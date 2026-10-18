import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Suspense } from "react"
import { ArtifactRow, initials, PersonAvatar, ThreadRow } from "@/components/app/bits"
import {
  answersBy,
  artifacts,
  formatDate,
  getPerson,
  helpGraph,
  LANGUAGES,
  people,
  threads,
  threadTitle,
} from "@/lib/data"

export function generateStaticParams() {
  return people.map((p) => ({ handle: p.handle }))
}

export async function generateMetadata({ params }: PageProps<"/people/[handle]">): Promise<Metadata> {
  const p = getPerson((await params).handle)
  return { title: p?.name ?? "Person" }
}

// The params are known at build time; the boundary keeps navigation instant for any that are not.
export default function PersonPage({ params }: PageProps<"/people/[handle]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PersonContent params={params} />
    </Suspense>
  )
}

async function PersonContent({ params }: { params: PageProps<"/people/[handle]">["params"] }) {
  const person = getPerson((await params).handle)
  if (!person) notFound()
  const asked = threads.filter((t) => t.author === person.handle)
  const answers = answersBy(person.handle).filter((a) => a.thread.author !== person.handle)
  const built = artifacts.filter((a) => a.author === person.handle)
  const { helped, helpedBy } = helpGraph(person.handle)

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-8 pt-14 pb-12 md:grid-cols-[auto_1fr] md:items-end md:pt-20">
        <span
          aria-hidden
          className="font-wide grid size-28 place-items-center rounded-[6px] bg-card text-4xl font-semibold tracking-[-0.04em] md:size-40 md:text-6xl"
        >
          {initials(person.name)}
        </span>
        <div className="flex flex-col gap-4">
          <h1 className="font-wide text-[clamp(2.4rem,1.3rem+4vw,5rem)] leading-[0.95] font-semibold tracking-[-0.04em]">
            {person.name}
          </h1>
          <p className="text-lead max-w-[46ch] text-muted-foreground">{person.bio}</p>
          <p className="text-small text-muted-foreground">
            {person.place} · Writes in {person.languages.map((l) => LANGUAGES[l].native).join(", ")} · Here since{" "}
            {formatDate(person.joined)}
          </p>
        </div>
      </div>

      <section aria-labelledby="help-h" className="mb-16 grid gap-2 md:grid-cols-2">
        <h2 id="help-h" className="sr-only">
          Help given and received
        </h2>
        <HelpList title={`Helped ${helped.size} ${helped.size === 1 ? "person" : "people"}`} map={helped} empty="No answers on other people's threads yet." />
        <HelpList title={`Was helped by ${helpedBy.size}`} map={helpedBy} empty="Nobody has answered their questions yet." />
      </section>

      <div className="grid gap-14 lg:grid-cols-2">
        <section aria-labelledby="asked-h">
          <h2 id="asked-h" className="mb-2 text-lg font-medium">
            Asked
          </h2>
          {asked.length ? (
            <ul>
              {asked.map((t) => (
                <ThreadRow key={t.id} thread={t} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No questions yet.</p>
          )}
        </section>
        <div className="flex flex-col gap-14">
          {built.length > 0 && (
            <section aria-labelledby="built-h">
              <h2 id="built-h" className="mb-2 text-lg font-medium">
                Built and shared back
              </h2>
              <ul>
                {built.map((a) => (
                  <ArtifactRow key={a.slug} artifact={a} />
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="ans-h">
            <h2 id="ans-h" className="mb-2 text-lg font-medium">
              Answered
            </h2>
            {answers.length ? (
              <ul className="flex flex-col">
                {answers.map(({ thread, reply }) => (
                  <li key={thread.id + reply.id}>
                    <Link
                      href={`/threads/${thread.id}`}
                      className="-mx-3 flex flex-col gap-1 rounded-md px-3 py-4 transition-colors duration-150 hover:bg-card"
                    >
                      <span className="font-medium">{threadTitle(thread)}</span>
                      <span className="line-clamp-2 text-muted-foreground">{reply.en ?? reply.body}</span>
                      {reply.accepted && <span className="text-small text-foreground">Worked for the asker</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No answers yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function HelpList({ title, map, empty }: { title: string; map: Map<string, number>; empty: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-md bg-card p-6">
      <h3 className="font-medium">{title}</h3>
      {map.size ? (
        <ul className="flex flex-wrap gap-3">
          {[...map.entries()].map(([handle, n]) => {
            const p = getPerson(handle)!
            return (
              <li key={handle}>
                <Link href={`/people/${handle}`} className="flex items-center gap-2 rounded-full bg-background py-1 pr-3 pl-1 hover:bg-raised">
                  <PersonAvatar handle={handle} size="sm" />
                  <span className="text-[15px]">{p.name}</span>
                  {n > 1 && <span className="text-small text-muted-foreground tabular">×{n}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}
