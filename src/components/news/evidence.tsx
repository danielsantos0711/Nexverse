import { BadgeCheckIcon, CircleHelpIcon, EyeIcon, FileSearchIcon, FlaskConicalIcon, GitForkIcon, HistoryIcon, ImageIcon, PackageIcon, StarIcon, WandSparklesIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { hostname } from "@/lib/live/http"
import type { StorySource as Source } from "@/lib/newsroom"
import { AVAILABILITY, evidenceInfo, type Availability, type EvidenceLevel, type MediaItem, type TimelineEntry } from "@/lib/newsroom/engine/types"
import { cn } from "@/lib/utils"
import { storyDate } from "./bits"

/*
 * The research engine's marks on a story: how strong the evidence is (Daniel's five levels), how confident the
 * newsroom is in a leak, whether the thing is available, where the sources come from, the story's timeline,
 * and the media found in its sources (videos, images, repositories, models, charts from verified numbers).
 */

/** The keyframes these marks use, hoisted once into the head by React. */
export const NEWS_KEYFRAMES = `@keyframes nx-news-fade{from{opacity:0;transform:scaleY(.4)}to{opacity:1;transform:none}}@keyframes nx-news-grow{from{transform:scaleX(0)}to{transform:none}}`
export function NewsKeyframes() {
  return (
    <style href="nx-news-keyframes" precedence="default">
      {NEWS_KEYFRAMES}
    </style>
  )
}

const LEVEL_TONE: Record<EvidenceLevel, string> = {
  confirmed: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  observed: "border-ion/35 bg-ion/10 text-ion",
  technical: "border-gold/35 bg-gold/10 text-gold",
  plausible: "border-[#f0c9a3]/35 bg-[#f0c9a3]/10 text-[#f4d8bb]",
  rumor: "border-[#f0a3a3]/35 bg-[#f0a3a3]/10 text-[#f6c4c4]",
}
const LEVEL_ICON = { confirmed: BadgeCheckIcon, observed: EyeIcon, technical: FileSearchIcon, plausible: FlaskConicalIcon, rumor: CircleHelpIcon }

export function EvidenceBadge({ level, className }: { level: EvidenceLevel; className?: string }) {
  const info = evidenceInfo(level)
  const Icon = LEVEL_ICON[level]
  return (
    <span title={info.blurb} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", LEVEL_TONE[level], className)}>
      <Icon aria-hidden className="size-3" />
      {info.short}
    </span>
  )
}

export function AvailabilityTag({ value }: { value: Availability }) {
  if (value === "unknown") return null
  const label = AVAILABILITY.find((a) => a.id === value)?.label ?? value
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", value === "available" ? "text-emerald-200" : "text-muted-foreground")}>
      <span aria-hidden className={cn("size-1.5 rounded-full", value === "available" ? "bg-emerald-300 shadow-[0_0_8px_1px] shadow-emerald-300/50" : "bg-muted-foreground/60")} />
      {label}
    </span>
  )
}

/** A leak's confidence as a segmented meter with the five evidence levels underneath. */
export function LeakMeter({ confidence, level }: { confidence: number; level: EvidenceLevel | null }) {
  const pct = Math.max(0, Math.min(100, confidence))
  const steps = 20
  const lit = Math.round((pct / 100) * steps)
  const tone = pct >= 70 ? "bg-gold" : pct >= 45 ? "bg-[#f0c9a3]" : "bg-[#f0a3a3]"
  return (
    <figure className="rounded-2xl border border-[#f0a3a3]/25 bg-gradient-to-br from-[#f0a3a3]/[0.07] via-transparent to-gold/[0.05] p-4">
      <NewsKeyframes />
      <figcaption className="flex items-baseline justify-between gap-3">
        <Copy k="news.leak.meter" className="text-sm font-medium">
          Leak confidence
        </Copy>
        <span className="font-mono text-2xl font-semibold tabular-nums">
          {pct}
          <span className="text-sm text-muted-foreground">/100</span>
        </span>
      </figcaption>
      <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Leak confidence" className="mt-3 flex gap-[3px]">
        {Array.from({ length: steps }, (_, i) => (
          <span
            key={i}
            className={cn("h-2.5 flex-1 rounded-[2px] motion-safe:animate-[nx-news-fade_0.4s_ease-out_both]", i < lit ? tone : "bg-white/[0.07]")}
            style={{ animationDelay: `${i * 30}ms` }}
          />
        ))}
      </div>
      <Copy k="news.leak.meterNote" as="p" className="mt-3 text-xs leading-relaxed text-muted-foreground" multiline>
        How sure the newsroom is that the traces in the sources mean what this story says. It rises with independent official traces and falls when a mention stays isolated. Not a confirmation.
      </Copy>
      {level && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Copy k="news.leak.level">Evidence level:</Copy> <EvidenceBadge level={level} />
        </p>
      )}
    </figure>
  )
}

