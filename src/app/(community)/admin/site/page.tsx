import type { Metadata } from "next"
import { SiteEditor } from "@/components/content/site-editor"

export const metadata: Metadata = { title: "Site editor" }

export default function AdminSitePage() {
  return <SiteEditor />
}
