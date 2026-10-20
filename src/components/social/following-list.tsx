"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { HashIcon, UserIcon } from "lucide-react"
import { categoryIcon } from "@/components/forum/category-icon"
import { MemberAvatar } from "@/components/forum/discussion"
import { FollowButton } from "@/components/social/follow-button"
import { categories, categoryPath, getCategory } from "@/lib/data"
import { describeTarget, getMemberNames, listFollowing, type Follow } from "@/lib/social"
import { Copy } from "@/components/content/copy"

const SECTIONS = [
  { type: "member", label: "Members" },
  { type: "category", label: "Forum categories" },
  { type: "room", label: "Chat rooms" },
] as const

/** Everything a member follows, grouped, each with a button to unfollow. Offers categories when the list is empty. */
export function FollowingList({ userId, onCount }: { userId?: string | null; onCount?: (n: number) => void }) {
  const reduce = useReducedMotion()
  const [follows, setFollows] = useState<Follow[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [error, setError] = useState("")

  useEffect(() => {
    let stale = false
    listFollowing(userId)
      .then(async (list) => {
        const members = list.filter((f) => f.followee.startsWith("member:")).map((f) => f.followee.slice(7))
        const n = await getMemberNames(members).catch(() => ({}))
        if (stale) return
        setNames(n)
        setFollows(list)
        onCount?.(list.length)
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [userId, onCount])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!follows) return <p className="text-muted-foreground"><Copy k="profile.following-list.loading">Loading…</Copy></p>

  if (follows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          You are not following anything yet. Follow <Link href="/people" className="text-ion hover:underline"><Copy k="profile.following-list.people">people</Copy></Link>, forum categories or{" "}
          <Link href="/chat" className="text-ion hover:underline"><Copy k="profile.following-list.chat-rooms">chat rooms</Copy></Link> to hear when something happens.
        </p>
        <h3 className="text-sm font-medium text-muted-foreground"><Copy k="profile.following-list.start-with-a-category">Start with a category</Copy></h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon)
            return (
              <li key={c.slug} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3">
                <Icon aria-hidden className="size-5 shrink-0 text-ion" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={categoryPath(c.slug)} className="truncate font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">{c.blurb}</span>
                </div>
                <FollowButton followee={`category:${c.slug}`} showCount={false} name={c.name} />
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // Follows of the old sample people point at nobody; they are listed first so they can be dropped.
  const stale = follows.filter((f) => f.followee.startsWith("person:"))
  return (
    <div className="flex flex-col gap-8">
      {stale.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground"><Copy k="profile.following-list.no-longer-on-nexverse">No longer on Nexverse</Copy></h3>
          <ul className="flex flex-col gap-2">
            {stale.map((f) => (
              <li key={f.followee} className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                <UserIcon aria-hidden className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">@{f.followee.slice(7)} was an example profile and has been removed.</span>
                <FollowButton followee={f.followee} showCount={false} name={f.followee.slice(7)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {SECTIONS.map((s) => {
        const items = follows.filter((f) => f.followee.startsWith(`${s.type}:`))
        if (!items.length) return null
        return (
          <section key={s.type} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{s.label}</h3>
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {items.map((f) => {
                  const info = describeTarget(f.followee)
                  const label = s.type === "member" ? (names[info.id] ?? "A member") : info.label
                  const Icon = s.type === "category" ? categoryIcon(getCategory(info.id)?.icon ?? "") : null
                  return (
                    <motion.li
                      key={f.followee}
                      layout={reduce ? false : "position"}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3"
                    >
                      <span className="grid size-9 shrink-0 place-items-center">
                        {s.type === "member" ? (
                          <MemberAvatar name={label} size={36} />
                        ) : s.type === "room" ? (
                          <HashIcon aria-hidden className="size-5 text-gold" />
                        ) : Icon ? (
                          <Icon aria-hidden className="size-5 text-ion" />
                        ) : (
                          <UserIcon aria-hidden className="size-5 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {info.href ? (
                          <Link href={info.href} className="hover:underline">
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </span>
                      <FollowButton followee={f.followee} showCount={false} name={label} />
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          </section>
        )
      })}
    </div>
  )
}
