import Link from "next/link"
import { ArrowUpIcon, CheckCircle2Icon, EyeIcon, MessageSquareIcon } from "lucide-react"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { Translatable } from "@/components/forum/translatable"
import { Chip, LangTag, PersonAvatar, Stat } from "@/components/hub/bits"
import { ResourceCard, ThreadRow } from "@/components/hub/cards"
import { LikeButton } from "@/components/hub/like-button"
import { Item, Stagger } from "@/components/hub/motion"
import { ago, getCategory, getPerson, getResource, threadsIn, type Thread } from "@/lib/data"
import { cn } from "@/lib/utils"

export function SampleThread({ t }: { t: Thread }) {
  const cat = getCategory(t.category)
  const author = getPerson(t.author)
  const linked = t.links.map(getResource).filter((r) => r !== undefined)
  const related = threadsIn(t.category)
    .filter((x) => x.id !== t.id)
    .slice(0, 4)

  return (
    <div className="shell grid grid-cols-1 gap-10 pt-8 lg:grid-cols-[1fr_20rem] lg:pt-12">
      <article className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-4">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/forum" className="hover:text-foreground">
              Forum
            </Link>
            {cat && (
              <>
                <span aria-hidden> / </span>
                <Link href={`/forum?c=${cat.slug}`} className="text-ion hover:underline">
                  {cat.name}
                </Link>
              </>
            )}
          </nav>
          <Translatable
            lang={t.lang}
            original={<h1 className="text-2xl leading-tight font-semibold tracking-[-0.025em] md:text-[2.1rem]">{t.title}</h1>}
            english={t.en?.title && <h1 className="text-2xl leading-tight font-semibold tracking-[-0.025em] md:text-[2.1rem]">{t.en.title}</h1>}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <Link href={`/people/${t.author}`} className="flex items-center gap-2 text-foreground hover:underline">
              <PersonAvatar handle={t.author} size={26} />
              {author?.name}
            </Link>
            <span>{ago(t.date)}</span>
            <LangTag lang={t.lang} />
            <Stat icon={EyeIcon} value={t.views} label="views" />
            <Stat icon={MessageSquareIcon} value={t.replies.length} label="replies" />
          </div>
        </header>

        <div className="rounded-2xl border border-border bg-card/60 p-5 md:p-6">
          <Translatable
            lang={t.lang}
            original={<p className="text-[15px] leading-relaxed md:text-base">{t.body}</p>}
            english={t.en?.body && <p className="text-[15px] leading-relaxed md:text-base">{t.en.body}</p>}
          />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <LikeButton target={`thread:${t.id}`} base={t.votes} label="Upvote" />
            {t.tags.map((tag) => (
              <Chip key={tag}>#{tag}</Chip>
            ))}
          </div>
        </div>

        {t.replies.length > 0 && (
          <section aria-labelledby="replies-h" className="flex flex-col gap-3">
            <h2 id="replies-h" className="text-base font-semibold">
              {t.replies.length} {t.replies.length === 1 ? "reply" : "replies"}
            </h2>
            <Stagger as="ol" className="flex flex-col gap-2">
              {t.replies.map((r) => (
                <Item as="li" key={r.id}>
                  <div className={cn("flex gap-4 rounded-xl border p-4", r.accepted ? "border-ok/40 bg-ok/[0.05]" : "border-border bg-card/40")}>
                    <div className="flex w-10 shrink-0 flex-col items-center text-sm">
                      <ArrowUpIcon aria-hidden className="size-4 text-muted-foreground" />
                      <span className="font-semibold tabular">{r.votes}</span>
                      <span className="sr-only">votes</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Link href={`/people/${r.author}`} className="flex items-center gap-2 font-medium hover:underline">
                          <PersonAvatar handle={r.author} size={22} />
                          {getPerson(r.author)?.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">{ago(r.date)}</span>
                        {r.accepted && (
                          <span className="ml-auto inline-flex items-center gap-1 text-xs text-ok">
                            <CheckCircle2Icon aria-hidden className="size-3.5" /> Solved it
                          </span>
                        )}
                      </div>
                      <Translatable lang={r.lang} original={<p className="text-[15px] leading-relaxed">{r.body}</p>} english={r.en && <p className="text-[15px] leading-relaxed">{r.en}</p>} />
                    </div>
                  </div>
                </Item>
              ))}
            </Stagger>
          </section>
        )}

        <ThreadDiscussion threadId={t.id} />
      </article>

      <aside className="flex flex-col gap-6">
        {linked.length > 0 && (
          <section aria-labelledby="linked-h" className="flex flex-col gap-2.5">
            <h2 id="linked-h" className="font-sans text-sm font-medium tracking-normal text-muted-foreground">
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
        {related.length > 0 && (
          <section aria-labelledby="related-h" className="flex flex-col gap-1">
            <h2 id="related-h" className="font-sans text-sm font-medium tracking-normal text-muted-foreground">
              More in {cat?.name}
            </h2>
            <ul>
              {related.map((r) => (
                <li key={r.id}>
                  <ThreadRow t={r} compact />
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  )
}
