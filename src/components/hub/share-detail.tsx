"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowUpRightIcon, ExternalLinkIcon, NewspaperIcon, Trash2Icon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { AddToCollection } from "@/components/collections/add-to-collection"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { Chip, Cover, KIND_ICONS, KindTag, PersonAvatar } from "@/components/hub/bits"
import { LikeButton } from "@/components/hub/like-button"
import { ModMenu, ReportButton } from "@/components/moderation"
import { TimeAgo } from "@/components/live/time"
import { DiscussButton } from "@/components/social/discuss-button"
import { SaveButton } from "@/components/social/save-button"
import { ConfirmDialog } from "@/components/studio/ui"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { formatDate, KINDS, type ResourceKind } from "@/lib/data"
import { deleteShare, getShare, hostOf, sharePath, shareInternalHref, type Share } from "@/lib/hub"
import { getProject, projectPath } from "@/lib/projects"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

type State = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "ready"; share: Share }

/**
 * The page for one thing a member shared: a model, dataset, tool, repo or a news story. A project id that lands
 * here (they share the address space) goes on to its project page.
 */
export function ShareDetail({ kind, id }: { kind: ResourceKind | "news"; id: string }) {
  const router = useRouter()
  const { ready, user } = useSession()
  const [state, setState] = useState<State>({ status: "loading" })

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    ;(async () => {
      if (kind !== "news") {
        const p = await getProject(id).catch(() => null)
        if (p && (p.status === "published" || p.local || p.ownerId === user?.id)) {
          router.replace(projectPath(p.id) as `/p/${string}`)
          return
        }
      }
      const s = await getShare(id)
      if (stale) return
      if (!s) return setState({ status: "missing" })
      if (s.kind !== kind) {
        router.replace(sharePath(s) as `/news/${string}`)
        return
      }
      setState({ status: "ready", share: s })
      document.title = `${s.title} · Nexverse`
    })().catch((e: Error) => !stale && setState({ status: "error", message: e.message }))
    return () => {
      stale = true
    }
  }, [id, kind, ready, user?.id, router])

  if (state.status === "loading") return <PageSkeleton />
  if (state.status !== "ready") {
    const back = kind === "news" ? { href: "/news", label: "Back to news" } : { href: KINDS[kind].path, label: `Back to ${KINDS[kind].plural.toLowerCase()}` }
    return (
      <Empty className="mx-auto max-w-xl py-24">
        <EmptyHeader>
          <EmptyTitle>{state.status === "error" ? "This page could not be loaded" : "Nothing here"}</EmptyTitle>
          <EmptyDescription>{state.status === "error" ? state.message : "It may have been removed by the member who shared it, or the link is mistyped."}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} variant="secondary" render={<Link href={back.href as "/news"} />}>
            {back.label}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  return <ShareView s={state.share} mine={Boolean(state.share.local || (user && state.share.author?.id === user.id))} />
}

function ShareView({ s, mine }: { s: Share; mine: boolean }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const host = hostOf(s.url)
  const inside = shareInternalHref(s)
  const isNews = s.kind === "news"
  const Icon = isNews ? NewspaperIcon : KIND_ICONS[s.kind as ResourceKind]
  const back = isNews ? { href: "/news", label: "News" } : { href: KINDS[s.kind as ResourceKind].path, label: KINDS[s.kind as ResourceKind].plural }
  const authorHref = s.author ? `/people/${s.author.handle ?? s.author.id}` : null
  const target = `share:${s.id}`

  return (
    <>
      <div className="relative isolate overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 opacity-50">
          <Cover seed={`${s.id}banner`} kind={isNews ? "news" : (s.kind as ResourceKind)} />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/30 via-background/75 to-background" />
        <div className="shell flex flex-col gap-5 pt-10 pb-8 md:pt-14">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href={back.href as "/news"} className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Icon aria-hidden className="size-4" />
              {back.label}
            </Link>
            <span aria-hidden>/</span>
            <span className="truncate">{host || "Shared link"}</span>
          </nav>
          <div className="flex flex-wrap items-start gap-4">
            <div className="size-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/15 md:size-20">
              <Cover seed={s.id} kind={isNews ? "news" : (s.kind as ResourceKind)} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {isNews ? <span className="font-medium text-gold">News</span> : <KindTag kind={s.kind as ResourceKind} />}
                {s.featuredAt && <span className="rounded-full bg-gold/15 px-1.5 font-medium text-gold">Featured</span>}
                <span className="text-muted-foreground">Shared link</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] break-words md:text-3xl">{s.title}</h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {s.author && authorHref ? (
                  <Link href={authorHref as `/people/${string}`} className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <PersonAvatar handle={s.author.handle ?? s.author.id} name={s.author.name} src={s.author.avatarUrl} size={20} />
                    Shared by <span className="font-medium text-foreground">{s.author.name}</span>
                  </Link>
                ) : (
                  <span>{s.local ? "Shared from this browser" : "Shared by a member"}</span>
                )}
                <span aria-hidden>·</span>
                <TimeAgo date={s.createdAt} />
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {inside ? (
              <Link href={inside as `/gh/${string}`} className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                Read it on Nexverse <ArrowUpRightIcon aria-hidden className="size-4" />
              </Link>
            ) : null}
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={
                inside
                  ? "pressable inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3.5 text-sm hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  : "pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              }
            >
              Open {host || "the link"} <ExternalLinkIcon aria-hidden className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <LikeButton target={target} />
            <SaveButton target={target} />
            <AddToCollection target={target} />
            <DiscussButton title={s.title} href={sharePath(s)} category={isNews ? "announcements" : s.kind === "dataset" ? "data" : s.kind === "model" ? "models" : "show"} className="h-9" />
            {mine && (
              <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
                <Trash2Icon aria-hidden /> Remove
              </Button>
            )}
            {!s.local && !mine && <ReportButton targetKind="submission" targetId={s.id} targetUrl={sharePath(s)} />}
            {!s.local && <ModMenu kind="submission" id={s.id} featured={Boolean(s.featuredAt)} />}
          </div>
        </div>
      </div>

      <div className="shell grid grid-cols-1 gap-10 pt-8 pb-16 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="why-h" className="flex flex-col gap-2">
            <h2 id="why-h" className="text-base font-semibold">
              {isNews ? "Why it matters" : "What it is"}
            </h2>
            {s.summary ? <p className="max-w-[68ch] text-[15px] leading-relaxed text-foreground/90">{s.summary}</p> : <p className="text-muted-foreground">The member who shared this did not add a note.</p>}
          </section>
          <ThreadDiscussion threadId={`share-${s.id}`} heading="Comments" />
        </div>
        <aside className="flex flex-col gap-4">
          <section aria-label="Details" className="glass flex flex-col gap-3 rounded-2xl p-5 text-sm">
            <Row label="Source" value={<span className="break-all">{host || "Link"}</span>} />
            <Row label="Shared" value={formatDate(s.createdAt)} />
            {s.tags.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <Chip key={t}>#{t}</Chip>
                  ))}
                </div>
              </div>
            )}
          </section>
          <p className="text-xs text-muted-foreground">Links lead to the original source. Nexverse shows what members shared; it does not host or vouch for it.</p>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove this share?"
        description="It disappears from the hub and from everyone's saved items, and its comments are no longer shown."
        confirm="Remove"
        onConfirm={async () => {
          await deleteShare(s.id)
          router.push((isNews ? "/news" : KINDS[s.kind as ResourceKind].path) as "/news")
        }}
      />
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{value}</span>
    </div>
  )
}
