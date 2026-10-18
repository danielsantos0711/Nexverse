import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

export function generateStaticParams() {
  return resourceParams("repo")
}

export async function generateMetadata({ params }: PageProps<"/repos/[slug]">): Promise<Metadata> {
  return { title: resourceTitle("repo", (await params).slug) }
}

export default function Page({ params }: PageProps<"/repos/[slug]">) {
  return <ResourceDetailPage kind="repo" params={params} />
}
