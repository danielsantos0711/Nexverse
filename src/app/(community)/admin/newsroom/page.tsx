import type { Metadata } from "next"
import { Suspense } from "react"
import { AdminNewsroom } from "@/components/admin/newsroom-desk"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Newsroom" }

export default function AdminNewsroomPage() {
  return (
    // The section and the story being edited are read from the address, which is only known in the browser.
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <AdminNewsroom />
    </Suspense>
  )
}
