import type { Metadata } from "next"
import { Suspense } from "react"
import { PageTitle } from "@/components/hub/bits"
import { CompareView } from "@/components/hub/compare"

export const metadata: Metadata = { title: "Compare" }

export default function Page() {
  return (
    <div className="shell">
      <PageTitle eyebrow="Hub" title="Compare side by side" lead="Put up to four models, datasets, tools or repos next to each other. The best number in each row gets a trophy." />
      <Suspense>
        <CompareView />
      </Suspense>
    </div>
  )
}
