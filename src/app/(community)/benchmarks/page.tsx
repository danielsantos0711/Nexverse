import type { Metadata } from "next"
import { GaugeIcon } from "lucide-react"
import { BenchmarksIndex } from "@/components/benchmarks/benchmarks-index"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/benchmarks", {
    title: "Benchmarks",
    description: "Evaluation results submitted by members, with their settings and logs, and checked by others who ran them again.",
  })
}

export default function BenchmarksPage() {
  return (
    <div className="shell max-w-5xl pb-16">
      <ForumHeader k="benchmarks.header"
        title="Benchmarks"
        lead="Evaluation results from members, with the settings and logs to run them again. A result is verified once other members reproduce it."
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <GaugeIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <BenchmarksIndex />
    </div>
  )
}
