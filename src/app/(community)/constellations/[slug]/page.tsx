import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { PersonLink } from "@/components/hub/bits"
import { ResourceCard, ThreadRow } from "@/components/hub/cards"
import { ConstellationMap } from "@/components/hub/constellation-map"
import { LikeButton } from "@/components/hub/like-button"
import { Item, Stagger } from "@/components/hub/motion"
import { constellations, getConstellation, getResource, getThread } from "@/lib/data"
import { SaveButton } from "@/components/social/save-button"

export function generateStaticParams() {
  return constellations.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: PageProps<"/constellations/[slug]">): Promise<Metadata> {
  return { title: getConstellation((await params).slug)?.name ?? "Constellation" }
}

export default function Page({ params }: PageProps<"/constellations/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Detail params={params} />
    </Suspense>
  )
}

async function Detail({ params }: { params: PageProps<"/constellations/[slug]">["params"] }) {
  const c = getConstellation((await params).slug)
  if (!c) notFound()
  const stars = c.stars.map(getResource).filter((r) => r !== undefined)
  const talk = c.threads.map(getThread).filter((t) => t !== undefined)
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <Image src={c.image} alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-40" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/20 via-background/70 to-background" />
        <div className="shell flex flex-col gap-6 pt-12 pb-10">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/constellations" className="hover:text-foreground">
              Constellations
            </Link>
          </nav>
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold tracking-[-0.035em] md:text-5xl">{c.name}</h1>
            <p className="max-w-[60ch] text-lg text-muted-foreground">{c.goal}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                Mapped by <PersonLink handle={c.curator} />
              </span>
              <LikeButton target={`constellation:${c.slug}`} base={c.saves} label="Star" />
              <SaveButton target={`constellation:${c.slug}`} />
            </div>
          </div>
          <div className="glass rounded-3xl p-2 md:p-6">
            <ConstellationMap c={c} />
          </div>
        </div>
      </section>
      <div className="shell grid grid-cols-1 gap-10 pt-10 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="path-h" className="min-w-0">
          <h2 id="path-h" className="mb-4 text-xl font-semibold">
            The stack, in order
          </h2>
          <Stagger as="ol" className="relative flex flex-col gap-3 border-l border-ion/25 pl-6">
            {stars.map((r, i) => (
              <Item as="li" key={r.slug} className="relative">
                <span className="absolute top-5 -left-[31px] flex size-3.5 items-center justify-center rounded-full bg-background ring-2 ring-ion">
                  <span className="size-1.5 rounded-full bg-ion" />
                </span>
                <p className="mb-1.5 text-xs text-muted-foreground tabular">Step {i + 1}</p>
                <ResourceCard r={r} />
              </Item>
            ))}
          </Stagger>
        </section>
        {talk.length > 0 && (
          <aside aria-labelledby="talk-h" className="flex flex-col gap-1">
            <h2 id="talk-h" className="mb-2 font-sans text-sm font-medium tracking-normal text-muted-foreground">
              Where this came from
            </h2>
            {talk.map((t) => (
              <ThreadRow key={t.id} t={t} compact />
            ))}
          </aside>
        )}
      </div>
    </>
  )
}
