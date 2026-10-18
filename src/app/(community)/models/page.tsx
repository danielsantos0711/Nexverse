import type { Metadata } from "next"
import { ResourceListPage } from "@/components/hub/resource-pages"
import { KINDS } from "@/lib/data"

export const metadata: Metadata = { title: KINDS.model.plural, description: KINDS.model.blurb }

export default function Page() {
  return <ResourceListPage kind="model" />
}
