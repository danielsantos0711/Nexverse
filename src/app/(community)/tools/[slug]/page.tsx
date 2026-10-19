import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

export function generateStaticParams() {
  return resourceParams()
}

export const metadata: Metadata = { title: resourceTitle("tool") }

export default function Page({ params }: PageProps<"/tools/[slug]">) {
  return <ResourceDetailPage kind="tool" params={params} />
}
