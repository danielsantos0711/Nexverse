import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ChatApp } from "@/components/chat/chat-app"
import { ChatSkeleton } from "@/components/chat/chat-skeleton"
import { DEFAULT_ROOMS, ROOM_SLUG } from "@/lib/chat"

// The starting rooms are prerendered; rooms members open later render on first visit.
export function generateStaticParams() {
  return DEFAULT_ROOMS.map((r) => ({ room: r.slug }))
}

export async function generateMetadata({ params }: PageProps<"/chat/[room]">): Promise<Metadata> {
  const { room } = await params
  const known = DEFAULT_ROOMS.find((r) => r.slug === room)
  return { title: `${known?.name ?? room} · Chat`, description: known?.topic }
}

export default function ChatRoomPage({ params }: PageProps<"/chat/[room]">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Room params={params} />
    </Suspense>
  )
}

async function Room({ params }: { params: PageProps<"/chat/[room]">["params"] }) {
  const { room } = await params
  if (!ROOM_SLUG.test(room)) notFound()
  return <ChatApp slug={room} />
}
