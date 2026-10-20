import Link from "next/link"
import type { Route } from "next"
import { ArrowUpRightIcon, BookmarkIcon, HeartIcon, XIcon } from "lucide-react"
import { STAR_KINDS, type Star } from "@/components/cosmos/model"
import { primaryButton } from "@/components/forum/forum-ui"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

/** What the Open button says: most stars open their page; your own star opens your profile or asks you to sign in. */
function openLabel(star: Star) {
  if (star.kind !== "you") return "Open"
  if (star.href === "/you") return "Your profile"
  if (star.href === "/saved") return "Saved"
  return "Sign in"
}

/** The glass card for the star you hover, focus or pick: name, kind, a line of facts, the summary and an Open button. */
export function StarCard({ star, liked, saved, onClose, className }: { star: Star; liked: boolean; saved: boolean; onClose?: () => void; className?: string }) {
  const kind = STAR_KINDS[star.kind]
  return (
    <div style={{ background: "linear-gradient(180deg, rgb(20 24 34 / 0.94), rgb(11 14 22 / 0.94))" }} className={cn("glass flex flex-col gap-2.5 rounded-2xl p-4 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.8)]", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: kind.color, boxShadow: `0 0 8px ${kind.color}` }} />
            {kind.label}
          </span>
          <h2 className="truncate text-base leading-tight font-semibold tracking-[-0.01em]">{star.name}</h2>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close card" className="pressable -mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <XIcon aria-hidden className="size-4" />
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{star.meta}</p>
      <p className="line-clamp-3 text-sm text-foreground/85">{star.summary}</p>
      {(liked || saved) && (
        <p className="flex flex-wrap gap-1.5 text-xs text-gold">
          {liked && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5">
              <HeartIcon aria-hidden className="size-3" /> <Copy k="cosmos.star-card.you-liked-this">You liked this</Copy>
            </span>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5">
              <BookmarkIcon aria-hidden className="size-3" /> <Copy k="cosmos.star-card.saved">Saved</Copy>
            </span>
          )}
        </p>
      )}
      {star.href && (
        <div className="pt-1">
          <Link href={star.href as Route} className={cn(primaryButton, "h-8 px-3.5")}>
            {openLabel(star)}
            <ArrowUpRightIcon aria-hidden className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  )
}
