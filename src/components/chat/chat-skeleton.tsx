import { Skeleton } from "@/components/ui/skeleton"

/** The chat's frame while the room loads, the same size as the real thing so nothing jumps. */
export function ChatSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[24rem] w-full border-t border-border" aria-busy="true" aria-label="Loading chat">
      <div className="hidden w-64 shrink-0 flex-col gap-2 border-r border-border p-4 md:flex">
        <Skeleton className="mb-2 h-4 w-16" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex-1" />
        <div className="p-4">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
      <div className="hidden w-72 shrink-0 border-l border-border xl:block" />
    </div>
  )
}
