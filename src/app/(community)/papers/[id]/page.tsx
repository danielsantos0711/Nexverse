import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { DetailSkeleton } from "@/components/live/detail"
import { PaperView } from "@/components/live/paper-view"
import { isArxivId, segment } from "@/lib/live/ids"
import { paperDetail } from "@/lib/live/papers"

/** One sample, so the shell is prerendered; every other item renders on request. */
export function generateStaticParams() {
  return [{ id: "1706.03762" }]
}


type Params = Promise<{ id: string }>

/** New-style ids (2610.21601, 2610.21601v2) arrive as is; old-style ones (hep-th/9901001) arrive percent-encoded. */
async function read(params: Params) {
  const id = segment((await params).id)
  return id && isArxivId(id) ? id : null
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = await read(params)
  if (!id) return { title: "Paper not found" }
  const res = await paperDetail(id)
  if (!res.ok) return { title: `arXiv:${id}` }
  const p = res.data
  const lead = p.tldr || p.summary
  return { title: p.title, description: lead.length > 200 ? `${lead.slice(0, 197).trimEnd()}…` : lead }
}

async function View({ params }: { params: Params }) {
  const id = await read(params)
  if (!id) notFound()
  return <PaperView id={id} />
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <View params={params} />
    </Suspense>
  )
}
