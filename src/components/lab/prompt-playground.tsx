"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { CheckIcon, CircleStopIcon, CloudOffIcon, FilePlus2Icon, HistoryIcon, LinkIcon, Loader2Icon, PlayIcon, SaveIcon, Share2Icon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Gate } from "@/components/moderation"
import { LabAiError, LIMITS, loadModels, runPlayground, type AiModel, type ModelsState } from "@/lib/lab/ai"
import { deletePrompt, listMyPrompts, myId, promptPath, savePrompt, type LabPrompt } from "@/lib/lab/prompts"
import { quickTokens } from "@/lib/lab/tokenizers"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { ActionButton, CopyAction, EASE, fmtInt, Panel, RangeSlider, SwitchRow } from "./ui"
import { Copy } from "@/components/content/copy"

/* ------------------------------------------------------------- templates */

type Part = { t: "text"; v: string } | { t: "var"; name: string }

const VAR = /\{\{\s*([A-Za-z_][\w.-]{0,40})\s*\}\}/g

export function parseTemplate(template: string): { parts: Part[]; vars: string[] } {
  const parts: Part[] = []
  const vars: string[] = []
  let last = 0
  for (const m of template.matchAll(VAR)) {
    if (m.index > last) parts.push({ t: "text", v: template.slice(last, m.index) })
    parts.push({ t: "var", name: m[1] })
    if (!vars.includes(m[1])) vars.push(m[1])
    last = m.index + m[0].length
  }
  if (last < template.length) parts.push({ t: "text", v: template.slice(last) })
  return { parts, vars }
}

const fill = (parts: Part[], values: Record<string, string>) => parts.map((p) => (p.t === "text" ? p.v : values[p.name]?.length ? values[p.name] : `{{${p.name}}}`)).join("")

/** Templates saved by the earlier playground used {name} and {{ / }} for literal braces. */
function fromOldSyntax(t: string) {
  return t.replace(/\{\{|\}\}|\{([A-Za-z_][\w.-]{0,40})\}/g, (m, name: string | undefined) => (m === "{{" ? "{" : m === "}}" ? "}" : `{{${name}}}`))
}

const HUES = [222, 160, 32, 275, 340, 190, 60, 300]
const hue = (vars: string[], name: string) => HUES[Math.max(0, vars.indexOf(name)) % HUES.length]

/* --------------------------------------------------------------- storage */

type RunResult = { model: string; label: string; text?: string; ms?: number; provider?: string; error?: string; outTokens?: number }
type HistoryItem = { id: string; at: number; title: string; system: string; prompt: string; values: Record<string, string>; temperature: number; inTokens: number; results: RunResult[] }
type OldTemplate = { id: string; name: string; template: string; values: Record<string, string> }

const HISTORY_KEY = "nexverse:lab:playground-history"
const OLD_KEY = "nexverse:lab:prompts"
const listeners = new Set<() => void>()
const caches = new Map<string, { raw: string | null; value: unknown[] }>()
const EMPTY: never[] = []

function readList<T>(key: string): T[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {}
  const c = caches.get(key)
  if (c && c.raw === raw) return c.value as T[]
  let value: unknown[] = []
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown
    if (Array.isArray(parsed)) value = parsed.filter((x) => x && typeof x === "object").slice(0, 50)
  } catch {}
  caches.set(key, { raw, value })
  return value as T[]
}

function writeList(key: string, next: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(next.slice(0, 30)))
  } catch {}
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => (e.key === HISTORY_KEY || e.key === OLD_KEY) && l()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

const useList = <T,>(key: string) => useSyncExternalStore(subscribe, () => readList<T>(key), () => EMPTY as T[])

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)

/* --------------------------------------------------------------- starters */

