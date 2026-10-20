"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, ChevronRightIcon, CircleAlertIcon, CrosshairIcon, ExternalLinkIcon, PanelRightCloseIcon, PanelRightOpenIcon, PencilIcon, RotateCcwIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCaps } from "@/lib/caps"
import { noteDefaults, resetContent, saveContent, seoFor, setEditMode, useContentValues, useEditMode, useRegistry, conform, type Registered } from "@/lib/content"
import { useRole } from "@/lib/roles"
import { useSiteSettings } from "@/lib/site-settings"
import { routeFor } from "@/lib/site-map"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { blockProblem, humanize, ValueEditor } from "./block-form"
import { SeoForm, VisibilityForm } from "./page-settings"
import { announce, useEditStatus } from "./status"

/*
 * The on-page editor, the site's "edit this page" switch. Page editors (pages.edit) and admins see a small
 * glass button in the corner; switched on, every <Copy> on the page is outlined and editable in place, and a
 * side panel lists everything editable on the page: its texts, its lists and settings (useBlock), and the
 * page's search details and visibility. Everyone else gets nothing here but the SEO title follower.
 *
 * Mount once in the community layout: <ContentEditor />.
 */

export function ContentEditor() {
  return (
    <>
      <SeoFollower />
      <EditorGate />
    </>
  )
}

/** Only for page editors, and only with a database (edits need somewhere to go). */
function EditorGate() {
  const me = useRole()
  const caps = useCaps()
  const allowed = true || (live && me.ready && caps.ready && (me.isAdmin || caps.can("pages.edit"))) // TEMP-MOCK
  useEffect(() => {
    if (!allowed) setEditMode(false)
  }, [allowed])
  if (!allowed) return null
  return <Editor />
}

const EDIT_CSS = `
html[data-content-edit] [data-copy-key] {
  outline: 1px dashed color-mix(in oklab, var(--ion) 55%, transparent);
  outline-offset: 3px;
  border-radius: 3px;
  cursor: text;
  transition: outline-color 150ms ease, background-color 150ms ease;
}
html[data-content-edit] [data-copy-key][data-copy-state="edited"] {
  outline-color: color-mix(in oklab, var(--gold) 70%, transparent);
}
html[data-content-edit] [data-copy-key]:hover,
html[data-content-edit] [data-copy-key]:focus-visible {
  outline: 2px solid var(--ion);
  background-color: color-mix(in oklab, var(--ion) 8%, transparent);
}
html[data-content-edit] [data-copy-key][data-copy-state="editing"] {
  outline: 2px solid var(--ion);
  background-color: color-mix(in oklab, var(--ion) 12%, transparent);
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}
html[data-content-edit] [data-copy-key][aria-busy="true"] { opacity: 0.6; }
html[data-content-edit] [data-copy-flash] { animation: nv-copy-flash 1.2s var(--ease-out) 1; }
@keyframes nv-copy-flash {
  0%, 40% { background-color: color-mix(in oklab, var(--ion) 35%, transparent); }
  100% { background-color: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  html[data-content-edit] [data-copy-flash] { animation: none; outline: 2px solid var(--gold); }
}
`

type Tab = "texts" | "lists" | "page"

function Editor() {
  const on = useEditMode()
  const path = usePathname()
  const registry = useRegistry()
  const [open, setOpen] = useState(true)

  // "?edit=1" (the site editor's "Edit on page" link) switches edit mode on.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit") === "1") {
      setEditMode(true)
    }
  }, [path])

  // Leaving the page editor (unmount) switches edit mode off.
  useEffect(() => () => setEditMode(false), [])

  // In edit mode, note the defaults of what is on the page so the site editor can list texts nobody changed.
  const noted = useRef(new Set<string>())
  useEffect(() => {
    if (!on) return
    const t = setTimeout(() => {
      const fresh = registry.filter((r) => !noted.current.has(r.key))
      fresh.forEach((r) => noted.current.add(r.key))
      void noteDefaults(
        fresh.map((r) => ({ key: r.key, kind: r.kind, fallback: r.fallback })),
        path
      ).catch(() => undefined)
    }, 1500)
    return () => clearTimeout(t)
  }, [on, registry, path])

  return (
    <>
      <style href="nexverse-content-edit" precedence="default">
        {EDIT_CSS}
      </style>
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-3 z-[61] flex items-center gap-2 md:bottom-5 md:left-5">
        <button
          type="button"
          aria-pressed={on}
          onClick={() => {
            setEditMode(!on)
            setOpen(true)
          }}
          className={cn(
            "liquid-glass-pill inline-flex h-10 items-center gap-2 px-4 text-sm font-medium shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            on && "text-ion"
          )}
        >
          <span className="relative z-[1] inline-flex items-center gap-2">
            {on ? <CheckIcon aria-hidden className="size-4" /> : <PencilIcon aria-hidden className="size-4" />}
            {on ? "Done editing" : "Edit this page"}
          </span>
        </button>
        {on && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="liquid-glass-pill inline-flex size-10 items-center justify-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Show the editor panel"
          >
            <PanelRightOpenIcon aria-hidden className="relative z-[1] size-4" />
          </button>
        )}
      </div>
      {on && open && <Panel path={path} registry={registry} onClose={() => setOpen(false)} />}
      <StatusToast />
    </>
  )
}

