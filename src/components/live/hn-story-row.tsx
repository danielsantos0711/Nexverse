import Link from "next/link"
import { ArrowUpIcon, MessageSquareIcon, MessagesSquareIcon } from "lucide-react"
import { Spotlight } from "@/components/hub/motion"
import { compact } from "@/lib/data"
import type { HnStory } from "@/lib/live"
import { discussItemHref, internalHref } from "@/lib/live/ids"
import { cn } from "@/lib/utils"
import { ExternalLink } from "./bits"
import { TimeAgo } from "./time"

/** The anchor of a story's row on /trending, for links from the home page and the trending strip. */
export const hnAnchor = (id: string) => `/trending#hn-${id}`

/** Where a story should open: its Nexverse page when it links a repository, model or paper; else its row on /trending. */
export const hnHref = (s: HnStory) => internalHref(s.url) ?? hnAnchor(s.id)

/**
 * A Hacker News story, laid out like a forum thread row. Stories about a GitHub repository, a Hugging Face
 * item or an arXiv paper open that item's page on Nexverse. Others are not links themselves: the article and
 * the HN thread stay available as small secondary links, next to "Discuss here".
 */
export function HnStoryRow({ story: s, className, tight = false }: { story: HnStory; className?: string; tight?: boolean }) {
  const inside = internalHref(s.url)
  return (
    <Spotlight id={`hn-${s.id}`} className={cn("relative scroll-mt-24 rounded-xl transition-colors target:bg-ion/[0.06] hover:bg-card/80", className)}>
      <div className={cn("flex gap-4", tight ? "p-3" : "p-4")}>
        <div className="hidden w-14 shrink-0 flex-col items-center self-start rounded-lg bg-secondary/70 py-1.5 sm:flex">
          <ArrowUpIcon aria-hidden className="size-3.5 text-[#ff9a5c]" />
          <span className="text-sm font-semibold tabular">{compact(s.points)}</span>
          <span className="sr-only">points</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {inside ? (
            <Link href={inside} className="text-[15px] leading-snug font-medium after:absolute after:inset-0">
              {s.title}
            </Link>
          ) : (
            <p className="text-[15px] leading-snug font-medium">{s.title}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {inside ? (
              <span className="font-mono text-[#ff9a5c]/90">{s.domain}</span>
            ) : (
              <ExternalLink href={s.url} className="relative z-10 font-mono text-[#ff9a5c]/90 hover:underline" title="Open the article in a new tab">
                {s.domain} ↗
              </ExternalLink>
            )}
            <span className="tabular sm:hidden">{compact(s.points)} points</span>
            {s.author && <span>by {s.author}</span>}
            <TimeAgo date={s.createdAt} />
            <ExternalLink href={s.hnUrl} className="relative z-10 inline-flex items-center gap-1 tabular hover:text-foreground hover:underline" title="The discussion on Hacker News, in a new tab">
              <MessageSquareIcon aria-hidden className="size-3.5" />
              {compact(s.comments)} on HN
            </ExternalLink>
            <Link href={discussItemHref(s.title, `${s.title}\n\n${s.url}`)} className="relative z-10 inline-flex items-center gap-1 text-ion hover:underline">
              <MessagesSquareIcon aria-hidden className="size-3.5" />
              Discuss here
            </Link>
          </div>
        </div>
      </div>
    </Spotlight>
  )
}