const STARTERS: { title: string; system: string; prompt: string; values: Record<string, string> }[] = [
  {
    title: "Explain for an audience",
    system: "You are a patient teacher. Answer in plain language.",
    prompt: "Explain {{topic}} to {{audience}} in at most {{length}}. Use one concrete example and end with a single question that checks understanding.",
    values: { topic: "the KV cache in transformers", audience: "a product manager", length: "120 words" },
  },
  {
    title: "Classify a message",
    system: 'Classify the message into one of: {{labels}}. Reply with JSON only: {"label": "...", "confidence": 0.0}',
    prompt: "Message: {{message}}",
    values: { labels: "billing, outage, account, other", message: "I was charged twice this month." },
  },
  {
    title: "Translate with a glossary",
    system: "You are a careful translator. Keep formatting and always use the glossary terms.",
    prompt: "Translate into {{target}}. Glossary:\n{{glossary}}\n\nText:\n{{text}}",
    values: { target: "European Portuguese", glossary: "fine-tune → afinar\nmodel card → cartão do modelo", text: "We fine-tune the model and publish its model card." },
  },
  {
    title: "Review code",
    system: "You are a senior engineer. Find bugs first, then readability issues. Quote the lines you mean.",
    prompt: "Review this {{language}} code:\n\n```{{language}}\n{{code}}\n```",
    values: { language: "python", code: "def mean(xs):\n    return sum(xs) / len(xs)" },
  },
]

/* --------------------------------------------------------------- component */

