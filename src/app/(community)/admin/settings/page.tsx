import { redirect } from "next/navigation"

// Site settings are tabs of Appearance, Menus and Access now; the old index opens the first one.
export default function AdminSettingsPage() {
  redirect("/admin/settings/brand")
}
