import type { Metadata } from "next"
import { ChatAdmin } from "@/components/admin/chat-admin"

export const metadata: Metadata = { title: "Chat rooms" }

export default function AdminChatPage() {
  return <ChatAdmin />
}
