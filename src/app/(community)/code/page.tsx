import type { Metadata } from "next"
import { Suspense } from "react"
import { CodeExplore } from "@/components/code/explore"
import { CodeHero } from "@/components/code/hero"
import { Skeleton } from "@/components/ui/skeleton"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/code", {
    title: "Code",
    description: "Git-style repositories on Nexverse: commits, branches, pull requests, issues and releases, linked to the models, datasets and discussions they belong to.",
  })
}

export default function CodePage() {
  return (
    <div data-flow="clip" className="sd-flow shell max-w-6xl pb-16">
      <CodeHero />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <CodeExplore />
      </Suspense>
    </div>
  )
}
