"use client"

import { usePathname } from "next/navigation"
import { useState } from "react"
import { LockIcon, LockOpenIcon, PinIcon, PinOffIcon, ShieldIcon } from "lucide-react"
import { setThreadFlag } from "@/components/forum/forum-data"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ModMenu } from "@/components/moderation/mod-menu"
import { ReportButton } from "@/components/moderation/report-button"
import type { ModAction } from "@/lib/moderation"
import { useRole } from "@/lib/roles"

type ThreadFlags = { pinned: boolean; locked: boolean; onChange: (next: { pinned: boolean; locked: boolean }) => void }

/**
 * The moderation controls under a forum post: Report for everyone but its author, the staff menu (hide, unhide,
 * remove) and, on a thread, the forum's own staff tools (pin, lock). The database checks every action
 * (reports need an account; moderate_content and set_thread_flag are staff-only).
 */
export function PostModeration({
  kind,
  id,
  mine,
  anchor,
  hidden,
  onModerated,
  thread,
}: {
  kind: "question" | "answer"
  id: string
  mine: boolean
  /** The post's anchor on the page ("post-3"), so a report links straight to it. */
  anchor: string
  hidden?: boolean
  onModerated?: (act: ModAction) => void
  thread?: ThreadFlags
}) {
  const path = usePathname()
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {!mine && <ReportButton targetKind={kind} targetId={id} targetUrl={`${path}#${anchor}`} />}
      {kind === "question" && thread && <ThreadTools id={id} thread={thread} />}
      <ModMenu kind={kind} id={id} hidden={hidden} onDone={onModerated} />
    </span>
  )
}

function ThreadTools({ id, thread }: { id: string; thread: ThreadFlags }) {
  const { isStaff } = useRole()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (!isStaff) return null

  async function flip(flag: "pin" | "lock") {
    if (busy) return
    const on = flag === "pin" ? !thread.pinned : !thread.locked
    setBusy(true)
    setError("")
    try {
      await setThreadFlag(id, flag, on)
      thread.onChange({ pinned: flag === "pin" ? on : thread.pinned, locked: flag === "lock" ? on : thread.locked })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="pressable inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          }
        >
          <ShieldIcon aria-hidden className="size-4" /> Thread tools
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Moderators</DropdownMenuLabel>
            <DropdownMenuItem disabled={busy} onClick={() => flip("pin")}>
              {thread.pinned ? <PinOffIcon aria-hidden /> : <PinIcon aria-hidden />}
              {thread.pinned ? "Unpin from the category" : "Pin to the top of the category"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onClick={() => flip("lock")}>
              {thread.locked ? <LockOpenIcon aria-hidden /> : <LockIcon aria-hidden />}
              {thread.locked ? "Unlock replies" : "Lock replies"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  )
}
