import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Suspense } from "react"
import { NMark } from "@/components/brand"
import { ArtifactRow, PersonAvatar, PersonLink, ThreadRow } from "@/components/app/bits"
import { MemberQuestions } from "@/components/app/member"
import { LinkButton } from "@/components/link-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { artifactsIn, getOrbit, LANGUAGES, orbits, peopleIn, threadsIn } from "@/lib/data"

export function generateStaticParams() {
  return orbits.map((o) => ({ slug: o.slug }))
}

export async function generateMetadata({ params }: PageProps<"/orbits/[slug]">): Promise<Metadata> {
  const o = getOrbit((await params).slug)
  return { title: o?.name ?? "Orbit", description: o?.blurb }
}

// The params are known at build time; the boundary keeps navigation instant for any that are not.
export default function OrbitPage({ params }: PageProps<"/orbits/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrbitContent params={params} />
    </Suspense>
  )
}

async function OrbitContent({ params }: { params: PageProps<"/orbits/[slug]">["params"] }) {
  const orbit = getOrbit((await params).slug)
  if (!orbit) notFound()
  const ts = threadsIn(orbit.slug)
  const as = artifactsIn(orbit.slug)
  const ps = peopleIn(orbit.slug)

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-8 pt-14 pb-12 md:grid-cols-[1fr_auto] md:items-end md:pt-20">
        <div className="flex flex-col gap-5">
          <h1 className="font-wide text-[clamp(2.5rem,1.4rem+4.4vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.04em]">
            {orbit.name}
          </h1>
          <p className="text-lead max-w-[48ch] text-muted-foreground">{orbit.about}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <LinkButton href={`/new?orbit=${orbit.slug}`} size="lg">
              Ask in {orbit.name}
            </LinkButton>
          </div>
        </div>
        <NMark
          material={orbit.material}
          sizes="(min-width: 768px) 280px, 60vw"
          className="hidden aspect-square w-[min(280px,22vw)] rounded-[6px] md:block"
        />
      </div>

      <div className="grid gap-14 lg:grid-cols-[1fr_18rem]">
        <Tabs defaultValue="threads">
          <TabsList>
            <TabsTrigger value="threads">Threads</TabsTrigger>
            <TabsTrigger value="built">Built here</TabsTrigger>
            <TabsTrigger value="people">People</TabsTrigger>
          </TabsList>
          <TabsContent value="threads" className="pt-4">
            <MemberQuestions orbit={orbit.slug} showOrbit={false} className="mb-8" />
            <ul>
              {ts.map((t) => (
                <ThreadRow key={t.id} thread={t} showOrbit={false} />
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="built" className="pt-4">
            {as.length ? (
              <ul>
                {as.map((a) => (
                  <ArtifactRow key={a.slug} artifact={a} />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-muted-foreground">Nothing built here yet. The first answer that works usually becomes something.</p>
            )}
          </TabsContent>
          <TabsContent value="people" className="pt-4">
            <ul className="flex flex-col gap-1">
              {ps.map((p) => (
                <li key={p.handle} className="flex items-center gap-3 py-3">
                  <PersonAvatar handle={p.handle} />
                  <span className="flex flex-col">
                    <PersonLink handle={p.handle} />
                    <span className="text-small text-muted-foreground">
                      {p.place} · {p.languages.map((l) => LANGUAGES[l].native).join(", ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>

        <aside aria-labelledby="rules-h" className="flex flex-col gap-4 self-start rounded-md bg-card p-6">
          <h2 id="rules-h" className="font-medium">How we talk here</h2>
          <ul className="flex flex-col gap-3 text-[15px] text-muted-foreground">
            {orbit.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