/** What kind of places the sources are: the company itself, repositories, papers, public records, coverage. */
export function SourceBadges({ sources }: { sources: Source[] }) {
  const kinds = new Map<string, number>()
  for (const s of sources) {
    const h = hostname(s.url)
    const k = /github\.com|gitlab\.com/.test(h) ? "Repository" : /arxiv\.org|openreview|aclanthology|doi\.org/.test(h) ? "Paper" : /\.gov$|\.gov\.|europa\.eu|federalregister/.test(h) ? "Public record" : /docs\.|developer|platform\./.test(h) ? "Documentation" : "Publisher"
    kinds.set(k, (kinds.get(k) ?? 0) + 1)
  }
  const publishers = new Set(sources.map((s) => (s.publisher || hostname(s.url)).toLowerCase())).size
  return (
    <ul aria-label="Where the sources come from" className="flex flex-wrap gap-1.5">
      <li className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs">
        {publishers} independent {publishers === 1 ? "publisher" : "publishers"}
      </li>
      {[...kinds].map(([k, n]) => (
        <li key={k} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {k}
          {n > 1 ? ` ×${n}` : ""}
        </li>
      ))}
    </ul>
  )
}

/** The story's life: published, then each update the engine or an editor added, newest last. */
export function StoryTimeline({ entries, sources }: { entries: TimelineEntry[]; sources: Source[] }) {
  if (entries.length < 2) return null
  return (
    <section aria-labelledby="timeline-h" className="mt-12">
      <h2 id="timeline-h" className="flex items-center gap-2 text-lg font-semibold">
        <HistoryIcon aria-hidden className="size-4 text-ion" />
        <Copy k="news.story.timeline">How this story developed</Copy>
      </h2>
      <ol className="relative mt-5 flex flex-col gap-6 border-l border-white/10 pl-6">
        {entries.map((e, i) => (
          <li key={`${e.at}-${i}`} className="relative">
            <span aria-hidden className={cn("absolute top-1.5 -left-[29px] size-2.5 rounded-full ring-4 ring-background", i === entries.length - 1 ? "bg-ion shadow-[0_0_12px_2px] shadow-ion/50" : "bg-white/30")} />
            <p className="text-xs text-muted-foreground">
              <time dateTime={e.at}>{storyDate(e.at)}</time> · {e.kind === "update" ? "Update" : e.kind === "correction" ? "Correction" : "First published"}
            </p>
            <p className="mt-0.5 font-medium">{e.title}</p>
            {e.note && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{e.note}</p>}
            {e.sources.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-1.5">
                {e.sources
                  .filter((n) => sources[n - 1])
                  .map((n) => (
                    <a key={n} href={`#source-${n}`} className="rounded-sm font-mono text-xs text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      [{n}]
                    </a>
                  ))}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Chart({ item }: { item: Extract<MediaItem, { type: "chart" }> }) {
  const max = Math.max(...item.items.map((x) => Math.abs(x.value)), 1)
  return (
    <figure className="rounded-2xl border border-border bg-gradient-to-b from-white/[0.03] to-transparent p-4 md:p-5">
      <NewsKeyframes />
      <figcaption className="text-sm font-medium">
        {item.title}
        {item.unit && <span className="text-muted-foreground"> ({item.unit})</span>}
      </figcaption>
      <ul className="mt-4 flex flex-col gap-2.5">
        {item.items.map((x, i) => (
          <li key={`${x.label}-${i}`} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground" title={x.label}>
              {x.label}
            </span>
            <span className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className="absolute inset-y-0 left-0 origin-left rounded-full bg-gradient-to-r from-ion/70 to-ion motion-safe:animate-[nx-news-grow_0.9s_cubic-bezier(0.2,0.8,0.2,1)_both]"
                style={{ width: `${(Math.abs(x.value) / max) * 100}%`, animationDelay: `${i * 70}ms` }}
              />
            </span>
            <span className="font-mono text-xs tabular-nums">
              {x.value.toLocaleString("en-US")}
              {x.source ? (
                <a href={`#source-${x.source}`} className="ml-1 text-ion hover:underline" aria-label={`Source ${x.source}`}>
                  [{x.source}]
                </a>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <Copy k="news.media.chartNote" as="p" className="mt-3 text-xs text-muted-foreground">
        Every number is quoted in the source it points to.
      </Copy>
    </figure>
  )
}

/** Media found in the story's own sources. Videos load only when the reader presses play (no tracking before). */
export function StoryMedia({ media }: { media: MediaItem[] }) {
  const items = media.filter((m) => m.type !== "image").slice(0, 6)
  const images = media.filter((m): m is Extract<MediaItem, { type: "image" }> => m.type === "image").slice(0, 4)
  if (!items.length && !images.length) return null
  return (
    <section aria-labelledby="media-h" className="mt-12 flex flex-col gap-4">
      <h2 id="media-h" className="text-lg font-semibold">
        <Copy k="news.media.title">From the sources</Copy>
      </h2>
      {items.map((m, i) => {
        if (m.type === "chart") return <Chart key={i} item={m} />
        if (m.type === "video")
          return (
            <figure key={i} className="overflow-hidden rounded-2xl border border-border">
              <div className="relative aspect-video bg-black">
                <iframe
                  src={m.provider === "youtube" ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(m.id)}` : `https://player.vimeo.com/video/${encodeURIComponent(m.id)}?dnt=1`}
                  title={m.title || "Video from the source"}
                  loading="lazy"
                  allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="absolute inset-0 size-full"
                />
              </div>
              <figcaption className="px-4 py-2 text-xs text-muted-foreground">
                {m.title || "Video"}
                {m.source ? ` · source [${m.source}]` : ""}
              </figcaption>
            </figure>
          )
        if (m.type === "repo")
          return (
            <a
              key={i}
              href={`https://github.com/${m.repo}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group flex flex-col gap-2 rounded-2xl border border-border bg-card/40 p-4 transition-colors hover:border-repo/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex items-center gap-2 font-mono text-sm">
                <PackageIcon aria-hidden className="size-4 text-repo" />
                {m.repo}
              </span>
              {m.description && <span className="line-clamp-2 text-sm text-muted-foreground">{m.description}</span>}
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {m.stars !== null && (
                  <span className="inline-flex items-center gap-1">
                    <StarIcon aria-hidden className="size-3" />
                    {m.stars.toLocaleString("en-US")}
                  </span>
                )}
                {m.forks !== null && (
                  <span className="inline-flex items-center gap-1">
                    <GitForkIcon aria-hidden className="size-3" />
                    {m.forks.toLocaleString("en-US")}
                  </span>
                )}
                {m.language && <span>{m.language}</span>}
                {m.license && <span>{m.license}</span>}
              </span>
            </a>
          )
        if (m.type === "model")
          return (
            <div key={i} className="flex flex-col gap-2 rounded-2xl border border-border bg-card/40 p-4">
              <span className="flex items-center gap-2 font-mono text-sm">
                <WandSparklesIcon aria-hidden className="size-4 text-model" />
                {m.name}
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {m.task && <span>{m.task}</span>}
                {m.downloads !== null && <span>{m.downloads.toLocaleString("en-US")} downloads</span>}
                {m.likes !== null && <span>{m.likes.toLocaleString("en-US")} likes</span>}
                {m.license && <span>{m.license}</span>}
              </span>
              <span className="text-[11px] text-muted-foreground/80">Figures {m.via}.</span>
            </div>
          )
        return null
      })}
      {images.length > 0 && (
        <div className={cn("grid gap-3", images.length > 1 && "sm:grid-cols-2")}>
          {images.map((m, i) => (
            <figure key={i} className="overflow-hidden rounded-2xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- images from the cited sources, shown at their own address */}
              <img src={m.url} alt={m.alt} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
              <figcaption className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
                <ImageIcon aria-hidden className="size-3" />
                {m.credit}
                {m.source ? ` · source [${m.source}]` : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}

/** The honest label on an AI-generated cover. */
export function AiIllustrationLabel() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
      <WandSparklesIcon aria-hidden className="size-3" />
      AI illustration, not a photo
    </span>
  )
}
