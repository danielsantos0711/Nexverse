import type { Metadata } from "next"
import { PageTitle } from "@/components/hub/bits"
import { SavedView } from "@/components/social/saved-view"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/saved", { title: "Saved", description: "Everything you bookmarked on Nexverse.", robots: { index: false } })
}

export default function SavedPage() {
  return (
    <div data-flow="tilt" className="sd-flow shell max-w-5xl">
      <PageTitle k="saved.header" title="Saved" lead="Everything you bookmarked, in one place." />
      <SavedView />
    </div>
  )
}
