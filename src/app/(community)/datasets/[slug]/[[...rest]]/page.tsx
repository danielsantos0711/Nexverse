import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

// One sample id lets the route be checked at build time; real projects and links load in the browser.
export function generateStaticParams() {
  return resourceParams()
}

export const metadata: Metadata = { title: resourceTitle("dataset") }

export default function Page({ params }: PageProps<"/datasets/[slug]/[[...rest]]">) {
  return <ResourceDetailPage kind="dataset" params={params} />
}
