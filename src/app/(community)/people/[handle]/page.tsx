import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { CalendarIcon, MapPinIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { PersonAvatar } from "@/components/hub/bits"
import { ConstellationCard, ResourceCard, ThreadRow } from "@/components/hub/cards"
import { Heatmap } from "@/components/hub/heatmap"
import { LikeButton } from "@/components/hub/like-button"
import { MotionTabs } from "@/components/hub/motion-tabs"
import { compact, constellations, formatDate, getPerson, LANGUAGES, people, resourcesBy, threads, threadsBy } from "@/lib/data"

export function generateStaticParams() {
  return people.map((p) => ({ handle: p.handle }))
}

export async function generateMetadata({ params }: PageProps<"/people/[handle]">): Promise<Metadata> {
  return { title: getPerson((await params).handle)?.name ?? "Person" }
}

export default function Page({ params }: PageProps<"/people/[handle]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile params={params} />
    </Suspense>
  )
}

async function Profile({ params }: { params: PageProps<"/people/[handle]">["params"] }) {
  const p = getPerson((await params).handle)
  if (!p) notFound()
  const built = resourcesBy(p.handle)
  const started = threadsBy(p.handle)
  const replied = threads.filter((t) => t.author !== p.handle && t.replies.some((r) => r.author === p.handle))
  const mapped = constellations.filter((c) => c.curator === p.handle)
  const total = p.activity.reduce((a, b) => a + b, 0)
  const list = (items: React.ReactNode[], empty: string) => (items.length ? <ul className="flex flex-col gap-2">{items}</ul> : <p className="text-muted-foreground">{empty}</p>)

  return (
    <div className="shell grid grid-cols-1 gap-10 pt-10 lg:grid-cols-[18rem_1fr]">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <PersonAvatar handle={p.handle} size={112} className="shadow-[0_20px_80px_-20px_rgb(143_180_255/0.6)]" />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">{p.name}</h1>
          <p className="text-muted-foreground">
            @{p.handle} · {p.role}
          </p>
        </div>
        <p className="text-[15px]">{p.bio}</p>
        <LikeButton target={`person:${p.handle}`} base={p.followers} label="Follow" className="self-start" />
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <MapPinIcon aria-hidden className="size-4" /> {p.place}
          </li>
          <li className="flex items-center gap-2">
            <CalendarIcon aria-hidden className="size-4" /> Joined {formatDate(p.joined)}
          </li>
        </ul>
        <div className="flex flex-wrap gap-1.5">
          {p.langs.map((l) => (
            <span key={l} lang={l} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
              {LANGUAGES[l].native}
            </span>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-8">
        <section aria-labelledby="activity-h" className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="activity-h" className="font-sans text-sm font-medium tracking-normal">
              {compact(total)} contributions in the last year
            </h2>
            <span className="text-xs text-muted-foreground">{compact(p.followers)} followers</span>
          </div>
          <Heatmap weeks={p.activity} seed={p.handle} />
        </section>
        <MotionTabs
          tabs={[
            { id: "built", label: "Built", count: built.length, content: list(built.map((r) => <li key={r.slug}><ResourceCard r={r} /></li>), "Nothing published yet.") },
            { id: "threads", label: "Threads", count: started.length, content: list(started.map((t) => <li key={t.id}><ThreadRow t={t} /></li>), "No threads started yet.") },
            { id: "replies", label: "Replies", count: replied.length, content: list(replied.map((t) => <li key={t.id}><ThreadRow t={t} /></li>), "No replies yet.") },
            { id: "maps", label: "Constellations", count: mapped.length, content: mapped.length ? <ul className="grid gap-4 md:grid-cols-2">{mapped.map((c) => <li key={c.slug}><ConstellationCard c={c} /></li>)}</ul> : <p className="text-muted-foreground">No constellations mapped yet.</p> },
          ]}
        />
      </div>
    </div>
  )
}
