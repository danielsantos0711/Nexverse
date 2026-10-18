import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { PersonLink } from "@/components/hub/bits"
import { NewsCard, ResourceCard } from "@/components/hub/cards"
import { LikeButton } from "@/components/hub/like-button"
import { formatDate, getNews, getResource, news, NEWS_KINDS } from "@/lib/data"

export function generateStaticParams() {
  return news.map((n) => ({ id: n.id }))
}

export async function generateMetadata({ params }: PageProps<"/news/[id]">): Promise<Metadata> {
  return { title: getNews((await params).id)?.title ?? "News" }
}

export default function Page({ params }: PageProps<"/news/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Story params={params} />
    </Suspense>
  )
}

async function Story({ params }: { params: PageProps<"/news/[id]">["params"] }) {
  const n = getNews((await params).id)
  if (!n) notFound()
  const linked = n.links.map(getResource).filter((r) => r !== undefined)
  const more = news.filter((x) => x.id !== n.id).slice(0, 3)
  return (
    <>
      <div className="relative isolate overflow-hidden border-b border-border">
        {n.image && <Image src={n.image} alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-50" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        <div className="shell flex max-w-4xl flex-col gap-4 pt-16 pb-10 md:pt-24">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/news" className="hover:text-foreground">
              News
            </Link>
            <span aria-hidden> / </span>
            <span className="text-gold">{NEWS_KINDS[n.kind]}</span>
          </nav>
          <h1 className="text-3xl leading-[1.08] font-semibold tracking-[-0.03em] md:text-5xl">{n.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span>{n.source}</span>
            <span>{formatDate(n.date)}</span>
            <span className="flex items-center gap-1.5">
              Shared by <PersonLink handle={n.by} />
            </span>
          </div>
        </div>
      </div>
      <div className="shell grid grid-cols-1 max-w-6xl gap-10 pt-8 lg:grid-cols-[1fr_20rem]">
        <article className="flex min-w-0 flex-col gap-6">
          <p className="text-lg leading-relaxed">{n.summary}</p>
          <section aria-labelledby="why-h" className="rounded-2xl border border-gold/30 bg-gold/[0.05] p-5">
            <h2 id="why-h" className="mb-1 font-sans text-sm font-medium tracking-normal text-gold">
              Why it matters
            </h2>
            <p className="leading-relaxed">{n.why}</p>
          </section>
          <div className="flex flex-wrap gap-2">
            <LikeButton target={`news:${n.id}`} base={n.votes} label="Upvote" />
          </div>
          <ThreadDiscussion threadId={`news-${n.id}`} heading="Comments" />
        </article>
        <aside className="flex flex-col gap-6">
          {linked.length > 0 && (
            <section aria-labelledby="linked-h" className="flex flex-col gap-2.5">
              <h2 id="linked-h" className="font-sans text-sm font-medium tracking-normal text-muted-foreground">
                On Nexverse
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
          <section aria-labelledby="more-h" className="flex flex-col gap-2.5">
            <h2 id="more-h" className="font-sans text-sm font-medium tracking-normal text-muted-foreground">
              More news
            </h2>
            <ul className="flex flex-col gap-2">
              {more.map((m) => (
                <li key={m.id}>
                  <NewsCard n={m} />
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}
