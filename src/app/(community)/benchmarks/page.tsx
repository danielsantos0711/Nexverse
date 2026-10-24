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
    <div data-flow="clip" className="sd-flow shell max-w-5xl pb-16">
      <ForumHeader backdrop="pixels" k="benchmarks.header"
        title="Benchmarks"
        lead="Eval results with the settings to run them again, verified when others reproduce them."
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
