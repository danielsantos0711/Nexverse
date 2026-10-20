"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { FileTextIcon, PencilIcon } from "lucide-react"
import { PageBlocks } from "@/components/pages/page-blocks"
import { Breadcrumbs } from "@/components/forum/forum-ui"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useCaps } from "@/lib/caps"
import { getPageBySlug, type SitePage } from "@/lib/pages"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { Copy } from "@/components/content/copy"

/**
 * A custom page, read in the browser: published pages for everyone, drafts for page editors (row level security
 * decides; a draft shows a banner so an editor never mistakes it for the live page). The page's own title and
 * description become the document's <title> and meta description.
 */
export function PageView({ slug }: { slug: string }) {
  const { ready, user } = useSession()
  const { can } = useCaps()
  const [state, setState] = useState<{ key: string; page: SitePage | null; error: string } | null>(null)
  const key = `${slug}|${user?.id ?? ""}`

  useEffect(() => {
    if (live && !ready) return
    let on = true
    getPageBySlug(slug)
      .then((page) => on && setState({ key, page, error: "" }))
      .catch((e: Error) => on && setState({ key, page: null, error: e.message }))
    return () => {
      on = false
    }
  }, [slug, ready, key])

  const loaded = state?.key === key ? state : null
  if (!loaded) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pt-10" aria-busy="true" aria-label="Loading the page">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
      </div>
    )
  }

  const page = loaded.page
  if (!page) {
    return (
      <Empty className="mx-auto mt-12 max-w-2xl rounded-2xl border border-border bg-card/40 py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>{loaded.error ? "This page could not be loaded" : "This page is not here"}</EmptyTitle>
          <EmptyDescription>{loaded.error || (live ? "It may not be published yet, or the address has a typo." : "Custom pages live in the database, and this copy of Nexverse has none.")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/" className="text-sm text-ion hover:underline">
            <Copy k="custom-page.page-view.back-to-the-home-page">Back to the home page</Copy>
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  const editable = can("pages.edit")
  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-6 pt-8 md:pt-10">
      <title>{page.title}</title>
      {page.description && <meta name="description" content={page.description} />}
      {page.status === "draft" && <meta name="robots" content="noindex" />}
      <header className="relative isolate flex flex-col gap-3">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-56 w-screen -translate-x-1/2 bg-[radial-gradient(50%_70%_at_20%_0%,rgb(143_180_255/0.12),transparent_70%),radial-gradient(35%_60%_at_75%_10%,rgb(216_197_158/0.06),transparent_70%)]"
        />
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: page.title }]} />
        {page.status === "draft" && (
          <p role="note" className="w-fit rounded-full border border-gold/30 bg-gold/[0.08] px-3 py-1 text-xs text-gold">
            <Copy k="custom-page.page-view.draft-only-page-editors-can">Draft: only page editors can see this page</Copy>
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">{page.title}</h1>
          {editable && (
            <Link
              href={`/admin/pages/${page.id}`}
              className="pressable inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm text-muted-foreground hover:border-white/20 hover:text-foreground"
            >
              <PencilIcon aria-hidden className="size-4" /> <Copy k="custom-page.page-view.edit-page">Edit page</Copy>
            </Link>
          )}
        </div>
        {page.description && <p className="max-w-[68ch] text-[15px] text-muted-foreground">{page.description}</p>}
      </header>
      {page.blocks.length ? <PageBlocks blocks={page.blocks} /> : <p className="text-sm text-muted-foreground"><Copy k="custom-page.page-view.this-page-has-no-content">This page has no content yet.</Copy></p>}
    </article>
  )
}
