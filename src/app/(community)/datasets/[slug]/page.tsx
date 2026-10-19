import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

export function generateStaticParams() {
  return resourceParams()
}

export const metadata: Metadata = { title: resourceTitle("dataset") }

export default function Page({ params }: PageProps<"/datasets/[slug]">) {
  return <ResourceDetailPage kind="dataset" params={params} />
}
