import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { CalendarIcon, FileTextIcon, FolderGit2Icon, QuoteIcon } from "lucide-react"
import { LikeButton } from "@/components/hub/like-button"
import { MotionTabs } from "@/components/hub/motion-tabs"
import { SaveButton } from "@/components/social/save-button"
import { Skeleton } from "@/components/ui/skeleton"
import { compact } from "@/lib/data"
import { areaInfo } from "@/lib/live/catalog"
import { discussItemHref, internalHref, liveTarget, paperHref } from "@/lib/live/ids"
import { paperCitations, paperDetail, type CitedWork } from "@/lib/live/papers"
import { ExternalLink } from "./bits"
import { CitationBars } from "./citation-bars"
import { DetailBanner, DiscussButton, Empty, InfoRow, ErrorPanel, Panel, SourceLink } from "./detail"

/* The in-site page of a paper: abstract, authors, the PDF embedded, and who cites it. */

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

const SOURCE_NAME = { openalex: "OpenAlex", semanticscholar: "Semantic Scholar" } as const

function Authors({ names }: { names: string[] }) {
  if (!names.length) return null
  if (names.length <= 12) return <p className="max-w-[90ch] text-foreground/85">{names.join(", ")}</p>
  return (
    <details className="max-w-[90ch] text-foreground/85">
      <summary className="cursor-pointer list-none rounded-sm [&::-webkit-details-marker]:hidden">
        {names.slice(0, 10).join(", ")} <span className="text-ion hover:underline">and {names.length - 10} more</span>
      </summary>
      <p className="mt-1">{names.slice(10).join(", ")}</p>
    </details>
  )
}

// ─── Citations ──────────────────────────────────────────────────────────────────────────────────────────────

/** One citing or cited work. On arXiv it opens here; otherwise its DOI opens in a new tab; else plain text. */
function Work({ w }: { w: CitedWork }) {
  const meta = [w.authors, w.year ? String(w.year) : "", w.citations ? `cited ${compact(w.citations)}×` : ""].filter(Boolean).join(" · ")
  const body = (
    <>
      <span className="line-clamp-2 text-sm leading-snug font-medium">{w.title}</span>
      {(meta || w.arxivId) && (
        <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular">
          {meta && <span>{meta}</span>}
          {w.arxivId && <span className="font-mono text-gold">arXiv:{w.arxivId}</span>}
        </span>
      )}
    </>
  )
  const box = "flex flex-col gap-0.5 rounded-xl border border-border bg-card/50 px-3.5 py-2.5"
  if (w.arxivId)
    return (
      <Link href={paperHref(w.arxivId)} className={`${box} transition-colors hover:bg-card`}>
        {body}
      </Link>
    )
  if (w.doi)
    return (
      <ExternalLink href={`https://doi.org/${w.doi}`} className={`${box} transition-colors hover:bg-card`}>
        {body}
      </ExternalLink>
    )
  return <div className={box}>{body}</div>
}

