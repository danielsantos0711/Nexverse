import type { Metadata } from "next"
import { SettingsView } from "@/components/settings/settings-view"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/settings", { title: "Settings", description: "Your profile, interests, notifications and account.", robots: { index: false } })
}

export default function SettingsPage() {
  return (
    <div className="shell max-w-5xl">
      <SettingsView />
    </div>
  )
}
