import Link from "next/link"
import { CircleAlertIcon, MessagesSquareIcon, SearchXIcon, TimerIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { FailReason } from "@/lib/live/http"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"
import { PageBackdrop } from "@/components/glass/page-backdrop"

/** Shared frame for the in-site pages of external items: banner, details panel, error and loading states. */

type CoverKind = "model" | "dataset" | "tool" | "repo" | "news" | "thread"

export function DetailBanner({
  crumbs,
  art,
  children,
}: {
  /** Kept for callers; the drawn cover these chose was removed in round 12. */
  seed?: string
  kind?: CoverKind
  crumbs: { href?: string; label: React.ReactNode }[]
  /** Replaces the drawn cover behind the header, e.g. a Space's own gradient. */
  art?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="nx-detail relative isolate overflow-hidden border-b border-border">
      {/* Sober graphite (round 12): no drawn nebula or ring of light behind the title, only a page's own art.
          Launch pass: without art, the silver contour lines move behind the title like the list pages' headers. */}
      {!art && <PageBackdrop variant="topo" className="top-0" />}
      {art && (
        <>
          <div className="absolute inset-0 -z-10 opacity-60">{art}</div>
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/30 via-background/70 to-background" />
        </>
      )}
      <div className="shell flex flex-col gap-5 pt-10 pb-8 md:pt-14">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {c.href ? (
                <Link href={c.href} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        {children}
      </div>
    </div>
  )
}

export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right break-words">{children}</span>
    </div>
  )
}

export function Panel({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className={cn("glass flex flex-col gap-3 rounded-2xl p-5 text-sm", className)}>
      {children}
    </section>
  )
}

/** "Discuss in forum": opens the new-thread form prefilled with a title and a link back here. */
export function DiscussButton({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("pressable inline-flex h-9 items-center gap-2 rounded-full border border-ion/40 bg-ion/10 px-3.5 text-sm text-ion transition-colors hover:bg-ion/15", className)}
    >
      <MessagesSquareIcon aria-hidden className="size-4" />
      <Copy k="gh-repo.detail.discuss-in-forum">Discuss in forum</Copy>
    </Link>
  )
}

/**
 * A small credit line at the bottom of a page: where the data comes from, as plain text. Members stay on Nexverse, so
 * it names the source without linking out (`label` is kept for callers and used as the tooltip).
 */
export function SourceLink({ href, label, className }: { href: string; label: string; className?: string }) {
  let source = "public APIs"
  try {
    const host = new URL(href).hostname.replace(/^www\./, "")
    source = host === "github.com" ? "GitHub’s public API" : host
  } catch {}
  return (
    <p className={cn("text-xs text-muted-foreground/80", className)} title={label}>
      Data from {source}, refreshed every few hours.
    </p>
  )
}

const REASON: Record<FailReason, { icon: typeof CircleAlertIcon; title: string; body: string }> = {
  ratelimit: {
    icon: TimerIcon,
    title: "Taking a short breather",
    body: "The source is limiting how often we can ask right now. This page fills in again on its own within the hour.",
  },
  error: {
    icon: CircleAlertIcon,
    title: "Could not load this right now",
    body: "The source did not answer. Try again in a few minutes; nothing is wrong on your side.",
  },
  toolarge: {
    icon: CircleAlertIcon,
    title: "Too large to show here",
    body: "This one is bigger than we display inside Nexverse.",
  },
  notfound: {
    icon: SearchXIcon,
    title: "Nothing here",
    body: "It may have been renamed, made private or removed.",
  },
}

/** A friendly panel in place of content that could not be loaded. */
export function ErrorPanel({ reason, what, className, children }: { reason: FailReason; what?: string; className?: string; children?: React.ReactNode }) {
  const r = REASON[reason]
  return (
    <div role="status" className={cn("glass flex items-start gap-3 rounded-2xl p-5 text-sm", className)}>
      <r.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{what ? `${r.title}: ${what}` : r.title}</p>
        <p className="text-muted-foreground">{r.body}</p>
        {children}
      </div>
    </div>
  )
}

/** An empty tab: short and plain. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{children}</p>
}

const UNITS = ["B", "KB", "MB", "GB", "TB"]

export function bytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")} ${UNITS[i]}`
}

/** Banner, tabs and aside placeholders, for the <Suspense> fallback of every detail page. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="border-b border-border">
        <div className="shell flex flex-col gap-5 pt-10 pb-8 md:pt-14">
          <Skeleton className="h-4 w-48" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-2xl md:size-20" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-8 w-2/3 max-w-md" />
              <Skeleton className="h-4 w-1/2 max-w-sm" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      <div className="shell grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <div className="flex gap-4 border-b border-border pb-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-20" />
            ))}
          </div>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-4 h-40 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