export function PromptPlayground({ initial }: { initial?: LabPrompt | null }) {
  const reduce = useReducedMotion()
  const history = useList<HistoryItem>(HISTORY_KEY)
  const oldTemplates = useList<OldTemplate>(OLD_KEY)

  const [models, setModels] = useState<ModelsState | null>(null)
  const [title, setTitle] = useState(STARTERS[0].title)
  const [system, setSystem] = useState(STARTERS[0].system)
  const [prompt, setPrompt] = useState(STARTERS[0].prompt)
  const [values, setValues] = useState<Record<string, string>>(STARTERS[0].values)
  const [temperature, setTemperature] = useState(0.7)
  const [picked, setPicked] = useState<string[]>([])
  const [results, setResults] = useState<RunResult[]>([])
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [status, setStatus] = useState("")
  const abort = useRef<AbortController | null>(null)

  // Saved prompts (account)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [shared, setShared] = useState(false)
  const [mine, setMine] = useState<LabPrompt[] | null>(null)
  const [me, setMe] = useState<string | null | undefined>(undefined)
  const [saveState, setSaveState] = useState<{ busy: boolean; error?: string; done?: string }>({ busy: false })

  const load = useCallback((p: { title: string; system: string; prompt: string; values: Record<string, string>; models?: string[]; temperature?: number | null; id?: string | null; shared?: boolean; mine?: boolean }) => {
    setTitle(p.title)
    setSystem(p.system)
    setPrompt(p.prompt)
    setValues(p.values)
    if (p.models?.length) setPicked(p.models.slice(0, 3))
    if (p.temperature != null) setTemperature(Math.min(LIMITS.temperatureMax, Math.max(0, p.temperature)))
    setSavedId(p.mine ? (p.id ?? null) : null)
    setShared(p.mine ? !!p.shared : false)
    setResults([])
    setStatus(`Loaded ${p.title}`)
  }, [])

  useEffect(() => {
    let alive = true
    void loadModels().then((s) => {
      if (!alive) return
      setModels(s)
      if (s.status === "ok") setPicked((cur) => (cur.length ? cur.filter((id) => s.models.some((m) => m.id === id)) : [s.models[0].id]))
    })
    return () => {
      alive = false
    }
  }, [])

  const refreshMine = useCallback(async () => {
    try {
      const id = await myId()
      setMe(id)
      if (!id) return setMine([])
      setMine(await listMyPrompts())
    } catch {
      setMine(null)
    }
  }, [])

  useEffect(() => {
    if (!live) return
    let alive = true
    void Promise.resolve().then(() => {
      if (alive) void refreshMine()
    })
    return () => {
      alive = false
    }
  }, [refreshMine])

  // A prompt opened from a share link, either as a prop (/lab/prompt/<id>) or as ?p=<id>.
  useEffect(() => {
    if (initial) {
      void myId().then((id) => load({ ...initial, values: initial.variables, mine: id === initial.ownerId }))
      return
    }
    let p: string | null = null
    try {
      p = new URLSearchParams(window.location.search).get("p")
    } catch {}
    if (!p) return
    void import("@/lib/lab/prompts").then(async ({ getPrompt }) => {
      try {
        const found = await getPrompt(p)
        if (!found) return setStatus("That shared prompt was not found or is private.")
        const id = await myId()
        load({ ...found, values: found.variables, mine: id === found.ownerId })
      } catch (e) {
        setStatus((e as Error).message)
      }
    })
  }, [initial, load])

  const sys = useMemo(() => parseTemplate(system), [system])
  const usr = useMemo(() => parseTemplate(prompt), [prompt])
  const vars = useMemo(() => [...new Set([...sys.vars, ...usr.vars])], [sys.vars, usr.vars])
  const renderedSystem = fill(sys.parts, values)
  const renderedPrompt = fill(usr.parts, values)
  const inTokens = useMemo(() => quickTokens(renderedSystem) + quickTokens(renderedPrompt), [renderedSystem, renderedPrompt])
  const unfilled = vars.filter((v) => !values[v]?.trim())
  const tooLong = renderedSystem.length > LIMITS.system ? "system" : renderedPrompt.length > LIMITS.prompt ? "prompt" : null
  const modelList = models?.status === "ok" ? models.models : []
  const labelOf = (id: string) => modelList.find((m) => m.id === id)?.label ?? id

  function togglePick(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]))
  }

  async function run() {
    if (!renderedPrompt.trim() || !picked.length || running || tooLong) return
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setRunning(true)
    setStatus(`Running on ${picked.length} model${picked.length > 1 ? "s" : ""}`)
    const start: RunResult[] = picked.map((m) => ({ model: m, label: labelOf(m) }))
    setResults(start)
    const done = await Promise.all(
      picked.map(async (m, k): Promise<RunResult> => {
        try {
          const r = await runPlayground({ model: m, system: renderedSystem.trim() || undefined, prompt: renderedPrompt, temperature }, ctrl.signal)
          if (r.remaining != null) setRemaining(r.remaining)
          const res: RunResult = { ...start[k], text: r.data.text, ms: r.data.ms, provider: r.data.provider, outTokens: quickTokens(r.data.text) }
          setResults((cur) => cur.map((x) => (x.model === m ? res : x)))
          return res
        } catch (e) {
          const msg = (e as Error).name === "AbortError" ? "Stopped." : e instanceof LabAiError ? e.message : "The model did not answer. Try again."
          const res: RunResult = { ...start[k], error: msg }
          setResults((cur) => cur.map((x) => (x.model === m ? res : x)))
          return res
        }
      })
    )
    setRunning(false)
    setStatus("Done")
    if (done.some((d) => d.text)) {
      const item: HistoryItem = { id: uid(), at: Date.now(), title: title.trim() || "Untitled prompt", system, prompt, values: Object.fromEntries(vars.map((v) => [v, values[v] ?? ""])), temperature, inTokens, results: done }
      writeList(HISTORY_KEY, [item, ...history])
    }
  }

  async function save() {
    setSaveState({ busy: true })
    try {
      const p = await savePrompt({ title, system, prompt, variables: Object.fromEntries(vars.map((v) => [v, values[v] ?? ""])), models: picked, temperature, shared }, savedId)
      setSavedId(p.id)
      setSaveState({ busy: false, done: shared ? "Saved and shared" : "Saved to your account" })
      void refreshMine()
    } catch (e) {
      setSaveState({ busy: false, error: (e as Error).message })
    }
  }

  async function remove(id: string) {
    try {
      await deletePrompt(id)
      if (savedId === id) setSavedId(null)
      void refreshMine()
      setStatus("Deleted")
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  const shareUrl = savedId && shared && typeof window !== "undefined" ? `${window.location.origin}${promptPath(savedId)}` : null

  return (
    <div className="flex flex-col gap-4">
      <span role="status" className="sr-only">
        {status}
      </span>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Panel
          title="Prompt"
          actions={
            <ActionButton onClick={() => load({ title: "", system: "", prompt: "", values: {} })}>
              <FilePlus2Icon aria-hidden className="size-3.5" />
              New
            </ActionButton>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pg-title" className="text-sm font-medium text-foreground/90">
                <Copy k="lab-tool.prompt-playground.name">Name</Copy>
              </label>
              <Input id="pg-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled prompt" maxLength={120} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pg-system" className="text-sm font-medium text-foreground/90">
                System prompt <span className="font-normal text-muted-foreground"><Copy k="lab-tool.prompt-playground.optional">(optional)</Copy></span>
              </label>
              <Textarea id="pg-system" value={system} onChange={(e) => setSystem(e.target.value)} maxLength={LIMITS.system} placeholder="How the model should behave…" spellCheck={false} className="max-h-[30vh] min-h-20 resize-y font-mono text-[13px] leading-relaxed md:text-[13px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="pg-prompt" className="text-sm font-medium text-foreground/90">
                  <Copy k="lab-tool.prompt-playground.user-prompt">User prompt</Copy>
                </label>
                <span className="text-xs text-muted-foreground">
                  <code className="rounded bg-white/[0.06] px-1 font-mono">{"{{variable}}"}</code> adds a field
                </span>
              </div>
              <Textarea id="pg-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={LIMITS.prompt} placeholder="Summarise {{document}} for {{audience}}…" spellCheck={false} className="max-h-[45vh] min-h-36 resize-y font-mono text-[13px] leading-relaxed md:text-[13px]" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Variables found">
              <span className="text-muted-foreground">{vars.length ? `${vars.length} variable${vars.length > 1 ? "s" : ""}:` : "No variables."}</span>
              {vars.map((v) => (
                <span key={v} className="rounded-full px-2 py-0.5 font-mono" style={{ background: `hsl(${hue(vars, v)} 70% 60% / 0.14)`, color: `hsl(${hue(vars, v)} 80% 78%)` }}>
                  {v}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground/90"><Copy k="lab-tool.prompt-playground.starters">Starters</Copy></span>
              <div className="flex flex-wrap gap-1.5">
                {STARTERS.map((s) => (
                  <button key={s.title} type="button" onClick={() => load(s)} className="pressable h-8 rounded-full border border-border px-3 text-[13px] text-muted-foreground transition-colors outline-none hover:border-white/20 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Variables" description={vars.length ? undefined : "Write {{name}} in a prompt and a field for it appears here."}>
            <div className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {vars.map((v) => (
                  <motion.div
                    key={v}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: EASE }}
                    className="flex flex-col gap-1.5"
                  >
                    <label htmlFor={`pg-v-${v}`} className="flex items-center gap-2 text-sm font-medium">
                      <span aria-hidden className="size-2 rounded-full" style={{ background: `hsl(${hue(vars, v)} 80% 70%)` }} />
                      <span className="font-mono text-[13px]">{v}</span>
                    </label>
                    <Textarea id={`pg-v-${v}`} value={values[v] ?? ""} onChange={(e) => setValues((s) => ({ ...s, [v]: e.target.value }))} rows={1} placeholder={`Value for ${v}`} className="max-h-48 min-h-9 resize-y" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Panel>

          <Panel title="Models" description="Pick up to three to compare side by side.">
            {models === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                Loading the models this site can run…
              </div>
            ) : models.status === "off" ? (
              <div className="flex gap-3 rounded-xl border border-border bg-white/[0.02] p-3 text-sm">
                <CloudOffIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground/90"><Copy k="lab-tool.prompt-playground.ai-is-not-switched-on">AI is not switched on for this site yet.</Copy></span> You can still write and fill prompts here, and copy them into any model you use.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <ul className="flex flex-col gap-1.5">
                  {modelList.map((m) => (
                    <ModelOption key={m.id} m={m} on={picked.includes(m.id)} disabled={!picked.includes(m.id) && picked.length >= 3} onToggle={() => togglePick(m.id)} />
                  ))}
                </ul>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-foreground/90"><Copy k="lab-tool.prompt-playground.temperature">Temperature</Copy></span>
                    <span className="text-xs text-muted-foreground tabular">{temperature.toFixed(1)}</span>
                  </div>
                  <RangeSlider label="Temperature" value={temperature} onChange={setTemperature} min={0} max={LIMITS.temperatureMax} step={0.1} valueText={(v) => v.toFixed(1)} />
                  <p className="text-xs text-muted-foreground"><Copy k="lab-tool.prompt-playground.lower-is-more-predictable-higher">Lower is more predictable, higher more varied.</Copy></p>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Run"
        description={
          <span className="tabular">
            ≈{fmtInt(inTokens)} input tokens (estimated){unfilled.length > 0 && <span className="text-gold"> · not filled: {unfilled.join(", ")}</span>}
            {remaining != null && <span> · {remaining} runs left today</span>}
          </span>
        }
        actions={<CopyAction text={() => (renderedSystem.trim() ? `System:\n${renderedSystem}\n\nUser:\n${renderedPrompt}` : renderedPrompt)} label="Copy prompt" />}
      >
        {models?.status === "ok" ? (
          <Gate cap="ai.use" action="run prompts on the free models">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton onClick={run} disabled={running || !picked.length || !renderedPrompt.trim() || !!tooLong} className="h-10 border-ion/40 bg-ion/15 px-5 text-ion hover:bg-ion/20">
                  {running ? <Loader2Icon aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <PlayIcon aria-hidden className="size-4" />}
                  {running ? "Running…" : picked.length > 1 ? `Run on ${picked.length} models` : "Run"}
                </ActionButton>
                {running && (
                  <ActionButton onClick={() => abort.current?.abort()}>
                    <CircleStopIcon aria-hidden className="size-3.5" />
                    Stop
                  </ActionButton>
                )}
                {!picked.length && <span className="text-sm text-muted-foreground"><Copy k="lab-tool.prompt-playground.pick-a-model-above">Pick a model above.</Copy></span>}
                {tooLong && (
                  <span className="text-sm text-gold">
                    With the variables filled, the {tooLong} prompt is over {fmtInt(tooLong === "system" ? LIMITS.system : LIMITS.prompt)} characters. Shorten it to run.
                  </span>
                )}
              </div>
              {results.length > 0 && (
                <div className={cn("grid gap-3", results.length === 2 && "md:grid-cols-2", results.length === 3 && "md:grid-cols-2 xl:grid-cols-3")}>
                  {results.map((r) => (
                    <ResultCard key={r.model} r={r} inTokens={inTokens} />
                  ))}
                </div>
              )}
              {results.some((r) => r.text) && <p className="text-xs text-muted-foreground"><Copy k="lab-tool.prompt-playground.ai-generated-check-facts-before">AI-generated. Check facts before relying on them. Output token counts are estimates.</Copy></p>}
            </div>
          </Gate>
        ) : (
          <p className="text-sm text-muted-foreground">{models === null ? "Checking whether AI is available…" : "Running needs the site's AI, which is not available right now. Copy the prompt to use it elsewhere."}</p>
        )}
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Save and share" description="Saved prompts belong to your account. Shared ones open for anyone with the link.">
          {!live ? (
            <p className="text-sm text-muted-foreground"><Copy k="lab-tool.prompt-playground.accounts-are-not-available-on" multiline>Accounts are not available on this copy of the site, so prompts cannot be saved online. Run history needs the site&rsquo;s AI, which is off here too.</Copy></p>
          ) : me === undefined ? (
            <p className="text-sm text-muted-foreground"><Copy k="lab-tool.prompt-playground.checking-your-account">Checking your account…</Copy></p>
          ) : me === null ? (
            <p className="text-sm text-muted-foreground">
              <Link href="/sign-in?next=/lab/prompts" className="text-ion underline-offset-2 hover:underline">
                <Copy k="lab-tool.prompt-playground.sign-in">Sign in</Copy>
              </Link>{" "}
              to save prompts to your account and share them with a link.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <SwitchRow label="Share with a link" description="Anyone with the link can view and copy it, signed in or not." checked={shared} onChange={setShared} />
              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={save} disabled={saveState.busy || !prompt.trim()} className="border-ion/40 bg-ion/10 text-ion hover:bg-ion/15">
                  {saveState.busy ? <Loader2Icon aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" /> : <SaveIcon aria-hidden className="size-3.5" />}
                  {savedId ? "Update saved prompt" : "Save prompt"}
                </ActionButton>
                {savedId && (
                  <ActionButton onClick={() => { setSavedId(null); setSaveState({ busy: false }) }}>
                    <FilePlus2Icon aria-hidden className="size-3.5" />
                    Save as a copy next time
                  </ActionButton>
                )}
              </div>
              <div aria-live="polite" className="text-sm">
                {saveState.error && <p className="text-destructive">{saveState.error}</p>}
                {saveState.done && (
                  <p className="flex items-center gap-1.5 text-ok">
                    <CheckIcon aria-hidden className="size-4" />
                    {saveState.done}
                  </p>
                )}
              </div>
              {shareUrl && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-black/25 p-2.5">
                  <LinkIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{shareUrl}</code>
                  <CopyAction text={shareUrl} label="Copy link" />
                </div>
              )}
              <div>
                <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"><Copy k="lab-tool.prompt-playground.your-prompts">Your prompts</Copy></h3>
                {mine === null ? (
                  <p className="text-sm text-muted-foreground"><Copy k="lab-tool.prompt-playground.saving-prompts-is-not-switched">Saving prompts is not switched on for this site yet.</Copy></p>
                ) : mine.length === 0 ? (
                  <p className="text-sm text-muted-foreground"><Copy k="lab-tool.prompt-playground.nothing-saved-yet">Nothing saved yet.</Copy></p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {mine.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 py-1.5">
                        <button type="button" onClick={() => load({ ...p, values: p.variables, mine: true })} aria-current={p.id === savedId || undefined} className={cn("flex min-w-0 flex-1 flex-col rounded-lg px-2 py-1.5 text-left outline-none hover:bg-white/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50", p.id === savedId && "bg-white/[0.05]")}>
                          <span className="flex items-center gap-1.5 truncate text-sm">
                            {p.title}
                            {p.shared && <Share2Icon aria-label="Shared" className="size-3 text-ion" />}
                          </span>
                          <span className="truncate font-mono text-xs text-muted-foreground">{p.prompt.replace(/\s+/g, " ").slice(0, 80)}</span>
                        </button>
                        <button type="button" onClick={() => remove(p.id)} aria-label={`Delete ${p.title}`} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50">
                          <Trash2Icon aria-hidden className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="History"
          description="Your last 30 runs, kept in this browser only."
          actions={
            history.length > 0 && (
              <ActionButton onClick={() => writeList(HISTORY_KEY, [])}>
                <Trash2Icon aria-hidden className="size-3.5" />
                Clear
              </ActionButton>
            )
          }
        >
          {history.length === 0 && oldTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground"><Copy k="lab-tool.prompt-playground.runs-appear-here-after-the">Runs appear here after the first one.</Copy></p>
          ) : (
            <ul className="flex max-h-[50vh] flex-col divide-y divide-border overflow-auto">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      load({ title: h.title, system: h.system, prompt: h.prompt, values: h.values, temperature: h.temperature, models: h.results.map((r) => r.model) })
                      setResults(h.results)
                    }}
                    className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left outline-none hover:bg-white/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <HistoryIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                        {h.title}
                      </span>
                      <time dateTime={new Date(h.at).toISOString()} className="shrink-0 text-xs text-muted-foreground">
                        {new Date(h.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                      </time>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{h.results.map((r) => `${r.label}${r.ms ? ` ${(r.ms / 1000).toFixed(1)}s` : ""}`).join(" · ")}</span>
                  </button>
                </li>
              ))}
              {oldTemplates.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => load({ title: t.name, system: "", prompt: fromOldSyntax(t.template), values: t.values })} className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left outline-none hover:bg-white/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50">
                    <span className="truncate text-sm">{t.name}</span>
                    <span className="text-xs text-muted-foreground"><Copy k="lab-tool.prompt-playground.template-saved-in-this-browser">Template saved in this browser</Copy></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function ModelOption({ m, on, disabled, onToggle }: { m: AiModel; on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50", on ? "border-ion/40 bg-ion/[0.07]" : "border-border hover:bg-white/[0.03]", disabled && "cursor-not-allowed opacity-50")}>
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--ion)]" checked={on} disabled={disabled} onChange={onToggle} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{m.label}</span>
          <span className="text-xs text-muted-foreground">
            {m.provider}
            {m.context > 0 && ` · ${fmtInt(m.context)} context`}
            {m.notes && ` · ${m.notes}`}
          </span>
        </span>
      </label>
    </li>
  )
}

function ResultCard({ r, inTokens }: { r: RunResult; inTokens: number }) {
  const pending = !r.text && !r.error
  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-black/25 p-3" aria-busy={pending}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{r.label}</h3>
          <p className="text-xs text-muted-foreground tabular">
            {r.ms != null ? `${(r.ms / 1000).toFixed(2)} s` : pending ? "waiting…" : "—"}
            {r.provider && ` · ${r.provider}`}
            {r.outTokens != null && ` · ≈${fmtInt(inTokens)} in / ≈${fmtInt(r.outTokens)} out`}
            {r.ms && r.outTokens ? ` · ≈${Math.round(r.outTokens / (r.ms / 1000))} tok/s` : ""}
          </p>
        </div>
        {r.text && <CopyAction text={r.text} label="Copy" className="h-8 px-3" />}
      </header>
      {pending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[90, 75, 82, 40].map((w, k) => (
            <span key={k} className="h-2.5 animate-pulse rounded-full bg-white/[0.07] motion-reduce:animate-none" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : r.error ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {r.error}
        </p>
      ) : (
        <div className="max-h-[50vh] overflow-auto text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground/90" tabIndex={0} role="region" aria-label={`Answer from ${r.label}`}>
          {r.text}
        </div>
      )}
    </article>
  )
}
