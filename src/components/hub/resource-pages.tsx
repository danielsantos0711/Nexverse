import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense, ViewTransition } from "react"
import { DownloadIcon, FileIcon, GitForkIcon, HeartIcon, UsersIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Chip, Cover, KIND_ICONS, KindTag, LangTag, PageTitle, PersonAvatar, Stat } from "@/components/hub/bits"
import { ConstellationCard, NewsCard, ResourceCard, ThreadRow } from "@/components/hub/cards"
import { CompareButton } from "@/components/hub/compare"
import { CopyButton } from "@/components/hub/copy-button"
import { LikeButton } from "@/components/hub/like-button"
import { MotionTabs } from "@/components/hub/motion-tabs"
import { ResourceIndex } from "@/components/hub/resource-index"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { SaveButton } from "@/components/social/save-button"
import { AddToCollection } from "@/components/collections/add-to-collection"
import { CosmosLink } from "@/components/cosmos/cosmos-link"
import { ModelScores } from "@/components/benchmarks/model-scores"
import { DiscussButton } from "@/components/social/discuss-button"
import {
  ago,
  compact,
  constellationsWith,
  formatDate,
  getPerson,
  getResource,
  KINDS,
  LANGUAGES,
  newsAbout,
  resources,
  resourcesBy,
  resourcesOf,
  threadsAbout,
  type ResourceKind,
  resourcePath,
} from "@/lib/data"

export function ResourceListPage({ kind }: { kind?: ResourceKind }) {
  const Icon = kind ? KIND_ICONS[kind] : null
  const count = resourcesOf(kind).length
  return (
    <div className="shell">
      <PageTitle
        eyebrow={
          Icon ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon aria-hidden className="size-4" /> {compact(count)} {KINDS[kind!].plural.toLowerCase()}
            </span>
          ) : (
            `${resources.length} things people built`
          )
        }
        title={kind ? KINDS[kind].plural : "Explore everything"}
        lead={kind ? KINDS[kind].blurb : "Every model, dataset, tool and repo on Nexverse, in one place. Filter by task, language and licence."}
      />
      <Suspense fallback={<PageSkeleton />}>
        <ResourceIndex kind={kind} />
      </Suspense>
    </div>
  )
}

const REACH = {
  model: [DownloadIcon, "Downloads last month"],
  dataset: [DownloadIcon, "Downloads last month"],
  tool: [UsersIcon, "Monthly users"],
  repo: [GitForkIcon, "Forks"],
} as const

export function resourceParams(kind: ResourceKind) {
  return resourcesOf(kind).map((r) => ({ slug: r.slug }))
}

export function resourceTitle(kind: ResourceKind, slug: string) {
  const r = getResource(slug)
  return r && r.kind === kind ? `${r.owner}/${r.name}` : KINDS[kind].label
}

export function ResourceDetailPage({ kind, params }: { kind: ResourceKind; params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ResourceDetail kind={kind} params={params} />
    </Suspense>
  )
}

