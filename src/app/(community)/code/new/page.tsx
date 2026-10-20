import type { Metadata } from "next"
import { FolderPlusIcon } from "lucide-react"
import { NewRepo } from "@/components/code/new-repo"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/code/new", { title: "New repository · Code" })
}

export default function NewRepoPage() {
  return (
    <div className="shell max-w-3xl pb-16">
      <ForumHeader k="code-new.header"
        title="Create a repository"
        lead="A repository holds your project's files and their full history. Start with a README, a licence and a .gitignore, then upload or edit files in the browser."
        crumbs={[{ label: "Code", href: "/code" }, { label: "New repository" }]}
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <FolderPlusIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <NewRepo />
    </div>
  )
}
