import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { DetailSkeleton } from "@/components/live/detail"
import { RepoView } from "@/components/live/gh-repo"
import { ghRepo } from "@/lib/live/github"
import { isGhOwner, isGhRepo } from "@/lib/live/ids"

/** One sample, so the shell is prerendered; every other item renders on request. */
export function generateStaticParams() {
  return [{ owner: "danielsantos0711", repo: "Nexverse" }]
}


type Params = Promise<{ owner: string; repo: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { owner, repo } = await params
  if (!isGhOwner(owner) || !isGhRepo(repo)) return { title: "Repository not found" }
  const res = await ghRepo(owner, repo)
  const name = res.ok ? res.data.fullName : `${owner}/${repo}`
  return {
    title: name,
    description: (res.ok && res.data.description) || `${name} on Nexverse: README, files, commits and releases, and a place to discuss it.`,
  }
}

async function Repo({ params }: { params: Params }) {
  const { owner, repo } = await params
  if (!isGhOwner(owner) || !isGhRepo(repo)) notFound()
  return <RepoView owner={owner} repo={repo} />
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Repo params={params} />
    </Suspense>
  )
}
