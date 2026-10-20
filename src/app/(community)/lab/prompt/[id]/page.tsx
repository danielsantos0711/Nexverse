import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { SharedPrompt } from "@/components/lab/shared-prompt"
import { Copy } from "@/components/content/copy"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Shared prompts live in the database and are read in the browser; this sample only satisfies the build.
export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = {
  title: "Shared prompt · Lab",
  description: "A prompt shared from the Nexverse Prompt playground. Open it to run it on the free models or copy it.",
}

export default function Page({ params }: PageProps<"/lab/prompt/[id]">) {
  return (
    <div className="shell pb-16">
      <nav aria-label="Breadcrumb" className="pt-8 text-sm text-muted-foreground md:pt-10">
        <Link href="/lab" className="hover:text-foreground">
          <Copy k="lab-prompt.page.lab">Lab</Copy>
        </Link>
        <span aria-hidden className="px-1.5 opacity-50">
          /
        </span>
        <Link href="/lab/prompts" className="hover:text-foreground">
          <Copy k="lab-prompt.page.prompt-playground">Prompt playground</Copy>
        </Link>
        <span aria-hidden className="px-1.5 opacity-50">
          /
        </span>
        <span className="text-foreground/80"><Copy k="lab-prompt.page.shared-prompt">Shared prompt</Copy></span>
      </nav>
      <Suspense fallback={<PageSkeleton />}>
        <Prompt params={params} />
      </Suspense>
    </div>
  )
}

async function Prompt({ params }: { params: PageProps<"/lab/prompt/[id]">["params"] }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return <SharedPrompt id={id} />
}
