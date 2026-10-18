import type { Metadata } from "next"
import { ChatApp } from "@/components/chat/chat-app"

export const metadata: Metadata = {
  title: "Chat",
  description: "Live rooms for AI builders: models, agents, local AI, datasets, papers and more.",
}

/** The chat opens in the lobby. */
export default function ChatPage() {
  return <ChatApp slug="general" />
}
