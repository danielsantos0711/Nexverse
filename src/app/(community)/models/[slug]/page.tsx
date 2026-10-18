import type { Metadata } from "next"
import { ResourceDetailPage, resourceParams, resourceTitle } from "@/components/hub/resource-pages"

export function generateStaticParams() {
  return resourceParams("model")
}

export async function generateMetadata({ params }: PageProps<"/models/[slug]">): Promise<Metadata> {
  return { title: resourceTitle("model", (await params).slug) }
}

export default function Page({ params }: PageProps<"/models/[slug]">) {
  return <ResourceDetailPage kind="model" params={params} />
}
