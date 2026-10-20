"use client"

import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useId, useState } from "react"
import { ArrowRightIcon, DownloadCloudIcon, FileIcon, Loader2Icon, SparklesIcon } from "lucide-react"
import { Gate } from "@/components/moderation/gate"
import { Copy } from "@/components/content/copy"
import { Switch } from "@/components/editor/publish-fields"
import { GlowCard } from "@/components/hub/glow-card"
import { Button } from "@/components/ui/button"
import { accessToken } from "@/lib/code/api"
import { formatBytes } from "@/lib/editor/media"
import { parseImportId, SITE_NAMES, type ImportPreview, type ImportResult, type ImportSite, type ImportType } from "@/lib/import/types"
import { licenseName } from "@/lib/publish/licenses"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/**
 * Bring a public model or dataset from Hugging Face, or a model's details from OpenRouter, into Nexverse. The
 * server reads the source (only those two sites, nothing else), shows what it would create, and on Import makes
 * a project of the right type owned by you, with the card as its README and an "imported from" credit. The page
 * then lives on Nexverse like any other: no redirects to the source.
 */
export function ImportPanel() {
  return (
    <Gate cap="project.create" action="import a model or dataset">
      <ImportForm />
    </Gate>
  )
}

const EXAMPLES: Record<ImportSite, Partial<Record<ImportType, string>>> = {
  huggingface: { model: "Qwen/Qwen2.5-0.5B", dataset: "stanfordnlp/imdb" },
  openrouter: { model: "mistralai/mistral-small" },
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const token = await accessToken()
  if (!token) throw new Error("Sign in to import.")
  const res = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? `The import failed (${res.status}).`)
  return json.data
}

