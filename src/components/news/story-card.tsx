import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"
import { storyHref, type Story } from "@/lib/newsroom"
import { cn } from "@/lib/utils"
import { AiNote, CategoryTag, StoryCover, storyDate, UnconfirmedBadge } from "./bits"

const publishers = (s: Story) => [...new Set(s.sources.map((x) => x.publisher).filter(Boolean))].slice(0, 2).join(", ")

/** The whole card is one link (the headline's ::after covers it); keyboard focus rings the card. */
const COVER_LINK = "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"

/**
 * "Nexverse Exclusive": the lead story at the top of /news. A wide cover with a slow orbit drawn over it,
 * the headline and the summary. Motion stops for people who ask for less.
 */
export function FeatureStory({ story }: { story: Story }) {
  return (
    <article className="group relative isolate overflow-hidden rounded-3xl border border-border bg-card">
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="relative aspect-[16/9] overflow-hidden lg:aspect-auto lg:min-h-[22rem]">
          <div className="absolute inset-0">
            <StoryCover story={story} className="transition-transform duration-[1.2s] ease-out group-hover:scale-[1.03] motion-reduce:transform-none" />
          </div>
          {/* two slow orbits around the cover's light: the story in its own small sky */}
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center [mask-image:radial-gradient(closest-side,#000_60%,transparent)]">
            <span className="col-start-1 row-start-1 aspect-square w-[85%] [transform:rotateX(68deg)]">
              <span className="block size-full rounded-full border border-dashed border-gold/25 motion-safe:animate-[spin_80s_linear_infinite]" />
            </span>
            <span className="col-start-1 row-start-1 aspect-square w-[52%] [transform:rotateX(62deg)_rotateZ(-18deg)]">
              <span className="block size-full rounded-full border border-dashed border-ion/30 motion-safe:animate-[spin_50s_linear_infinite_reverse]" />
            </span>
          </div>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-card" />
        </div>
        <div className="relative flex flex-col gap-4 p-6 md:p-8">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold">
              <span aria-hidden className="pulse-dot size-1.5 rounded-full bg-gold" />
              Nexverse Exclusive
            </span>
            <CategoryTag category={story.category} />
            {story.unconfirmed && <UnconfirmedBadge />}
          </p>
          <h2 className="font-display text-2xl leading-tight font-semibold tracking-[-0.025em] text-balance md:text-[1.75rem]">
            <Link href={storyHref(story)} className={cn("decoration-ion/50 underline-offset-4 group-hover:underline", COVER_LINK, "focus-visible:after:rounded-3xl")}>
              {story.title}
            </Link>
          </h2>
          {story.dek && <p className="max-w-[60ch] text-[15px] leading-relaxed text-foreground/80">{story.dek}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-sm text-muted-foreground">
            <time dateTime={story.publishedAt ?? undefined}>{storyDate(story.publishedAt)}</time>
            {publishers(story) && <span>Sources: {publishers(story)}</span>}
            {story.aiGenerated && <AiNote />}
            <span className="ml-auto inline-flex items-center gap-1 text-ion">
              Read the story <ArrowUpRightIcon aria-hidden className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}

/** A story in a grid: cover strip, category, headline, summary. */
export function StoryCard({ story, className }: { story: Story; className?: string }) {
  return (
    <article className={cn("group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/70 transition-colors hover:bg-card", className)}>
      <div className="relative aspect-[16/7] overflow-hidden">
        <StoryCover story={story} className="transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transform-none" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
      </div>
      <div className="-mt-6 flex flex-1 flex-col gap-2 p-4 pt-0">
        <p className="relative flex flex-wrap items-center gap-2">
          <CategoryTag category={story.category} />
          {story.unconfirmed && <UnconfirmedBadge />}
        </p>
        <h3 className="text-[17px] leading-snug font-semibold text-balance">
          <Link href={storyHref(story)} className={cn(COVER_LINK, "focus-visible:after:rounded-2xl")}>
            {story.title}
          </Link>
        </h3>
        {story.dek && <p className="line-clamp-3 text-sm text-muted-foreground">{story.dek}</p>}
        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground">
          <time dateTime={story.publishedAt ?? undefined}>{storyDate(story.publishedAt)}</time>
          {publishers(story) && <span className="truncate">{publishers(story)}</span>}
          {story.aiGenerated && <AiNote />}
        </p>
      </div>
    </article>
  )
}

/** A compact row: for side columns, related stories and the home page. */
export function StoryRow({ story, className }: { story: Story; className?: string }) {
  return (
    <article className={cn("group relative flex gap-3.5 rounded-xl py-2.5", className)}>
      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
        <StoryCover story={story} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <CategoryTag category={story.category} className="text-[11px]" />
          {story.unconfirmed && <UnconfirmedBadge className="px-1.5 py-0 text-[11px]" />}
        </p>
        <h3 className="line-clamp-2 text-[15px] leading-snug font-medium group-hover:text-foreground">
          <Link href={storyHref(story)} className={cn(COVER_LINK, "focus-visible:after:rounded-xl")}>
            {story.title}
          </Link>
        </h3>
        <p className="text-xs text-muted-foreground">
          <time dateTime={story.publishedAt ?? undefined}>{storyDate(story.publishedAt)}</time>
        </p>
      </div>
    </article>
  )
}
