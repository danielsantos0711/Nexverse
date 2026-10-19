import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PlusIcon, SendIcon } from "lucide-react"
import { PageTitle } from "@/components/hub/bits"
import { MemberNews } from "@/components/hub/member-news"
import { HowWeReport, NewsFront, NewsFrontSkeleton } from "@/components/news/news-front"
import { TipForm } from "@/components/news/tip-form"

export const metadata: Metadata = {
  title: "News",
  description: "Nexverse's own newsroom: short, sourced stories on AI launches, research, policy, industry and tools, with rumours clearly labelled. Plus the stories members shared.",
}

export default function NewsPage() {
  return (
    <div className="shell pb-20">
      <PageTitle
        eyebrow="The Nexverse newsroom"
        title="News"
        lead="What changed in AI, written up from the official sources and checked by an editor. Rumours and leaks are always marked unconfirmed."
      >
        <div className="mt-1 flex flex-wrap gap-2">
          <a href="#tip" className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <SendIcon aria-hidden className="size-4" /> Send a tip
          </a>
          <Link href="/share?kind=news" className="pressable glass inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <PlusIcon aria-hidden className="size-4" /> Share a story
          </Link>
        </div>
      </PageTitle>

      <Suspense fallback={<NewsFrontSkeleton />}>
        <NewsFront />
      </Suspense>

      <section aria-labelledby="community-h" className="mt-16 border-t border-border pt-10">
        <div className="mb-5 flex flex-col gap-1">
          <h2 id="community-h" className="text-xl font-semibold md:text-2xl">
            From the community
          </h2>
          <p className="text-sm text-muted-foreground">Links members shared, each with a line on why it matters. These are members&apos; picks, not newsroom stories.</p>
        </div>
        <MemberNews />
      </section>

      <section aria-labelledby="how-h" className="mt-16 border-t border-border pt-10">
        <h2 id="how-h" className="mb-5 text-xl font-semibold md:text-2xl">
          How the newsroom works
        </h2>
        <HowWeReport />
      </section>

      <section id="tip" aria-labelledby="tip-h" className="mt-16 scroll-mt-24 border-t border-border pt-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-2">
            <h2 id="tip-h" className="text-xl font-semibold md:text-2xl">
              Send a tip
            </h2>
            <p className="max-w-[48ch] text-muted-foreground">
              Saw a launch, a policy change or a leak the newsroom should look at? Send it to the editors. They check it against official sources first, and anything unconfirmed is published as such.
            </p>
          </div>
          <TipForm />
        </div>
      </section>
    </div>
  )
}
