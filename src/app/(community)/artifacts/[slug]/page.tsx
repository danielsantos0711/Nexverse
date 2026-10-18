import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Suspense } from "react"
import { LoopMark, PersonAvatar, PersonLink, ThreadRow } from "@/components/app/bits"
import { LinkButton } from "@/components/link-button"
import {
  ARTIFACT_KINDS,
  artifacts,
  formatDate,
  getArtifact,
  getOrbit,
  getPerson,
  getThread,
  LANGUAGES,
  threads,
  threadTitle,
} from "@/lib/data"

export function generateStaticParams() {
  return artifacts.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: PageProps<"/artifacts/[slug]">): Promise<Metadata> {
  const a = getArtifact((await params).slug)
  return { title: a?.name ?? "Artifact", description: a?.summary }
}

// The params are known at build time; the boundary keeps navigation instant for any that are not.
export default function ArtifactPage({ params }: PageProps<"/artifacts/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ArtifactContent params={params} />
    </Suspense>
  )
}

async function ArtifactContent({ params }: { params: PageProps<"/artifacts/[slug]">["params"] }) {
  const artifact = getArtifact((await params).slug)
  if (!artifact) notFound()
  const origin = artifact.fromThread ? getThread(artifact.fromThread) : undefined
  const orbit = getOrbit(artifact.orbit)!
  const author = getPerson(artifact.author)!
  const discussed = threads.filter((t) => t.artifact === artifact.slug || t.orbit === artifact.orbit).filter((t) => t.id !== origin?.id).slice(0, 3)

  const details = [
    { label: "Kind", value: ARTIFACT_KINDS[artifact.kind].label },
    { label: "Licence", value: artifact.license },
    { label: "Languages", value: artifact.languages.map((l) => LANGUAGES[l].native).join(", ") },
    ...artifact.facts,
    { label: "Updated", value: formatDate(artifact.updated) },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-6 pt-14 pb-12 md:pt-20">
        <p className="text-muted-foreground">
          {ARTIFACT_KINDS[artifact.kind].label} in{" "}
          <Link href={`/orbits/${orbit.slug}`} className="text-foreground hover:underline">
            {orbit.name}
          </Link>
        </p>
        <h1 className="font-wide text-[clamp(2.4rem,1.2rem+5vw,6rem)] leading-[0.92] font-semibold tracking-[-0.045em] break-words">
          {artifact.name}
        </h1>
        <p className="text-lead max-w-[44ch]">{artifact.summary}</p>
        <span className="flex items-center gap-3">
          <PersonAvatar handle={author.handle} />
          <span className="flex flex-col leading-tight">
            <PersonLink handle={author.handle} />
            <span className="text-small text-muted-foreground">{author.place}</span>
          </span>
        </span>
      </div>

      <div className="grid gap-14 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-14">
          <p className="max-w-[64ch] text-lg leading-relaxed">{artifact.description}</p>

          {origin && (
            <section aria-labelledby="origin-h" className="flex flex-col gap-4 rounded-md bg-card p-6 md:p-8">
              <h2 id="origin-h" className="text-small text-muted-foreground">
                It started as a question
              </h2>
              <Link
                href={`/threads/${origin.id}`}
                className="font-wide text-[clamp(1.4rem,1rem+1.2vw,2rem)] leading-tight font-semibold tracking-[-0.03em] hover:underline"
              >
                {threadTitle(origin)}
              </Link>
              <span className="flex flex-wrap items-center gap-4 text-small text-muted-foreground">
                <LoopMark stage={origin.stage} />
                <span>Asked by {getPerson(origin.author)?.name}</span>
                <span>{origin.replies.length} answers</span>
              </span>
            </section>
          )}

          {discussed.length > 0 && (
            <section aria-labelledby="disc-h">
              <h2 id="disc-h" className="mb-2 text-lg font-medium">
                Related questions
              </h2>
              <ul>
                {discussed.map((t) => (
                  <ThreadRow key={t.id} thread={t} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-6 self-start">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-md bg-card p-6 text-[15px]">
            {details.map((d) => (
              <div key={d.label} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
          <LinkButton href={`/new?orbit=${orbit.slug}&about=${artifact.slug}`} variant="secondary" size="lg">
            Ask about {artifact.name}
          </LinkButton>
          <p className="text-small text-muted-foreground">
            Downloads and source links appear here once members can publish. This page is sample content.
          </p>
        </aside>
      </div>
    </div>
  )
}