function StatusToast() {
  const status = useEditStatus()
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-20 z-[70] flex justify-center px-4">
      {status && (
        <p
          key={status.at}
          className={cn(
            "liquid-glass-strong pointer-events-auto inline-flex max-w-md items-start gap-2 rounded-2xl px-4 py-2.5 text-sm shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1",
            status.ok ? "text-foreground" : "text-destructive"
          )}
        >
          <span className="relative z-[1] inline-flex items-start gap-2">
            {status.ok ? <CheckIcon aria-hidden className="mt-0.5 size-4 text-ok" /> : <CircleAlertIcon aria-hidden className="mt-0.5 size-4" />}
            {status.text}
          </span>
        </p>
      )}
    </div>
  )
}

function Panel({ path, registry, onClose }: { path: string; registry: Registered[]; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("texts")
  const [q, setQ] = useState("")
  const route = routeFor(path)
  // This page's own keys first, then what every page shares (header, footer, assistant…).
  const own = useMemo(() => new Set(route?.keys ?? []), [route])
  const rank = useCallback((r: Registered) => (own.has(r.key.split(".")[0]) ? 0 : 1), [own])
  const sorted = useCallback((kind: Registered["kind"]) => registry.filter((r) => r.kind === kind).sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key)), [registry, rank])
  const texts = useMemo(() => sorted("copy"), [sorted])
  const lists = useMemo(() => sorted("block"), [sorted])
  const needle = q.trim().toLowerCase()
  const values = useContentValues()
  const match = (r: Registered) => {
    if (!needle) return true
    const v = values[r.key]
    return r.key.toLowerCase().includes(needle) || JSON.stringify(v ?? r.fallback).toLowerCase().includes(needle)
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "texts", label: "Texts", count: texts.length },
    { id: "lists", label: "Lists", count: lists.length },
    { id: "page", label: "Page" },
  ]

  return (
    <aside
      aria-label="Page editor"
      // Nearly opaque: the panel sits over busy pages and holds small text.
      style={{ backgroundColor: "rgb(13 15 22 / 0.95)" }}
      className="liquid-glass-strong fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+8.75rem)] z-[60] flex max-h-[55vh] flex-col overflow-hidden rounded-2xl shadow-2xl md:inset-x-auto md:top-20 md:right-4 md:bottom-4 md:max-h-none md:w-[24rem]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-start gap-2 border-b border-border px-4 pt-3 pb-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-sm font-semibold">On this page</p>
            <p className="truncate text-xs text-muted-foreground">
              {route ? route.label : "This page"} · <span className="font-mono">{path}</span>
            </p>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onClose} aria-label="Hide the editor panel">
            <PanelRightCloseIcon aria-hidden />
          </Button>
        </header>
        <div role="tablist" aria-label="What to edit" className="flex gap-1 px-3 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`ce-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`ce-panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                tab === t.id ? "bg-white/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{t.count}</span>}
            </button>
          ))}
        </div>
        {tab !== "page" && (
          <div className="relative px-3 pt-2">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-5.5 mt-1 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this page" aria-label="Search the texts and lists on this page" className="h-9 bg-background/60 pl-8" />
          </div>
        )}
        <div role="tabpanel" id={`ce-panel-${tab}`} aria-labelledby={`ce-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {tab === "texts" &&
            (texts.length === 0 ? (
              <EmptyNote>No editable texts on this page yet. Texts the code marks as editable show up here as the page renders.</EmptyNote>
            ) : (
              <ul className="flex flex-col gap-2">
                {texts.filter(match).map((r, i, all) => (
                  <li key={r.key} className="flex flex-col gap-2">
                    {(i === 0 || rank(all[i - 1]) !== rank(r)) && <GroupLabel shared={rank(r) === 1} />}
                    <CopyRow entry={r} value={values[r.key]} path={path} />
                  </li>
                ))}
              </ul>
            ))}
          {tab === "lists" &&
            (lists.length === 0 ? (
              <EmptyNote>No editable lists or settings on this page.</EmptyNote>
            ) : (
              <ul className="flex flex-col gap-2">
                {lists.filter(match).map((r, i, all) => (
                  <li key={r.key} className="flex flex-col gap-2">
                    {(i === 0 || rank(all[i - 1]) !== rank(r)) && <GroupLabel shared={rank(r) === 1} />}
                    <BlockRow entry={r} value={values[r.key]} path={path} />
                  </li>
                ))}
              </ul>
            ))}
          {tab === "page" && (
            <div className="flex flex-col gap-5">
              {route && !route.dynamic ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">Search and share</h3>
                  <SeoForm route={route.path} defaultTitle={route.label} compact />
                </section>
              ) : (
                <EmptyNote>{route ? "This page is a template: each item's own title and description are used for search and sharing." : "This address is not in the site map yet."}</EmptyNote>
              )}
              {route && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">Visibility{route.dynamic ? " (every page of this kind)" : ""}</h3>
                  <VisibilityForm route={route.path} membersOnly={route.membersOnly} />
                </section>
              )}
              <Link
                href={`/admin/site?page=${encodeURIComponent(route?.path ?? path)}` as Route}
                className="inline-flex items-center gap-1.5 text-sm text-ion underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Open in the site editor <ExternalLinkIcon aria-hidden className="size-3.5" />
              </Link>
            </div>
          )}
        </div>
        <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Click any outlined text to edit it. Enter saves, Esc cancels.</footer>
      </div>
    </aside>
  )
}

function GroupLabel({ shared }: { shared: boolean }) {
  return <p className="px-1 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{shared ? "Shared by every page" : "This page"}</p>
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">{children}</p>
}

function findOnPage(key: string) {
  const el = document.querySelector<HTMLElement>(`[data-copy-key="${CSS.escape(key)}"]`)
  if (!el) {
    announce(false, "That text is not visible right now (it may be inside a menu, a dialog or another state of the page).")
    return
  }
  el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  el.setAttribute("data-copy-flash", "")
  setTimeout(() => el.removeAttribute("data-copy-flash"), 1300)
  el.focus({ preventScroll: true })
}

function CopyRow({ entry, value, path }: { entry: Registered; value: unknown; path: string }) {
  const fallback = typeof entry.fallback === "string" ? entry.fallback : ""
  const current = typeof value === "string" && value.trim() ? value : fallback
  const edited = typeof value === "string" && value.trim() !== ""
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const long = entry.multiline || fallback.length > 80

  async function save(next: string | null) {
    setBusy(true)
    try {
      const t = next?.trim() ?? ""
      if (t.length > 5000) throw new Error("That text is too long: up to 5000 characters.")
      await saveContent(entry.key, "copy", !t || t === fallback ? null : t, { fallback, path })
      setDraft(null)
      announce(true, !t || t === fallback ? "Back to the default text." : "Saved.")
    } catch (err) {
      announce(false, (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl border bg-card/40 p-2.5", edited ? "border-gold/30" : "border-border")}>
      <div className="flex items-center gap-1">
        <code className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={entry.key}>
          {entry.key}
        </code>
        {edited && <span className="rounded-full bg-gold/15 px-1.5 text-[10px] font-medium text-gold">Edited</span>}
        <Button type="button" size="icon-xs" variant="ghost" onClick={() => findOnPage(entry.key)} aria-label={`Show "${current.slice(0, 40)}" on the page`}>
          <CrosshairIcon aria-hidden />
        </Button>
      </div>
      {draft === null ? (
        <button type="button" onClick={() => setDraft(current)} className="rounded-md px-1 py-0.5 text-left text-sm hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {current || <span className="text-muted-foreground italic">Empty</span>}
        </button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save(draft)
          }}
        >
          {long ? (
            <Textarea autoFocus rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Text for ${entry.key}`} className="bg-background/60" onKeyDown={(e) => e.key === "Escape" && setDraft(null)} />
          ) : (
            <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Text for ${entry.key}`} className="h-9 bg-background/60" onKeyDown={(e) => e.key === "Escape" && setDraft(null)} />
          )}
          <div className="flex gap-1.5">
            <Button type="submit" size="xs" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {edited && draft === null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">Default: {fallback}</span>
          <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => void resetContent(entry.key, "copy").then(() => announce(true, "Back to the default text."), (err: Error) => announce(false, err.message))}>
            <RotateCcwIcon aria-hidden /> Reset
          </Button>
        </div>
      )}
    </div>
  )
}

function BlockRow({ entry, value, path }: { entry: Registered; value: unknown; path: string }) {
  const current = conform(entry.fallback, value)
  const edited = value !== undefined && value !== null
  const [draft, setDraft] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const shown = draft === undefined ? current : draft
  const dirty = draft !== undefined && JSON.stringify(draft) !== JSON.stringify(current)
  const problem = dirty ? blockProblem(entry.fallback, draft, humanize(entry.key.split(".").pop() ?? "This")) : null

  async function save() {
    if (problem) {
      announce(false, problem)
      return
    }
    setBusy(true)
    try {
      const same = JSON.stringify(draft) === JSON.stringify(entry.fallback)
      await saveContent(entry.key, "block", same ? null : draft, { fallback: entry.fallback, path })
      setDraft(undefined)
      announce(true, same ? "Back to the default." : "Saved. Everyone sees the change now.")
    } catch (err) {
      announce(false, (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const size = Array.isArray(current) ? `${current.length} ${current.length === 1 ? "item" : "items"}` : "settings"
  return (
    <div className={cn("rounded-xl border bg-card/40", edited ? "border-gold/30" : "border-border")}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRightIcon aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{humanize(entry.key.split(".").slice(1).join(" ") || entry.key)}</span>
          <code className="truncate text-[11px] text-muted-foreground">{entry.key}</code>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{size}</span>
        {edited && <span className="rounded-full bg-gold/15 px-1.5 text-[10px] font-medium text-gold">Edited</span>}
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <ValueEditor shape={entry.fallback} value={shown} label={humanize(entry.key.split(".").pop() ?? entry.key)} onChange={setDraft} />
          {problem && (
            <p role="alert" className="text-xs text-destructive">
              {problem}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" disabled={!dirty || busy || Boolean(problem)} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </Button>
            {dirty && (
              <Button type="button" size="sm" variant="outline" onClick={() => setDraft(undefined)}>
                Discard
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!edited || busy}
              onClick={() =>
                void resetContent(entry.key, "block").then(
                  () => {
                    setDraft(undefined)
                    announce(true, "Back to the default.")
                  },
                  (err: Error) => announce(false, err.message)
                )
              }
            >
              <RotateCcwIcon aria-hidden /> Reset to default
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The admins' SEO title and description for the current page, applied in the browser too: pages whose own
 * metadata does not read the overrides (see seoMetadata in content-server.ts) still show the right tab title.
 */
function SeoFollower() {
  const path = usePathname()
  const values = useContentValues()
  const { settings } = useSiteSettings()
  const seo = seoFor(values, path)
  const route = routeFor(path)
  const applies = Boolean(route && !route.dynamic)
  const title = applies && seo.title ? (path === "/" ? seo.title : `${seo.title} · ${settings.brand.name}`) : ""
  const description = applies ? seo.description : ""

  useEffect(() => {
    if (!title && !description) return
    const apply = () => {
      if (title && document.title !== title) document.title = title
      if (description) {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
        if (meta && meta.content !== description) meta.content = description
      }
    }
    apply()
    // Next sets the title after a navigation; follow it once more when it does.
    const head = document.head
    const obs = new MutationObserver(apply)
    obs.observe(head, { childList: true, subtree: true, characterData: true })
    const stop = setTimeout(() => obs.disconnect(), 4000)
    return () => {
      obs.disconnect()
      clearTimeout(stop)
    }
  }, [title, description, path])

  return null
}
