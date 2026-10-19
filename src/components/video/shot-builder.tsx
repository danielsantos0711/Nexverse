"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import {
  ArrowUpIcon,
  FileClockIcon,
  HandIcon,
  LockIcon,
  MoveHorizontalIcon,
  MoveRightIcon,
  PlaneIcon,
  RotateCwIcon,
  RotateCcwIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon,
  type LucideIcon,
} from "lucide-react"
import { AiErrorText, AiLabel, AiLoading, useAiReady } from "@/components/ai/ai-bits"
import { primaryButton } from "@/components/forum/forum-ui"
import { TimeAgo } from "@/components/live/time"
import { ai, type AiRequestError, type VideoPromptResult } from "@/lib/ai-client"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
  ASPECTS,
  CAMERA_MOVES,
  composePrompt,
  createVideo,
  deleteVideo,
  DURATIONS,
  EMPTY_SHOT,
  LENSES,
  LIGHTING,
  listMyDrafts,
  MOODS,
  SHOT_TEMPLATES,
  shotFrom,
  shotSettings,
  STYLES,
  updateVideo,
  type Option,
  type Shot,
  type VideoPost,
} from "@/lib/video"
import { CopyText } from "./video-bits"

const STORE_KEY = "nexverse-shot-builder"

const MOVE_ICONS: Record<string, LucideIcon> = {
  static: LockIcon,
  "dolly-in": ZoomInIcon,
  "dolly-out": ZoomOutIcon,
  orbit: RotateCwIcon,
  "crane-up": ArrowUpIcon,
  tracking: MoveRightIcon,
  handheld: HandIcon,
  pan: MoveHorizontalIcon,
  "tilt-up": ArrowUpIcon,
  "push-in": ZoomInIcon,
  fpv: PlaneIcon,
  aerial: PlaneIcon,
}

const input =
  "h-10 w-full rounded-xl border border-border bg-secondary/40 px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

type Saved = { shot: Shot; manual: string | null; title: string; draftId: string | null }

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Saved>
    return {
      shot: shotFrom((v.shot ?? {}) as Record<string, unknown>),
      manual: typeof v.manual === "string" ? v.manual.slice(0, 4000) : null,
      title: typeof v.title === "string" ? v.title.slice(0, 120) : "",
      draftId: typeof v.draftId === "string" ? v.draftId : null,
    }
  } catch {
    return null
  }
}

