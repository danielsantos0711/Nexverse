"use client"

import { PreviewCard } from "@base-ui/react/preview-card"
import { ExternalLinkIcon } from "lucide-react"
import type { StorySource } from "@/lib/newsroom"

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/**
 * A citation in the text: a small superscript number that jumps to the source in the list below. Hovering or
 * focusing it previews the source (publisher, title, date and a line from the page) without leaving the
 * paragraph; on touch screens a tap simply jumps to the list.
 */
export function Cite({ n, source }: { n: number; source: StorySource }) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        href={`#source-${n}`}
        delay={250}
        aria-label={`Source ${n}: ${source.publisher || host(source.url)}`}
        className="relative -top-[0.45em] mx-[0.08em] inline-flex h-[1.35em] min-w-[1.35em] items-center justify-center rounded-full bg-ion/12 px-1 align-baseline font-mono text-[0.62em] leading-none font-medium text-ion no-underline transition-colors outline-none hover:bg-ion/25 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-ion/25"
      >
        {n}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={8} className="z-50">
          <PreviewCard.Popup className="liquid-glass-strong w-[min(22rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-2xl p-4 text-sm shadow-2xl transition-[transform,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="grid size-5 place-items-center rounded-full bg-ion/15 font-mono text-[11px] text-ion">{n}</span>
              <span className="truncate">{source.publisher || host(source.url)}</span>
              {source.publishedAt && <span className="ml-auto shrink-0">{DATE.format(new Date(source.publishedAt))}</span>}
            </p>
            <p className="mt-2 leading-snug font-medium">{source.title || source.url}</p>
            {source.excerpt && <p className="mt-2 line-clamp-4 border-l-2 border-ion/30 pl-3 text-[13px] leading-relaxed text-muted-foreground">{source.excerpt}</p>}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-3 inline-flex items-center gap-1 rounded-sm text-xs text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Open {host(source.url)} <ExternalLinkIcon aria-hidden className="size-3" />
            </a>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}
