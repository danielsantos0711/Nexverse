import type { Metadata } from "next"
import { Suspense } from "react"
import { PageTitle } from "@/components/hub/bits"
import { CompareView } from "@/components/hub/compare"
import { seoMetadata } from "@/lib/content-server"
import { Copy } from "@/components/content/copy"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/compare", { title: "Compare", description: "Put up to four member projects side by side: likes, saves, replies, versions, licence and languages." })
}

export default function Page() {
  return (
    <div className="shell">
      <PageTitle k="compare.header" eyebrow={<Copy k="compare.header.eyebrow">Hub</Copy>} title="Compare side by side" lead="Put up to four member projects next to each other. The best number in each row gets a trophy." />
      <Suspense>
        <CompareView />
      </Suspense>
    </div>
  )
}
