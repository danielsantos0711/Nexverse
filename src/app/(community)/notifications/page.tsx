import type { Metadata } from "next"
import { PageTitle } from "@/components/hub/bits"
import { NotificationsView } from "@/components/social/notifications-view"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/notifications", { title: "Notifications", robots: { index: false } })
}

export default function NotificationsPage() {
  return (
    <div className="shell max-w-3xl">
      <PageTitle k="notifications.header" title="Notifications" lead="Replies to your threads, upvotes and new followers, as they happen." />
      <NotificationsView />
    </div>
  )
}
