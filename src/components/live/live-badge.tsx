"use client"

import { cn } from "@/lib/utils"
import { relative, useNow } from "./time"

/**
 * A breathing dot with "Live · updated 12 min ago". When the feed could not be reached it turns grey and
 * says so, instead of pretending. The dot's pulse stops under prefers-reduced-motion (see .pulse-dot).
 */
export function LiveBadge({ fetchedAt, ok = true, className }: { fetchedAt: number; ok?: boolean; className?: string }) {
  const now = useNow()
  const when = now === null ? null : relative(fetchedAt, Math.max(now, fetchedAt))
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      {ok ? (
        <span aria-hidden className="pulse-dot" />
      ) : (
        <span aria-hidden className="inline-block size-[7px] rounded-full bg-muted-foreground/50" />
      )}
      <span className={cn("font-medium", ok ? "text-ok" : "text-muted-foreground")}>{ok ? "Live" : "Offline"}</span>
      {ok ? (
        when && <span className="tabular">· updated {when}</span>
      ) : (
        <span>· retrying in a few minutes</span>
      )}
    </span>
  )
}
