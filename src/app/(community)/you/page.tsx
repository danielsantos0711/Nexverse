import type { Metadata } from "next"
import { YouView } from "@/components/account/you-view"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/you", { title: "Your page", robots: { index: false } })
}

/** Your page: your projects (what /studio was), threads, shares, follows and progress, in tabs. */
export default function YouPage() {
  return (
    <div className="shell max-w-6xl">
      <YouView />
    </div>
  )
}
