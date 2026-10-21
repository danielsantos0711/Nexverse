import type { Metadata } from "next"
import { Suspense } from "react"
import { NewsroomControl } from "@/components/admin/newsroom-control"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Newsroom control" }

export default function NewsroomControlPage() {
  return (
    // Everything on the page is the signed-in editor's own and is read in the browser.
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <NewsroomControl />
    </Suspense>
  )
}
