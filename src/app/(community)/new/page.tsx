import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHead } from "@/components/app/bits"
import { Composer } from "@/components/app/composer"

export const metadata: Metadata = { title: "Ask a question" }

export default function NewPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHead
        title="Ask a question"
        lead="Write in the language you think in. People who read another language will see it translated, with your original one tap away."
      />
      <Suspense>
        <Composer />
      </Suspense>
    </div>
  )
}
