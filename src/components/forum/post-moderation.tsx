"use client"

import { usePathname } from "next/navigation"
import { useState } from "react"
import { EyeIcon, EyeOffIcon, LockIcon, LockOpenIcon, PinIcon, PinOffIcon, ShieldIcon } from "lucide-react"
import { setThreadFlag } from "@/components/forum/forum-data"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ModMenu } from "@/components/moderation/mod-menu"
import { ReportButton } from "@/components/moderation/report-button"
import { categoryModerate, findCategory, useForumMap } from "@/lib/forum-categories"
import type { ModAction } from "@/lib/moderation"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"

type ThreadFlags = { pinned: boolean; locked: boolean; onChange: (next: { pinned: boolean; locked: boolean }) => void }

/**
 * The moderation controls under a forum post: Report for everyone but its author, the staff menu (hide, unhide,
 * remove) and, on a thread, the forum's own tools (pin, lock). A category's own moderators get pin, lock and hide
 * in that category. The database checks every action (moderate_content and set_thread_flag are staff-only;
 * forum_moderate also lets the category's moderators in).
 */
export function PostModeration({
  kind,
  id,
  orbit,
  mine,
  anchor,
  hidden,
  onModerated,
  thread,
}: {
  kind: "question" | "answer"
  id: string
  /** The thread's category, so its moderators get their tools. */
  orbit?: string
  mine: boolean
  /** The post's anchor on the page ("post-3"), so a report links straight to it. */
  anchor: string
  hidden?: boolean
  onModerated?: (act: ModAction) => void
  thread?: ThreadFlags
}) {
  const path = usePathname()
  const { isStaff } = useRole()
  const { user } = useSession()
  const map = useForumMap()
  const cat = orbit ? findCategory(map, orbit) : undefined
  const categoryMod = !isStaff && Boolean(user && cat?.moderators.includes(user.id))
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {!mine && <ReportButton targetKind={kind} targetId={id} targetUrl={`${path}#${anchor}`} />}
      {(isStaff || categoryMod) && (kind === "answer" ? categoryMod : Boolean(thread)) && (
        <Tools kind={kind} id={id} thread={kind === "question" ? thread : undefined} hidden={hidden} viaCategory={categoryMod} onModerated={onModerated} />
      )}
      <ModMenu kind={kind} id={id} hidden={hidden} onDone={onModerated} />
    </span>
  )
}

function Tools({
  kind,
  id,
  thread,
  hidden,
  viaCategory,
  onModerated,
}: {
  kind: "question" | "answer"
  id: string
  thread?: ThreadFlags
  hidden?: boolean
  viaCategory: boolean
  onModerated?: (act: ModAction) => void
}) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function flip(flag: "pin" | "lock") {
    if (busy || !thread) return
    const on = flag === "pin" ? !thread.pinned : !thread.locked
    setBusy(true)
    setError("")
    try {
      if (viaCategory) await categoryModerate("question", id, on ? flag : flag === "pin" ? "unpin" : "unlock")
      else await setThreadFlag(id, flag, on)
      thread.onChange({ pinned: flag === "pin" ? on : thread.pinned, locked: flag === "lock" ? on : thread.locked })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function hide() {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await categoryModerate(kind, id, hidden ? "unhide" : "hide")
      onModerated?.(hidden ? "unhide" : "hide")
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
          <ShieldIcon aria-hidden className="size-4" /> {kind === "question" ? "Thread tools" : "Moderate"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{viaCategory ? "Category moderator" : "Moderators"}</DropdownMenuLabel>
            {thread && (
              <>
                <DropdownMenuItem disabled={busy} onClick={() => flip("pin")}>
                  {thread.pinned ? <PinOffIcon aria-hidden /> : <PinIcon aria-hidden />}
                  {thread.pinned ? "Unpin from the category" : "Pin to the top of the category"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy} onClick={() => flip("lock")}>
                  {thread.locked ? <LockOpenIcon aria-hidden /> : <LockIcon aria-hidden />}
                  {thread.locked ? "Unlock replies" : "Lock replies"}
                </DropdownMenuItem>
              </>
            )}
            {/* Staff hide from their own menu; category moderators hide here. */}
            {viaCategory && (
              <DropdownMenuItem disabled={busy} onClick={hide}>
                {hidden ? <EyeIcon aria-hidden /> : <EyeOffIcon aria-hidden />}
                {hidden ? "Show again" : kind === "question" ? "Hide this thread" : "Hide this reply"}
              </DropdownMenuItem>
            )}
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
