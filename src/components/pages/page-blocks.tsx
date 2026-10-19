"use client"

import Link from "next/link"
import type { Route } from "next"
import { useEffect, useState } from "react"
import { ArrowRightIcon, ChevronDownIcon, CircleAlertIcon, CircleCheckIcon, InfoIcon, RocketIcon } from "lucide-react"
import { VideoEmbed } from "@/components/fx/video-embed"
import { Markdown } from "@/components/live/markdown"
import { TimeAgo } from "@/components/live/time"
import { Skeleton } from "@/components/ui/skeleton"
import { loadList, type Block, type ListItem, type Tone } from "@/lib/pages"
import { isSafeHref } from "@/lib/site-settings"
import { cn } from "@/lib/utils"

/*
 * A custom page's blocks, rendered. Text goes through the site's safe Markdown renderer (no raw HTML is ever
 * injected), links are checked with isSafeHref, and videos load their player only after a click.
 * The same component draws the public page and the editor's live preview.
 */

export function PageBlocks({ blocks, preview = false }: { blocks: Block[]; preview?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} preview={preview} />
      ))}
    </div>
  )
}

const prose = "[&>div>:first-child]:mt-0 [&>div>:last-child]:mb-0"

function BlockView({ block: b, preview }: { block: Block; preview: boolean }) {
  switch (b.type) {
    case "heading": {
      if (!b.text.trim()) return preview ? <Placeholder text="Empty heading" /> : null
      const Tag = b.level === 3 ? "h3" : "h2"
      return (
        <Tag id={anchor(b.text)} className={cn("scroll-mt-24 font-semibold tracking-[-0.015em]", b.level === 3 ? "text-lg" : "mt-2 text-xl")}>
          {b.text}
        </Tag>
      )
    }
    case "text":
      return b.markdown.trim() ? (
        <div className={prose}>
          <Markdown source={b.markdown} ctx={{ source: "none" }} className="max-w-[72ch]" />
        </div>
      ) : preview ? (
        <Placeholder text="Empty text" />
      ) : null
    case "image":
      if (!b.src) return preview ? <Placeholder text="No image yet" /> : null
      return (
        <figure className={cn("flex flex-col gap-2", !b.wide && "max-w-3xl")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- images come from the site's own media bucket or an https address the editors chose */}
          <img src={b.src} alt={b.alt} loading="lazy" decoding="async" className="w-full rounded-2xl border border-border bg-card/40 object-cover" />
          {b.caption && <figcaption className="text-sm text-muted-foreground">{b.caption}</figcaption>}
        </figure>
      )
    case "callout":
      return b.title.trim() || b.body.trim() ? <Callout tone={b.tone} title={b.title} body={b.body} /> : preview ? <Placeholder text="Empty callout" /> : null
    case "buttons": {
      const items = b.items.filter((i) => i.label.trim() && isSafeHref(i.href))
      if (!items.length) return preview ? <Placeholder text="Buttons need a label and a link" /> : null
      return (
        <div className="flex flex-wrap gap-2">
          {items.map((i, n) => (
            <ButtonLink key={n} href={i.href} primary={i.primary}>
              {i.label}
            </ButtonLink>
          ))}
        </div>
      )
    }
    case "faq": {
      const items = b.items.filter((i) => i.q.trim())
      if (!items.length) return preview ? <Placeholder text="No questions yet" /> : null
      return (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
          {items.map((i, n) => (
            <details key={n} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-[15px] font-medium transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                {i.q}
                <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className={cn("px-4 pb-4 text-sm text-muted-foreground", prose)}>
                <Markdown source={i.a} ctx={{ source: "none" }} />
              </div>
            </details>
          ))}
        </div>
      )
    }
    case "list":
      return <ContentList source={b.source} title={b.title} count={b.count} />
    case "gallery": {
      const images = b.images.filter((i) => i.src)
      if (!images.length) return preview ? <Placeholder text="No images in the gallery yet" /> : null
      return (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {images.map((i, n) => (
            <li key={n} className="overflow-hidden rounded-xl border border-border bg-card/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- images come from the site's own media bucket */}
              <img src={i.src} alt={i.alt} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-[1.02] motion-reduce:transform-none" />
            </li>
          ))}
        </ul>
      )
    }
    case "video":
      if (!b.videoId) return preview ? <Placeholder text="Paste a YouTube or Vimeo link" /> : null
      return (
        <figure className="flex max-w-3xl flex-col gap-2">
          <VideoEmbed source={b.provider === "youtube" ? { kind: "youtube", id: b.videoId } : { kind: "vimeo", id: b.videoId, hash: "" }} title={b.title || "Video"} />
          {b.title && <figcaption className="text-sm text-muted-foreground">{b.title}</figcaption>}
        </figure>
      )
    case "divider":
      return <hr className="border-0 border-t border-border" />
    case "columns": {
      const cols = b.columns.filter((c) => c.trim())
      if (!cols.length) return preview ? <Placeholder text="Empty columns" /> : null
      return (
        <div className={cn("grid grid-cols-1 gap-6", b.columns.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
          {b.columns.map((c, n) => (
            <div key={n} className={cn("rounded-2xl border border-border bg-card/30 p-5 text-sm", prose)}>
              <Markdown source={c} ctx={{ source: "none" }} />
            </div>
          ))}
        </div>
      )
    }
  }
}

const anchor = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)

const TONE: Record<Tone, { box: string; icon: typeof InfoIcon; color: string }> = {
  info: { box: "border-ion/25 bg-ion/[0.06]", icon: InfoIcon, color: "text-ion" },
  success: { box: "border-ok/25 bg-ok/[0.06]", icon: CircleCheckIcon, color: "text-ok" },
  warning: { box: "border-gold/30 bg-gold/[0.07]", icon: CircleAlertIcon, color: "text-gold" },
  launch: { box: "border-model/30 bg-model/[0.07]", icon: RocketIcon, color: "text-model" },
}

function Callout({ tone, title, body }: { tone: Tone; title: string; body: string }) {
  const t = TONE[tone]
  return (
    <aside className={cn("flex gap-3 rounded-2xl border px-4 py-3.5", t.box)}>
      <t.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", t.color)} />
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {body && (
          <div className={cn("text-muted-foreground", prose)}>
            <Markdown source={body} ctx={{ source: "none" }} />
          </div>
        )}
      </div>
    </aside>
  )
}

function ButtonLink({ href, primary, children }: { href: string; primary: boolean; children: React.ReactNode }) {
  const cls = cn(
    "pressable inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    primary ? "bg-primary text-primary-foreground" : "border border-border bg-white/[0.03] text-foreground hover:border-white/20"
  )
  if (href.startsWith("/")) {
    return (
      <Link href={href as Route} className={cls}>
        {children}
        {primary && <ArrowRightIcon aria-hidden className="size-4" />}
      </Link>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

const LIST_EMPTY = {
  threads: { text: "No threads yet. The first one could be yours.", href: "/forum/new", cta: "Start a thread" },
  news: { text: "No news stories yet.", href: "/news", cta: "Go to News" },
  projects: { text: "No projects published yet.", href: "/new/project", cta: "Publish a project" },
} as const

function ContentList({ source, title, count }: { source: "threads" | "news" | "projects"; title: string; count: number }) {
  const [state, setState] = useState<{ key: string; items: ListItem[] } | null>(null)
  const key = `${source}|${count}`
  useEffect(() => {
    let on = true
    void loadList(source, count)
      .catch(() => [] as ListItem[])
      .then((items) => on && setState({ key, items }))
    return () => {
      on = false
    }
  }, [source, count, key])
  const items = state?.key === key ? state.items : null
  const empty = LIST_EMPTY[source]
  return (
    <section className="flex flex-col gap-3" aria-label={title || undefined}>
      {title && <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>}
      {!items ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: Math.min(count, 4) }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40">
          {items.map((i) => (
            <li key={i.id}>
              <Link
                href={i.href as Route}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-medium">{i.title}</span>
                  {i.meta && <span className="truncate text-xs text-muted-foreground">{i.meta}</span>}
                </span>
                {i.date && <TimeAgo date={i.date} className="shrink-0 text-xs text-muted-foreground" />}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          {empty.text}{" "}
          <Link href={empty.href} className="text-ion hover:underline">
            {empty.cta}
          </Link>
        </p>
      )}
    </section>
  )
}

function Placeholder({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground">{text}</p>
}
