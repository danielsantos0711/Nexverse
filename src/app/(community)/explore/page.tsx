import type { Metadata } from "next"
import { ResourceListPage } from "@/components/hub/resource-pages"

export const metadata: Metadata = { title: "Explore" }

export default function Page() {
  return <ResourceListPage />
}
