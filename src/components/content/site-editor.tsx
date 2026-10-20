"use client"

import type { Route } from "next"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { ChevronRightIcon, EyeOffIcon, HistoryIcon, LockIcon, PencilIcon, RefreshCwIcon, RotateCcwIcon, SearchIcon, ShieldIcon, SquareArrowOutUpRightIcon } from "lucide-react"
import { AdminHeading, Notice, when } from "@/components/admin/controls"
import { Gate } from "@/components/moderation/gate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { conform, isVisibility, loadContentRows, resetContent, saveContent, useContentValues, VISIBILITIES, visibilityKey, type ContentRow, type Visibility } from "@/lib/content"
import { openAddress, pageForKey, SITE_AREAS, SITE_MAP, type SitePageEntry } from "@/lib/site-map"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { blockProblem, humanize, ValueEditor } from "./block-form"
import { SeoForm, VisibilityForm } from "./page-settings"
import { announce, useEditStatus } from "./status"

/*
 * The admin's site editor (/admin/site): every page of the site from the site map, and for each one its search
 * details, who may see it, and every text and list on it that has been edited or seen in edit mode. A search
 * runs across all of the site's content at once. Texts the code marks as editable appear here once a page
 * editor has opened that page in edit mode ("Edit on page"), which records their defaults.
 */

const VIS_ICON: Record<Visibility, typeof EyeOffIcon | null> = { everyone: null, members: LockIcon, staff: ShieldIcon, hidden: EyeOffIcon }

export function SiteEditor() {
  const body = (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <SiteEditorBody />
    </Suspense>
  )
  return live ? (
    <Gate role="member" cap="pages.edit" action="edit the site">
      {body}
    </Gate>
  ) : (
    body
  )
}

