import Link from "next/link"
import { BookOpenIcon, FileTextIcon, FolderGit2Icon, MessagesSquareIcon } from "lucide-react"
import { Spotlight } from "@/components/hub/motion"
import type { Paper } from "@/lib/live"
import { areaInfo } from "@/lib/live/catalog"
import { discussItemHref, internalHref, paperHref } from "@/lib/live/ids"
import { cn } from "@/lib/utils"
import { Abstract } from "./abstract"
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

/** An arXiv paper: area, authors, an expandable abstract. Opens its page on Nexverse. */
export function PaperCard({ paper: p, className }: { paper: Paper; className?: string }) {
  const code = p.links.code ? internalHref(p.links.code) : null
  const primary = p.categories[0]
  return (
    <Spotlight className={cn("relative flex gap-4 rounded-2xl border border-border bg-card/70 p-4 transition-colors hover:bg-card", className)}>
      <article className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-gold" title={primary ? areaInfo(primary)?.label : undefined}>
            <FileTextIcon aria-hidden className="size-3.5" />
            {primary ?? "arXiv"}
          </span>
          {p.categories.length > 1 && <span className="font-mono">{p.categories.slice(1, 4).join(" · ")}</span>}
          <TimeAgo date={p.published} />
          <span className="font-mono">arXiv:{p.id}</span>
        </div>
        <h3 className="font-sans text-base leading-snug font-medium tracking-normal">
          <Link href={paperHref(p.id)} className="hover:underline">
            {p.title}
          </Link>
        </h3>
        <Authors names={p.authors} />
        <Abstract text={p.summary} />
        <div className="-ml-2 flex flex-wrap items-center gap-0.5 pt-1">
          <Link href={paperHref(p.id)} className={cn(LINK, "text-foreground/90")}>
            <BookOpenIcon aria-hidden className="size-3.5" />
            Read the paper
          </Link>
          {code && (
            <Link href={code} className={LINK}>
              <FolderGit2Icon aria-hidden className="size-3.5" />
              Code
            </Link>
          )}
          <Link href={discussItemHref(p.title, `${p.title} (arXiv:${p.id})\n\n${paperHref(p.id)}`)} className={cn(LINK, "ml-auto text-ion hover:text-ion")}>
            <MessagesSquareIcon aria-hidden className="size-3.5" />
            Discuss in forum
          </Link>
        </div>
      </article>
    </Spotlight>
  )
}
