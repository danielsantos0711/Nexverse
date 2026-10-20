import type { Metadata } from "next"
import { ForYouFeed } from "@/components/for-you/for-you-feed"
import { PageTitle } from "@/components/hub/bits"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/for-you", { title: "For you", description: "Projects, threads, news, events, missions and people picked from what you follow and care about on Nexverse.", robots: { index: false } })
}

export default function ForYouPage() {
  return (
    <div className="shell pb-16">
      <PageTitle k="for-you.header" title="For you" lead="Your corner of the universe: what the people and categories you follow made, events and missions coming up, and people worth following. Every card says why it is here." />
      <ForYouFeed />
    </div>
  )
}
