import type { Metadata } from "next"
import { SettingsIndex } from "@/components/admin/settings-forms"

export const metadata: Metadata = { title: "Site settings" }

export default function AdminSettingsPage() {
  return <SettingsIndex />
}
