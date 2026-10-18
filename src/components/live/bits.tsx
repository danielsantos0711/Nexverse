import { SquareArrowOutUpRightIcon, WifiOffIcon } from "lucide-react"
import type { Feed, LiveSource } from "@/lib/live"
import { cn } from "@/lib/utils"
import { LiveBadge } from "./live-badge"

export const SOURCES: Record<LiveSource, { name: string; url: string }> = {
  huggingface: { name: "Hugging Face", url: "https://huggingface.co" },
  arxiv: { name: "arXiv", url: "https://arxiv.org" },
  hackernews: { name: "Hacker News", url: "https://news.ycombinator.com" },
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

/** "Live · updated 4 min ago · from Hugging Face", with an optional link to the source's own listing. */
export function FeedMeta({ feed, href, label, className }: { feed: Feed<unknown>; href?: string; label?: string; className?: string }) {
  const src = SOURCES[feed.source]
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <LiveBadge fetchedAt={feed.fetchedAt} ok={feed.ok} />
      <span>
        from{" "}
        <ExternalLink href={src.url} className="text-foreground/80 hover:text-foreground hover:underline">
          {src.name}
        </ExternalLink>
      </span>
      {href && (
        <ExternalLink href={href} className="inline-flex items-center gap-1 text-ion hover:underline">
          {label ?? `Open on ${src.name}`}
          <SquareArrowOutUpRightIcon aria-hidden className="size-3" />
        </ExternalLink>
      )}
    </div>
  )
}

/** Shown in place of a feed that could not be reached, so the rest of the page carries on. */
export function FeedUnavailable({ source, href, className }: { source: LiveSource; href?: string; className?: string }) {
  const src = SOURCES[source]
  return (
    <div className={cn("glass flex flex-col items-start gap-2 rounded-xl p-5 text-sm text-muted-foreground sm:flex-row sm:items-center", className)}>
      <WifiOffIcon aria-hidden className="size-4 shrink-0" />
      <p className="flex-1">{src.name} is not answering right now. This section refreshes on its own in a few minutes.</p>
      <ExternalLink href={href ?? src.url} className="shrink-0 text-ion hover:underline">
        Open {src.name} →
      </ExternalLink>
    </div>
  )
}

/** The forum's new-thread page, prefilled with a title. */
export const discussHref = (title: string) => `/forum/new?title=${encodeURIComponent(title.slice(0, 280))}`
