"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useId, useState } from "react"
import { PlusIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react"
import { Cover, TYPE_ICONS } from "@/components/hub/bits"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ACCENTS, getProjectsById, PROJECT_TYPES, searchProjects, type Appearance, type DatasetSpecs, type Endpoint, type ModelSpecs, type Project, type ProjectSpecs, type ProjectType } from "@/lib/projects"
import { cn } from "@/lib/utils"

/*
 * The editor's round 10 fields: what the project is (six types), the specs its model or dataset page shows,
 * the projects it is built with, and how its page looks (accent colour and emoji).
 */

export function TypePicker({ value, onChange }: { value: ProjectType; onChange: (t: ProjectType) => void }) {
  const t = PROJECT_TYPES.find((x) => x.id === value) ?? PROJECT_TYPES[0]
  return (
    <FieldSet>
      <FieldLegend variant="label">What is it?</FieldLegend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {PROJECT_TYPES.map((x) => {
          const Icon = TYPE_ICONS[x.id]
          const on = value === x.id
          return (
            <label
              key={x.id}
              className={cn(
                "pressable relative flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                on ? "border-ion/60 bg-ion/10" : "border-border bg-card hover:bg-secondary/50"
              )}
            >
              <input type="radio" name="project-type" value={x.id} checked={on} onChange={() => onChange(x.id)} className="sr-only" />
              <Icon aria-hidden className={cn("size-5 transition-transform", on ? "scale-110 text-ion" : "text-muted-foreground")} />
              <span className="font-medium">{x.label}</span>
            </label>
          )
        })}
      </div>
      <FieldDescription>{t.blurb}</FieldDescription>
    </FieldSet>
  )
}

const numOr = (s: string) => {
  const n = Number(s.replace(/[, _]/g, ""))
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : undefined
}
const listOr = (s: string) => {
  const l = s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
  return l.length ? l : undefined
}

function Text({ id, label, value, onChange, placeholder, hint, mono }: { id: string; label: string; value: string | number | undefined; onChange: (v: string) => void; placeholder?: string; hint?: string; mono?: boolean }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn("h-10 bg-background/60", mono && "font-mono")} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

