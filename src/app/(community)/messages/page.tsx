import type { Metadata } from "next"
import { MessagesApp } from "@/components/messages/messages-app"

export const metadata: Metadata = {
  title: "Messages",
  description: "Direct messages with other members of Nexverse.",
  robots: { index: false },
}

/** Your conversations. Everything here is private, so it loads in the browser once you are signed in. */
export default function MessagesPage() {
  return <MessagesApp />
}
