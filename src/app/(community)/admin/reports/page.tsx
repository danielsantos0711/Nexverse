import type { Metadata } from "next"
import { AdminReports } from "@/components/admin/reports"

export const metadata: Metadata = { title: "Reports" }

export default function AdminReportsPage() {
  return <AdminReports />
}