/** Specs for model and dataset pages. Free-form text where members describe; numbers where pages compute. */
export function SpecsEditor({ type, value, onChange }: { type: ProjectType; value: ProjectSpecs; onChange: (v: ProjectSpecs) => void }) {
  const uid = useId()
  // Text inputs keep what was typed ("128k" while typing) and store the parsed value.
  const [raw, setRaw] = useState<Record<string, string>>({})
  if (type === "model") {
    const m: ModelSpecs = value.model ?? {}
    const set = (patch: Partial<ModelSpecs>) => onChange({ ...value, model: { ...m, ...patch } })
    const rawOf = (k: string, v: unknown) => raw[k] ?? (v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v))
    const typed = (k: string, parse: (s: string) => unknown, apply: (v: never) => void) => (s: string) => {
      setRaw((r) => ({ ...r, [k]: s }))
      apply(parse(s) as never)
    }
    const endpoints = m.endpoints ?? []
    const setEndpoint = (i: number, patch: Partial<Endpoint>) => set({ endpoints: endpoints.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Text id={`${uid}-prov`} label="Provider" value={m.provider} onChange={(v) => set({ provider: v || undefined })} placeholder="Your lab or team" />
          <Text id={`${uid}-par`} label="Parameters" value={m.parameters} onChange={(v) => set({ parameters: v || undefined })} placeholder="7B" />
          <Text id={`${uid}-arch`} label="Architecture" value={m.architecture} onChange={(v) => set({ architecture: v || undefined })} placeholder="Llama, Mixture of experts…" />
          <Text id={`${uid}-ctx`} label="Context length (tokens)" value={rawOf("ctx", m.contextLength)} onChange={typed("ctx", numOr, (v: number | undefined) => set({ contextLength: v }))} placeholder="131072" mono />
          <Text id={`${uid}-out`} label="Max output (tokens)" value={rawOf("out", m.maxOutput)} onChange={typed("out", numOr, (v: number | undefined) => set({ maxOutput: v }))} placeholder="8192" mono />
          <Text id={`${uid}-lib`} label="Library" value={m.library} onChange={(v) => set({ library: v || undefined })} placeholder="transformers, gguf, onnx" />
          <Text id={`${uid}-in`} label="Input" value={rawOf("in", m.inputModalities)} onChange={typed("in", listOr, (v: string[] | undefined) => set({ inputModalities: v }))} placeholder="text, image" hint="Separate with commas." />
          <Text id={`${uid}-outm`} label="Output" value={rawOf("outm", m.outputModalities)} onChange={typed("outm", listOr, (v: string[] | undefined) => set({ outputModalities: v }))} placeholder="text" />
          <Text id={`${uid}-base`} label="Base model" value={m.baseModel} onChange={(v) => set({ baseModel: v || undefined })} placeholder="What it was fine-tuned from" />
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Pricing</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(m.pricing?.free)} onChange={(e) => set({ pricing: e.target.checked ? { free: true, prompt: 0, completion: 0 } : undefined })} className="size-4 accent-[#8fb4ff]" />
            Free to use
          </label>
          {!m.pricing?.free && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Text id={`${uid}-pin`} label="Input, $ per 1M tokens" value={rawOf("pin", m.pricing?.prompt)} onChange={typed("pin", numOr, (v: number | undefined) => set({ pricing: { ...m.pricing, prompt: v } }))} placeholder="0.15" mono />
              <Text id={`${uid}-pout`} label="Output, $ per 1M tokens" value={rawOf("pout", m.pricing?.completion)} onChange={typed("pout", numOr, (v: number | undefined) => set({ pricing: { ...m.pricing, completion: v } }))} placeholder="0.60" mono />
            </div>
          )}
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Endpoints</legend>
          <p className="text-xs text-muted-foreground">Services that run this model through an API. Shown on the Providers tab.</p>
          <AnimatePresence initial={false}>
            {endpoints.map((e, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                <Text id={`${uid}-e${i}-p`} label="Provider" value={e.provider} onChange={(v) => setEndpoint(i, { provider: v })} />
                <Text id={`${uid}-e${i}-c`} label="Context" value={e.contextLength} onChange={(v) => setEndpoint(i, { contextLength: numOr(v) })} mono />
                <Text id={`${uid}-e${i}-i`} label="$ in / 1M" value={e.pricing?.prompt} onChange={(v) => setEndpoint(i, { pricing: { ...e.pricing, prompt: numOr(v) } })} mono />
                <Text id={`${uid}-e${i}-o`} label="$ out / 1M" value={e.pricing?.completion} onChange={(v) => setEndpoint(i, { pricing: { ...e.pricing, completion: numOr(v) } })} mono />
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove endpoint" onClick={() => set({ endpoints: endpoints.filter((_, j) => j !== i) })}>
                  <Trash2Icon aria-hidden />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
          {endpoints.length < 30 && (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => set({ endpoints: [...endpoints, { provider: "" }] })}>
              <PlusIcon aria-hidden /> Add an endpoint
            </Button>
          )}
        </fieldset>
      </div>
    )
  }
  if (type === "dataset") {
    const d: DatasetSpecs = value.dataset ?? {}
    const set = (patch: Partial<DatasetSpecs>) => onChange({ ...value, dataset: { ...d, ...patch } })
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Text id={`${uid}-rows`} label="Rows" value={raw.rows ?? d.rows} onChange={(v) => (setRaw((r) => ({ ...r, rows: v })), set({ rows: numOr(v) }))} placeholder="25000" mono />
        <Text id={`${uid}-tasks`} label="Tasks" value={raw.tasks ?? d.tasks?.join(", ")} onChange={(v) => (setRaw((r) => ({ ...r, tasks: v })), set({ tasks: listOr(v) }))} placeholder="text classification, translation" />
        <Text id={`${uid}-mod`} label="Modalities" value={raw.mod ?? d.modalities?.join(", ")} onChange={(v) => (setRaw((r) => ({ ...r, mod: v })), set({ modalities: listOr(v) }))} placeholder="text, audio" />
        <Text id={`${uid}-fmt`} label="Formats" value={raw.fmt ?? d.formats?.join(", ")} onChange={(v) => (setRaw((r) => ({ ...r, fmt: v })), set({ formats: listOr(v) }))} placeholder="csv, jsonl, parquet" hint="Left empty, the page reads them from your files." />
      </div>
    )
  }
  return null
}

