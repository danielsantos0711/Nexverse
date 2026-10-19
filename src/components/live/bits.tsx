import { WifiOffIcon } from "lucide-react"
import type { Feed, LiveSource } from "@/lib/live"
import { cn } from "@/lib/utils"
import { LiveBadge } from "./live-badge"

export const SOURCES: Record<LiveSource, { name: string; url: string }> = {
  github: { name: "GitHub", url: "https://github.com" },
}

/** Every link that leaves Nexverse: new tab, no referrer, no endorsement. */
export function ExternalLink({ href, className, children, ...rest }: Omit<React.ComponentProps<"a">, "target" | "rel">) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className} {...rest}>
      {children}
    </a>
  )
}

/** "Live · updated 4 min ago · via GitHub". The source is credited in small text; items open on Nexverse. */
export function FeedMeta({ feed, className }: { feed: Feed<unknown>; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <LiveBadge fetchedAt={feed.fetchedAt} ok={feed.ok} />
      <span>via {SOURCES[feed.source].name}</span>
    </div>
  )
}

/** Shown in place of a feed that could not be reached, so the rest of the page carries on. */
export function FeedUnavailable({ source, className }: { source: LiveSource; className?: string }) {
  return (
    <div className={cn("glass flex items-center gap-3 rounded-xl p-5 text-sm text-muted-foreground", className)}>
      <WifiOffIcon aria-hidden className="size-4 shrink-0" />
      <p className="flex-1">{SOURCES[source].name} is not answering right now. This section refreshes on its own in a few minutes.</p>
    </div>
  )
}

/** The forum's new-thread page, prefilled with a title. */
export const discussHref = (title: string) => `/forum/new?title=${encodeURIComponent(title.slice(0, 280))}`
