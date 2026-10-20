import type { Metadata } from "next"
import { DownloadCloudIcon } from "lucide-react"
import { ImportRepo } from "@/components/code/import-repo"
import { ForumHeader } from "@/components/forum/forum-header"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/code/import", { title: "Import from GitHub · Code" })
}

export default function ImportPage() {
  return (
    <div className="shell max-w-3xl pb-16">
      <ForumHeader k="code-import.header"
        title="Import a repository from GitHub"
        lead="Bring a public GitHub repository to Nexverse. We copy the files of one branch as your first commit, so you can keep working on it here with branches, issues and pull requests."
        crumbs={[{ label: "Code", href: "/code" }, { label: "Import" }]}
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <DownloadCloudIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <ImportRepo />
    </div>
  )
}
