"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Loader2Icon, MailIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isUuid, startConversation } from "@/lib/messages"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/**
 * "Message" on a member's profile: opens (or finds) your conversation with them. Signed-out visitors are sent
 * to sign in first. Only real members can be messaged, so it hides itself without a database, for ids that are
 * not member ids, and on your own profile.
 */
export function MessageButton({
  memberId,
  name,
  variant = "outline",
  size = "default",
  className,
}: {
  memberId: string
  /** Their display name, for the button's accessible label. */
  name?: string
  variant?: "outline" | "secondary" | "default" | "ghost"
  size?: "default" | "sm"
  className?: string
}) {
  const router = useRouter()
  const { ready, user } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const label = name ? `Message ${name}` : "Send a message"

  if (!live || !isUuid(memberId)) return null
  if (live && user?.id === memberId) return null

  if (live && ready && !user) {
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(typeof window === "undefined" ? "/messages" : location.pathname)}`}
        aria-label={`Sign in to ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
        className={cn(
          "pressable inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className
        )}
      >
        <MailIcon aria-hidden className="size-4" /> Message
      </Link>
    )
  }

  async function open() {
    setBusy(true)
    setError("")
    try {
      const id = await startConversation(memberId, name)
      router.push(`/messages/${id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <Button variant={variant} size={size} onClick={open} disabled={busy || (live && !ready)} aria-label={label}>
        {busy ? <Loader2Icon aria-hidden className="animate-spin" /> : <MailIcon aria-hidden />}
        Message
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}
