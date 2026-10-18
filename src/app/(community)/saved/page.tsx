import type { Metadata } from "next"
import { PageTitle } from "@/components/hub/bits"
import { SavedView } from "@/components/social/saved-view"

export const metadata: Metadata = { title: "Saved", description: "Everything you bookmarked on Nexverse.", robots: { index: false } }

export default function SavedPage() {
  return (
    <div className="shell max-w-5xl">
      <PageTitle title="Saved" lead="Models, datasets, tools, repos, threads, stories and constellations you bookmarked, in one place." />
      <SavedView />
    </div>
  )
}
