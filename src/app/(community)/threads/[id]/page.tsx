import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Suspense } from "react"
import { ThreadView } from "@/components/app/thread-view"
import {
  ARTIFACT_KINDS,
  getArtifact,
  getOrbit,
  getThread,
  LOOP_STAGES,
  threads,
  threadTitle,
  threadsIn,
} from "@/lib/data"
import { cn } from "@/lib/utils"

export function generateStaticParams() {
  return threads.map((t) => ({ id: t.id }))
}

export async function generateMetadata({ params }: PageProps<"/threads/[id]">): Promise<Metadata> {
  const t = getThread((await params).id)
  return { title: t ? threadTitle(t) : "Thread" }
}

// The params are known at build time; the boundary keeps navigation instant for any that are not.
export default function ThreadPage({ params }: PageProps<"/threads/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ThreadContent params={params} />
    </Suspense>
  )
}

async function ThreadContent({ params }: { params: PageProps<"/threads/[id]">["params"] }) {
  const thread = getThread((await params).id)
  if (!thread) notFound()
  const orbit = getOrbit(thread.orbit)!
  const artifact = thread.artifact ? getArtifact(thread.artifact) : undefined
  const at = LOOP_STAGES.findIndex((s) => s.id === thread.stage)
  const related = threadsIn(orbit.slug).filter((t) => t.id !== thread.id).slice(0, 3)

  return (
    <div className="mx-auto grid max-w-6xl gap-14 pt-10 lg:grid-cols-[1fr_20rem] lg:pt-16">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-8 text-small text-muted-foreground">
          <Link href="/orbits" className="hover:text-foreground">
            Orbits
          </Link>
          <span aria-hidden> / </span>
          <Link href={`/orbits/${orbit.slug}`} className="hover:text-foreground">
            {orbit.name}
          </Link>
        </nav>
        <ThreadView thread={thread} />
      </div>

      <aside className="flex flex-col gap-10 lg:pt-16">
        <section aria-labelledby="loop-h" className="flex flex-col gap-4">
          <h2 id="loop-h" className="font-medium">
            Where this loop is
          </h2>
          <ol className="flex flex-col gap-1.5">
            {LOOP_STAGES.map((s, i) => (
              <li
                key={s.id}
                aria-current={i === at ? "step" : undefined}
                className={cn(
                  "rounded-md px-4 py-3",
                  i < at && "bg-card text-muted-foreground",
                  i === at && (i === 3 ? "bg-field text-field-foreground" : "bg-foreground text-background"),
                  i > at && "bg-card/40 text-muted-foreground/70"
                )}
              >
                <span className="block font-medium">{s.label}</span>
                <span className="text-small opacity-80">{s.detail}</span>
              </li>
            ))}
          </ol>
        </section>

        {artifact && (
          <section aria-labelledby="became-h" className="flex flex-col gap-3 rounded-md bg-field p-6 text-field-foreground">
            <h2 id="became-h" className="text-small">
              This question became a {ARTIFACT_KINDS[artifact.kind].label.toLowerCase()}
            </h2>
            <Link
              href={`/artifacts/${artifact.slug}`}
              className="font-wide text-2xl leading-tight font-semibold tracking-[-0.03em] hover:underline"
            >
              {artifact.name}
            </Link>
            <p className="text-[15px]">{artifact.summary}</p>
          </section>
        )}

        {related.length > 0 && (
          <section aria-labelledby="rel-h" className="flex flex-col gap-3">
            <h2 id="rel-h" className="font-medium">
              Also in {orbit.name}
            </h2>
            <ul className="flex flex-col gap-3">
              {related.map((t) => (
                <li key={t.id}>
                  <Link href={`/threads/${t.id}`} className="text-[15px] leading-snug text-muted-foreground hover:text-foreground">
                    {threadTitle(t)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  )
}
