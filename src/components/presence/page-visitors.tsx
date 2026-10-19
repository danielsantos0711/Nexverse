"use client"

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { ChatAvatar } from "@/components/chat/glyphs"
import { publicPath, usePresence } from "@/lib/presence"
import { cn } from "@/lib/utils"

/**
 * Who is on this page right now, as a few small stacked faces and a count. You are included (last), so the
 * strip reads "you and two others"; it hides itself when nobody, not even you, is tracked here.
 */
export function PageVisitors({ path, max = 4, className }: { path?: string; max?: number; className?: string }) {
  const { online, me, path: current } = usePresence()
  const reduce = useReducedMotion()
  const here = publicPath(path ?? current)
  const list = online.filter((v) => v.path === here).sort((a, b) => Number(a.member.id === me?.id) - Number(b.member.id === me?.id))
  if (!list.length) return null
  const others = list.filter((v) => v.member.id !== me?.id).length
  const shown = list.slice(0, max)
  const label = others === 0 ? "Only you are on this page" : `${others} other ${others === 1 ? "member is" : "members are"} on this page`

  return (
    <div className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)} title={list.map((v) => v.member.name).join(", ")}>
      <LayoutGroup>
        <ul className="flex items-center -space-x-1.5" aria-label={label}>
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((v) => (
              <motion.li
                key={v.member.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
                className="rounded-full ring-2 ring-background"
              >
                <ChatAvatar id={v.member.id} name={v.member.name} size={20} />
                <span className="sr-only">{v.member.id === me?.id ? `${v.member.name} (you)` : v.member.name}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {list.length > shown.length && (
            <li className="grid h-5 min-w-5 place-items-center rounded-full bg-secondary px-1 text-[10px] tabular ring-2 ring-background">+{list.length - shown.length}</li>
          )}
        </ul>
      </LayoutGroup>
      <span aria-hidden className="inline-flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-ok" />
        {others === 0 ? "Just you here" : `${list.length} here now`}
      </span>
    </div>
  )
}
