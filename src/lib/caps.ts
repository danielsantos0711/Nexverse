"use client"

import { useRole } from "@/lib/roles"
import { live } from "@/lib/supabase"

/*
 * What the signed-in member may do. The database is the authority: every write is checked with
 * `public.has_cap(cap)`. This hook only decides what the interface shows. (Stub: the roles and reputation
 * work replaces `can` with the member's real capabilities, from their roles and reputation tier.)
 */

export const CAPS = [
  "thread.create",
  "reply.create",
  "link.post",
  "submission.create",
  "project.create",
  "collection.create",
  "event.create",
  "mission.create",
  "launch.create",
  "duel.create",
  "crew.create",
  "room.create",
  "room.post",
  "message.send",
  "repo.create",
  "issue.create",
  "news.tip",
  "news.write",
  "news.publish",
  "pages.edit",
  "menus.edit",
  "forum.manage",
  "chat.manage",
  "moderate",
  "members.manage",
  "roles.manage",
  "settings.manage",
  "ai.use",
] as const
export type Cap = (typeof CAPS)[number]

const STAFF_ONLY: Cap[] = ["news.write", "news.publish", "pages.edit", "menus.edit", "forum.manage", "chat.manage", "moderate", "members.manage", "roles.manage", "settings.manage", "room.create"]

export function useCaps() {
  const me = useRole()
  const can = (cap: Cap) => {
    if (!live) return !STAFF_ONLY.includes(cap)
    if (me.role === "guest" || (me.suspended && !me.isAdmin)) return false
    if (me.isAdmin) return true
    if (STAFF_ONLY.includes(cap)) return me.isStaff && !["roles.manage", "settings.manage", "members.manage"].includes(cap)
    return true
  }
  return { ready: me.ready, can }
}
