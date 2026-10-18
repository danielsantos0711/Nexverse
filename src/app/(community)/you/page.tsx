import type { Metadata } from "next"
import { YouView } from "@/components/account/you-view"

export const metadata: Metadata = { title: "You", robots: { index: false } }

export default function YouPage() {
  return (
    <div className="shell max-w-5xl">
      <YouView />
    </div>
  )
}
