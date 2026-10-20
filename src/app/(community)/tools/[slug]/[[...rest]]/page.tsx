import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

// One sample id lets the route be checked at build time; real projects and links load in the browser.
export function generateStaticParams() {
  return resourceParams()
}

export const metadata: Metadata = { title: resourceTitle("tool") }

export default function Page({ params }: PageProps<"/tools/[slug]/[[...rest]]">) {
  return <ResourceDetailPage kind="tool" params={params} />
}
