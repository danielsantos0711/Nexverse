import type { Metadata } from "next"
import Link from "next/link"
import { BarChart3Icon, PlusIcon, SwordsIcon } from "lucide-react"
import { ArenaView } from "@/components/arena/arena-view"
import { ForumHeader } from "@/components/forum/forum-header"
import { primaryButton } from "@/components/forum/forum-ui"

export const metadata: Metadata = {
  title: "Arena",
  description: "Blind duels between models. Read two answers to the same prompt, vote for the better one, then see which models wrote them.",
}

export default function ArenaPage() {
  return (
    <div className="shell max-w-5xl pb-16">
      <ForumHeader
        title="Arena"
        lead="Two answers to the same prompt, model names hidden. Vote for the better one, then see who wrote them. Every vote moves the ratings."
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <SwordsIcon aria-hidden className="size-5" />
          </span>
        }
      >
        <Link
          href="/arena/ratings"
          className="pressable inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <BarChart3Icon aria-hidden className="size-4" /> Ratings
        </Link>
        <Link href="/arena/new" className={primaryButton}>
          <PlusIcon aria-hidden className="size-4" /> Post a duel
        </Link>
      </ForumHeader>
      <ArenaView />
    </div>
  )
}
