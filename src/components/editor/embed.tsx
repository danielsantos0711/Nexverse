"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowUpRightIcon, FileTextIcon, FolderGit2Icon, MessageSquareQuoteIcon, PlayIcon, ScrollTextIcon } from "lucide-react"
import { EMBED_LABEL, playerSrc, youtubeThumb, type Embed } from "@/lib/editor/embeds"
import { cn } from "@/lib/utils"

/**
 * One embed in a member post. Videos show a still and a play button; the provider's player (an iframe from
 * youtube-nocookie.com or player.vimeo.com, sandboxed) loads only when someone presses play. Other kinds are
 * cards that link out.
 */
export function EmbedBlock({ embed, className }: { embed: Embed; className?: string }) {
  if (embed.type === "youtube" || embed.type === "vimeo") return <Video embed={embed} className={className} />
  return <Card embed={embed} className={className} />
}

function Video({ embed, className }: { embed: Extract<Embed, { type: "youtube" | "vimeo" }>; className?: string }) {
  const [on, setOn] = useState(false)
  const label = EMBED_LABEL[embed.type]
  return (
    <figure className={cn("not-prose my-4 overflow-hidden rounded-xl border border-border bg-black", className)}>
      <div className="relative aspect-video">
        {on ? (
          <iframe
            src={playerSrc(embed)}
            title={label}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOn(true)}
            className="group absolute inset-0 grid place-items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
          >
            {embed.type === "youtube" ? (
              // eslint-disable-next-line @next/next/no-img-element -- provider still, no optimisation and no referrer
              <img src={youtubeThumb(embed.id)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
            ) : (
              <span aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_oklab,var(--color-ion)_35%,transparent),transparent_60%),radial-gradient(ellipse_at_80%_90%,rgba(180,140,255,0.3),transparent_55%)]" />
            )}
            <span className="liquid-glass-pill relative inline-flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur-md transition-transform group-hover:scale-[1.03] group-active:scale-[0.98]">
              <PlayIcon aria-hidden className="size-4 fill-current" /> Play {label.toLowerCase()}
            </span>
          </button>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-3 border-t border-white/10 bg-card/80 px-3 py-2 text-xs text-muted-foreground">
        <span>{label}. Loads from {embed.type === "youtube" ? "YouTube (privacy-enhanced mode)" : "Vimeo (do not track)"} when you press play.</span>
        <a href={embed.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex shrink-0 items-center gap-1 hover:text-foreground">
          Open <ArrowUpRightIcon aria-hidden className="size-3" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </figcaption>
    </figure>
  )
}

const CARD = "not-prose group my-4 flex items-center gap-3 rounded-xl border border-border bg-card/50 p-3.5 transition-colors hover:border-ion/40 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

function Card({ embed, className }: { embed: Exclude<Embed, { type: "youtube" | "vimeo" }>; className?: string }) {
  const info =
    embed.type === "github"
      ? { icon: FolderGit2Icon, title: `${embed.owner}/${embed.repo}`, detail: "Read the README and files on Nexverse", href: `/gh/${embed.owner}/${embed.repo}`, internal: true }
      : embed.type === "gist"
        ? { icon: FileTextIcon, title: `Gist by ${embed.user}`, detail: `gist.github.com/${embed.user}/${embed.id.slice(0, 8)}…`, href: embed.url, internal: false }
        : embed.type === "arxiv"
          ? { icon: ScrollTextIcon, title: `arXiv:${embed.id}`, detail: "Paper abstract and PDF on arxiv.org", href: `https://arxiv.org/abs/${embed.id}`, internal: false }
          : { icon: MessageSquareQuoteIcon, title: `Post by @${embed.user}`, detail: "Open on x.com", href: embed.url, internal: false }
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ion/10 text-ion ring-1 ring-ion/20">
        <info.icon aria-hidden className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted-foreground">{EMBED_LABEL[embed.type]}</span>
        <span className="truncate font-medium text-foreground">{info.title}</span>
        <span className="truncate text-xs text-muted-foreground">{info.detail}</span>
      </span>
      <ArrowUpRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </>
  )
  if (info.internal) {
    return (
      <Link href={info.href as `/gh/${string}`} className={cn(CARD, className)}>
        {body}
      </Link>
    )
  }
  return (
    <a href={info.href} target="_blank" rel="noopener noreferrer nofollow ugc" className={cn(CARD, className)}>
      {body}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}
