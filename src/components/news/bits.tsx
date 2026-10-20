import { CircleHelpIcon, SparklesIcon } from "lucide-react"
import { Cover } from "@/components/hub/bits"
import { categoryInfo, type NewsCategory, type Story } from "@/lib/newsroom"
import { cn } from "@/lib/utils"

/*
 * Small pieces every newsroom surface shares: the category label, the "Unconfirmed" badge, the AI note and
 * the cover (an editor's image, or a star field drawn from the story's id).
 */

const TONE: Record<NewsCategory, string> = {
  launch: "text-ion",
  research: "text-dataset",
  policy: "text-gold",
  industry: "text-model",
  tools: "text-repo",
  rumor: "text-[#f0a3a3]",
}

export function CategoryTag({ category, label, className }: { category: NewsCategory; label?: string; className?: string }) {
  return <span className={cn("text-xs font-medium tracking-wide uppercase", TONE[category], className)}>{label || categoryInfo(category).one}</span>
}

export function UnconfirmedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border border-[#f0a3a3]/35 bg-[#f0a3a3]/10 px-2 py-0.5 text-xs font-medium text-[#f6c4c4]", className)}
      title="Reported but not confirmed by the company involved"
    >
      <CircleHelpIcon aria-hidden className="size-3" />
      Unconfirmed
    </span>
  )
}

export function AiNote({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)} title="Drafted with AI from the cited sources, reviewed by a Nexverse editor">
      <SparklesIcon aria-hidden className="size-3" />
      AI-assisted
    </span>
  )
}

/** The generated Nexverse cover of a published story: with its headline, or the sky and the N alone. */
export const generatedCoverUrl = (id: string, variant: "title" | "art" = "title") => `/api/newsroom/cover?id=${id}${variant === "art" ? "&v=art" : ""}`

/**
 * A story's cover: the chosen photo, or the generated Nexverse cover once the story is published (the image
 * route only draws published stories), or a star field drawn from the id for drafts in the editors' desk.
 * `variant` "art" leaves the headline off the generated cover, for cards that print the headline anyway.
 */
export function StoryCover({
  story,
  className,
  variant = "art",
  priority = false,
}: {
  story: Pick<Story, "id" | "cover" | "coverAlt" | "status">
  className?: string
  variant?: "title" | "art"
  priority?: boolean
}) {
  const src = story.cover ?? (story.status === "published" || story.status === "scheduled" ? generatedCoverUrl(story.id, variant) : null)
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- covers come from many publishers' hosts; no optimisation, no referrer
      <img
        src={src}
        alt={story.cover ? story.coverAlt : ""}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn("block size-full object-cover", className)}
      />
    )
  }
  return <Cover seed={story.id} kind="news" className={className} />
}

/** Who made the cover and under which licence, linked to where it came from. Nothing for generated covers. */
export function CoverCreditLine({ story, className }: { story: Pick<Story, "cover" | "coverKind" | "coverCredit">; className?: string }) {
  const c = story.coverCredit
  if (!story.cover || !c) return null
  const by = story.coverKind === "source" ? `Image: ${c.creator}` : `Photo: ${c.creator}`
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {c.creatorUrl ? (
        <a href={c.creatorUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-white/20 underline-offset-2 hover:text-foreground">
          {by}
        </a>
      ) : (
        by
      )}
      {c.license && (
        <>
          {" · "}
          {c.licenseUrl ? (
            <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-white/20 underline-offset-2 hover:text-foreground">
              {c.license}
            </a>
          ) : (
            c.license
          )}
        </>
      )}
      {c.landing && (
        <>
          {" · "}
          <a href={c.landing} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-white/20 underline-offset-2 hover:text-foreground">
            {story.coverKind === "source" ? "source" : c.provider || "original"}
          </a>
        </>
      )}
    </p>
  )
}

const TINT: Record<NewsCategory, string> = {
  launch: "143 180 255",
  research: "159 227 207",
  policy: "216 197 158",
  industry: "211 180 255",
  tools: "233 199 154",
  rumor: "240 163 163",
}

/**
 * What the generated cover looks like, drawn in the page for stories that are not published yet (the image
 * route only draws published ones). Same sky, same orbits, the official lockup at its own proportions.
 */
export function GeneratedCoverPreview({ title, category, className }: { title: string; category: NewsCategory; className?: string }) {
  const c = TINT[category]
  return (
    <div className={cn("@container relative isolate flex size-full flex-col justify-between overflow-hidden bg-[#05060a] p-[5%] text-left", className)} style={{ backgroundImage: `radial-gradient(circle at 74% 34%, rgb(${c} / 0.42), rgb(${c} / 0.12) 28%, transparent 60%)` }}>
      <span aria-hidden className="absolute top-[34%] left-[74%] -z-10 aspect-[900/280] w-[75%] -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-full border" style={{ borderColor: `rgb(${c} / 0.32)` }} />
      <span aria-hidden className="absolute top-[34%] left-[74%] -z-10 aspect-[540/170] w-[45%] -translate-x-1/2 -translate-y-1/2 rotate-2 rounded-full border border-white/20" />
      {/* eslint-disable-next-line @next/next/no-img-element -- the official lockup file, scaled uniformly by width */}
      <img src="/brand/horizontal-white.png" alt="" width={1600} height={328} className="h-auto w-[19%]" />
      <span className="line-clamp-3 max-w-[80%] font-display text-[clamp(0.8rem,3.4cqw,1.6rem)] leading-tight font-semibold tracking-[-0.02em] text-balance">{title || "Your headline"}</span>
    </div>
  )
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })

/** A fixed UTC date, so prerendered markup never depends on the reader's clock. */
export const storyDate = (iso: string | null) => (iso ? DATE.format(new Date(iso)) : "")
export const storyDateTime = (iso: string | null) => (iso ? DATE_TIME.format(new Date(iso)) : "")
