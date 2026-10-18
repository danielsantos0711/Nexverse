import { Skeleton } from "@/components/ui/skeleton"

export function PageSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pt-20" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="mt-10 h-40 w-full" />
    </div>
  )
}
