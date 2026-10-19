import type { Metadata } from "next"
import { AdminLog } from "@/components/admin/mod-log"

export const metadata: Metadata = { title: "Moderation log" }

export default function AdminLogPage() {
  return <AdminLog />
}
