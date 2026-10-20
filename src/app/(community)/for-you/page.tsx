import type { Metadata } from "next"
import { PageTitle } from "@/components/hub/bits"
import { ForYouView } from "@/components/social/for-you-view"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/for-you", { title: "For you", description: "New topics, releases and stories from what you follow and save on Nexverse.", robots: { index: false } })
}

export default function ForYouPage() {
  return (
    <div className="shell max-w-4xl">
      <PageTitle k="for-you.header" title="For you" lead="What is new from the people and categories you follow, and around the things you saved." />
      <ForYouView />
    </div>
  )
}