function SiteEditorBody() {
  const [rows, setRows] = useState<ContentRow[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const params = useSearchParams()
  // The page to open comes from "?page=/forum" (the on-page editor links here) until the admin picks one.
  const [picked, setPicked] = useState<string | null | undefined>(undefined)
  const page = picked === undefined ? params.get("page") : picked
  const [q, setQ] = useState("")
  const values = useContentValues()

  const apply = useCallback((res: Awaited<ReturnType<typeof loadContentRows>>) => {
    setRows(res.rows)
    setProblem(res.ok ? null : (res.reason ?? "Could not read the site's content."))
  }, [])
  const reload = useCallback(() => loadContentRows().then(apply), [apply])

  // Loads the rows, and again whenever the live values change (an edit here, in another tab or by another editor).
  const sig = useMemo(() => JSON.stringify(values), [values])
  useEffect(() => {
    let on = true
    void loadContentRows().then((res) => on && apply(res))
    return () => {
      on = false
    }
  }, [sig, apply])

  function select(path: string | null) {
    setPicked(path)
    const url = new URL(window.location.href)
    if (path) url.searchParams.set("page", path)
    else url.searchParams.delete("page")
    window.history.replaceState(window.history.state, "", url)
  }

  const byPage = useMemo(() => {
    const map = new Map<string, ContentRow[]>()
    for (const r of rows ?? []) {
      if (/^(seo|visibility)\./.test(r.key)) continue
      const p = pageForKey(r.key)?.path ?? "*other"
      map.set(p, [...(map.get(p) ?? []), r])
    }
    return map
  }, [rows])

  const selected = page ? (SITE_MAP.find((p) => p.path === page) ?? (page === "*other" ? OTHER : null)) : null
  const needle = q.trim().toLowerCase()

  return (
    <section aria-labelledby="site-title" className="flex flex-col gap-5">
      <AdminHeading title="Site editor" lead="Every page of Nexverse: its texts, lists, search details and who can see it. Change anything here, or open a page and edit it in place.">
        <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
          <RefreshCwIcon aria-hidden /> Refresh
        </Button>
      </AdminHeading>
      <StatusLineLive />
      {!live && (
        <Notice tone="warn" title="This copy runs in the browser only">
          The site editor saves to the database. Connect Supabase to edit the site.
        </Notice>
      )}
      {live && problem && (
        <Notice tone="warn" title="The site's content cannot be read right now">
          {problem}
        </Notice>
      )}

      <div className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every text, list and page on the site" aria-label="Search all site content" className="h-11 bg-background/60 pl-9" />
      </div>

      {needle ? (
        <SearchResults rows={rows} needle={needle} onReload={reload} onOpen={(p) => { setQ(""); select(p) }} />
      ) : selected ? (
        <PageDetail entry={selected} rows={byPage.get(selected.path) ?? []} onBack={() => select(null)} onReload={reload} />
      ) : (
        <PageList byPage={byPage} values={values} loading={rows === null && live} onOpen={select} />
      )}
    </section>
  )
}

const OTHER: SitePageEntry = { path: "*other", label: "Other texts", area: "Site", keys: [], global: true }

function StatusLineLive() {
  const s = useEditStatus()
  return (
    <p role="status" aria-live="polite" className={cn("text-sm", s ? (s.ok ? "text-ok" : "text-destructive") : "sr-only")}>
      {s?.text}
    </p>
  )
}

function visibilityOf(values: Record<string, unknown>, path: string): Visibility {
  const v = values[visibilityKey(path)]
  return isVisibility(v) ? v : "everyone"
}

function PageList({ byPage, values, loading, onOpen }: { byPage: Map<string, ContentRow[]>; values: Record<string, unknown>; loading: boolean; onOpen: (p: string) => void }) {
  const others = byPage.get("*other") ?? []
  return (
    <div className="flex flex-col gap-6">
      {SITE_AREAS.map((area) => {
        const pages = SITE_MAP.filter((p) => p.area === area)
        if (!pages.length) return null
        return (
          <section key={area} aria-labelledby={`area-${area}`} className="flex flex-col gap-2">
            <h3 id={`area-${area}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {area}
            </h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {pages.map((p) => {
                const list = byPage.get(p.path) ?? []
                const edited = list.filter((r) => r.value !== null).length
                const vis = p.global ? "everyone" : visibilityOf(values, p.path)
                const Icon = VIS_ICON[vis]
                const seo = values[`seo.${p.path}`]
                return (
                  <li key={p.path}>
                    <button
                      type="button"
                      onClick={() => onOpen(p.path)}
                      className="press group flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-card/50 p-3.5 text-left hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="min-w-0 flex-1 truncate">{p.label}</span>
                        {Icon && (
                          <Badge variant="outline" className="gap-1 text-[11px]">
                            <Icon aria-hidden className="size-3" /> {VISIBILITIES.find((v) => v.id === vis)!.label}
                          </Badge>
                        )}
                        <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{p.global ? "Shared by every page" : p.path}</span>
                      <span className="text-xs text-muted-foreground">
                        {loading ? "…" : `${list.length} ${list.length === 1 ? "text" : "texts"} known · ${edited} edited`}
                        {seo ? " · SEO set" : ""}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {others.length > 0 && (
        <button type="button" onClick={() => onOpen("*other")} className="self-start text-sm text-ion underline-offset-4 hover:underline">
          {others.length} texts not tied to a page in the site map
        </button>
      )}
    </div>
  )
}

function PageDetail({ entry, rows, onBack, onReload }: { entry: SitePageEntry; rows: ContentRow[]; onBack: () => void; onReload: () => Promise<void> }) {
  const [q, setQ] = useState("")
  const [onlyEdited, setOnlyEdited] = useState(false)
  const open = openAddress(entry)
  const needle = q.trim().toLowerCase()
  const shown = rows.filter((r) => (!onlyEdited || r.value !== null) && (!needle || matches(r, needle)))

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="text-sm">
        <button type="button" onClick={onBack} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          All pages
        </button>
        <span aria-hidden className="mx-1.5 text-muted-foreground">/</span>
        <span>{entry.label}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-lg font-semibold tracking-[-0.01em]">{entry.label}</h3>
          <p className="font-mono text-xs text-muted-foreground">{entry.global ? "Shared by every page" : entry.path}</p>
          {entry.keys.length > 0 && <p className="text-xs text-muted-foreground">Keys starting with {entry.keys.map((k) => `"${k}."`).join(", ")}</p>}
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={open as Route} />}>
              <SquareArrowOutUpRightIcon aria-hidden /> Open
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href={`${open}${open.includes("?") ? "&" : "?"}edit=1` as Route} />}>
              <PencilIcon aria-hidden /> Edit on page
            </Button>
          </div>
        )}
      </div>
      {entry.dynamic && !open && <Notice title="A template for many pages">Open any {entry.label.toLowerCase()} on the site and switch on “Edit this page” to edit its texts in place.</Notice>}

      {!entry.global && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section aria-labelledby="pd-seo" className="glass flex flex-col gap-3 rounded-2xl p-4">
            <h4 id="pd-seo" className="font-medium">
              Search and share
            </h4>
            {entry.dynamic ? <p className="text-sm text-muted-foreground">Each item’s own title and description are used for search and sharing.</p> : <SeoForm route={entry.path} defaultTitle={entry.label} />}
          </section>
          <section aria-labelledby="pd-vis" className="glass flex flex-col gap-3 rounded-2xl p-4">
            <h4 id="pd-vis" className="font-medium">
              Visibility{entry.dynamic ? " (every page of this kind)" : ""}
            </h4>
            <VisibilityForm route={entry.path} membersOnly={entry.membersOnly} />
          </section>
        </div>
      )}

      <section aria-labelledby="pd-texts" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h4 id="pd-texts" className="font-medium">
            Texts and lists <span className="font-normal text-muted-foreground">· {rows.length}</span>
          </h4>
          <div className="relative min-w-[12rem] flex-1">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this page" aria-label={`Search the texts of ${entry.label}`} className="h-9 bg-background/60 pl-8" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyEdited} onChange={(e) => setOnlyEdited(e.target.checked)} className="size-4 accent-(--ion)" />
            Edited only
          </label>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No texts recorded for this page yet. {open ? "Use “Edit on page”: opening the page in edit mode lists every editable text here." : "Open one of these pages in edit mode to list its texts here."}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing matches.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((r) => (
              <li key={r.key}>
                <RowEditor row={r} onReload={onReload} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function matches(r: ContentRow, needle: string) {
  return r.key.toLowerCase().includes(needle) || JSON.stringify(r.value ?? "").toLowerCase().includes(needle) || JSON.stringify(r.fallback ?? "").toLowerCase().includes(needle)
}

function SearchResults({ rows, needle, onReload, onOpen }: { rows: ContentRow[] | null; needle: string; onReload: () => Promise<void>; onOpen: (p: string) => void }) {
  const pages = SITE_MAP.filter((p) => p.label.toLowerCase().includes(needle) || p.path.toLowerCase().includes(needle))
  const hits = (rows ?? []).filter((r) => !/^(seo|visibility)\./.test(r.key) && matches(r, needle)).slice(0, 80)
  if (rows === null && live) return <Skeleton className="h-48 w-full rounded-2xl" />
  return (
    <div className="flex flex-col gap-4">
      {pages.length > 0 && (
        <section aria-label="Pages" className="flex flex-wrap gap-2">
          {pages.map((p) => (
            <button key={p.path} type="button" onClick={() => onOpen(p.path)} className="liquid-glass-pill inline-flex h-8 items-center gap-1.5 px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="relative z-[1]">{p.label}</span>
            </button>
          ))}
        </section>
      )}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {hits.length === 0 ? "No texts match." : `${hits.length}${hits.length === 80 ? "+" : ""} ${hits.length === 1 ? "text matches" : "texts match"}`}
      </p>
      <ul className="flex flex-col gap-2">
        {hits.map((r) => (
          <li key={r.key}>
            <RowEditor row={r} onReload={onReload} showPage />
          </li>
        ))}
      </ul>
    </div>
  )
}

function RowEditor({ row, onReload, showPage }: { row: ContentRow; onReload: () => Promise<void>; showPage?: boolean }) {
  const [draft, setDraft] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(false)
  const fallback = row.fallback ?? (row.kind === "copy" ? "" : row.value)
  const current = row.kind === "copy" ? (typeof row.value === "string" && row.value.trim() ? row.value : (typeof fallback === "string" ? fallback : "")) : conform(fallback, row.value)
  const edited = row.value !== null
  const page = pageForKey(row.key)
  const editing = draft !== undefined
  const problem = editing && row.kind === "block" && fallback !== undefined && fallback !== null ? blockProblem(fallback, draft, humanize(row.key.split(".").pop() ?? "This")) : null

  async function save(next: unknown) {
    setBusy(true)
    try {
      if (row.kind === "copy") {
        const t = typeof next === "string" ? next.trim() : ""
        if (t.length > 5000) throw new Error("That text is too long: up to 5000 characters.")
        await saveContent(row.key, "copy", !t || t === fallback ? null : t)
      } else {
        if (problem) throw new Error(problem)
        await saveContent(row.key, "block", JSON.stringify(next) === JSON.stringify(fallback) ? null : next)
      }
      setDraft(undefined)
      announce(true, "Saved. Every open page shows it within seconds.")
      await onReload()
    } catch (err) {
      announce(false, (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    try {
      await resetContent(row.key, row.kind)
      setDraft(undefined)
      announce(true, "Back to the default.")
      await onReload()
    } catch (err) {
      announce(false, (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border bg-card/40 p-3", edited ? "border-gold/30" : "border-border")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={row.key}>
          {row.key}
        </code>
        {showPage && page && <Badge variant="outline">{page.label}</Badge>}
        <Badge variant="outline">{row.kind === "copy" ? "Text" : "List"}</Badge>
        {edited && <span className="rounded-full bg-gold/15 px-2 text-[11px] font-medium text-gold">Edited {row.editor ? `by ${row.editor} ` : ""}{when(row.updatedAt)}</span>}
      </div>

      {!editing ? (
        row.kind === "copy" ? (
          <p className="text-sm whitespace-pre-line">{String(current) || <span className="text-muted-foreground italic">Empty</span>}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{Array.isArray(current) ? `${current.length} ${current.length === 1 ? "item" : "items"}` : "Settings"}</p>
        )
      ) : row.kind === "copy" ? (
        <Textarea autoFocus rows={Math.min(6, Math.max(2, String(draft).length / 70 + 1))} value={String(draft)} onChange={(e) => setDraft(e.target.value)} aria-label={`Text for ${row.key}`} className="bg-background/60" />
      ) : fallback !== undefined && fallback !== null ? (
        <ValueEditor shape={fallback} value={draft} label={humanize(row.key.split(".").pop() ?? row.key)} onChange={setDraft} />
      ) : (
        <p className="text-sm text-muted-foreground">Open the page in edit mode once so the editor learns this list’s shape.</p>
      )}
      {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}

      {edited && !editing && row.kind === "copy" && typeof fallback === "string" && fallback && <p className="truncate text-xs text-muted-foreground">Default: {fallback}</p>}

      <div className="flex flex-wrap gap-1.5">
        {editing ? (
          <>
            <Button type="button" size="sm" disabled={busy || Boolean(problem)} onClick={() => void save(draft)}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setDraft(undefined)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={!live || (row.kind === "block" && (fallback === undefined || fallback === null))} onClick={() => setDraft(structuredClone(current))}>
            <PencilIcon aria-hidden /> Edit
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={!edited || busy} onClick={() => void reset()}>
          <RotateCcwIcon aria-hidden /> Reset to default
        </Button>
        {row.history.length > 0 && (
          <Button type="button" size="sm" variant="ghost" aria-expanded={history} onClick={() => setHistory((h) => !h)}>
            <HistoryIcon aria-hidden /> History · {row.history.length}
          </Button>
        )}
        {page && openAddress(page) && (
          <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`${openAddress(page)}?edit=1` as Route} />}>
            <SquareArrowOutUpRightIcon aria-hidden /> Edit on page
          </Button>
        )}
      </div>

      {history && (
        <ol className="flex flex-col gap-1.5 border-t border-border pt-2">
          {row.history.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{h.at ? when(h.at) : "earlier"}</span>
              <span className="min-w-0 flex-1 truncate">{h.value === null ? <em className="text-muted-foreground">Default</em> : typeof h.value === "string" ? h.value : Array.isArray(h.value) ? `${h.value.length} items` : "Settings"}</span>
              <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => void save(h.value === null ? (row.kind === "copy" ? "" : fallback) : h.value)}>
                Restore
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