function ImportForm() {
  const uid = useId()
  const router = useRouter()
  const reduce = useReducedMotion()
  const [site, setSite] = useState<ImportSite>("huggingface")
  const [type, setType] = useState<ImportType>("model")
  const [raw, setRaw] = useState("")
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState<"preview" | "import" | null>(null)
  const [error, setError] = useState("")
  const [publish, setPublish] = useState(false)
  const [copyFiles, setCopyFiles] = useState(true)
  const id = parseImportId(site, type, raw)

  const reset = () => {
    setPreview(null)
    setError("")
  }

  async function look(e?: React.FormEvent) {
    e?.preventDefault()
    if (!id) return setError(site === "openrouter" ? "Use an OpenRouter model id like author/model." : `Use a Hugging Face ${type} id like owner/name, or paste its address.`)
    setBusy("preview")
    setError("")
    try {
      setPreview(await call<ImportPreview>({ site, type, id, preview: true }))
    } catch (err) {
      setPreview(null)
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function run() {
    if (!id) return
    setBusy("import")
    setError("")
    try {
      const r = await call<ImportResult>({ site, type, id, publish, copyFiles })
      router.push(r.href as "/")
    } catch (err) {
      setError((err as Error).message)
      setBusy(null)
    }
  }

  if (!live) return <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Importing needs the site&apos;s database, and this copy of Nexverse has none.</p>

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={look} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="flex flex-wrap gap-3">
          <div className="flex rounded-full border border-border p-0.5 text-sm" role="group" aria-label="Source">
            {(["huggingface", "openrouter"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={site === s}
                onClick={() => {
                  setSite(s)
                  if (s === "openrouter") setType("model")
                  reset()
                }}
                className="relative rounded-full px-3.5 py-1.5"
              >
                {site === s && <motion.span layoutId={`${uid}-site`} className="absolute inset-0 rounded-full bg-secondary" transition={{ type: "spring", duration: 0.35, bounce: 0.2 }} />}
                <span className={cn("relative", site === s ? "text-foreground" : "text-muted-foreground")}>{SITE_NAMES[s]}</span>
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-border p-0.5 text-sm" role="group" aria-label="What to import">
            {(["model", "dataset"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                disabled={site === "openrouter" && t === "dataset"}
                title={site === "openrouter" && t === "dataset" ? "OpenRouter lists models only" : undefined}
                onClick={() => {
                  setType(t)
                  reset()
                }}
                className="relative rounded-full px-3.5 py-1.5 disabled:opacity-40"
              >
                {type === t && <motion.span layoutId={`${uid}-type`} className="absolute inset-0 rounded-full bg-secondary" transition={{ type: "spring", duration: 0.35, bounce: 0.2 }} />}
                <span className={cn("relative capitalize", type === t ? "text-foreground" : "text-muted-foreground")}>{t}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`${uid}-id`} className="sr-only">
            {SITE_NAMES[site]} {type} id
          </label>
          <input
            id={`${uid}-id`}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value)
              if (preview) setPreview(null)
            }}
            placeholder={`${EXAMPLES[site][type] ?? "owner/name"}, or paste its address`}
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background/60 px-3.5 font-mono text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/40"
          />
          <Button type="submit" size="lg" disabled={busy !== null || !raw.trim()}>
            {busy === "preview" ? <Loader2Icon aria-hidden className="animate-spin" /> : <SparklesIcon aria-hidden />} Look it up
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          <Copy k="import.lead">Public items only. Nexverse reads the card and the details, and copies a few small files (configuration, a data sample) into its own storage. Up to 10 imports an hour.</Copy>
        </p>
      </form>

      <AnimatePresence mode="wait">
        {error && (
          <motion.p key="err" role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {busy === "preview" && !preview && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-48 animate-pulse rounded-2xl border border-border bg-card" />
        )}
        {preview && (
          <motion.div key={preview.ref} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}>
            <GlowCard className="rounded-2xl">
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 md:p-6">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    {preview.type === "model" ? "Model" : "Dataset"} · imported from {SITE_NAMES[preview.site]} · <span className="font-mono">{preview.ref}</span>
                  </p>
                  <h3 className="text-xl font-semibold tracking-[-0.01em]">{preview.name}</h3>
                  <p className="text-sm text-muted-foreground">{preview.summary}</p>
                </div>
                {preview.facts.length > 0 && (
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                    {preview.facts.map((f) => (
                      <div key={f.label} className="bg-card px-3 py-2">
                        <dt className="text-[11px] text-muted-foreground uppercase">{f.label}</dt>
                        <dd className="truncate text-sm" title={f.value}>
                          {f.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {preview.license !== "unspecified" && <span className="rounded-full bg-secondary px-2 py-0.5 font-mono">{licenseName(preview.license)}</span>}
                  {preview.tags.map((t) => (
                    <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                      #{t}
                    </span>
                  ))}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">README {preview.readmeChars.toLocaleString("en")} characters</span>
                </div>
                {preview.files.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {preview.files.map((f) => (
                      <li key={f.name} className="flex items-center gap-2 text-muted-foreground">
                        <FileIcon aria-hidden className="size-3.5" /> <span className="font-mono text-xs">{f.name}</span>
                        {f.bytes !== null && <span className="text-xs">{formatBytes(f.bytes)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={publish} onChange={setPublish} label="Publish right away" /> Publish right away
                  </label>
                  {preview.files.length > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={copyFiles} onChange={setCopyFiles} label="Copy the small files" /> Copy the {preview.files.length} small {preview.files.length === 1 ? "file" : "files"}
                    </label>
                  )}
                  <Button className="sm:ml-auto" onClick={run} disabled={busy !== null}>
                    {busy === "import" ? <Loader2Icon aria-hidden className="animate-spin" /> : <DownloadCloudIcon aria-hidden />}
                    {busy === "import" ? "Importing…" : "Import into Nexverse"}
                    {busy !== "import" && <ArrowRightIcon aria-hidden />}
                  </Button>
                </div>
                {!publish && <p className="text-xs text-muted-foreground">It starts as a draft only you can see. Check the card, add files or a repository, then publish.</p>}
              </div>
            </GlowCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
