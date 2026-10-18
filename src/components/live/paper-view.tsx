import Link from "next/link"
import { notFound } from "next/navigation"
import { AppWindowIcon, ArrowUpIcon, BoxIcon, CalendarIcon, DatabaseIcon, FileTextIcon, FolderGit2Icon, SparklesIcon } from "lucide-react"
import { Chip } from "@/components/hub/bits"
import { LikeButton } from "@/components/hub/like-button"
import { MotionTabs } from "@/components/hub/motion-tabs"
import { SaveButton } from "@/components/social/save-button"
import { compact } from "@/lib/data"
import { discussItemHref, hfHref, internalHref, liveTarget, paperHref } from "@/lib/live/ids"
import { paperDetail, type LinkedHub } from "@/lib/live/papers"
import type { HubKind } from "@/lib/live/types"
import { ExternalLink } from "./bits"
import { DetailBanner, DiscussButton, Empty, ErrorPanel, InfoRow, Panel, SourceLink } from "./detail"

/* The in-site page of a paper: abstract, authors, the PDF embedded, and what on the Hub builds on it. */

const crumbs = [
  {
    href: "/papers",
    label: (
      <>
        <FileTextIcon aria-hidden className="size-4" /> Papers
      </>
    ),
  },
]

const DATE = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

function Authors({ names }: { names: string[] }) {
  if (!names.length) return null
  if (names.length <= 12) return <p className="max-w-[90ch] text-foreground/85">{names.join(", ")}</p>
  return (
    <details className="max-w-[90ch] text-foreground/85">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {names.slice(0, 10).join(", ")} <span className="text-ion hover:underline">and {names.length - 10} more</span>
      </summary>
      <p className="mt-1">{names.slice(10).join(", ")}</p>
    </details>
  )
}

const HUB_ICON: Record<HubKind, typeof BoxIcon> = { model: BoxIcon, dataset: DatabaseIcon, space: AppWindowIcon }

