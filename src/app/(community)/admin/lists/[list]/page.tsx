import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { getListDef, LISTS } from "@/lib/lists/registry"
import { ListEditorPage } from "../_components/list-editor"

export function generateStaticParams() {
  return LISTS.map((l) => ({ list: l.slug }))
}

// Static, so reading params stays inside the Suspense boundary and the shell can be prefetched.
export const metadata: Metadata = { title: "Curated lists" }

export default function AdminListPage({ params }: PageProps<"/admin/lists/[list]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <List params={params} />
    </Suspense>
  )
}

async function List({ params }: { params: PageProps<"/admin/lists/[list]">["params"] }) {
  const { list } = await params
  if (!getListDef(list)) notFound()
  return <ListEditorPage slug={list} />
}
