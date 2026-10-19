import type { Metadata } from "next"
import { LockIcon, SparklesIcon } from "lucide-react"
import { PageTitle } from "@/components/hub/bits"
import { LabHeroFx, LabIndex } from "@/components/lab/lab-index"
import { LAB_TOOLS } from "@/components/lab/tools"

export const metadata: Metadata = {
  title: "Lab",
  description:
    "Free tools for building with AI: a prompt playground on free models, token counter, inference cost, VRAM and fine-tuning calculators, RAG chunk planner, JSON Schema builder, regex tester, licence comparator and more.",
}

export default function Page() {
  const local = LAB_TOOLS.filter((t) => !t.usesAi).length
  return (
    <div className="shell pb-16">
      <div className="relative isolate">
        <LabHeroFx />
        <PageTitle
          eyebrow="Lab"
          title="Tools for building with AI"
          lead="Quick, honest answers to the questions that come up every week: what will it cost, will it fit, how should I split it, can I use it. Run prompts on free models and compare them side by side."
        >
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <LockIcon aria-hidden className="size-3.5" />
              {local} of {LAB_TOOLS.length} tools run entirely in your browser; nothing you type is sent anywhere.
            </p>
            <p className="flex items-center gap-1.5">
              <SparklesIcon aria-hidden className="size-3.5" />
              The prompt playground uses the site&rsquo;s free AI models and needs a free account to run.
            </p>
          </div>
        </PageTitle>
      </div>
      <LabIndex />
    </div>
  )
}
