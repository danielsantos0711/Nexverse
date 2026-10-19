import Link from "next/link"
import { ArrowLeftIcon, CircleHelpIcon, ExternalLinkIcon, MessageSquarePlusIcon, SparklesIcon } from "lucide-react"
import { ExternalLink } from "@/components/live/bits"
import { Markdown } from "@/components/live/markdown"
import { ReportButton } from "@/components/moderation/report-button"
import { hostname } from "@/lib/live/http"
import { discussItemHref } from "@/lib/live/ids"
import { categoryInfo, storyHref, type Story } from "@/lib/newsroom"
import { relatedStories } from "@/lib/newsroom/public"
import { AiNote, CategoryTag, StoryCover, storyDateTime, UnconfirmedBadge } from "./bits"
import { ShareStory } from "./share-story"
import { StoryRow } from "./story-card"

/*
 * One newsroom story in reading mode: a narrow column, the summary up front, the sources in their own box,
 * a plain note on how it was written, and the ways to respond (share, discuss in the forum, report).
 */

function Byline({ story }: { story: Story }) {
  const editor = story.editor ?? (story.aiGenerated ? null : story.writer)
  if (story.aiGenerated) return <span>{editor ? `Reviewed by ${editor.name}` : "Reviewed by the Nexverse editors"}</span>
  return <span>{story.writer ? `By ${story.writer.name}` : "By the Nexverse editors"}</span>
}

export async function StoryView({ story }: { story: Story }) {
  const related = await relatedStories(story.category, story.id, 4)
  const path = storyHref(story)
  const discuss = discussItemHref(story.title, `${story.dek}\n\nRead the story on Nexverse: ${path}`)

  return (
    <article className="shell pb-20">
      <div className="mx-auto max-w-[44rem] pt-8 md:pt-12">
        <Link href="/news" className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <ArrowLeftIcon aria-hidden className="size-4" /> News
        </Link>

        <header className="mt-6 flex flex-col gap-4">
          <p className="flex flex-wrap items-center gap-3">
            <Link href="/news" className="rounded-sm hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <CategoryTag category={story.category} />
            </Link>
            {story.unconfirmed && <UnconfirmedBadge />}
            {story.aiGenerated && <AiNote />}
          </p>
          <h1 className="font-display text-[1.9rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance md:text-[2.4rem]">{story.title}</h1>
          {story.dek && <p className="text-lg leading-relaxed text-foreground/80">{story.dek}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <time dateTime={story.publishedAt ?? undefined}>{storyDateTime(story.publishedAt)}</time>
            <span aria-hidden>·</span>
            <Byline story={story} />
          </p>
        </header>

        <div className="relative mt-8 aspect-[16/7] overflow-hidden rounded-2xl ring-1 ring-white/10">
          <StoryCover story={story} />
        </div>

        {story.unconfirmed && (
          <div role="note" className="mt-8 flex gap-3 rounded-xl border border-[#f0a3a3]/30 bg-[#f0a3a3]/[0.06] px-4 py-3 text-sm">
            <CircleHelpIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-[#f6c4c4]" />
            <p>
              <span className="font-medium">Not confirmed.</span> <span className="text-muted-foreground">This story reports something the company involved has not confirmed. Read it as a report, check the sources below, and expect it to change.</span>
            </p>
          </div>
        )}

        <Markdown source={story.body} ctx={{ source: "none" }} className="mt-8 text-[17px] leading-[1.75] [&_p]:my-5 [&_ul]:my-5" />

        <section aria-labelledby="sources-h" className="mt-12 rounded-2xl border border-border bg-card/50 p-5">
          <h2 id="sources-h" className="text-sm font-semibold">
            Sources
          </h2>
          <ol className="mt-3 flex flex-col gap-2.5">
            {story.sources.map((s, i) => (
              <li key={s.url} className="flex gap-3 text-sm">
                <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground tabular">{i + 1}</span>
                <ExternalLink href={s.url} className="group flex min-w-0 flex-col rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <span className="font-medium group-hover:underline">{s.title || s.url}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {s.publisher || hostname(s.url)}
                    <ExternalLinkIcon aria-hidden className="size-3" />
                  </span>
                </ExternalLink>
              </li>
            ))}
          </ol>
        </section>

        {story.aiGenerated && (
          <p className="mt-4 flex gap-2 text-sm text-muted-foreground">
            <SparklesIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Drafted by a free AI model from the sources above, then read and approved by a Nexverse editor. Something wrong? Report it and we will correct it.
            </span>
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-border pt-6">
          <ShareStory title={story.title} path={path} />
          <Link
            href={discuss as `/forum/new?${string}`}
            className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <MessageSquarePlusIcon aria-hidden className="size-4" /> Discuss in the forum
          </Link>
          <ReportButton targetKind="news_story" targetId={story.id} targetUrl={path} className="ml-auto" />
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-h" className="mx-auto mt-16 max-w-[64rem] border-t border-border pt-10">
          <h2 id="related-h" className="text-lg font-semibold">
            More {related.every((s) => s.category === story.category) ? `in ${categoryInfo(story.category).label}` : "from the newsroom"}
          </h2>
          <ol className="mt-4 grid gap-x-8 md:grid-cols-2">
            {related.map((s) => (
              <li key={s.id} className="border-b border-border/60">
                <StoryRow story={s} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  )
}
