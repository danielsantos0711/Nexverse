"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { GlobeIcon, LoaderCircleIcon, LockIcon } from "lucide-react"
import { Gate } from "@/components/moderation"
import { Button } from "@/components/ui/button"
import { commitTree, createRepo, repoPath, updateRepo, uploadFiles, type Upload, type Visibility } from "@/lib/code/api"
import { GITIGNORES, gitignoreText, LICENSES, licenseText, readmeText } from "@/lib/code/templates"
import { slugify, VALID_SLUG } from "@/lib/code/tree"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"
import { FormError, href, inputCls, textareaCls } from "./ui"

/** Topics typed as "llm, agents rag" → ["llm", "agents", "rag"]. */
export function parseTopics(raw: string): string[] {
  return [
    ...new Set(
      raw
        .toLowerCase()
        .split(/[\s,]+/)
        .map((t) => t.replace(/[^a-z0-9-]/g, "").replace(/^-+/, "").slice(0, 35))
        .filter(Boolean)
    ),
  ].slice(0, 20)
}

export function NewRepo() {
  return (
    <Gate cap="repo.create" action="create a repository">
      <NewRepoForm />
    </Gate>
  )
}

function NewRepoForm() {
  const id = useId()
  const router = useRouter()
  const session = useSession()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [visibility, setVisibility] = useState<Visibility>("public")
  const [readme, setReadme] = useState(true)
  const [license, setLicense] = useState("")
  const [gitignore, setGitignore] = useState("")
  const [topics, setTopics] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const slug = slugify(name)
  const nameError = name && !VALID_SLUG.test(slug) ? "Use letters or numbers in the name." : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!slug || nameError) {
      setError(nameError ?? "Give the repository a name.")
      return
    }
    try {
      setBusy("Creating the repository…")
      const repo = await createRepo({ name: name.trim(), slug, description, visibility, topics: parseTopics(topics), license: license || null })
      const enc = new TextEncoder()
      const files: Upload[] = []
      const holder = session.member?.name ?? repo.owner.name
      if (readme) files.push({ path: "README.md", data: enc.encode(readmeText(name.trim(), description.trim())) })
      if (license) {
        const text = await licenseText(license, holder)
        if (text) files.push({ path: "LICENSE", data: enc.encode(text) })
      }
      if (gitignore) {
        const text = await gitignoreText(gitignore)
        if (text) files.push({ path: ".gitignore", data: enc.encode(text) })
      }
      if (files.length) {
        setBusy("Writing the first commit…")
        const entries = await uploadFiles(repo.id, files)
        await commitTree(repo.id, repo.defaultBranch, null, entries, "Initial commit")
        if (readme) await updateRepo(repo.id, { readme: readmeText(name.trim(), description.trim()) }).catch(() => null)
      }
      router.push(href(repoPath(repo)))
    } catch (err) {
      setError((err as Error).message)
      setBusy(null)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-busy={Boolean(busy)}>
      <div className="grid gap-2">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Name
        </label>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus placeholder="tiny-tokenizer" aria-invalid={Boolean(nameError)} aria-describedby={`${id}-slug`} className={inputCls} />
        <p id={`${id}-slug`} className="text-xs text-muted-foreground">
          {slug ? (
            <>
              Its address ends in <span className="font-mono text-foreground/80">/{slug}</span>
            </>
          ) : (
            "Short and memorable. Lowercase letters, numbers, dots, dashes and underscores."
          )}
        </p>
      </div>

      <div className="grid gap-2">
        <label htmlFor={`${id}-desc`} className="text-sm font-medium">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={350} rows={2} className={textareaCls} placeholder="What it does, in one or two sentences." />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Who can see it</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { v: "public", icon: GlobeIcon, title: "Public", text: "Anyone can see and fork it. You choose who can push." },
              { v: "private", icon: LockIcon, title: "Private", text: "Only you and the collaborators you add." },
            ] as const
          ).map((o) => (
            <label
              key={o.v}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                visibility === o.v ? "border-ion/40 bg-ion/10" : "border-border bg-card/40 hover:bg-card/70"
              )}
            >
              <input type="radio" name="visibility" value={o.v} checked={visibility === o.v} onChange={() => setVisibility(o.v)} className="sr-only" />
              <o.icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", visibility === o.v ? "text-ion" : "text-muted-foreground")} />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{o.title}</span>
                <span className="text-xs text-muted-foreground">{o.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-border bg-card/40 p-4">
        <legend className="px-1 text-sm font-medium">Start with</legend>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} className="mt-0.5 size-4 accent-[var(--ion)]" />
          <span>
            A README
            <span className="block text-xs text-muted-foreground">The page people see first. You can edit it right after.</span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-lic`} className="text-sm">
              Licence
            </label>
            <select id={`${id}-lic`} value={license} onChange={(e) => setLicense(e.target.value)} className={inputCls}>
              <option value="">None</option>
              {LICENSES.map((l) => (
                <option key={l.spdx} value={l.spdx}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{LICENSES.find((l) => l.spdx === license)?.hint ?? "Without a licence, others may look but not reuse."}</p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-gi`} className="text-sm">
              .gitignore
            </label>
            <select id={`${id}-gi`} value={gitignore} onChange={(e) => setGitignore(e.target.value)} className={inputCls}>
              <option value="">None</option>
              {GITIGNORES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Files your tools generate and you should not upload.</p>
          </div>
        </div>
      </fieldset>

      <div className="grid gap-2">
        <label htmlFor={`${id}-topics`} className="text-sm font-medium">
          Topics <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input id={`${id}-topics`} value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="llm, agents, tokenizer" className={inputCls} />
        {parseTopics(topics).length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Topics to add">
            {parseTopics(topics).map((t) => (
              <li key={t} className="rounded-full bg-repo/10 px-2.5 py-0.5 text-xs text-repo">
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>

      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={Boolean(busy)}>
          {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          {busy ?? "Create repository"}
        </Button>
        <p className="text-xs text-muted-foreground">Up to 100 MB per repository and 25 MB per file.</p>
      </div>
    </form>
  )
}
