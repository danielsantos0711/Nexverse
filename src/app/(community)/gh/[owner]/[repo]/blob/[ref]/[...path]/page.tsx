import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { DetailSkeleton } from "@/components/live/detail"
import { RepoPathView } from "@/components/live/gh-repo"
import { filePath, isGhOwner, isGhRepo, isGitRef, segment } from "@/lib/live/ids"

/** One sample, so the shell is prerendered; every other item renders on request. */
export function generateStaticParams() {
  return [{ owner: "danielsantos0711", repo: "Nexverse", ref: "main", path: ["README.md"] }]
}


type Params = Promise<{ owner: string; repo: string; ref: string; path: string[] }>

async function read(params: Params) {
  const p = await params
  const branch = segment(p.ref)
  const path = filePath(p.path)
  if (!isGhOwner(p.owner) || !isGhRepo(p.repo) || !branch || !isGitRef(branch) || !path) return null
  return { owner: p.owner, repo: p.repo, branch, path }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await read(params)
  if (!p) return { title: "Not found" }
  return { title: `${p.path} · ${p.owner}/${p.repo}`, description: `${p.path} in ${p.owner}/${p.repo}, on Nexverse.` }
}

async function View({ params }: { params: Params }) {
  const p = await read(params)
  if (!p) notFound()
  return <RepoPathView {...p} mode="blob" />
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <View params={params} />
    </Suspense>
  )
}
