import Link from "next/link"
import { ArrowUpRightIcon, BookOpenTextIcon } from "lucide-react"
import { readingMinutes, storyHref, type CategoryNames, type Story } from "@/lib/newsroom"
import { cn } from "@/lib/utils"
import { AiNote, CategoryTag, StoryCover, storyDate, UnconfirmedBadge } from "./bits"

const publishers = (s: Story) => [...new Set(s.sources.map((x) => x.publisher).filter(Boolean))].slice(0, 2).join(", ")

/** The whole card is one link (the headline's ::after covers it); keyboard focus rings the card. */
const COVER_LINK = "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"

const label = (s: Story, names?: CategoryNames) => names?.[s.category]?.one

function Meta({ story, className }: { story: Story; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <time dateTime={story.publishedAt ?? undefined}>{storyDate(story.publishedAt)}</time>
      {readingMinutes(story) && <span>{readingMinutes(story)} min read</span>}
      {publishers(story) && <span className="truncate">{publishers(story)}</span>}
    </p>
  )
}

/**
 * "Nexverse Exclusive": the lead story at the top of /news. The cover fills the card edge to edge and the
 * headline sits on it, magazine style, with two slow orbits drawn over the light. Motion stops for people
 * who ask for less.
 */
export function FeatureStory({ story, names }: { story: Story; names?: CategoryNames }) {
  return (
    <article className="group relative isolate overflow-hidden rounded-[2rem] border border-border bg-card">
      <div className="relative aspect-[4/5] sm:aspect-[16/10] lg:aspect-[21/9]">
        <div className="absolute inset-0">
          <StoryCover story={story} priority className="transition-transform duration-[1.4s] ease-out group-hover:scale-[1.025] motion-reduce:transform-none" />
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center [mask-image:radial-gradient(closest-side,#000_55%,transparent)]">
          <span className="col-start-1 row-start-1 aspect-square w-[70%] [transform:rotateX(70deg)]">
            <span className="block size-full rounded-full border border-dashed border-gold/25 motion-safe:animate-[spin_90s_linear_infinite]" />
          </span>
          <span className="col-start-1 row-start-1 aspect-square w-[42%] [transform:rotateX(64deg)_rotateZ(-18deg)]">
            <span className="block size-full rounded-full border border-dashed border-ion/30 motion-safe:animate-[spin_55s_linear_infinite_reverse]" />
          </span>
        </div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#05060a] via-[#05060a]/55 to-transparent sm:via-[#05060a]/30" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 sm:p-8 lg:max-w-[60%] lg:p-10">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="liquid-glass-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-gold">
              <span aria-hidden className="pulse-dot size-1.5 rounded-full bg-gold" />
              Nexverse Exclusive
            </span>
            <CategoryTag category={story.category} label={label(story, names)} />
            {story.unconfirmed && <UnconfirmedBadge />}
          </p>
          <h2 className="font-display text-[1.6rem] leading-[1.12] font-semibold tracking-[-0.025em] text-balance md:text-[2.1rem]">
            <Link data-nav-item href={storyHref(story)} className={cn("decoration-ion/50 underline-offset-4 group-hover:underline", COVER_LINK, "focus-visible:after:rounded-[2rem]")}>
              {story.title}
            </Link>
          </h2>
          {story.dek && <p className="line-clamp-3 max-w-[62ch] text-[15px] leading-relaxed text-foreground/80">{story.dek}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm text-muted-foreground">
            <Meta story={story} className="text-sm" />
            {story.aiGenerated && <AiNote />}
            <span className="ml-auto hidden items-center gap-1 text-ion sm:inline-flex">
              Read the story <ArrowUpRightIcon aria-hidden className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}

/** A large story for the second row: a tall cover, then the headline and summary. */
export function TopStory({ story, names }: { story: Story; names?: CategoryNames }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card/70 transition-colors hover:bg-card">
      <div className="relative aspect-[16/9] overflow-hidden">
        <StoryCover story={story} className="transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transform-none" />
        {story.depth === "deep" && (
          <span className="liquid-glass-pill absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-gold">
            <BookOpenTextIcon aria-hidden className="size-3" /> In depth
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <p className="flex flex-wrap items-center gap-2">
          <CategoryTag category={story.category} label={label(story, names)} />
          {story.unconfirmed && <UnconfirmedBadge />}
        </p>
        <h3 className="font-display text-xl leading-snug font-semibold tracking-[-0.015em] text-balance">
          <Link data-nav-item href={storyHref(story)} className={cn(COVER_LINK, "focus-visible:after:rounded-3xl")}>
            {story.title}
          </Link>
        </h3>
        {story.dek && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{story.dek}</p>}
        <Meta story={story} className="mt-auto pt-2" />
      </div>
    </article>
  )
}

/** A story in a grid: a wide cover, category, headline, summary. */
export function StoryCard({ story, names, className }: { story: Story; names?: CategoryNames; className?: string }) {
  return (
    <article className={cn("group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/70 transition-colors hover:bg-card", className)}>
      <div className="relative aspect-[16/9] overflow-hidden">
        <StoryCover story={story} className="transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transform-none" />
        {story.depth === "deep" && (
          <span className="liquid-glass-pill absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-gold">
            <BookOpenTextIcon aria-hidden className="size-3" /> In depth
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="relative flex flex-wrap items-center gap-2">
          <CategoryTag category={story.category} label={label(story, names)} />
          {story.unconfirmed && <UnconfirmedBadge />}
        </p>
        <h3 className="text-[17px] leading-snug font-semibold text-balance">
          <Link data-nav-item href={storyHref(story)} className={cn(COVER_LINK, "focus-visible:after:rounded-2xl")}>
            {story.title}
          </Link>
        </h3>
        {story.dek && <p className="line-clamp-3 text-sm text-muted-foreground">{story.dek}</p>}
        <Meta story={story} className="mt-auto pt-2" />
      </div>
    </article>
  )
}

/** A compact row: for side columns and the home page. */
export function StoryRow({ story, names, className }: { story: Story; names?: CategoryNames; className?: string }) {
  return (
    <article className={cn("group relative flex gap-4 rounded-xl py-3", className)}>
      <div className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 sm:w-28">
        <StoryCover story={story} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <CategoryTag category={story.category} label={label(story, names)} className="text-[11px]" />
          {story.unconfirmed && <UnconfirmedBadge className="px-1.5 py-0 text-[11px]" />}
        </p>
        <h3 className="line-clamp-3 text-[15px] leading-snug font-medium group-hover:text-foreground">
          <Link data-nav-item href={storyHref(story)} className={cn(COVER_LINK, "focus-visible:after:rounded-xl")}>
            {story.title}
          </Link>
        </h3>
        <p className="text-xs text-muted-foreground">
          <time dateTime={story.publishedAt ?? undefined}>{storyDate(story.publishedAt)}</time>
          {readingMinutes(story) ? ` · ${readingMinutes(story)} min` : ""}
        </p>
      </div>
    </article>
  )
}
