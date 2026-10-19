import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { MessagesApp } from "@/components/messages/messages-app"

// Conversations are private and load in the browser. One placeholder id lets the route be checked at build
// time; it renders the "not here" state, and real ids render on first visit.
export function generateStaticParams() {
  return [{ id: "00000000-0000-4000-8000-000000000000" }]
}

// Same rule as isConversationId in lib/messages (which pulls in React hooks, so it stays out of server code).
const CONVERSATION_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|local-[a-z0-9-]{1,60})$/i

export const metadata: Metadata = { title: "Messages", robots: { index: false } }

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <Suspense fallback={<MessagesApp />}>
      <Conversation params={params} />
    </Suspense>
  )
}

async function Conversation({ params }: { params: PageProps<"/messages/[id]">["params"] }) {
  const { id } = await params
  if (!CONVERSATION_ID.test(id)) notFound()
  return <MessagesApp id={id.toLowerCase()} />
}
