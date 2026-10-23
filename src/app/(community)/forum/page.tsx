import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { SquarePenIcon } from "lucide-react"
import { primaryButton } from "@/components/forum/forum-ui"
import { ForumIndex, LegacyCategoryRedirect } from "@/components/forum/forum-index"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/forum", { title: "Forum", description: "Discussions for people building with AI, organised by category, in any language." })
}

export default function ForumPage() {
  return (
    <div className="sd-flow shell pb-16">
      <ForumHeader k="forum.header" title="Forum" lead="Discussions by category, in whatever language you think in.">
        <Link href="/forum/new" className={primaryButton}>
          <SquarePenIcon aria-hidden className="size-4" /> Start a thread
        </Link>
      </ForumHeader>
      <ForumIndex />
      {/* Old links (/forum?c=<slug>) read the query in the browser and move to /forum/c/<slug>. */}
      <Suspense fallback={null}>
        <LegacyCategoryRedirect />
      </Suspense>
    </div>
  )
}
