import type { Metadata } from "next"
import { MenusAdmin } from "@/components/admin/menus-admin"

export const metadata: Metadata = { title: "Menus" }

export default function AdminMenusPage() {
  return <MenusAdmin />
}
