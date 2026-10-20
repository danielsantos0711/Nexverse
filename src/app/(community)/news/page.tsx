import type { Metadata } from "next"
import { AreaCrumbs } from "@/components/site/area-crumbs"
import Link from "next/link"
import { Suspense } from "react"
import { PlusIcon, SendIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { PageTitle } from "@/components/hub/bits"
import { MemberNews } from "@/components/hub/member-news"
import { HowWeReport, NewsFront, NewsFrontSkeleton } from "@/components/news/news-front"
import { TipForm } from "@/components/news/tip-form"

export const metadata: Metadata = {
  title: "News",
  description: "Nexverse's own newsroom: researched, sourced stories on AI launches, research, policy, industry and tools, with every claim cited and rumours clearly labelled. Plus the stories members shared.",
}

export default function NewsPage() {
  return (
    <div className="shell pb-20">
      <PageTitle
        k="news.header"
        eyebrow={<span className="flex flex-wrap items-center gap-x-2.5 gap-y-1"><AreaCrumbs /><span aria-hidden className="opacity-40">·</span><Copy k="news.header.eyebrow">The Nexverse newsroom</Copy></span>}
        title="News"
        lead="What changed in AI, researched from the official sources, cited claim by claim and checked by an editor. Rumours and leaks are always marked unconfirmed."
      >
        <div className="mt-1 flex flex-wrap gap-2">
          <a href="#tip" className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <SendIcon aria-hidden className="size-4" /> <Copy k="news.header.tip">Send a tip</Copy>
          </a>
          <Link href="/share?kind=news" className="pressable glass inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <PlusIcon aria-hidden className="size-4" /> <Copy k="news.header.share">Share a story</Copy>
          </Link>
        </div>
      </PageTitle>

      <Suspense fallback={<NewsFrontSkeleton />}>
        <NewsFront />
      </Suspense>

      <section aria-labelledby="community-h" className="mt-16 border-t border-border pt-10">
        <div className="mb-5 flex flex-col gap-1">
          <h2 id="community-h" className="text-xl font-semibold md:text-2xl">
            <Copy k="news.community.title">From the community</Copy>
          </h2>
          <Copy k="news.community.lead" as="p" className="text-sm text-muted-foreground">
            Links members shared, each with a line on why it matters. These are members&apos; picks, not newsroom stories.
          </Copy>
        </div>
        <MemberNews />
      </section>

      <section aria-labelledby="how-h" className="mt-16 border-t border-border pt-10">
        <h2 id="how-h" className="mb-5 text-xl font-semibold md:text-2xl">
          <Copy k="news.how.title">How the newsroom works</Copy>
        </h2>
        <HowWeReport />
      </section>

      <section id="tip" aria-labelledby="tip-h" className="mt-16 scroll-mt-24 border-t border-border pt-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-2">
            <h2 id="tip-h" className="text-xl font-semibold md:text-2xl">
              <Copy k="news.tip.title">Send a tip</Copy>
            </h2>
            <Copy k="news.tip.lead" as="p" className="max-w-[48ch] text-muted-foreground" multiline>
              Saw a launch, a policy change or a leak the newsroom should look at? Send it to the editors. They check it against official sources first, and anything unconfirmed is published as such.
            </Copy>
          </div>
          <TipForm />
        </div>
      </section>
    </div>
  )
}
