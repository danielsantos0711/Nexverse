import type { Metadata } from "next"
import { StudioDashboard } from "@/components/studio/studio-dashboard"

export const metadata: Metadata = { title: "Your studio", description: "Your projects on Nexverse, how they are doing, and your drafts.", robots: { index: false } }

export default function StudioPage() {
  return (
    <div className="shell max-w-6xl">
      <StudioDashboard />
    </div>
  )
}