function Linked({ title, kind, items, total }: { title: string; kind: HubKind; items: LinkedHub[]; total: number }) {
  if (!items.length) return null
  const Icon = HUB_ICON[kind]
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {title} <span className="text-muted-foreground tabular">{compact(Math.max(total, items.length))}</span>
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((m) => (
          <li key={m.id}>
            <Link href={hfHref(kind, m.id)} className="flex items-center gap-3 rounded-xl border border-border bg-card/50 px-3 py-2.5 transition-colors hover:bg-card">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-base">{m.emoji || <Icon aria-hidden className="size-4 text-muted-foreground" />}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-sm">{m.id}</span>
                {m.title ? (
                  <span className="truncate text-xs text-muted-foreground">{m.title}</span>
                ) : (
                  <span className="text-xs text-muted-foreground tabular">
                    {m.downloads > 0 ? `${compact(m.downloads)} downloads · ` : ""}
                    {compact(m.likes)} likes
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export async function PaperView({ id }: { id: string }) {
  const res = await paperDetail(id)
  if (!res.ok) {
    if (res.reason === "notfound") notFound()
    return (
      <>
        <DetailBanner seed={`paper-${id}`} kind="news" crumbs={crumbs}>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-4xl">arXiv:{id}</h1>
        </DetailBanner>
        <div className="shell flex max-w-3xl flex-col gap-6 pt-8">
          <ErrorPanel reason={res.reason} />
        </div>
      </>
    )
  }
  const p = res.data
  const target = liveTarget("paper", p.baseId)
  const discuss = discussItemHref(p.title, `${p.title} (arXiv:${p.baseId})\n\n${paperHref(p.baseId)}`)
  const code = p.github ? internalHref(p.github) : null
  const usedCount = p.models.length + p.datasets.length + p.spaces.length
  const published = p.published ? DATE.format(new Date(p.published)) : ""

  const overview = (
    <div className="flex max-w-[75ch] flex-col gap-6">
      {p.tldr && (
        <div className="flex gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] p-4">
          <SparklesIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
          <p className="text-[15px] leading-relaxed text-foreground/90">
            <span className="sr-only">In one sentence: </span>
            {p.tldr}
          </p>
        </div>
      )}
      <section aria-labelledby="abstract-h" className="flex flex-col gap-2">
        <h2 id="abstract-h" className="text-base font-semibold">
          Abstract
        </h2>
        <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{p.summary || "No abstract available."}</p>
      </section>
      {p.keywords.length > 0 && (
        <ul aria-label="Keywords" className="flex flex-wrap gap-1.5">
          {p.keywords.map((k) => (
            <li key={k}>
              <Chip>{k}</Chip>
            </li>
          ))}
        </ul>
      )}
      {p.comment && <p className="text-sm text-muted-foreground">Authors&apos; note: {p.comment}</p>}
    </div>
  )

  const pdf = (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-[#525659]">
        <iframe src={p.pdf} title={`PDF of ${p.title}`} loading="lazy" referrerPolicy="no-referrer" className="block h-[82vh] min-h-[520px] w-full" />
      </div>
      <p className="text-xs text-muted-foreground">
        The PDF not showing? Some phones cannot display PDFs inside a page.{" "}
        <ExternalLink href={p.pdf} className="text-ion hover:underline">
          Open the PDF on its own
        </ExternalLink>
        .
      </p>
    </div>
  )

  const used = usedCount ? (
    <div className="flex flex-col gap-6">
      <Linked title="Models" kind="model" items={p.models} total={p.counts.models} />
      <Linked title="Datasets" kind="dataset" items={p.datasets} total={p.counts.datasets} />
      <Linked title="Spaces" kind="space" items={p.spaces} total={p.counts.spaces} />
    </div>
  ) : (
    <Empty>No models, datasets or Spaces cite this paper yet.</Empty>
  )

  return (
    <>
      <DetailBanner seed={`paper-${p.baseId}`} kind="news" crumbs={crumbs}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {p.categories.map((c, i) => (
            <span key={c} className={i === 0 ? "font-medium text-gold" : "font-mono text-xs"}>
              {c}
            </span>
          ))}
          <span className="font-mono text-xs">arXiv:{p.id}</span>
        </div>
        <h1 className="max-w-[40ch] text-2xl leading-tight font-semibold tracking-[-0.02em] md:text-4xl">{p.title}</h1>
        <Authors names={p.authors} />
        <div className="flex flex-wrap items-center gap-2">
          {target && <LikeButton target={target} />}
          {target && <SaveButton target={target} />}
          <DiscussButton href={discuss} />
          {p.upvotes !== null && (
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/60 px-3.5 text-sm" title="Upvotes from the Hugging Face community">
              <ArrowUpIcon aria-hidden className="size-4 text-muted-foreground" />
              <span className="tabular">{compact(p.upvotes)}</span>
              <span className="text-muted-foreground">upvotes</span>
            </span>
          )}
          {published && (
            <span className="inline-flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
              <CalendarIcon aria-hidden className="size-4" />
              {published}
            </span>
          )}
        </div>
      </DetailBanner>

      <div className="shell grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <MotionTabs
          className="min-w-0"
          tabs={[
            { id: "overview", label: "Overview", content: overview },
            { id: "pdf", label: "Read the PDF", content: pdf },
            { id: "used", label: "Used on the Hub", count: usedCount || undefined, content: used },
          ]}
        />
        <aside className="flex flex-col gap-6">
          <Panel label="Details">
            {published && (
              <InfoRow label="Published">{published}</InfoRow>
            )}
            <InfoRow label="arXiv id">
              <span className="font-mono text-xs">{p.id}</span>
            </InfoRow>
            {p.categories.length > 0 && (
              <InfoRow label="Categories">
                <span className="font-mono text-xs">{p.categories.join(", ")}</span>
              </InfoRow>
            )}
            <InfoRow label="Authors">
              <span className="tabular">{p.authors.length}</span>
            </InfoRow>
            {p.upvotes !== null && (
              <InfoRow label="Upvotes">
                <span className="tabular">{p.upvotes}</span>
              </InfoRow>
            )}
            {code && (
              <InfoRow label="Code">
                <Link href={code} className="inline-flex items-center gap-1 text-ion hover:underline">
                  <FolderGit2Icon aria-hidden className="size-3.5" />
                  {p.github.replace(/^https:\/\/(www\.)?github\.com\//, "").slice(0, 40)}
                </Link>
              </InfoRow>
            )}
            {p.project && (
              <InfoRow label="Project page">
                <ExternalLink href={p.project} className="text-xs text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground">
                  {p.project.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 36)}
                </ExternalLink>
              </InfoRow>
            )}
          </Panel>
        </aside>
      </div>
      <div className="shell mt-12">
        <SourceLink href={`https://arxiv.org/abs/${p.id}`} label="View on arXiv" />
      </div>
    </>
  )
}
