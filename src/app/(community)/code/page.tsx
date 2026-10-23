import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { DownloadCloudIcon, FolderGit2Icon, GitBranchIcon, PlusIcon, UsersIcon } from "lucide-react"
import { CodeExplore } from "@/components/code/explore"
import { GitHubTab } from "@/components/code/github-tab"
import { ResourceIndex } from "@/components/hub/resource-index"
import { RowsSkeleton } from "@/components/live/skeletons"
import { LinkTabs } from "@/components/site/link-tabs"
import { PageHead } from "@/components/site/page-head"
import { AreaCrumbs } from "@/components/site/area-crumbs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/code", {
    title: "Code",
    description: "Code on Nexverse: repositories with commits, branches, issues and releases, the repos members shared, and open-source AI on GitHub, all readable here.",
  })
}

/*
 * One Code area (round 12, Daniel: "ve se ha paginas que fazem a mesma coisa e junta-as"). It was three pages:
 *   /code       repositories hosted on Nexverse          now the first tab
 *   /repos      repo projects and links members shared   now ?from=members (/repos redirects here)
 *   /gh/topics  open-source AI on GitHub, by topic       now ?from=github  (/gh/topics redirects here)
 * Every GitHub repository opens inside Nexverse (/gh/<owner>/<repo>). One way to publish: a project with a code
 * repository (the Create sheet's "Project"); an empty repository and an import from GitHub stay one click away.
 */
type From = "nexverse" | "members" | "github"

export default function CodePage({ searchParams }: PageProps<"/code">) {
  return (
    <div data-flow="clip" className="sd-flow shell pb-16">
      <PageHead
        k="code.header"
        crumbs={<AreaCrumbs />}
        title="Code"
        lead="Repositories with their full history, the repos members shared, and GitHub, all read here."
        actions={
          <>
            <Button nativeButton={false} render={<Link href="/new/project?type=other&code=1" />}>
              <PlusIcon aria-hidden /> Publish code
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/code/import" />}>
              <DownloadCloudIcon aria-hidden /> Import from GitHub
            </Button>
          </>
        }
      >
        <Suspense fallback={<Skeleton className="h-10 w-80 max-w-full rounded-full" />}>
          <Tabs searchParams={searchParams} />
        </Suspense>
      </PageHead>
      <Suspense fallback={<RowsSkeleton rows={4} />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function from(searchParams: PageProps<"/code">["searchParams"]): Promise<From> {
  const f = (await searchParams).from
  return f === "members" || f === "github" ? f : "nexverse"
}

async function Tabs({ searchParams }: { searchParams: PageProps<"/code">["searchParams"] }) {
  const f = await from(searchParams)
  return (
    <LinkTabs
      label="Where the code is"
      current={f === "nexverse" ? "/code" : `/code?from=${f}`}
      tabs={[
        { href: "/code", label: "On Nexverse", icon: FolderGit2Icon },
        { href: "/code?from=members", label: "Shared by members", icon: UsersIcon },
        { href: "/code?from=github", label: "GitHub", icon: GitBranchIcon },
      ]}
    />
  )
}

async function Body({ searchParams }: { searchParams: PageProps<"/code">["searchParams"] }) {
  const f = await from(searchParams)
  if (f === "github") return <GitHubTab />
  if (f === "members") return <ResourceIndex kind="repo" />
  return (
    <div className="flex flex-col gap-3">
      <CodeExplore />
      <p className="text-xs text-muted-foreground">
        Want a bare repository without a project page?{" "}
        <Link href="/code/new" className="text-ion hover:underline">
          Create an empty repository
        </Link>
      </p>
    </div>
  )
}
