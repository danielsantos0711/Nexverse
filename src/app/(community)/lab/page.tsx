import type { Metadata } from "next"
import { LockIcon } from "lucide-react"
import { PageTitle } from "@/components/hub/bits"
import { LabHeroFx, LabIndex } from "@/components/lab/lab-index"
import { getLabTools } from "@/lib/lists/server"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/lab", {
    title: "Lab",
    description:
      "Free tools for building with AI: a prompt playground on free models, token counter, inference cost, VRAM and fine-tuning calculators, RAG chunk planner, JSON Schema builder, regex tester, licence comparator and more.",
  })
}

export default async function Page() {
  // The tools admins left switched on (/admin/lists).
  const LAB_TOOLS = await getLabTools()
  const local = LAB_TOOLS.filter((t) => !t.usesAi).length
  return (
    <div data-flow="zoom" className="sd-flow shell pb-16">
      <div className="relative isolate">
        <LabHeroFx />
        <PageTitle k="lab.header"
          title="Lab"
          lead="Free tools for building with AI: cost, VRAM, tokens, prompts and more."
        >
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" title="The prompt playground uses the site's free AI models and needs a free account.">
            <LockIcon aria-hidden className="size-3.5" />
            {local} of {LAB_TOOLS.length} run in your browser only
          </p>
        </PageTitle>
      </div>
      <LabIndex />
    </div>
  )
}
