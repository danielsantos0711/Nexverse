import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Placeholders shaped like the live rows and cards, for <Suspense> fallbacks. */

export function RowsSkeleton({ rows = 6, columns = 2, className }: { rows?: number; columns?: 1 | 2; className?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cn("grid gap-2.5", columns === 2 && "md:grid-cols-2", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3.5 rounded-xl border border-border bg-card/50 p-3.5">
          <Skeleton className="size-14 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CardsSkeleton({ cards = 6, className }: { cards?: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-card/50">
          <Skeleton className="h-24 rounded-none" />
          <div className="flex flex-col gap-2 p-4 pt-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PapersSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading papers" className="flex flex-col gap-5">
      <Skeleton className="h-10 w-72 rounded-full" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card/50 p-4">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function StripSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex gap-2 overflow-hidden">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-48 shrink-0 rounded-full" />
      ))}
    </div>
  )
}
