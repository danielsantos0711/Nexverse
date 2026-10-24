import type { Metadata } from "next"
import Link from "next/link"
import { FolderPlusIcon, SparklesIcon } from "lucide-react"
import { NewRepo } from "@/components/code/new-repo"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/code/new", { title: "New repository · Code" })
}

export default function NewRepoPage() {
  return (
    <div className="shell max-w-3xl pb-16">
      <ForumHeader backdrop="circuit" k="code-new.header"
        title="Create a repository"
        lead="A repository holds your project's files and their full history. Start with a README, a licence and a .gitignore, then upload or edit files in the browser."
        crumbs={[{ label: "Code", href: "/code" }, { label: "New repository" }]}
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <FolderPlusIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <Link href="/new/project?code=1&type=other" className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm transition-colors hover:border-white/20">
        <SparklesIcon aria-hidden className="size-4 shrink-0 text-ion" />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">Publishing a model, dataset, tool or app?</span> Start a project instead: it gets this repository as its Code tab, plus a card, files, activity and discussions.
        </span>
      </Link>
      <NewRepo />
    </div>
  )
}
