import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

export function generateStaticParams() {
  return resourceParams()
}

export const metadata: Metadata = { title: resourceTitle("model") }

export default function Page({ params }: PageProps<"/models/[slug]">) {
  return <ResourceDetailPage kind="model" params={params} />
}
