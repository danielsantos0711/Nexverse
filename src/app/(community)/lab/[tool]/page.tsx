import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { CardBuilder } from "@/components/lab/card-builder"
import { ContextCalculator } from "@/components/lab/context-calculator"
import { EmbeddingSimilarity } from "@/components/lab/embedding-similarity"
import { FineTuneCalculator } from "@/components/lab/fine-tune-calculator"
import { InferenceCost } from "@/components/lab/inference-cost"
import { JsonSchemaBuilder } from "@/components/lab/json-schema-builder"
import { LicenceChecker } from "@/components/lab/licence-checker"
import { LicenceCompare } from "@/components/lab/licence-compare"
import { PromptPlayground } from "@/components/lab/prompt-playground"
import { Quantization } from "@/components/lab/quantization"
import { RagChunker } from "@/components/lab/rag-chunker"
import { RegexTester } from "@/components/lab/regex-tester"
import { TokenCost } from "@/components/lab/token-cost"
import { TokenCounter } from "@/components/lab/token-counter"
import { LAB_TOOLS, labPath, type LabToolSlug } from "@/components/lab/tools"
import { getLabShelves, getLabTools } from "@/lib/lists/server"
import { VramCalculator } from "@/components/lab/vram-calculator"
import { DiscussButton } from "@/components/social/discuss-button"
import { ExplainTool } from "@/components/lab/explain-tool"
import { SaveButton } from "@/components/social/save-button"
import { Copy } from "@/components/content/copy"
import { PageBackdrop } from "@/components/glass/page-backdrop"

const TOOLS: Record<LabToolSlug, () => React.ReactNode> = {
  vram: () => <VramCalculator />,
  tokens: () => <TokenCost />,
  licences: () => <LicenceChecker />,
  "model-card": () => <CardBuilder kind="model" />,
  "dataset-card": () => <CardBuilder kind="dataset" />,
  prompts: () => <PromptPlayground />,
  "token-counter": () => <TokenCounter />,
  context: () => <ContextCalculator />,
  "inference-cost": () => <InferenceCost />,
  "fine-tuning": () => <FineTuneCalculator />,
  quantization: () => <Quantization />,
  "rag-chunks": () => <RagChunker />,
  embeddings: () => <EmbeddingSimilarity />,
  "json-schema": () => <JsonSchemaBuilder />,
  regex: () => <RegexTester />,
  "licence-compare": () => <LicenceCompare />,
}

const EXPLAINED = new Set<LabToolSlug>(["vram", "tokens", "licences", "token-counter", "context", "inference-cost", "fine-tuning", "quantization", "rag-chunks", "embeddings", "regex", "licence-compare", "json-schema"])

export function generateStaticParams() {
  return LAB_TOOLS.map((t) => ({ tool: t.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const tool = (await params).tool
  const t = (await getLabTools()).find((x) => x.slug === tool)
  return t ? { title: `${t.name} · Lab`, description: t.tagline } : { title: "Lab" }
}

export default function Page({ params }: { params: Promise<{ tool: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Tool params={params} />
    </Suspense>
  )
}

async function Tool({ params }: { params: Promise<{ tool: string }> }) {
  const slug = (await params).tool
  // Switched off by an admin (/admin/lists): the page answers "not found", like the Lab index hides it.
  const [tools, shelves] = await Promise.all([getLabTools(), getLabShelves()])
  const t = tools.find((x) => x.slug === slug)
  if (!t) notFound()
  const Icon = t.icon
  // Same category first, then the rest.
  const others = [...tools.filter((x) => x.slug !== t.slug && x.group === t.group), ...tools.filter((x) => x.group !== t.group)]
  const group = shelves.find((c) => c.id === t.group)
  return (
    <div className="nx-detail relative isolate shell pb-16">
      <PageBackdrop variant="pixels" />
      <header className="relative isolate flex flex-col gap-4 pt-8 pb-6 md:pt-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-64 w-screen -translate-x-1/2"
          style={{ background: `radial-gradient(50% 70% at 15% 0%, rgb(${t.tint} / 0.13), transparent 70%)` }}
        />
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/lab" className="hover:text-foreground">
            <Copy k="lab-tool.page.lab">Lab</Copy>
          </Link>
          <span aria-hidden className="px-1.5 opacity-50">
            /
          </span>
          {group && (
            <>
              <span>{group.label}</span>
              <span aria-hidden className="px-1.5 opacity-50">
                /
              </span>
            </>
          )}
          <span className="text-foreground/80">{t.name}</span>
        </nav>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-[68ch] flex-col gap-2">
            <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight md:text-2xl">
              <span className="flex size-8 items-center justify-center rounded-lg ring-1 ring-white/10" style={{ background: `rgb(${t.tint} / 0.12)`, color: `rgb(${t.tint})` }}>
                <Icon aria-hidden className="size-4" />
              </span>
              {t.name}
            </h1>
            <p className="text-[15px] text-muted-foreground">{t.intro}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <SaveButton target={`lab:${t.slug}`} />
            <DiscussButton title={`the ${t.name}`} href={labPath(t.slug)} category={t.category} className="h-9 px-3.5" />
          </div>
        </div>
      </header>

      {/* calculators get "Explain this result"; builders and the playground make text, not numbers to explain */}
      {EXPLAINED.has(t.slug) ? <ExplainTool tool={t.name}>{TOOLS[t.slug]()}</ExplainTool> : TOOLS[t.slug]()}

      <nav aria-label="More Lab tools" className="mt-14 border-t border-border pt-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground"><Copy k="lab-tool.page.more-in-the-lab">More in the Lab</Copy></h2>
        <ul className="flex flex-wrap gap-2">
          {others.map((o) => {
            const OIcon = o.icon
            return (
              <li key={o.slug}>
                <Link
                  href={labPath(o.slug)}
                  className="pressable inline-flex h-9 items-center gap-2 rounded-full border border-border bg-white/[0.02] px-3.5 text-sm text-foreground/85 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <OIcon aria-hidden className="size-3.5" style={{ color: `rgb(${o.tint})` }} />
                  {o.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
