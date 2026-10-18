import Link from "next/link"
import { ArrowUpIcon } from "lucide-react"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { Breadcrumbs, PinnedBadge, SolvedBadge } from "@/components/forum/forum-ui"
import { AcceptedAnswer, Post, SimilarThreads, ThreadStats } from "@/components/forum/thread-parts"
import { similarTopics, type Poster } from "@/components/forum/topics"
import { Translatable } from "@/components/forum/translatable"
import { Chip, LangTag } from "@/components/hub/bits"
import { ResourceCard } from "@/components/hub/cards"
import { LikeButton } from "@/components/hub/like-button"
import { SaveButton } from "@/components/social/save-button"
import { categoryPath, getCategory, getPerson, getResource, lastActivity, threadTitle, type Thread } from "@/lib/data"

const poster = (handle: string): Poster => ({ handle, name: getPerson(handle)?.name ?? handle })
const bodyText = "text-[15px] leading-relaxed"

export function SampleThread({ t }: { t: Thread }) {
  const cat = getCategory(t.category)
  const linked = t.links.map(getResource).filter((r) => r !== undefined)
  const similar = similarTopics(t.id, t.category)
  const acceptedIndex = t.replies.findIndex((r) => r.accepted)
  const accepted = acceptedIndex >= 0 ? t.replies[acceptedIndex] : null
  const participants = [...new Set([t.author, ...t.replies.map((r) => r.author)])].map(poster)
  const titleClass = "text-xl leading-snug font-semibold tracking-[-0.015em] md:text-2xl"

  return (
    <div className="shell pt-6 pb-16 lg:pt-8">
      <Breadcrumbs items={[{ label: "Forum", href: "/forum" }, ...(cat ? [{ label: cat.name, href: categoryPath(cat.slug) }] : []), { label: threadTitle(t) }]} />

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-3">
            <Translatable lang={t.lang} original={<h1 className={titleClass}>{t.title}</h1>} english={t.en?.title && <h1 className={titleClass}>{t.en.title}</h1>} />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {cat && (
                <Link href={categoryPath(cat.slug)} className="rounded-full border border-ion/25 bg-ion/10 px-2.5 py-0.5 text-xs text-ion transition-colors hover:bg-ion/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {cat.name}
                </Link>
              )}
              <LangTag lang={t.lang} />
              {t.pinned && <PinnedBadge />}
              {accepted && <SolvedBadge />}
            </div>
          </header>

          <Post
            n={1}
            original
            poster={poster(t.author)}
            date={t.date}
            actions={
              <>
                <LikeButton target={`thread:${t.id}`} base={t.votes} label="Upvote" />
                <SaveButton target={`thread:${t.id}`} />
                {t.tags.map((tag) => (
                  <Chip key={tag}>#{tag}</Chip>
                ))}
              </>
            }
          >
            <Translatable lang={t.lang} original={<p className={bodyText}>{t.body}</p>} english={t.en?.body && <p className={bodyText}>{t.en.body}</p>} />
          </Post>

          {accepted && (
            <AcceptedAnswer n={acceptedIndex + 2} poster={poster(accepted.author)} date={accepted.date}>
              <p className={bodyText} lang={accepted.en ? "en" : accepted.lang}>
                {accepted.en ?? accepted.body}
              </p>
            </AcceptedAnswer>
          )}

          {t.replies.length > 0 && (
            <section aria-labelledby="replies-h" className="flex flex-col gap-3">
              <h2 id="replies-h" className="font-sans text-base font-semibold tracking-normal">
                {t.replies.length} {t.replies.length === 1 ? "reply" : "replies"}
              </h2>
              <ol className="flex flex-col gap-3">
                {t.replies.map((r, i) => (
                  <li key={r.id}>
                    <Post
                      n={i + 2}
                      index={i}
                      poster={poster(r.author)}
                      date={r.date}
                      accepted={r.accepted}
                      note={
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular">
                          <ArrowUpIcon aria-hidden className="size-3" />
                          {r.votes}
                          <span className="sr-only">votes</span>
                        </span>
                      }
                    >
                      <Translatable lang={r.lang} original={<p className={bodyText}>{r.body}</p>} english={r.en && <p className={bodyText}>{r.en}</p>} />
                    </Post>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <ThreadDiscussion threadId={t.id} startAt={t.replies.length + 2} />
        </div>

        <aside aria-label="Thread details" className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <ThreadStats replies={t.replies.length} views={t.views} participants={participants} created={t.date} lastReply={t.replies.length ? lastActivity(t) : null} />
          {linked.length > 0 && (
            <section aria-labelledby="linked-h" className="flex flex-col gap-2.5">
              <h2 id="linked-h" className="px-1 font-sans text-sm font-semibold tracking-normal">
                Talked about here
              </h2>
              <ul className="flex flex-col gap-2">
                {linked.map((r) => (
                  <li key={r.slug}>
                    <ResourceCard r={r} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <SimilarThreads topics={similar} categoryName={cat?.name} />
        </aside>
      </div>
    </div>
  )
}