function WorkList({ title, items, total, empty }: { title: string; items: CitedWork[]; total: number; empty: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {title} {total > 0 && <span className="text-muted-foreground tabular">{compact(total)}</span>}
      </h3>
      {items.length ? (
        <ul className="grid gap-2">
          {items.map((w, i) => (
            <li key={`${w.arxivId || w.doi || w.title}-${i}`}>
              <Work w={w} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </section>
  )
}

async function CitationsTab({ id }: { id: string }) {
  const res = await paperCitations(id)
  if (!res.ok) {
    return res.reason === "notfound" ? (
      <Empty>The citation indexes have no record of this paper yet. New papers usually appear within a few weeks.</Empty>
    ) : (
      <ErrorPanel reason={res.reason === "toolarge" ? "error" : res.reason} what="citations" />
    )
  }
  const c = res.data
  return (
    <div className="flex max-w-[75ch] flex-col gap-8">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="glass flex flex-col gap-0.5 rounded-xl p-4">
          <dt className="text-xs text-muted-foreground">Cited by</dt>
          <dd className="text-2xl font-semibold tabular">{c.count.toLocaleString("en")}</dd>
        </div>
        <div className="glass flex flex-col gap-0.5 rounded-xl p-4">
          <dt className="text-xs text-muted-foreground">References</dt>
          <dd className="text-2xl font-semibold tabular">{c.referenceCount.toLocaleString("en")}</dd>
        </div>
        {c.influential !== null && (
          <div className="glass flex flex-col gap-0.5 rounded-xl p-4">
            <dt className="text-xs text-muted-foreground">Highly influenced</dt>
            <dd className="text-2xl font-semibold tabular">{c.influential.toLocaleString("en")}</dd>
          </div>
        )}
      </dl>
      <CitationBars data={c.byYear} />
      <WorkList title="Most cited papers that cite it" items={c.citedBy} total={c.count} empty="No citing papers found yet." />
      <WorkList title="What it cites" items={c.references} total={c.referenceCount} empty="No references listed." />
      <p className="text-xs text-muted-foreground/80">
        Citation data from {SOURCE_NAME[c.source]}, refreshed daily. Papers on arXiv open here on Nexverse.
        {c.url && (
          <>
            {" "}
            <ExternalLink href={c.url} className="underline decoration-border underline-offset-2 hover:text-foreground">
              See the full record
            </ExternalLink>
          </>
        )}
      </p>
    </div>
  )
}

function CitationsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading citations" className="flex max-w-[75ch] flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-36 rounded-xl" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  )
}

/** "Cited by 1,234" next to the actions, once the index answers; nothing if it does not. */
async function CitedPill({ id }: { id: string }) {
  const res = await paperCitations(id)
  if (!res.ok || res.data.count === 0) return null
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/60 px-3.5 text-sm" title={`Citation count from ${SOURCE_NAME[res.data.source]}`}>
      <QuoteIcon aria-hidden className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">Cited by</span>
      <span className="tabular">{compact(res.data.count)}</span>
    </span>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────────────────────────────────

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
  const target = liveTarget("paper", p.id)
  const discuss = discussItemHref(p.title, `${p.title} (arXiv:${p.id})\n\n${paperHref(p.id)}`)
  const code = p.links.code ? internalHref(p.links.code) : null
  const published = p.published ? DATE.format(new Date(p.published)) : ""
  const updated = p.updated && p.updated.slice(0, 10) !== p.published.slice(0, 10) ? DATE.format(new Date(p.updated)) : ""

  const overview = (
    <div className="flex max-w-[75ch] flex-col gap-6">
      <section aria-labelledby="abstract-h" className="flex flex-col gap-2">
        <h2 id="abstract-h" className="text-base font-semibold">
          Abstract
        </h2>
        <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{p.summary || "No abstract available."}</p>
      </section>
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

  return (
    <>
      <DetailBanner seed={`paper-${p.id}`} kind="news" crumbs={crumbs}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {p.categories.map((c, i) => (
            <span key={c} className={i === 0 ? "font-medium text-gold" : "font-mono text-xs"} title={areaInfo(c)?.label}>
              {c}
            </span>
          ))}
          <span className="font-mono text-xs">arXiv:{p.requestedId}</span>
        </div>
        <h1 className="max-w-[40ch] text-2xl leading-tight font-semibold tracking-[-0.02em] md:text-4xl">{p.title}</h1>
        <Authors names={p.authors} />
        <div className="flex flex-wrap items-center gap-2">
          {target && <LikeButton target={target} />}
          {target && <SaveButton target={target} />}
          <DiscussButton href={discuss} />
          <Suspense fallback={null}>
            <CitedPill id={p.id} />
          </Suspense>
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
            {
              id: "citations",
              label: "Citations",
              content: (
                <Suspense fallback={<CitationsSkeleton />}>
                  <CitationsTab id={p.id} />
                </Suspense>
              ),
            },
          ]}
        />
        <aside className="flex flex-col gap-6">
          <Panel label="Details">
            {published && <InfoRow label="Published">{published}</InfoRow>}
            {updated && <InfoRow label="Latest version">{updated}</InfoRow>}
            <InfoRow label="arXiv id">
              <span className="font-mono text-xs">{p.requestedId}</span>
            </InfoRow>
            {p.categories.length > 0 && (
              <InfoRow label="Categories">
                <span className="font-mono text-xs">{p.categories.join(", ")}</span>
              </InfoRow>
            )}
            <InfoRow label="Authors">
              <span className="tabular">{p.authors.length}</span>
            </InfoRow>
            {code && (
              <InfoRow label="Code">
                <Link href={code} className="inline-flex items-center gap-1 text-ion hover:underline">
                  <FolderGit2Icon aria-hidden className="size-3.5" />
                  {p.links.code.replace(/^https:\/\/(www\.)?github\.com\//, "").slice(0, 40)}
                </Link>
              </InfoRow>
            )}
          </Panel>
          {p.categories[0] && areaInfo(p.categories[0]) && (
            <Link href={`/papers?area=${encodeURIComponent(p.categories[0])}`} className="glass rounded-2xl p-5 text-sm transition-colors hover:bg-card/80">
              <span className="block font-medium">More in {areaInfo(p.categories[0])?.label}</span>
              <span className="mt-1 block text-muted-foreground">The newest papers in {p.categories[0]}, refreshed through the day.</span>
            </Link>
          )}
        </aside>
      </div>
      <div className="shell mt-12">
        <SourceLink href={p.links.arxiv} label="View on arXiv" />
      </div>
    </>
  )
}