/** A radio group of tiles. Optional groups get an "Any" tile that leaves the choice to the model. */
function Choices({ legend, options, value, onChange, optional, icons, columns = "grid-cols-2 sm:grid-cols-3" }: {
  legend: string
  options: Option[]
  value: string
  onChange: (v: string) => void
  optional?: boolean
  icons?: Record<string, LucideIcon>
  columns?: string
}) {
  const name = useId()
  const all = optional ? [{ id: "", label: "Any", phrase: "", hint: "Leave it to the model" }, ...options] : options
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={cn("grid gap-1.5", columns)}>
        {all.map((o) => {
          const Icon = icons?.[o.id]
          return (
            <label
              key={o.id || "any"}
              className={cn(
                "relative flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                value === o.id ? "border-ion/50 bg-ion/10 text-foreground" : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} className="sr-only" />
              <span className="flex items-center gap-1.5 font-medium">
                {Icon && <Icon aria-hidden className={cn("size-3.5 shrink-0", value === o.id ? "text-ion" : "")} />}
                {o.label}
              </span>
              {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** A compact segmented control (duration, aspect). */
function Segments<T extends string | number>({ legend, options, value, onChange }: { legend: string; options: { id: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void }) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={String(o.id)}
            title={o.hint}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-sm tabular transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              value === o.id ? "border-ion/50 bg-ion/10 text-ion" : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
            )}
          >
            <input type="radio" name={name} checked={value === o.id} onChange={() => onChange(o.id)} className="sr-only" />
            {o.label}
            {o.hint && <span className="sr-only"> ({o.hint})</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** A viewfinder that shows the frame shape, lens, duration and camera move as you choose them. */
function Viewfinder({ shot }: { shot: Shot }) {
  const [w, h] = shot.aspect.split(":").map(Number)
  const Move = MOVE_ICONS[shot.camera] ?? LockIcon
  const move = CAMERA_MOVES.find((m) => m.id === shot.camera)
  const lens = LENSES.find((l) => l.id === shot.lens)
  const tall = h > w
  return (
    <div className="grid place-items-center rounded-2xl border border-border bg-black/60 p-4" aria-hidden>
      <div
        className="relative w-full overflow-hidden rounded-md border border-white/20 bg-[radial-gradient(70%_80%_at_50%_40%,rgb(143_180_255/0.16),transparent_70%),#05070c] transition-[aspect-ratio] duration-300 motion-reduce:transition-none"
        style={{ aspectRatio: `${w} / ${h}`, maxWidth: tall ? "9rem" : "100%" }}
      >
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="border-[0.5px] border-white/[0.07]" />
          ))}
        </div>
        {["top-1.5 left-1.5 border-t border-l", "top-1.5 right-1.5 border-t border-r", "bottom-1.5 left-1.5 border-b border-l", "bottom-1.5 right-1.5 border-b border-r"].map((c) => (
          <span key={c} className={cn("absolute size-3 border-white/60", c)} />
        ))}
        <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ion/40 bg-ion/10 text-ion">
          <Move className="size-4" />
        </span>
        <span className="absolute top-2 left-1/2 flex -translate-x-1/2 items-center gap-1 font-mono text-[10px] text-white/70">
          <span className="size-1.5 rounded-full bg-red-500 motion-safe:animate-pulse" /> REC
        </span>
        <span className="absolute bottom-2 left-2.5 font-mono text-[10px] text-white/70 tabular">00:{String(shot.duration).padStart(2, "0")}</span>
        <span className="absolute right-2.5 bottom-2 font-mono text-[10px] text-white/70">{shot.aspect}</span>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {move?.label} · {lens?.label}
      </p>
    </div>
  )
}

/**
 * The shot builder: pick what happens and how it is filmed, and it writes a clean text-to-video prompt as you
 * go. The prompt can be edited by hand, copied, saved as a draft (members) or shared with the video it made.
 */
export function ShotBuilder() {
  const router = useRouter()
  const { ready, user } = useSession()
  const aiReady = useAiReady()
  const [shot, setShot] = useState<Shot>(EMPTY_SHOT)
  const [manual, setManual] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [draftId, setDraftId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<VideoPost[] | null>(null)
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<AiRequestError | Error | null>(null)
  const [suggestion, setSuggestion] = useState<VideoPromptResult | null>(null)
  const loaded = useRef(false)

  // Start from the address (remix links) or from what this browser kept last time.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const fromShot = q.get("shot")
    const fromPrompt = q.get("prompt")
    let start: Saved | null = null
    if (fromShot) {
      try {
        start = { shot: shotFrom(JSON.parse(fromShot) as Record<string, unknown>), manual: null, title: "", draftId: null }
      } catch {}
    } else if (fromPrompt) {
      start = { shot: EMPTY_SHOT, manual: fromPrompt.slice(0, 4000), title: "", draftId: null }
    }
    start ??= readSaved()
    if (start) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restores the builder once mounted (the page is prerendered empty)
      setShot(start.shot)
      setManual(start.manual)
      setTitle(start.title)
      setDraftId(start.draftId)
    }
    loaded.current = true
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ shot, manual, title, draftId }))
    } catch {}
  }, [shot, manual, title, draftId])

  useEffect(() => {
    if (!live || !ready || !user) return
    let stale = false
    listMyDrafts()
      .then((d) => !stale && setDrafts(d))
      .catch(() => !stale && setDrafts([]))
    return () => {
      stale = true
    }
  }, [ready, user])

  const composed = useMemo(() => composePrompt(shot), [shot])
  const prompt = manual ?? composed
  const hasScene = Boolean(shot.subject.trim() || shot.action.trim() || shot.setting.trim())
  const set = <K extends keyof Shot>(k: K, v: Shot[K]) => setShot((s) => ({ ...s, [k]: v }))

  function reset() {
    setShot(EMPTY_SHOT)
    setManual(null)
    setTitle("")
    setDraftId(null)
    setSuggestion(null)
    setStatus(null)
  }

  async function saveDraft() {
    setStatus(null)
    if (!user) {
      router.push(`/sign-in?next=${encodeURIComponent("/video/builder")}`)
      return
    }
    const name = title.trim() || shot.subject.trim().slice(0, 80) || "Untitled shot"
    const input = { status: "draft" as const, title: name.length < 3 ? `${name} shot` : name, videoUrl: "", posterUrl: "", prompt, model: "", tool: "", settings: shotSettings(shot), tags: [] }
    setSaving(true)
    try {
      const saved = draftId ? await updateVideo(draftId, input).catch(() => createVideo(input)) : await createVideo(input)
      setDraftId(saved.id)
      setTitle(saved.title)
      setDrafts((d) => [saved, ...(d ?? []).filter((x) => x.id !== saved.id)])
      setStatus({ kind: "ok", text: "Saved to your drafts. Only you can see it." })
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Saving failed. Try again." })
    } finally {
      setSaving(false)
    }
  }

  function shareHref() {
    const q = new URLSearchParams()
    if (draftId) q.set("draft", draftId)
    q.set("shot", JSON.stringify(shot))
    if (manual) q.set("prompt", manual.slice(0, 1500))
    if (title.trim()) q.set("title", title.trim().slice(0, 120))
    return `/video/share?${q.toString()}` as const
  }

  function openDraft(d: VideoPost) {
    const s = shotFrom(d.settings)
    setShot(s)
    setManual(d.prompt && d.prompt !== composePrompt(s) ? d.prompt : null)
    setTitle(d.title)
    setDraftId(d.id)
    setSuggestion(null)
    setStatus({ kind: "ok", text: `Opened “${d.title}”.` })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function removeDraft(d: VideoPost) {
    if (!window.confirm(`Delete the draft “${d.title}”?`)) return
    try {
      await deleteVideo(d)
      setDrafts((list) => (list ?? []).filter((x) => x.id !== d.id))
      if (draftId === d.id) setDraftId(null)
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Deleting failed." })
    }
  }

  async function improve() {
    setAiError(null)
    setSuggestion(null)
    const idea = prompt.trim()
    if (idea.length < 8) {
      setAiError(new Error("Describe the shot first: at least a subject or an action."))
      return
    }
    setAiBusy(true)
    try {
      const res = await ai.videoPrompt({
        idea: idea.slice(0, 2000),
        style: [STYLES.find((s) => s.id === shot.style)?.phrase, MOODS.find((m) => m.id === shot.mood)?.phrase].filter(Boolean).join(", ") || undefined,
        camera: [CAMERA_MOVES.find((c) => c.id === shot.camera)?.phrase, LENSES.find((l) => l.id === shot.lens)?.phrase].filter(Boolean).join(", ") || undefined,
        duration: shot.duration,
      })
      setSuggestion(res.data)
    } catch (e) {
      setAiError(e as AiRequestError)
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-7">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Start from a template</p>
            <div className="flex flex-wrap gap-1.5">
              {SHOT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setShot({ ...EMPTY_SHOT, ...t.shot })
                    setManual(null)
                    setSuggestion(null)
                  }}
                  className="pressable rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <RotateCcwIcon aria-hidden className="size-3.5" /> Clear
              </button>
            </div>
          </div>

          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-medium">The scene</legend>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Subject</span>
              <input className={input} value={shot.subject} maxLength={200} onChange={(e) => set("subject", e.target.value)} placeholder="a lone astronaut" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Action</span>
              <input className={input} value={shot.action} maxLength={200} onChange={(e) => set("action", e.target.value)} placeholder="walks toward the ridge" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Setting</span>
              <input className={input} value={shot.setting} maxLength={200} onChange={(e) => set("setting", e.target.value)} placeholder="a red desert at dusk" />
            </label>
          </fieldset>

          <Choices legend="Camera move" options={CAMERA_MOVES} value={shot.camera} onChange={(v) => set("camera", v)} icons={MOVE_ICONS} columns="grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" />
          <Choices legend="Lens" options={LENSES} value={shot.lens} onChange={(v) => set("lens", v)} />
          <Choices legend="Lighting" options={LIGHTING} value={shot.lighting} onChange={(v) => set("lighting", v)} optional columns="grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" />
          <div className="grid gap-7 md:grid-cols-2">
            <Choices legend="Mood" options={MOODS} value={shot.mood} onChange={(v) => set("mood", v)} optional columns="grid-cols-2" />
            <Choices legend="Look" options={STYLES} value={shot.style} onChange={(v) => set("style", v)} optional columns="grid-cols-2" />
          </div>
          <div className="grid gap-7 sm:grid-cols-2">
            <Segments legend="Duration" options={DURATIONS.map((d) => ({ id: d, label: `${d} s` }))} value={shot.duration} onChange={(v) => set("duration", v)} />
            <Segments legend="Aspect ratio" options={ASPECTS.map((a) => ({ id: a.id as string, label: a.label, hint: a.hint }))} value={shot.aspect} onChange={(v) => set("aspect", v)} />
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Keep out (optional)</span>
            <input className={input} value={shot.avoid} maxLength={200} onChange={(e) => set("avoid", e.target.value)} placeholder="text, logos, extra limbs" />
            <span className="text-xs text-muted-foreground">Added as “Avoid …”. Models with a negative-prompt field work better with it there.</span>
          </label>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Viewfinder shot={shot} />
          <div className="glass flex flex-col gap-3 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="shot-prompt" className="text-sm font-medium">
                Prompt
              </label>
              {manual !== null ? (
                <button type="button" onClick={() => setManual(null)} className="text-xs text-ion hover:underline">
                  Edited by hand · rebuild from choices
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">Updates as you choose</span>
              )}
            </div>
            <textarea
              id="shot-prompt"
              value={prompt}
              onChange={(e) => setManual(e.target.value.slice(0, 4000))}
              rows={8}
              placeholder="Fill in the scene to write the prompt."
              className="min-h-40 w-full resize-y rounded-xl border border-border bg-black/30 p-3 text-sm leading-relaxed focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <p className="text-xs text-muted-foreground tabular">
              {prompt.length} characters{!hasScene && manual === null ? " · add a subject, action or setting" : ""}
            </p>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Name (for drafts)</span>
              <input className={input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={shot.subject || "Untitled shot"} />
            </label>
            <div className="flex flex-wrap gap-2">
              <CopyText text={prompt} />
              {live && (
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={saving || !prompt.trim()}
                  className="pressable inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/60 px-3.5 text-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <SaveIcon aria-hidden className="size-4" />
                  {saving ? "Saving…" : draftId ? "Update draft" : "Save draft"}
                </button>
              )}
              {live && (
                <Link href={shareHref()} className={primaryButton}>
                  <UploadIcon aria-hidden className="size-4" /> Share with a video
                </Link>
              )}
            </div>
            {!live && <p className="text-xs text-muted-foreground">Drafts and sharing need member accounts, which are not switched on for this copy of Nexverse. Copy the prompt to use it anywhere.</p>}
            {live && ready && !user && <p className="text-xs text-muted-foreground">Sign in to save drafts and share videos.</p>}
            {status && (
              <p role={status.kind === "error" ? "alert" : "status"} className={cn("text-sm", status.kind === "error" ? "text-destructive" : "text-ok")}>
                {status.text}
              </p>
            )}
          </div>

          {aiReady.usable && (
            <div className="glass flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Improve with AI</p>
                <button
                  type="button"
                  onClick={improve}
                  disabled={aiBusy || prompt.trim().length < 8}
                  className="pressable inline-flex h-8 items-center gap-1.5 rounded-full border border-ion/40 bg-ion/10 px-3 text-sm text-ion transition-colors hover:bg-ion/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <SparklesIcon aria-hidden className="size-3.5" />
                  {aiBusy ? "Working…" : suggestion ? "Try again" : "Improve"}
                </button>
              </div>
              {aiBusy && <AiLoading label="Writing a fuller prompt…" />}
              {aiError && <AiErrorText error={aiError} />}
              {suggestion && !aiBusy && (
                <div className="flex flex-col gap-2">
                  <AiLabel />
                  {suggestion.title && <p className="text-sm font-medium">{suggestion.title}</p>}
                  <p className="rounded-xl border border-border bg-black/30 p-3 text-sm leading-relaxed whitespace-pre-line">{suggestion.prompt}</p>
                  {suggestion.negative && <p className="text-xs text-muted-foreground">Keep out: {suggestion.negative}</p>}
                  {suggestion.shots.length > 1 && (
                    <ol className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {suggestion.shots.map((s, i) => (
                        <li key={i}>
                          <span className="text-foreground/80 tabular">
                            {i + 1}. {s.duration}s
                          </span>{" "}
                          {s.description}
                        </li>
                      ))}
                    </ol>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setManual(suggestion.prompt.slice(0, 4000))
                      if (suggestion.title && !title.trim()) setTitle(suggestion.title.slice(0, 120))
                      setSuggestion(null)
                    }}
                    className={cn(primaryButton, "self-start")}
                  >
                    Use this prompt
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {live && user && (
        <section aria-labelledby="drafts-h" className="flex flex-col gap-3">
          <h2 id="drafts-h" className="flex items-center gap-2 text-base font-semibold">
            <FileClockIcon aria-hidden className="size-4 text-gold" /> Your drafts
          </h2>
          {drafts === null ? (
            <p className="text-sm text-muted-foreground">Loading your drafts…</p>
          ) : drafts.length ? (
            <ul className="grid gap-2 md:grid-cols-2">
              {drafts.map((d) => (
                <li key={d.id} className={cn("flex items-start gap-3 rounded-xl border bg-card/60 p-3", d.id === draftId ? "border-ion/50" : "border-border")}>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{d.prompt || "No prompt yet"}</p>
                    <TimeAgo date={d.updatedAt} prefix="Saved" className="text-xs text-muted-foreground/80" />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => openDraft(d)} className="rounded-full px-2.5 py-1 text-xs text-ion hover:bg-ion/10">
                      Open
                    </button>
                    <button type="button" onClick={() => removeDraft(d)} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive" aria-label={`Delete the draft “${d.title}”`}>
                      <Trash2Icon aria-hidden className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No drafts yet. “Save draft” keeps a shot here, visible only to you.</p>
          )}
        </section>
      )}
    </div>
  )
}
