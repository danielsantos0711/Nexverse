import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

export function generateStaticParams() {
  return resourceParams("dataset")
}

export async function generateMetadata({ params }: PageProps<"/datasets/[slug]">): Promise<Metadata> {
  return { title: resourceTitle("dataset", (await params).slug) }
}

export default function Page({ params }: PageProps<"/datasets/[slug]">) {
  return <ResourceDetailPage kind="dataset" params={params} />
}