async function ResourceDetail({ kind, params }: { kind: ResourceKind; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const r = getResource(slug)
  if (!r || r.kind !== kind) notFound()
  const owner = getPerson(r.owner)
  const discussions = threadsAbout(r.slug)
  const inConstellations = constellationsWith(r.slug)
  const inNews = newsAbout(r.slug)
  const more = resourcesBy(r.owner).filter((x) => x.slug !== r.slug).slice(0, 4)
  const similar = resources.filter((x) => x.slug !== r.slug && x.task === r.task).slice(0, 4)
  const [ReachIcon, reachLabel] = REACH[r.kind]
  const KindIcon = KIND_ICONS[r.kind]
  const files = r.files ?? [
    { name: "README.md", size: "6 KB" },
    { name: r.kind === "repo" ? "src/" : r.kind === "tool" ? "manifest.json" : "data/", size: "—" },
    { name: "LICENSE", size: "11 KB" },
  ]

  const overview = (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-[72ch] flex-col gap-4 text-[15px] leading-relaxed text-foreground/90">
        {r.about.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {r.quickstart && (
        <section aria-labelledby="qs-h" className="flex flex-col gap-3">
          <h2 id="qs-h" className="text-base font-semibold">
            Quick start
          </h2>
          <div className="relative overflow-hidden rounded-xl border border-border bg-[#07080d]">
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
              <span className="flex gap-1.5">
                <i className="size-2.5 rounded-full bg-white/10" />
                <i className="size-2.5 rounded-full bg-white/10" />
                <i className="size-2.5 rounded-full bg-white/10" />
              </span>
              <CopyButton text={r.quickstart} />
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-[#cfd8ea]">
              <code>{r.quickstart}</code>
            </pre>
          </div>
        </section>
      )}
      {inNews.length > 0 && (
        <section aria-labelledby="innews-h" className="flex flex-col gap-3">
          <h2 id="innews-h" className="text-base font-semibold">
            In the news
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {inNews.map((n) => (
              <li key={n.id}>
                <NewsCard n={n} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )

  const fileList = (
    <ul className="overflow-hidden rounded-xl border border-border">
      {files.map((f) => (
        <li key={f.name} className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0 hover:bg-white/[0.02]">
          <FileIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="font-mono">{f.name}</span>
          <span className="ml-auto text-xs text-muted-foreground tabular">{f.size}</span>
        </li>
      ))}
    </ul>
  )

  const talk = (
    <div className="flex flex-col gap-6">
      {discussions.length > 0 && (
        <ol className="flex flex-col gap-1">
          {discussions.map((t) => (
            <li key={t.id}>
              <ThreadRow t={t} />
            </li>
          ))}
        </ol>
      )}
      <ThreadDiscussion threadId={`${r.kind}-${r.slug}`} heading="Comments" />
    </div>
  )

  const usedIn = inConstellations.length ? (
    <ul className="grid gap-4 md:grid-cols-2">
      {inConstellations.map((c) => (
        <li key={c.slug}>
          <ConstellationCard c={c} />
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-muted-foreground">Not part of a constellation yet.</p>
  )

  return (
    <>
      <div className="relative isolate overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 opacity-60">
          <Cover seed={r.slug + "banner"} kind={r.kind} />
        </div>
        <Image src="/space/ring.webp" alt="" fill sizes="100vw" className="-z-10 object-cover opacity-[0.12] mix-blend-screen" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/30 via-background/70 to-background" />
        <div className="shell flex flex-col gap-5 pt-10 pb-8 md:pt-14">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href={KINDS[r.kind].path} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <KindIcon aria-hidden className="size-4" />
              {KINDS[r.kind].plural}
            </Link>
            <span aria-hidden>/</span>
            <Link href={`/people/${r.owner}`} className="hover:text-foreground">
              {r.owner}
            </Link>
          </nav>
          <div className="flex flex-wrap items-center gap-4">
            <ViewTransition name={`cover-${r.kind}-${r.slug}`} share="morph" default="none">
              <div className="size-16 overflow-hidden rounded-2xl ring-1 ring-white/15 md:size-20">
                <Cover seed={r.slug} kind={r.kind} />
              </div>
            </ViewTransition>
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-[-0.03em] break-words md:text-4xl">
                <span className="text-muted-foreground">{r.owner}/</span>
                {r.name}
              </h1>
              <p className="text-muted-foreground">{r.summary}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LikeButton target={`${r.kind}:${r.slug}`} base={r.likes} />
            <SaveButton target={`${r.kind}:${r.slug}`} />
            <AddToCollection target={`${r.kind}:${r.slug}`} />
            <CompareButton slug={r.slug} />
            <CosmosLink target={`${r.kind}:${r.slug}`} />
            <DiscussButton title={r.name} href={resourcePath(r)} category={r.kind === "dataset" ? "data" : r.kind === "model" ? "models" : "show"} />
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/60 px-3.5 text-sm" title={reachLabel}>
              <ReachIcon aria-hidden className="size-4" /> <span className="tabular">{compact(r.reach)}</span>
              <span className="text-muted-foreground">{r.kind === "repo" ? "forks" : r.kind === "tool" ? "users" : "downloads"}</span>
            </span>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <KindTag kind={r.kind} />
            <Chip>{r.task}</Chip>
            <Chip>{r.license}</Chip>
            {r.tags.map((t) => (
              <Chip key={t}>#{t}</Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="shell grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[1fr_20rem]">
        <MotionTabs
          className="min-w-0"
          tabs={[
            { id: "overview", label: r.kind === "model" ? "Model card" : r.kind === "dataset" ? "Dataset card" : "Overview", content: overview },
            { id: "files", label: r.kind === "repo" ? "Code" : "Files", count: files.length, content: fileList },
            { id: "talk", label: "Discussions", count: discussions.length, content: talk },
            { id: "used", label: "Constellations", count: inConstellations.length, content: usedIn },
          ]}
        />

        <aside className="flex flex-col gap-6">
          <section aria-label="Details" className="glass flex flex-col gap-3 rounded-2xl p-5 text-sm">
            <Row label={r.kind === "model" ? "Parameters" : r.kind === "dataset" ? "Size" : r.kind === "tool" ? "Platform" : "Language"} value={<span className="font-mono">{r.spec}</span>} />
            <Row label="Task" value={r.task} />
            <Row label="Licence" value={r.license} />
            <Row label="Updated" value={`${formatDate(r.updated)} · ${ago(r.updated)}`} />
            <Row label="Likes" value={<Stat icon={HeartIcon} value={r.likes} label="likes" />} />
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Languages</span>
              <div className="flex flex-wrap gap-1.5">
                {r.langs.map((l) => (
                  <span key={l} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-xs">
                    <LangTag lang={l} className="border-0 p-0" /> <span lang={l}>{LANGUAGES[l].native}</span>
                  </span>
                ))}
              </div>
            </div>
          </section>

          {r.kind === "model" && <ModelScores slug={r.slug} />}

          {owner && (
            <section aria-label="Owner" className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex items-center gap-3">
                <PersonAvatar handle={owner.handle} size={40} />
                <div className="flex min-w-0 flex-col">
                  <Link href={`/people/${owner.handle}`} className="truncate font-medium hover:underline">
                    {owner.name}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">{owner.role}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{owner.bio}</p>
              {more.length > 0 && (
                <ul className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
                  {more.map((m) => (
                    <li key={m.slug}>
                      <Link href={`${KINDS[m.kind].path}/${m.slug}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <span className="size-5 overflow-hidden rounded">
                          <Cover seed={m.slug} kind={m.kind} />
                        </span>
                        {m.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            Sample entry for the preview. Owners, numbers and files are illustrative.
          </p>
        </aside>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar-h" className="shell mt-16">
          <h2 id="similar-h" className="mb-4 text-xl font-semibold">
            More for {r.task.toLowerCase()}
          </h2>
          <ul className="grid gap-2.5 md:grid-cols-2">
            {similar.map((s) => (
              <li key={s.slug}>
                <ResourceCard r={s} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
