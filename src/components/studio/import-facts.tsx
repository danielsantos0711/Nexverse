"use client"

import Link from "next/link"
import { useState } from "react"
import { DownloadIcon, FolderGit2Icon, GitForkIcon, HeartIcon, StarIcon, TagIcon } from "lucide-react"
import { compact, formatDate } from "@/lib/data"
import { formatBytes } from "@/lib/editor/media"
import { SOURCE_SITES, type ImportedFacts, type Project } from "@/lib/projects"

/*
 * What the source said about an imported project when it was read: its numbers at that moment, dates, code
 * languages, latest release, files with their sizes, authors, and a few rows of a dataset. Kept apart from
 * Nexverse's own counts and labelled with the date they were read. No link leaves Nexverse: GitHub code opens in
 * Nexverse's code browser, everything else is shown here.
 */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right break-words">{value}</span>
    </div>
  )
}

const LANG_TONES = ["bg-ion", "bg-gold", "bg-[#7fe0b0]", "bg-[#b9a7ff]", "bg-[#ff8fa8]", "bg-white/40", "bg-white/25", "bg-white/15"]

/** The sidebar card: numbers, dates, release, languages and topics from the source. */
export function ImportedFactsCard({ p }: { p: Project }) {
  const f = p.specs?.imported
  if (!f || !p.source) return null
  const gh = p.source.site === "github" ? p.source.ref : null
  const stats = [
    f.stars !== undefined && { icon: StarIcon, label: "stars", value: f.stars },
    f.forks !== undefined && { icon: GitForkIcon, label: "forks", value: f.forks },
    f.downloads !== undefined && { icon: DownloadIcon, label: "downloads", value: f.downloads },
    f.likes !== undefined && { icon: HeartIcon, label: "likes", value: f.likes },
  ].filter((x): x is { icon: typeof StarIcon; label: string; value: number } => Boolean(x))
  return (
    <section aria-labelledby="source-facts-h" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
      <h2 id="source-facts-h" className="text-xs font-medium text-muted-foreground">
        From {SOURCE_SITES[p.source.site]}, read {formatDate(f.at)}
      </h2>
      {stats.length > 0 && (
        <dl className="grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-white/[0.03] px-3 py-2">
              <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <s.icon aria-hidden className="size-3" /> {s.label}
              </dt>
              <dd className="font-semibold tabular-nums">{compact(s.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {f.author && <Row label={p.source.site === "arxiv" ? "First author" : "By"} value={f.author} />}
      {f.createdAt && <Row label={p.source.site === "arxiv" ? "Submitted" : "Created"} value={formatDate(f.createdAt)} />}
      {f.updatedAt && <Row label="Last updated" value={formatDate(f.updatedAt)} />}
      {f.totalBytes ? <Row label="Size" value={formatBytes(f.totalBytes)} /> : null}
      {f.gated && <Row label="Access" value="Gated: the authors approve each download" />}
      {f.release && <Row label="Latest release" value={<span className="font-mono">{f.release.tag}</span>} />}
      {f.languages && f.languages.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Code</span>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
            {f.languages.map((l, i) => (
              <span key={l.name} className={LANG_TONES[i % LANG_TONES.length]} style={{ width: `${l.share}%` }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {f.languages.slice(0, 5).map((l, i) => (
              <li key={l.name} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={`size-2 rounded-full ${LANG_TONES[i % LANG_TONES.length]}`} />
                {l.name} <span className="text-muted-foreground">{l.share}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {f.categories && f.categories.length > 0 && <Row label="Categories" value={<span className="font-mono text-xs">{f.categories.join(", ")}</span>} />}
      {f.datasets && f.datasets.length > 0 && <Row label="Trained on" value={f.datasets.slice(0, 4).join(", ")} />}
      {f.topics && f.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          {f.topics.slice(0, 12).map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs">
              <TagIcon aria-hidden className="size-3 text-muted-foreground" /> {t}
            </span>
          ))}
        </div>
      )}
      {gh && (
        <Link href={`/gh/${gh}` as "/"} className="mt-1 inline-flex items-center gap-2 text-ion hover:underline">
          <FolderGit2Icon aria-hidden className="size-4" /> Browse the code
        </Link>
      )}
      <p className="text-[11px] text-muted-foreground">Numbers from the source at that date. Likes and downloads here on Nexverse are counted separately.</p>
    </section>
  )
}

/** The main column: the latest release notes, the files list and a dataset's first rows. */
export function ImportedDetails({ p }: { p: Project }) {
  const f = p.specs?.imported
  if (!f) return null
  return (
    <>
      {f.sample && <SamplePreview sample={f.sample} />}
      {f.release?.notes && (
        <section aria-labelledby="release-h" className="flex flex-col gap-3">
          <h2 id="release-h" className="text-sm font-medium text-muted-foreground">
            Latest release: <span className="font-mono text-foreground">{f.release.tag}</span>
            {f.release.date ? ` · ${formatDate(f.release.date)}` : ""}
          </h2>
          <pre className="max-h-72 overflow-auto rounded-2xl border border-border bg-card p-4 font-sans text-sm whitespace-pre-wrap text-foreground/85">{f.release.notes}</pre>
        </section>
      )}
      {f.files && f.files.length > 0 && <FilesList facts={f} />}
      {f.authors && f.authors.length > 1 && (
        <section aria-labelledby="authors-h" className="flex flex-col gap-2">
          <h2 id="authors-h" className="text-sm font-medium text-muted-foreground">
            Authors ({f.authors.length})
          </h2>
          <p className="text-sm text-foreground/85">{f.authors.join(", ")}</p>
        </section>
      )}
    </>
  )
}

function FilesList({ facts }: { facts: ImportedFacts }) {
  const [all, setAll] = useState(false)
  const files = facts.files ?? []
  const shown = all ? files : files.slice(0, 10)
  const more = (facts.fileCount ?? files.length) - shown.length
  return (
    <section aria-labelledby="src-files-h" className="flex flex-col gap-3">
      <h2 id="src-files-h" className="text-sm font-medium text-muted-foreground">
        Files at the source {facts.fileCount ? `(${facts.fileCount.toLocaleString("en")}${facts.totalBytes ? `, ${formatBytes(facts.totalBytes)}` : ""})` : ""}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-sm">
        {shown.map((x) => (
          <li key={x.name} className="flex items-center justify-between gap-4 px-4 py-2">
            <span className="min-w-0 truncate font-mono text-xs">{x.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{x.bytes !== undefined ? formatBytes(x.bytes) : x.name.endsWith("/") ? "folder" : ""}</span>
          </li>
        ))}
      </ul>
      {more > 0 &&
        (files.length > shown.length ? (
          <button type="button" onClick={() => setAll(true)} className="self-start text-sm text-ion hover:underline">
            Show {files.length - shown.length} more
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">and {more.toLocaleString("en")} more files.</p>
        ))}
    </section>
  )
}

function SamplePreview({ sample }: { sample: NonNullable<ImportedFacts["sample"]> }) {
  return (
    <section aria-labelledby="sample-h" className="flex flex-col gap-3">
      <h2 id="sample-h" className="text-sm font-medium text-muted-foreground">
        First rows{sample.split ? ` of ${sample.split}` : ""}
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              {sample.columns.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-mono font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {sample.rows.map((r, i) => (
              <tr key={i}>
                {sample.columns.map((c, j) => (
                  <td key={c} className="max-w-[22rem] px-3 py-2">
                    <span className="line-clamp-4">{r[j]}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
