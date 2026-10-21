import type { Metadata } from "next"
import { ImportAdmin } from "@/components/admin/import-admin"

export const metadata: Metadata = { title: "Import" }

export default function AdminImportPage() {
  return <ImportAdmin />
}
