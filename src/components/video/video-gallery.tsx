"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { CameraIcon, ColumnsIcon, FilmIcon, SearchIcon, UploadIcon, XIcon } from "lucide-react"
import { primaryButton, rise, riseDelay } from "@/components/forum/forum-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { listVideos, videoModels, videoTags, type VideoPost } from "@/lib/video"
import { VideoCard } from "./video-bits"

type Sort = "newest" | "liked"

const chip = (on: boolean) =>
  cn(
    "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    on ? "border-ion/50 bg-ion/10 text-ion" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
  )

/** Every shared video, with search, model and tag filters, two sorts, and picking two to compare. */
export function VideoGallery() {
  const { ready, user } = useSession()
  const [videos, setVideos] = useState<VideoPost[] | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [model, setModel] = useState("")
  const [tag, setTag] = useState("")
  const [sort, setSort] = useState<Sort>("newest")
  const [picked, setPicked] = useState<string[]>([])

  // Filters can come in the address (?model=Veo&tag=space), from the links on a video's page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const m = (q.get("model") ?? "").slice(0, 80)
    const t = q.get("tag") ?? ""
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page is prerendered without search params; read them once mounted
    if (m) setModel(m)
    if (/^[a-z0-9-]{1,24}$/.test(t)) setTag(t)
  }, [])

  const load = useCallback(() => {
    listVideos()
      .then((list) => {
        setVideos(list)
        setError("")
      })
      .catch((e: Error) => {
        setError(e.message)
        setVideos((v) => v ?? [])
      })
  }, [])

  useEffect(() => {
    if (live && !ready) return
    load()
  }, [load, ready, user?.id])

  const models = useMemo(() => (videos ? videoModels(videos).slice(0, 10) : []), [videos])
  const tags = useMemo(() => (videos ? videoTags(videos).slice(0, 14) : []), [videos])

  const shown = useMemo(() => {
    if (!videos) return []
    const q = query.trim().toLowerCase()
    const list = videos.filter(
      (v) =>
        (!model || v.model.trim().toLowerCase() === model.toLowerCase()) &&
        (!tag || v.tags.includes(tag)) &&
        (!q || `${v.title} ${v.prompt} ${v.model} ${v.tool} ${v.tags.join(" ")}`.toLowerCase().includes(q))
    )
    return sort === "liked" ? [...list].sort((a, b) => b.likes - a.likes || b.createdAt.localeCompare(a.createdAt)) : list
  }, [videos, query, model, tag, sort])

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]))

  if (!videos) {
    return (
      <div aria-busy="true" aria-label="Loading videos" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
        ))}
      </div>
    )
  }

  if (!videos.length) return <EmptyGallery error={error} />

  const filtered = Boolean(query || model || tag)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-60">
          <span className="sr-only">Search videos</span>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, prompts, models"
            className="h-9 w-full rounded-full border border-border bg-secondary/40 pr-3 pl-9 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <div role="group" aria-label="Sort" className="flex gap-1">
          <button type="button" className={chip(sort === "newest")} aria-pressed={sort === "newest"} onClick={() => setSort("newest")}>
            Newest
          </button>
          <button type="button" className={chip(sort === "liked")} aria-pressed={sort === "liked"} onClick={() => setSort("liked")}>
            Most liked
          </button>
        </div>
      </div>
      {models.length > 0 && (
        <div role="group" aria-label="Filter by model" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          <button type="button" className={chip(!model)} aria-pressed={!model} onClick={() => setModel("")}>
            All models
          </button>
          {models.map((m) => (
            <button key={m} type="button" className={chip(model.toLowerCase() === m.toLowerCase())} aria-pressed={model.toLowerCase() === m.toLowerCase()} onClick={() => setModel(model.toLowerCase() === m.toLowerCase() ? "" : m)}>
              {m}
            </button>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button key={t} type="button" className={cn(chip(tag === t), "h-7 px-2.5 text-xs")} aria-pressed={tag === t} onClick={() => setTag(tag === t ? "" : t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {shown.length} of {videos.length} {videos.length === 1 ? "video" : "videos"}
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setQuery("")
              setModel("")
              setTag("")
            }}
            className="ml-2 text-ion hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="hidden sm:inline"> · Pick two with “Compare” to see them side by side.</span>
      </p>
      {shown.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((v, i) => (
            <li key={v.id} className={rise} style={riseDelay(i)}>
              <VideoCard post={v} selected={picked.includes(v.id)} onSelect={() => toggle(v.id)} className="h-full" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No videos match these filters.</p>
      )}
      {picked.length > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex w-full max-w-md items-center gap-2 rounded-full border border-border bg-popover/95 p-1.5 pl-4 shadow-lg">
          <ColumnsIcon aria-hidden className="size-4 shrink-0 text-ion" />
          <span className="min-w-0 flex-1 truncate text-sm">{picked.length === 1 ? "Pick one more to compare" : "Two videos picked"}</span>
          <button type="button" onClick={() => setPicked([])} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Clear the comparison">
            <XIcon aria-hidden className="size-4" />
          </button>
          {picked.length === 2 && (
            <Link href={`/video/compare?a=${picked[0]}&b=${picked[1]}`} className={primaryButton}>
              Compare
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/** No videos yet: say so plainly and offer the two ways to start. */
function EmptyGallery({ error }: { error: string }) {
  return (
    <div className="relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_0%,rgb(143_180_255/0.12),transparent_70%)]" />
      <span className="grid size-12 place-items-center rounded-2xl border border-ion/25 bg-ion/10 text-ion">
        <FilmIcon aria-hidden className="size-6" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="text-lg font-semibold">No videos shared yet</h2>
        <p className="text-sm text-muted-foreground">
          {live
            ? "Be the first: share an AI video you made, with the prompt and model behind it, so others can learn from it and remix it."
            : "Sharing needs member accounts, which are not switched on for this copy of Nexverse. The shot builder works without an account."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {live && (
          <Link href="/video/share" className={primaryButton}>
            <UploadIcon aria-hidden className="size-4" /> Share the first video
          </Link>
        )}
        <Link
          href="/video/builder"
          className="pressable inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <CameraIcon aria-hidden className="size-4" /> Build a shot
        </Link>
      </div>
    </div>
  )
}
