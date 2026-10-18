import type { Metadata } from "next"
import { YouView } from "@/components/account/you-view"

export const metadata: Metadata = { title: "You", robots: { index: false } }

export default function YouPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <YouView />
    </div>
  )
}
