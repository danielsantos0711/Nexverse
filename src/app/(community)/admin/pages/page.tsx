import type { Metadata } from "next"
import { PagesAdmin } from "@/components/admin/pages-admin"

export const metadata: Metadata = { title: "Pages" }

export default function AdminPagesPage() {
  return <PagesAdmin />
}