/** "Built with": other Nexverse projects this one uses. They list it under Apps or Used by. */
export function RelatedPicker({ value, onChange, self }: { value: string[]; onChange: (ids: string[]) => void; self?: string }) {
  const uid = useId()
  const reduce = useReducedMotion()
  const [q, setQ] = useState("")
  const [found, setFound] = useState<Project[]>([])
  const [known, setKnown] = useState<Record<string, Project>>({})

  useEffect(() => {
    const missing = value.filter((id) => !known[id])
    if (!missing.length) return
    let stale = false
    getProjectsById(missing).then((list) => !stale && setKnown((k) => ({ ...k, ...Object.fromEntries(list.map((p) => [p.id, p])) })))
    return () => {
      stale = true
    }
  }, [value, known])

  useEffect(() => {
    if (q.trim().length < 2) return
    let stale = false
    const t = setTimeout(() => {
      searchProjects(q).then((list) => !stale && setFound(list.filter((p) => p.id !== self && !value.includes(p.id))))
    }, 200)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, self, value])

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {value.map((id) => (
            <motion.li key={id} layout={!reduce} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 py-1 pr-1 pl-1 text-sm">
                <span className="size-5 overflow-hidden rounded-full">
                  <Cover seed={known[id]?.slug ?? id} kind={known[id]?.kind ?? "repo"} />
                </span>
                {known[id]?.name ?? "A project"}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="rounded-full p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={`Remove ${known[id]?.name ?? "project"}`}>
                  <XIcon aria-hidden className="size-3.5" />
                </button>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {value.length < 12 && (
        <div className="relative">
          <label htmlFor={`${uid}-q`} className="sr-only">
            Find a project
          </label>
          <div className="flex h-10 items-center gap-2 rounded-lg border border-input bg-background/60 px-3 focus-within:ring-3 focus-within:ring-ring/50">
            <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
            <input id={`${uid}-q`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a model, dataset or tool on Nexverse" className="min-w-0 flex-1 bg-transparent text-sm outline-none" autoComplete="off" />
          </div>
          {q.trim().length >= 2 && found.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
              {found.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setKnown((k) => ({ ...k, [p.id]: p }))
                      onChange([...value, p.id])
                      setQ("")
                      setFound([])
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="size-6 shrink-0 overflow-hidden rounded-md">
                      <Cover seed={p.slug} kind={p.kind} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.owner?.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const EMOJI = ["", "🪐", "🌌", "⭐", "☄️", "🚀", "🛰️", "🌙", "🔭", "🧠", "📊", "🧪", "⚡", "🛠️", "🎧", "🖼️"]

export function AppearancePicker({ value, onChange }: { value: Appearance; onChange: (v: Appearance) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <FieldSet>
        <FieldLegend variant="label">Accent colour</FieldLegend>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => {
            const on = (value.accent ?? "ion") === a.id
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...value, accent: a.id })}
                className={cn("pressable flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-foreground/40 bg-secondary" : "border-border hover:bg-secondary/50")}
              >
                <span aria-hidden className="size-3.5 rounded-full ring-2 ring-white/10" style={{ background: a.hex }} />
                {a.label}
              </button>
            )
          })}
        </div>
        <FieldDescription>Used for the tabs, charts and highlights on your page.</FieldDescription>
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">Emoji</FieldLegend>
        <div className="flex flex-wrap gap-1.5">
          {EMOJI.map((e) => {
            const on = (value.emoji ?? "") === e
            return (
              <button
                key={e || "none"}
                type="button"
                aria-pressed={on}
                aria-label={e ? `Use ${e}` : "No emoji"}
                onClick={() => onChange({ ...value, emoji: e || undefined })}
                className={cn("pressable grid size-9 place-items-center rounded-lg border text-lg transition-colors", on ? "border-ion/60 bg-ion/10" : "border-border hover:bg-secondary/50")}
              >
                {e || <XIcon aria-hidden className="size-4 text-muted-foreground" />}
              </button>
            )
          })}
        </div>
        <FieldDescription>Shown on your project&apos;s planet in the header.</FieldDescription>
      </FieldSet>
    </div>
  )
}
