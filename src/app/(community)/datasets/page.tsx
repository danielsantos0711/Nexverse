import type { Metadata } from "next"
import { ResourceListPage } from "@/components/hub/resource-pages"
import { KINDS } from "@/lib/data"

export const metadata: Metadata = { title: KINDS.dataset.plural, description: KINDS.dataset.blurb }

export default function Page({ searchParams }: PageProps<"/datasets">) {
  return <ResourceListPage kind="dataset" searchParams={searchParams} />
}
