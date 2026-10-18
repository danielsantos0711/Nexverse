import Link from "next/link"
import { ArrowUpIcon, FileTextIcon, MessageSquareIcon, MessagesSquareIcon } from "lucide-react"
import { Stat } from "@/components/hub/bits"
import { Spotlight } from "@/components/hub/motion"
import type { Paper } from "@/lib/live"
import { cn } from "@/lib/utils"
import { Abstract } from "./abstract"
import { discussHref, ExternalLink } from "./bits"
import { TimeAgo } from "./time"

function Authors({ names }: { names: string[] }) {
  if (!names.length) return null
  const shown = names.slice(0, 4)
  const more = names.length - shown.length
  return (
    <p className="line-clamp-1 text-[13px] text-muted-foreground" title={names.join(", ")}>
      {shown.join(", ")}
      {more > 0 && <span className="text-muted-foreground/70"> +{more} more</span>}
    </p>
  )
}

const LINK = "relative z-10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"

/** A paper from Hugging Face's daily list or arXiv: authors, votes, an expandable abstract and links out. */
export function PaperCard({ paper: p, rank, className }: { paper: Paper; rank?: number; className?: string }) {
  const fromHf = p.source === "huggingface"
  return (
    <Spotlight className={cn("relative flex gap-4 rounded-2xl border border-border bg-card/70 p-4 transition-colors hover:bg-card", className)}>
      {fromHf && (
        <div className="hidden w-14 shrink-0 flex-col items-center self-start rounded-lg bg-secondary/70 py-1.5 sm:flex">
          <ArrowUpIcon aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold tabular">{p.upvotes}</span>
          <span className="sr-only">upvotes on Hugging Face</span>
        </div>
      )}
      <article className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {rank !== undefined && <span className="font-mono text-gold">#{rank}</span>}
          <span className="inline-flex items-center gap-1 font-medium text-gold">
            <FileTextIcon aria-hidden className="size-3.5" />
            {fromHf ? "Daily paper" : (p.categories[0] ?? "arXiv")}
          </span>
          {!fromHf && p.categories.length > 1 && <span className="font-mono">{p.categories.slice(1).join(" · ")}</span>}
          <TimeAgo date={p.published} />
          {fromHf && (
            <span className="sm:hidden">
              <Stat icon={ArrowUpIcon} value={p.upvotes} label="upvotes" />
            </span>
          )}
          {p.comments > 0 && <Stat icon={MessageSquareIcon} value={p.comments} label="comments on Hugging Face" />}
          <span className="font-mono">arXiv:{p.id}</span>
        </div>
        <h3 className="font-sans text-base leading-snug font-medium tracking-normal">
          <ExternalLink href={fromHf ? p.links.hf : p.links.arxiv} className="hover:underline">
            {p.title}
          </ExternalLink>
        </h3>
        <Authors names={p.authors} />
        {p.tldr && <p className="text-sm text-foreground/85">{p.tldr}</p>}
        <Abstract text={p.summary} />
        {p.keywords.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Keywords">
            {p.keywords.map((k) => (
              <li key={k} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                {k}
              </li>
            ))}
          </ul>
        )}
        <div className="-ml-2 flex flex-wrap items-center gap-0.5 pt-1">
          <ExternalLink href={p.links.arxiv} className={LINK}>
            arXiv
          </ExternalLink>
          <ExternalLink href={p.links.pdf} className={LINK}>
            PDF
          </ExternalLink>
          <ExternalLink href={p.links.hf} className={LINK}>
            Hugging Face
          </ExternalLink>
          {p.links.code && (
            <ExternalLink href={p.links.code} className={LINK}>
              Code
            </ExternalLink>
          )}
          {p.links.project && (
            <ExternalLink href={p.links.project} className={LINK}>
              Project page
            </ExternalLink>
          )}
          <Link href={discussHref(p.title)} className={cn(LINK, "ml-auto text-ion hover:text-ion")}>
            <MessagesSquareIcon aria-hidden className="size-3.5" />
            Discuss in forum
          </Link>
        </div>
      </article>
    </Spotlight>
  )
}
