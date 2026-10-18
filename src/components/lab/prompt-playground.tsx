"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useDeferredValue, useMemo, useState, useSyncExternalStore } from "react"
import { BookmarkPlusIcon, FilePlus2Icon, SaveIcon, Trash2Icon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { estimateTokens } from "./tokens"
import { ActionButton, AnimatedNumber, CopyAction, EASE, fmtInt, Panel } from "./ui"

/* --------------------------------------------------------------- parsing */

type Part = { t: "text"; v: string } | { t: "var"; name: string }

const VAR = /\{\{|\}\}|\{([A-Za-z_][\w.-]{0,40})\}/g

function parse(template: string): { parts: Part[]; vars: string[] } {
  const parts: Part[] = []
  const vars: string[] = []
  let last = 0
  const text = (v: string) => {
    if (!v) return
    const prev = parts[parts.length - 1]
    if (prev?.t === "text") prev.v += v
    else parts.push({ t: "text", v })
  }
  for (const m of template.matchAll(VAR)) {
    text(template.slice(last, m.index))
    last = m.index + m[0].length
    if (m[0] === "{{") text("{")
    else if (m[0] === "}}") text("}")
    else {
      parts.push({ t: "var", name: m[1] })
      if (!vars.includes(m[1])) vars.push(m[1])
    }
  }
  text(template.slice(last))
  return { parts, vars }
}

const renderText = (parts: Part[], values: Record<string, string>) => parts.map((p) => (p.t === "text" ? p.v : values[p.name] ? values[p.name] : `{${p.name}}`)).join("")

const HUES = [222, 160, 32, 275, 340, 190, 60, 300]
const hue = (vars: string[], name: string) => HUES[vars.indexOf(name) % HUES.length]

/* --------------------------------------------------------------- storage */

type Saved = { id: string; name: string; template: string; values: Record<string, string>; updatedAt: number }
const KEY = "nexverse:lab:prompts"
const listeners = new Set<() => void>()
let cache: { raw: string | null; value: Saved[] } = { raw: null, value: [] }
const EMPTY: Saved[] = []

function read(): Saved[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {}
  if (raw === cache.raw) return cache.value
  let value: Saved[] = []
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown
    if (Array.isArray(parsed)) value = parsed.filter((s): s is Saved => !!s && typeof s.id === "string" && typeof s.template === "string").slice(0, 100)
  } catch {}
  cache = { raw, value }
  return value
}

function write(next: Saved[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, 100)))
  } catch {}
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => e.key === KEY && l()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

const useSaved = () => useSyncExternalStore(subscribe, read, () => EMPTY)

/* --------------------------------------------------------------- starters */

const STARTERS: { name: string; template: string; values: Record<string, string> }[] = [
  {
    name: "Explain for an audience",
    template: "You are a patient teacher.\n\nExplain {topic} to {audience} in at most {length}.\nUse one concrete example from {domain}, and end with a single question that checks understanding.",
    values: { topic: "the KV cache in transformers", audience: "a product manager", length: "150 words", domain: "chat apps" },
  },
  {
    name: "Few-shot classifier",
    template:
      'Classify each message as one of: {labels}.\nAnswer with JSON only, like {{"label": "...", "confidence": 0.0}}.\n\nExamples:\n{examples}\n\nMessage: {message}',
    values: { labels: "billing, outage, other", examples: 'Message: "My bill doubled" → billing\nMessage: "No signal since 9am" → outage', message: "" },
  },
  {
    name: "Translate with a glossary",
    template: "Translate the text below from {source} into {target}.\nKeep the tone {tone}. Always use these terms:\n{glossary}\n\nText:\n{text}",
    values: { source: "English", target: "European Portuguese", tone: "friendly but professional", glossary: "model card → cartão do modelo\nfine-tune → afinar", text: "" },
  },
  {
    name: "Code review",
    template: "Review this {language} code for bugs first, then readability. Be specific and quote the lines you mean.\nContext: {context}\n\n```{language}\n{code}\n```",
    values: { language: "python", context: "", code: "" },
  },
]

