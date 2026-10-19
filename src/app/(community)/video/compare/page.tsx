import type { Metadata } from "next"
import { ForumHeader } from "@/components/forum/forum-header"
import { CompareView } from "@/components/video/compare-view"

export const metadata: Metadata = {
  title: "Compare videos",
  description: "Two shared AI videos side by side, with their prompts and settings.",
}

export default function ComparePage() {
  return (
    <div className="shell max-w-6xl pb-16">
      <ForumHeader title="Compare videos" lead="Two videos side by side, with what differs in how they were made." crumbs={[{ label: "Video lab", href: "/video" }, { label: "Compare" }]} />
      <CompareView />
    </div>
  )
}
