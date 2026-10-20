import type { Metadata } from "next"
import { ListsIndex } from "./_components/lists-index"

export const metadata: Metadata = { title: "Curated lists" }

export default function AdminListsPage() {
  return <ListsIndex />
}