/* --------------------------------------------------------------- component */

export function PromptPlayground() {
  const saved = useSaved()
  const reduce = useReducedMotion()
  const [name, setName] = useState(STARTERS[0].name)
  const [template, setTemplate] = useState(STARTERS[0].template)
  const [values, setValues] = useState<Record<string, string>>(STARTERS[0].values)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [status, setStatus] = useState("")

  const { parts, vars } = useMemo(() => parse(template), [template])
  const rendered = renderText(parts, values)
  const deferred = useDeferredValue(rendered)
  const est = useMemo(() => estimateTokens(deferred), [deferred])
  const unfilled = vars.filter((v) => !values[v]?.trim())

  function load(t: { name: string; template: string; values: Record<string, string> }, id: string | null) {
    setName(t.name)
    setTemplate(t.template)
    setValues(t.values)
    setLoadedId(id)
    setStatus(`Loaded ${t.name}`)
  }

  function save(asNew: boolean) {
    const now = Date.now()
    const keep = Object.fromEntries(vars.map((v) => [v, values[v] ?? ""]))
    const label = name.trim() || "Untitled template"
    if (loadedId && !asNew && saved.some((s) => s.id === loadedId)) {
      write(saved.map((s) => (s.id === loadedId ? { ...s, name: label, template, values: keep, updatedAt: now } : s)))
    } else {
      const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      write([{ id, name: label, template, values: keep, updatedAt: now }, ...saved])
      setLoadedId(id)
    }
    setStatus(`Saved ${label}`)
  }

  function remove(id: string) {
    const s = saved.find((x) => x.id === id)
    write(saved.filter((x) => x.id !== id))
    if (loadedId === id) setLoadedId(null)
    setStatus(s ? `Deleted ${s.name}` : "")
  }

  const isUpdate = !!loadedId && saved.some((s) => s.id === loadedId)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <span role="status" className="sr-only">
        {status}
      </span>
      <div className="flex flex-col gap-4">
        <Panel
          title="Template"
          actions={
            <ActionButton onClick={() => load({ name: "", template: "", values: {} }, null)}>
              <FilePlus2Icon aria-hidden className="size-3.5" />
              New
            </ActionButton>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pp-name" className="text-sm font-medium text-foreground/90">
                Name
              </label>
              <Input id="pp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled template" className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="pp-template" className="text-sm font-medium text-foreground/90">
                  Prompt
                </label>
                <span className="text-xs text-muted-foreground">
                  <code className="rounded bg-white/[0.06] px-1 font-mono">{"{variable}"}</code> to insert ·{" "}
                  <code className="rounded bg-white/[0.06] px-1 font-mono">{"{{ }}"}</code> for braces
                </span>
              </div>
              <Textarea
                id="pp-template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="Summarise {document} for {audience}…"
                spellCheck={false}
                className="max-h-[50vh] min-h-44 resize-y font-mono text-[13px] leading-relaxed md:text-[13px]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Variables found">
              <span className="text-muted-foreground">{vars.length ? `${vars.length} variable${vars.length > 1 ? "s" : ""}:` : "No variables yet."}</span>
              {vars.map((v) => (
                <span key={v} className="rounded-full px-2 py-0.5 font-mono" style={{ background: `hsl(${hue(vars, v)} 70% 60% / 0.14)`, color: `hsl(${hue(vars, v)} 80% 78%)` }}>
                  {v}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <ActionButton onClick={() => save(false)} disabled={!template.trim()} className="border-ion/40 bg-ion/10 text-ion hover:bg-ion/15">
                <SaveIcon aria-hidden className="size-3.5" />
                {isUpdate ? "Update saved" : "Save template"}
              </ActionButton>
              {isUpdate && (
                <ActionButton onClick={() => save(true)}>
                  <BookmarkPlusIcon aria-hidden className="size-3.5" />
                  Save as new
                </ActionButton>
              )}
              <CopyAction text={template} label="Copy template" />
            </div>
          </div>
        </Panel>

        <Panel title="Fill the variables" description={vars.length ? undefined : "Add a {variable} to the prompt and a field for it appears here."}>
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {vars.map((v) => (
                <motion.div
                  key={v}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="flex flex-col gap-1.5"
                >
                  <label htmlFor={`pp-v-${v}`} className="flex items-center gap-2 text-sm font-medium">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: `hsl(${hue(vars, v)} 80% 70%)` }} />
                    <span className="font-mono text-[13px]">{v}</span>
                  </label>
                  <Textarea
                    id={`pp-v-${v}`}
                    value={values[v] ?? ""}
                    onChange={(e) => setValues((s) => ({ ...s, [v]: e.target.value }))}
                    rows={1}
                    placeholder={`Value for ${v}`}
                    className="max-h-64 min-h-9 resize-y"
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Panel title="Rendered prompt" actions={<CopyAction text={rendered} label="Copy prompt" />}>
          <div className="mb-3 flex flex-wrap items-end gap-x-5 gap-y-1">
            <div>
              <div className="text-xs text-muted-foreground">Estimated tokens</div>
              <div className="text-3xl font-semibold tracking-tight">
                ≈<AnimatedNumber value={est.tokens} />
              </div>
            </div>
            <div className="pb-1 text-xs text-muted-foreground tabular">
              range {fmtInt(est.low)}–{fmtInt(est.high)} · {fmtInt(est.chars)} characters
            </div>
          </div>
          {unfilled.length > 0 && (
            <p className="mb-3 text-xs text-gold/90" aria-live="polite">
              Not filled yet: {unfilled.join(", ")}
            </p>
          )}
          <div className="max-h-[55vh] overflow-auto rounded-xl border border-border bg-black/30 p-4 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground/90" tabIndex={0} role="region" aria-label="Rendered prompt">
            {parts.length === 0 ? (
              <span className="text-muted-foreground">The rendered prompt appears here.</span>
            ) : (
              parts.map((p, i) =>
                p.t === "text" ? (
                  <span key={i}>{p.v}</span>
                ) : values[p.name] ? (
                  <mark key={i} className="rounded px-0.5 text-inherit" style={{ background: `hsl(${hue(vars, p.name)} 70% 60% / 0.16)`, boxShadow: `inset 0 -1px 0 hsl(${hue(vars, p.name)} 80% 70% / 0.5)` }}>
                    {values[p.name]}
                  </mark>
                ) : (
                  <span key={i} className="rounded border border-dashed px-1" style={{ borderColor: `hsl(${hue(vars, p.name)} 70% 65% / 0.6)`, color: `hsl(${hue(vars, p.name)} 80% 78%)` }}>
                    {`{${p.name}}`}
                  </span>
                )
              )
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Token counts are heuristic estimates; real tokenisers differ.</p>
        </Panel>

        <Panel title="Templates" description="Saved templates stay in this browser.">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Saved</h3>
              {saved.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {saved.map((s) => (
                      <motion.li
                        key={s.id}
                        layout={!reduce}
                        initial={reduce ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => load(s, s.id)}
                            aria-current={s.id === loadedId || undefined}
                            className={cn("flex min-w-0 flex-1 flex-col rounded-lg px-2 py-1.5 text-left transition-colors outline-none hover:bg-white/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50", s.id === loadedId && "bg-white/[0.05]")}
                          >
                            <span className="truncate text-sm">{s.name}</span>
                            <span className="truncate font-mono text-xs text-muted-foreground">{s.template.replace(/\s+/g, " ").slice(0, 80)}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(s.id)}
                            aria-label={`Delete ${s.name}`}
                            className="pressable flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <Trash2Icon aria-hidden className="size-3.5" />
                          </button>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Starters</h3>
              <div className="flex flex-wrap gap-1.5">
                {STARTERS.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => load(s, null)}
                    className="pressable h-8 rounded-full border border-border px-3 text-[13px] text-muted-foreground transition-colors outline-none hover:border-white/20 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
