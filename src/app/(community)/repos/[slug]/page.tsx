import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

export function generateStaticParams() {
  return resourceParams()
}

export const metadata: Metadata = { title: resourceTitle("repo") }

export default function Page({ params }: PageProps<"/repos/[slug]">) {
  return <ResourceDetailPage kind="repo" params={params} />
}
