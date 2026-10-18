import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { DetailSkeleton } from "@/components/live/detail"
import { HfFileView, HfView } from "@/components/live/hf-item"
import { hfItem } from "@/lib/live/hub"
import { filePath, HF_KIND, isHfId, isHfPlural, segment } from "@/lib/live/ids"

/** One sample, so the shell is prerendered; every other item renders on request. */
export function generateStaticParams() {
  return [{ kind: "models", id: ["openai-community", "gpt2"] }]
}


type Params = Promise<{ kind: string; id: string[] }>

/** /hf/models/<owner>/<name> or /hf/models/<owner>/<name>/blob/<path…> (also datasets, spaces). */
async function read(params: Params) {
  const p = await params
  if (!isHfPlural(p.kind) || p.id.length < 2) return null
  const [owner, name] = [segment(p.id[0]), segment(p.id[1])]
  if (!owner || !name || !isHfId(owner, name)) return null
  const kind = HF_KIND[p.kind]
  const id = `${owner}/${name}`
  if (p.id.length === 2) return { kind, id, path: null }
  if (p.id[2] !== "blob" || p.id.length < 4) return null
  const path = filePath(p.id.slice(3))
  return path ? { kind, id, path } : null
}

const LABEL = { model: "model", dataset: "dataset", space: "Space" } as const

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await read(params)
  if (!p) return { title: "Not found" }
  if (p.path) return { title: `${p.path} · ${p.id}`, description: `${p.path} in the ${LABEL[p.kind]} ${p.id}, on Nexverse.` }
  const res = await hfItem(p.kind, p.id)
  const title = res.ok && res.data.kind === "space" && res.data.title ? `${res.data.title} (${p.id})` : p.id
  return {
    title,
    description: (res.ok && res.data.description) || `The ${LABEL[p.kind]} ${p.id} on Nexverse: card, files and numbers, and a place to discuss it.`,
  }
}

async function View({ params }: { params: Params }) {
  const p = await read(params)
  if (!p) notFound()
  return p.path ? <HfFileView kind={p.kind} id={p.id} path={p.path} /> : <HfView kind={p.kind} id={p.id} />
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <View params={params} />
    </Suspense>
  )
}
