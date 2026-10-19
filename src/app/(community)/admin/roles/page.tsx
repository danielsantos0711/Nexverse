import type { Metadata } from "next"
import { RolesAdmin } from "@/components/admin/roles-admin"

export const metadata: Metadata = { title: "Roles and powers" }

export default function AdminRolesPage() {
  return <RolesAdmin />
}
