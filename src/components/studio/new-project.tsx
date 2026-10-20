"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeftIcon, PencilLineIcon } from "lucide-react"
import { ImportPanel } from "@/components/studio/import-panel"
import { ProjectEditor } from "@/components/studio/project-editor"
import { StudioHead } from "@/components/studio/ui"

/** /new/project: start a project from scratch (the editor), or with ?import=1 bring one in from another site. */
export function NewProject() {
  const params = useSearchParams()
  if (params.get("import") !== "1") return <ProjectEditor />
  return (
    <div className="shell max-w-3xl pb-24">
      <StudioHead
        eyebrow={
          <Link href="/studio" className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground">
            <ArrowLeftIcon aria-hidden className="size-3.5" /> Your studio
          </Link>
        }
        title="Import a model or dataset"
        lead="Bring a public model or dataset from Hugging Face, or a model from OpenRouter, onto Nexverse. Its card, details and a few small files become a project you own, with a credit to where it came from."
      >
        <Link href="/new/project" className="pressable inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm hover:border-white/20">
          <PencilLineIcon aria-hidden className="size-4" /> Start from scratch
        </Link>
      </StudioHead>
      <ImportPanel />
    </div>
  )
}
