import type { Metadata } from "next"
import { ForumAdmin } from "@/components/admin/forum-admin"

export const metadata: Metadata = { title: "Forum" }

export default function AdminForumPage() {
  return <ForumAdmin />
}
