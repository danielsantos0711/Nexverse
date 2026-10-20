import { BadgeCheckIcon, CircleAlertIcon, CircleDashedIcon } from "lucide-react"
import { reproSummary, type BenchmarkResult } from "@/lib/benchmarks"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

/** Verified (reproduced by members), disputed (more could not than could), or not checked yet. Icon and label, never colour alone. */
export function ReproBadge({ result, className, compact }: { result: Pick<BenchmarkResult, "repros">; className?: string; compact?: boolean }) {
  const s = reproSummary(result)
  if (s.verified)
    return (
      <span
        className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok", className)}
        title={`Reproduced by ${s.reproduced}${s.failed ? `, not by ${s.failed}` : ""}`}
      >
        <BadgeCheckIcon aria-hidden className="size-3.5" /> Verified
        {!compact && s.reproduced > 1 ? ` ×${s.reproduced}` : ""}
      </span>
    )
  if (s.disputed)
    return (
      <span
        className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive", className)}
        title={`${s.failed} could not reproduce`}
      >
        <CircleAlertIcon aria-hidden className="size-3.5" /> <Copy k="benchmarks.bench-bits.disputed">Disputed</Copy>
      </span>
    )
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-muted-foreground", className)}>
      <CircleDashedIcon aria-hidden className="size-3.5" /> {compact ? "Unchecked" : "Not reproduced yet"}
    </span>
  )
}
