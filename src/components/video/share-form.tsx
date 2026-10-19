"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { CheckCircle2Icon, FileVideoIcon, ImageIcon, LinkIcon, Loader2Icon, UploadIcon } from "lucide-react"
import { primaryButton } from "@/components/forum/forum-ui"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
  canUpload,
  cleanTags,
  composePrompt,
  createVideo,
  discardUpload,
  getVideo,
  lookupVideo,
  MAX_UPLOAD_MB,
  MODEL_SUGGESTIONS,
  parseVideoUrl,
  shotFrom,
  shotSettings,
  TOOL_SUGGESTIONS,
  updateVideo,
  uploadVideoFile,
  youtubePoster,
  type NewVideo,
  type VideoSource,
} from "@/lib/video"
import { LitePlayer } from "./lite-player"

const input =
  "h-10 w-full rounded-xl border border-border bg-secondary/40 px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

type Mode = "link" | "upload"

/**
 * Share a video you made: a YouTube or Vimeo link (checked with the host's oEmbed endpoint) or a short clip
 * uploaded here, plus the prompt, model, tool, settings and tags. Opened from the shot builder it arrives
 * with the prompt and settings filled in; opened with ?draft=<id> it publishes that draft.
 */
export function ShareVideoForm() {
  const router = useRouter()
  const { ready, user } = useSession()
  const role = useRole()
  const models = useId()
  const tools = useId()
  const [mode, setMode] = useState<Mode>("link")
  const [link, setLink] = useState("")
  const [source, setSource] = useState<VideoSource | null>(null)
  const [checking, setChecking] = useState(false)
  const [linkNote, setLinkNote] = useState("")
  const [poster, setPoster] = useState("")
  const [uploading, setUploading] = useState<"" | "video" | "poster">("")
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState("")
  const [tool, setTool] = useState("")
  const [tags, setTags] = useState("")
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [draftId, setDraftId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const uploads = useRef<string[]>([])
  const published = useRef(false)

  // Arriving from the shot builder (?shot=…&prompt=…&title=…) or with a draft to publish (?draft=<id>).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const shotRaw = q.get("shot")
    if (shotRaw) {
      try {
        const shot = shotFrom(JSON.parse(shotRaw) as Record<string, unknown>)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fills the form from the address once mounted
        setSettings(shotSettings(shot))
        setPrompt((q.get("prompt") ?? composePrompt(shot)).slice(0, 4000))
      } catch {}
    } else if (q.get("prompt")) {
      setPrompt((q.get("prompt") ?? "").slice(0, 4000))
    }
    if (q.get("title")) setTitle((q.get("title") ?? "").slice(0, 120))
    const draft = q.get("draft")
    if (draft && live) {
      getVideo(draft)
        .then((d) => {
          if (!d || !d.mine) return
          setDraftId(d.id)
          setTitle((t) => t || d.title)
          setPrompt((p) => p || d.prompt)
          setSettings((s) => (Object.keys(s).length ? s : d.settings))
          setModel(d.model)
          setTool(d.tool)
          setTags(d.tags.join(", "))
        })
        .catch(() => {})
    }
  }, [])

  // Uploaded files that never made it into a post are removed when the page closes.
  useEffect(() => {
    const list = uploads.current
    return () => {
      if (!published.current) for (const u of list) void discardUpload(u)
    }
  }, [])

  async function checkLink(value: string) {
    setLinkNote("")
    const s = parseVideoUrl(value)
    if (!s || s.kind === "file") {
      setSource(null)
      if (value.trim()) setLinkNote("Paste a YouTube or Vimeo link, for example https://youtu.be/… or https://vimeo.com/….")
      return
    }
    setSource(s)
    setPoster(s.kind === "youtube" ? youtubePoster(s.id) : "")
    setChecking(true)
    const found = await lookupVideo(s)
    setChecking(false)
    if (!found) {
      setLinkNote("Could not confirm this video. It may be private, removed or not embeddable. You can still share it if you are sure it plays.")
      return
    }
    if (found.poster) setPoster(found.poster)
    setTitle((t) => t || found.title)
  }

  async function upload(file: File | undefined, kind: "video" | "poster") {
    if (!file) return
    setError("")
    setUploading(kind)
    try {
      const url = await uploadVideoFile(file, kind)
      uploads.current.push(url)
      if (kind === "video") {
        setSource(parseVideoUrl(url))
        setLink(url)
      } else setPoster(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed. Try again.")
    } finally {
      setUploading("")
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!source) {
      setError(mode === "link" ? "Paste a YouTube or Vimeo link first." : "Upload the video file first.")
      return
    }
    const post: NewVideo = {
      status: "published",
      title,
      videoUrl: link,
      posterUrl: poster,
      prompt,
      model,
      tool,
      settings,
      tags: cleanTags(tags.split(/[,\s]+/)),
    }
    setSaving(true)
    try {
      const saved = draftId ? await updateVideo(draftId, post) : await createVideo(post)
      published.current = true
      router.push(`/video/${saved.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sharing failed. Try again.")
      setSaving(false)
    }
  }

  if (!live) {
    return (
      <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
        Sharing videos needs member accounts, which are not switched on for this copy of Nexverse. The{" "}
        <Link href="/video/builder" className="text-ion hover:underline">
          shot builder
        </Link>{" "}
        works without one.
      </p>
    )
  }
  if (!ready) return <p className="text-sm text-muted-foreground">Checking your session…</p>
  if (!user) {
    return (
      <div className="glass flex flex-col items-start gap-3 rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">Sign in to share a video. It takes an email address and nothing else.</p>
        <Link href={`/sign-in?next=${encodeURIComponent("/video/share")}`} className={primaryButton}>
          Sign in
        </Link>
      </div>
    )
  }
  if (role.suspended) {
    return <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">Your account is paused, so you cannot share videos right now.</p>
  }

  const tab = (m: Mode, label: string, Icon: typeof LinkIcon) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => {
        setMode(m)
        setSource(null)
        setLink("")
        setLinkNote("")
        setPoster("")
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </button>
  )

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" noValidate>
      <div className="flex min-w-0 flex-col gap-6">
        {draftId && <p className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">Publishing your draft. Add the video and it goes live.</p>}
        <section className="flex flex-col gap-3">
          <div role="tablist" aria-label="How to add the video" className="glass flex self-start rounded-full p-1">
            {tab("link", "YouTube or Vimeo link", LinkIcon)}
            {canUpload() && tab("upload", "Upload a clip", UploadIcon)}
          </div>
          {mode === "link" ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Video link</span>
              <input
                className={input}
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onBlur={(e) => void checkLink(e.target.value)}
                onPaste={(e) => {
                  const v = e.clipboardData.getData("text")
                  setTimeout(() => void checkLink(v), 0)
                }}
                placeholder="https://www.youtube.com/watch?v=…"
                aria-describedby="link-note"
              />
              <span id="link-note" className={cn("text-xs", linkNote ? "text-gold" : "text-muted-foreground")} aria-live="polite">
                {checking ? "Checking the link…" : linkNote || (source ? `Found on ${source.kind === "youtube" ? "YouTube" : "Vimeo"}.` : "Public or unlisted videos on YouTube or Vimeo.")}
              </span>
            </label>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <span className="font-medium">Video file</span>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-5 transition-colors hover:bg-secondary/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                {uploading === "video" ? <Loader2Icon aria-hidden className="size-5 animate-spin text-ion" /> : source ? <CheckCircle2Icon aria-hidden className="size-5 text-ok" /> : <FileVideoIcon aria-hidden className="size-5 text-muted-foreground" />}
                <span className="flex flex-col">
                  <span>{uploading === "video" ? "Uploading…" : source ? "Uploaded. Choose another file to replace it." : "Choose an MP4 or WebM file"}</span>
                  <span className="text-xs text-muted-foreground">Up to {MAX_UPLOAD_MB} MB. Longer videos are better on YouTube or Vimeo.</span>
                </span>
                <input type="file" accept="video/mp4,video/webm" className="sr-only" disabled={Boolean(uploading)} onChange={(e) => void upload(e.target.files?.[0], "video")} />
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-3 transition-colors hover:bg-secondary/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                {uploading === "poster" ? <Loader2Icon aria-hidden className="size-4 animate-spin text-ion" /> : <ImageIcon aria-hidden className="size-4 text-muted-foreground" />}
                <span className="flex flex-col">
                  <span>{poster ? "Poster added. Choose another to replace it." : "Poster image (optional)"}</span>
                  <span className="text-xs text-muted-foreground">JPEG, PNG or WebP, shown before the video plays.</span>
                </span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={Boolean(uploading)} onChange={(e) => void upload(e.target.files?.[0], "poster")} />
              </label>
            </div>
          )}
        </section>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Title</span>
          <input className={input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} required placeholder="Nebula drift, one take" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Prompt</span>
          <textarea
            value={prompt}
            maxLength={4000}
            rows={6}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="The prompt you used, as written. Others can copy and remix it."
            className="w-full resize-y rounded-xl border border-border bg-secondary/40 p-3 text-sm leading-relaxed placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <span className="text-xs text-muted-foreground">
            Writing one from scratch?{" "}
            <Link href="/video/builder" className="text-ion hover:underline">
              Use the shot builder
            </Link>
            .
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Model</span>
            <input className={input} value={model} maxLength={80} list={models} onChange={(e) => setModel(e.target.value)} placeholder="Veo, Sora, Wan…" />
            <datalist id={models}>
              {MODEL_SUGGESTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Tool</span>
            <input className={input} value={tool} maxLength={80} list={tools} onChange={(e) => setTool(e.target.value)} placeholder="ComfyUI, Runway…" />
            <datalist id={tools}>
              {TOOL_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Tags</span>
          <input className={input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="space, music-video, one-take" />
          <span className="text-xs text-muted-foreground">Up to 5, separated by commas.</span>
        </label>
        {Object.keys(settings).length > 0 && (
          <p className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            Shot settings from the builder are attached, so others can remix them.
            <button type="button" onClick={() => setSettings({})} className="shrink-0 text-ion hover:underline">
              Remove
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving || Boolean(uploading)} className={cn(primaryButton, "disabled:opacity-60")}>
            {saving ? "Sharing…" : "Share video"}
          </button>
          <Link href="/video" className="inline-flex h-9 items-center rounded-full px-4 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
        </div>
      </div>
      <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        <p className="text-sm font-medium">Preview</p>
        <LitePlayer source={source} poster={poster || null} title={title || "Your video"} />
        <p className="text-xs text-muted-foreground">Nothing plays until someone presses play. Be sure you have the rights to share the video, and follow the rules of the tool that made it.</p>
      </aside>
    </form>
  )
}
