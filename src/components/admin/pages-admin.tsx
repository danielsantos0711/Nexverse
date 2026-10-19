"use client"

import Link from "next/link"
import type { Route } from "next"
import { useEffect, useState } from "react"
import { ExternalLinkIcon, FilePlus2Icon, FileTextIcon, MenuIcon, PencilIcon } from "lucide-react"
import { AdminHeading, Notice, StatusLine, when } from "@/components/admin/controls"
import { PagesOrbit } from "@/components/pages/pages-orbit"
import { MoveButtons, moved } from "@/components/pages/admin-bits"
import { Gate } from "@/components/moderation/gate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { listPages, pagePath, reorderPages, type SitePage } from "@/lib/pages"
import { db, live } from "@/lib/supabase"

/** /admin/pages: every custom page, drafts first-class, in menu order, with a way to start a new one. */
export function PagesAdmin() {
  // Without a database there are no accounts: the screen opens read only under the shell's notice.
  if (!live) return <PagesAdminInner />
  return (
    <Gate role="moderator" cap="pages.edit" action="edit pages">
      <PagesAdminInner />
    </Gate>
  )
}

function PagesAdminInner() {
  const [pages, setPages] = useState<SitePage[] | null>(null)
  const [ready, setReady] = useState<boolean | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let on = true
    const c = db()
    // One cheap read tells whether the pages table is here yet.
    void (c ? c.from("site_pages").select("id", { head: true, count: "exact" }) : Promise.resolve({ error: true }))
      .then(({ error }) => on && setReady(!error))
    listPages()
      .then((p) => on && setPages(p))
      .catch(() => on && setPages([]))
    return () => {
      on = false
    }
  }, [])

  async function move(i: number, by: -1 | 1) {
    if (!pages) return
    const next = moved(pages, i, by)
    setBusy(true)
    setStatus(null)
    try {
      await reorderPages(next.map((p) => p.id))
      setPages(next)
      setStatus({ ok: true, text: "Order saved." })
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <AdminHeading title="Pages" lead="Build pages of your own from blocks: text, images, callouts, FAQs, lists of the latest threads and more. Save drafts, publish when ready.">
        <Button nativeButton={false} disabled={!ready} render={<Link href={"/admin/pages/new" as Route} />}>
          <FilePlus2Icon aria-hidden /> New page
        </Button>
      </AdminHeading>

      {live && ready === false && (
        <Notice tone="warn" title="Custom pages are not in the database yet">
          They switch on once the CMS migration (…_cms.sql) is applied: the pages table, revisions and the site-media image bucket.
        </Notice>
      )}
      <StatusLine status={status} />

      {!pages ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : pages.length === 0 ? (
        <div className="relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-ion/20 bg-gradient-to-b from-ion/[0.06] to-transparent px-6 py-12 text-center">
          <PagesOrbit className="h-28 w-28" />
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">No pages yet</h3>
            <p className="max-w-md text-sm text-muted-foreground">An About page, community guidelines, a page for an event series: start one, fill it with blocks, and publish it at /pages/your-address.</p>
          </div>
          {ready && (
            <Button nativeButton={false} render={<Link href={"/admin/pages/new" as Route} />}>
              <FilePlus2Icon aria-hidden /> Create the first page
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
          {pages.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-ion/20 bg-ion/10 text-ion">
                <FileTextIcon aria-hidden className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.title}</span>
                  <Badge variant={p.status === "published" ? "secondary" : "outline"} className={p.status === "draft" ? "border-gold/40 text-gold" : undefined}>
                    {p.status === "published" ? "Published" : "Draft"}
                  </Badge>
                  {p.showInMenu && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MenuIcon aria-hidden className="size-3" /> In menus
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{pagePath(p.slug)}</span> · {p.blocks.length} {p.blocks.length === 1 ? "block" : "blocks"} · edited {when(p.updatedAt)}
                  {p.updatedBy ? ` by ${p.updatedBy.name}` : ""}
                </span>
              </div>
              <MoveButtons index={i} count={pages.length} label={p.title} disabled={busy} onMove={(by) => void move(i, by)} />
              <Button variant="ghost" size="icon-sm" aria-label={`View ${p.title}`} nativeButton={false} render={<Link href={pagePath(p.slug) as Route} />}>
                <ExternalLinkIcon aria-hidden />
              </Button>
              <Button variant="secondary" size="sm" nativeButton={false} render={<Link href={`/admin/pages/${p.id}` as Route} />}>
                <PencilIcon aria-hidden /> Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
