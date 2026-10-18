import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

export function generateStaticParams() {
  return resourceParams("tool")
}

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">): Promise<Metadata> {
  return { title: resourceTitle("tool", (await params).slug) }
}

export default function Page({ params }: PageProps<"/tools/[slug]">) {
  return <ResourceDetailPage kind="tool" params={params} />
}
