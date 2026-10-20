import Link from "next/link"
import { ArrowLeftIcon, BookOpenTextIcon, CircleHelpIcon, ExternalLinkIcon, LayersIcon, MessageSquarePlusIcon, SparklesIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { ReportButton } from "@/components/moderation/report-button"
import { hostname } from "@/lib/live/http"
import { discussItemHref } from "@/lib/live/ids"
import { readingMinutes, storyHref, type CategoryNames, type Story } from "@/lib/newsroom"
import { relatedStories } from "@/lib/newsroom/public"
import { ArticleBody, storyHeadings } from "./article-body"
import { AiNote, CategoryTag, CoverCreditLine, StoryCover, storyDate, storyDateTime, UnconfirmedBadge } from "./bits"
import { ShareStory } from "./share-story"
import { StoryCard } from "./story-card"
import { ReadingProgress, StoryToc, StoryTocMobile } from "./toc"

/*
 * One newsroom story in long-form reading mode: the cover across the top with its credit, the headline,
 * summary and reading time, then the story in a comfortable column with "On this page" beside it (folded
 * above it on phones), the key facts box, the pull quote, citations that preview their source, the
 * numbered sources, a plain note on how it was made, and the ways to respond. Related stories close it.
 */

function Byline({ story }: { story: Story }) {
  const editor = story.editor ?? (story.aiGenerated ? null : story.writer)
  if (story.aiGenerated) return <span>{editor ? `Reviewed by ${editor.name}` : "Reviewed by the Nexverse editors"}</span>
  return <span>{story.writer ? `By ${story.writer.name}` : "By the Nexverse editors"}</span>
}

function KeyFacts({ story }: { story: Story }) {
  if (!story.keyFacts.length) return null
  return (
    <aside aria-labelledby="key-facts-h" className="liquid-glass relative overflow-hidden rounded-3xl p-5 md:p-6">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full border border-dashed border-ion/20" />
      <h2 id="key-facts-h" className="flex items-center gap-2 text-sm font-semibold">
        <LayersIcon aria-hidden className="size-4 text-ion" />
        <Copy k="news.story.keyFacts">Key facts</Copy>
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {story.keyFacts.map((f, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-snug">
            <span aria-hidden className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-gold shadow-[0_0_10px_2px] shadow-gold/40" />
            <span>
              {f.text}
              {f.source && story.sources[f.source - 1] && (
                <a href={`#source-${f.source}`} className="ml-1.5 rounded-sm font-mono text-xs text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Source ${f.source}`}>
                  [{f.source}]
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function Sources({ story }: { story: Story }) {
  return (
    <section aria-labelledby="sources-h" className="mt-14 border-t border-border pt-8">
      <h2 id="sources-h" className="text-lg font-semibold">
        <Copy k="news.story.sources">Sources</Copy>
      </h2>
      <Copy k="news.story.sourcesLead" as="p" className="mt-1 text-sm text-muted-foreground">
        Official pages this story was researched from. The numbers in the text point here.
      </Copy>
      <ol className="mt-5 flex flex-col gap-3">
        {story.sources.map((s, i) => (
          <li key={s.url} id={`source-${i + 1}`} className="group scroll-mt-28 rounded-2xl border border-border bg-card/40 p-4 transition-colors target:border-ion/50 target:bg-ion/[0.06]">
            <div className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ion/12 font-mono text-xs text-ion">{i + 1}</span>
              <div className="flex min-w-0 flex-col gap-1">
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {s.title || s.url}
                  <ExternalLinkIcon aria-hidden className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground" />
                </a>
                <p className="text-xs text-muted-foreground">
                  {s.publisher || hostname(s.url)}
                  {s.publishedAt ? ` · ${storyDate(s.publishedAt)}` : ""}
                  {` · ${hostname(s.url)}`}
                </p>
                {s.excerpt && <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{s.excerpt}</p>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export async function StoryView({ story, names }: { story: Story; names: CategoryNames }) {
  const related = await relatedStories(story.category, story.id, 3)
  const path = storyHref(story)
  const discuss = discussItemHref(story.title, `${story.dek}\n\nRead the story on Nexverse: ${path}`)
  const headings = storyHeadings(story.body)
  const minutes = readingMinutes(story)
  const long = story.depth !== "short" || headings.length >= 2

  return (
    <article className="pb-24">
      <ReadingProgress target="story-body" />
      <div className="shell">
        <div className="mx-auto max-w-[72rem] pt-6 md:pt-10">
          <Link href="/news" className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <ArrowLeftIcon aria-hidden className="size-4" /> <Copy k="news.story.back">News</Copy>
          </Link>

          <header className="mt-6 flex max-w-[50rem] flex-col gap-4">
            <p className="flex flex-wrap items-center gap-3">
              <CategoryTag category={story.category} label={names[story.category].one} />
              {story.unconfirmed && <UnconfirmedBadge />}
              {story.depth === "deep" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
                  <BookOpenTextIcon aria-hidden className="size-3" /> <Copy k="news.story.inDepth">In depth</Copy>
                </span>
              )}
              {story.aiGenerated && <AiNote />}
            </p>
            <h1 className="font-display text-[1.85rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance md:text-[2.5rem]">{story.title}</h1>
            {story.dek && <p className="max-w-[60ch] text-lg leading-relaxed text-foreground/80">{story.dek}</p>}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <time dateTime={story.publishedAt ?? undefined}>{storyDateTime(story.publishedAt)}</time>
              {minutes && (
                <>
                  <span aria-hidden>·</span>
                  <span>{minutes} min read</span>
                </>
              )}
              <span aria-hidden>·</span>
              <Byline story={story} />
              {story.sources.length > 1 && (
                <>
                  <span aria-hidden>·</span>
                  <a href="#sources-h" className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    {story.sources.length} sources
                  </a>
                </>
              )}
            </p>
          </header>

          <figure className="mt-8">
            <div className="relative aspect-[16/9] overflow-hidden rounded-3xl ring-1 ring-white/10 md:aspect-[21/9]">
              <StoryCover story={story} variant="art" priority />
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent" />
            </div>
            <figcaption className="mt-2 flex justify-end">
              <CoverCreditLine story={story} />
            </figcaption>
          </figure>
        </div>

        <div className={long ? "mx-auto mt-10 grid max-w-[72rem] gap-12 lg:grid-cols-[13rem_minmax(0,44rem)] lg:justify-center xl:gap-16" : "mx-auto mt-10 max-w-[44rem]"}>
          {long && (
            <aside className="hidden lg:block">
              <div className="sticky top-28 flex flex-col gap-8">
                <StoryToc headings={headings} />
                <div className="flex flex-col items-start gap-2">
                  <ShareStory title={story.title} path={path} />
                </div>
              </div>
            </aside>
          )}

          <div id="story-body" className="min-w-0">
            <div className="flex flex-col gap-5">
              {story.unconfirmed && (
                <div role="note" className="flex gap-3 rounded-2xl border border-[#f0a3a3]/30 bg-[#f0a3a3]/[0.06] px-4 py-3 text-sm">
                  <CircleHelpIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-[#f6c4c4]" />
                  <p>
                    <Copy k="news.story.unconfirmedTitle" className="font-medium">
                      Not confirmed.
                    </Copy>{" "}
                    <Copy k="news.story.unconfirmedBody" className="text-muted-foreground">
                      This story reports something the company involved has not confirmed. Read it as a report, check the sources below, and expect it to change.
                    </Copy>
                  </p>
                </div>
              )}
              <StoryTocMobile headings={headings} />
              <KeyFacts story={story} />
            </div>

            <ArticleBody body={story.body} sources={story.sources} pullQuote={story.pullQuote} className="mt-8 text-[17px] leading-[1.78] text-foreground/90" />

            <Sources story={story} />

            {story.aiGenerated && (
              <div className="mt-6 flex gap-3 rounded-2xl border border-border bg-card/30 p-4 text-sm text-muted-foreground">
                <SparklesIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-ion" />
                <Copy k="news.story.howMade" multiline>
                  How this story was made: a free AI model read the official pages above, listed the facts with the exact words that support them, wrote the story only from those facts, and a second pass checked every claim. A Nexverse editor then read and approved it. Something wrong? Report it and we will correct it.
                </Copy>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-border pt-6">
              <ShareStory title={story.title} path={path} />
              <Link
                href={discuss as `/forum/new?${string}`}
                className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <MessageSquarePlusIcon aria-hidden className="size-4" /> <Copy k="news.story.discuss">Discuss in the forum</Copy>
              </Link>
              <ReportButton targetKind="news_story" targetId={story.id} targetUrl={path} className="ml-auto" />
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section aria-labelledby="related-h" className="mx-auto mt-20 max-w-[72rem] border-t border-border pt-10">
            <h2 id="related-h" className="text-lg font-semibold">
              {related.every((s) => s.category === story.category) ? `More in ${names[story.category].label}` : <Copy k="news.story.related">More from the newsroom</Copy>}
            </h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((s) => (
                <li key={s.id}>
                  <StoryCard story={s} names={names} />
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </article>
  )
}
