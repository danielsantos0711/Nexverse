import type { Metadata } from "next"
import { ResourceListPage } from "@/components/hub/resource-pages"

export const metadata: Metadata = { title: "Explore", description: "Every model, dataset, tool and repo members published or shared on Nexverse, next to what is rising on GitHub." }

export default function Page() {
  return <ResourceListPage />
}
