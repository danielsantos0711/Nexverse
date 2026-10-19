"use client"

import { useState } from "react"
import { FilmIcon, PlayIcon } from "lucide-react"
import { embedUrl, sourceLabel, type VideoSource } from "@/lib/video"
import { cn } from "@/lib/utils"

/**
 * A video that costs nothing until someone asks for it: a poster and a play button. YouTube and Vimeo players
 * are mounted only after the click (from youtube-nocookie.com and with Vimeo's do-not-track flag); uploaded
 * clips use a native player with preload="none", so not a byte of video loads before play.
 */
export function LitePlayer({ source, poster, title, className }: { source: VideoSource | null; poster: string | null; title: string; className?: string }) {
  const [playing, setPlaying] = useState(false)
  const frame = cn("relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black", className)

  if (!source) {
    return (
      <div className={cn(frame, "grid place-items-center text-sm text-muted-foreground")}>
        <span className="flex items-center gap-2">
          <FilmIcon aria-hidden className="size-4" /> No video attached yet
        </span>
      </div>
    )
  }

  if (source.kind === "file") {
    return (
      <div className={frame}>
        <video controls preload="none" playsInline poster={poster ?? undefined} className="absolute inset-0 size-full bg-black object-contain" aria-label={title}>
          <source src={source.url} type={source.type} />
          Your browser cannot play this video.{" "}
          <a href={source.url} className="underline">
            Download it
          </a>
          .
        </video>
      </div>
    )
  }

  const src = embedUrl(source)
  if (playing && src) {
    return (
      <div className={frame}>
        <iframe
          src={src}
          title={title}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full"
        />
      </div>
    )
  }

  return (
    <div className={frame}>
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails from YouTube, Vimeo or Supabase Storage; hosts are checked in lib/video
        <img src={poster} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
      ) : (
        <PosterFallback seed={title} />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="group absolute inset-0 grid place-items-center focus-visible:outline-none"
        aria-label={`Play “${title}” (loads the ${sourceLabel(source)} player)`}
      >
        <span className="grid size-16 place-items-center rounded-full border border-white/25 bg-black/55 text-white shadow-[0_0_40px_rgb(143_180_255/0.35)] transition-transform duration-200 ease-out group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-ion group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-black motion-reduce:transition-none">
          <PlayIcon aria-hidden className="ml-1 size-7 fill-current" />
        </span>
      </button>
      <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white/85">{sourceLabel(source)} · loads on play</span>
    </div>
  )
}

/** A quiet starfield still for posts without a thumbnail, different for every title. */
export function PosterFallback({ seed, className }: { seed: string; className?: string }) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const hue = 200 + (h % 70)
  const x = 20 + (h % 60)
  const y = 25 + ((h >> 8) % 50)
  return (
    <div
      aria-hidden
      className={cn("absolute inset-0", className)}
      style={{
        // Static stars (no animation: a gallery can show dozens of these), then two soft nebula glows.
        background: `radial-gradient(1px 1px at 18% 28%, #fff, transparent), radial-gradient(1px 1px at 72% 18%, #dbe6ff, transparent), radial-gradient(1.5px 1.5px at 44% 76%, #fff, transparent), radial-gradient(1px 1px at 86% 64%, #d8c59e, transparent), radial-gradient(60% 80% at ${x}% ${y}%, hsl(${hue} 70% 55% / 0.35), transparent 70%), radial-gradient(40% 60% at ${100 - x}% ${100 - y}%, hsl(${(hue + 160) % 360} 60% 60% / 0.18), transparent 70%), #07090f`,
      }}
    >
      <FilmIcon className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-white/25" />
    </div>
  )
}
