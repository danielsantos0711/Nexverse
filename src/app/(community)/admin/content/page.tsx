import type { Metadata } from "next"
import { Suspense } from "react"
import { AdminContent } from "@/components/admin/content"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Content" }

export default function AdminContentPage() {
  return (
    // The selected kind is read from the address, which is only known in the browser.
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <AdminContent />
    </Suspense>
  )
}
