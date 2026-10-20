import type { Metadata } from "next"
import { YouView } from "@/components/account/you-view"
import { MyPoints } from "@/components/reputation/my-points"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/you", { title: "You", robots: { index: false } })
}

export default function YouPage() {
  return (
    <div className="shell max-w-5xl">
      <YouView />
      <MyPoints className="mt-8 mb-16" />
    </div>
  )
}
