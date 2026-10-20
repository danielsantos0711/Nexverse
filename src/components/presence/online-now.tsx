"use client"

import Link from "next/link"
import { Popover } from "@base-ui/react/popover"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { EyeOffIcon, RadioIcon } from "lucide-react"
import { ChatAvatar } from "@/components/chat/glyphs"
import { pageLabel, setPresenceOptOut, usePresence, type Visitor } from "@/lib/presence"
import { live } from "@/lib/supabase"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const EASE = [0.23, 1, 0.32, 1] as const
/** Where the first few faces sit on the ring, in degrees (12 o'clock is -90). */
const SEATS = [-90, 30, 150]

/**
 * Who is on Nexverse right now: a small orbit with a few faces circling a live dot and the count. It opens a
 * list of everyone online and the page each of them is on, so you can go and join them.
 */
export function OnlineNow({ className }: { className?: string }) {
  const { online, me, optedOut, ready } = usePresence()
  const reduce = useReducedMotion()
  const count = online.length
  const faces = online.slice(0, SEATS.length)
  const label = !ready ? "Who is online" : count === 1 ? "1 member online now" : `${count} members online now`
  const session = useSession()
  // Guests do not join presence, so a count would be a false zero
  if (live && session.ready && !session.user) return null

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        title={label}
        className={cn(
          "pressable group inline-flex h-8 items-center gap-2 rounded-full border border-border bg-secondary/40 pr-2.5 pl-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[popup-open]:bg-secondary data-[popup-open]:text-foreground",
          className
        )}
      >
        <span aria-hidden className="relative grid size-6 place-items-center">
          <span className="absolute inset-0 rounded-full border border-ion/25" />
          <span className="relative size-1.5 rounded-full bg-ok shadow-[0_0_8px_var(--ok)]" />
          <span className="absolute inset-0 motion-safe:animate-[spin_28s_linear_infinite]">
            <AnimatePresence initial={false}>
              {faces.map((v, i) => {
                const a = (SEATS[i] * Math.PI) / 180
                return (
                  <motion.span
                    key={v.member.id}
                    initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.4 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="absolute rounded-full ring-1 ring-background"
                    style={{ left: `calc(50% + ${Math.cos(a) * 12}px - 5px)`, top: `calc(50% + ${Math.sin(a) * 12}px - 5px)` }}
                  >
                    <ChatAvatar id={v.member.id} name={v.member.name} size={10} className="text-[0px]" />
                  </motion.span>
                )
              })}
            </AnimatePresence>
          </span>
        </span>
        <span className="tabular">
          {ready ? count : "–"}
          <span className="hidden sm:inline"> <Copy k="common.online-now.online">online</Copy></span>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="isolate z-50">
          <Popover.Popup className="w-[min(20rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-safe:transition-[transform,opacity] motion-safe:duration-150">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <Popover.Title className="flex items-center gap-2 text-sm font-medium">
                <RadioIcon aria-hidden className="size-4 text-ok" /> Online now
              </Popover.Title>
              <span className="text-xs text-muted-foreground tabular">{count}</span>
            </div>
            <PeopleList online={online} meId={me?.id ?? null} />
            <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
              {!live && <p><Copy k="common.online-now.local-preview-only-you-are" multiline>Local preview: only you are shown. With accounts switched on, everyone online appears here.</Copy></p>}
              {live && !me && <p><Copy k="common.online-now.sign-in-to-appear-here">Sign in to appear here. Only your name and the page you are on are shared.</Copy></p>}
              {me && (
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <EyeOffIcon aria-hidden className="size-3.5" /> <Copy k="common.online-now.hide-me-from-this-list">Hide me from this list</Copy>
                  </span>
                  <input type="checkbox" checked={optedOut} onChange={(e) => setPresenceOptOut(e.target.checked)} className="size-4 accent-[var(--ion)]" />
                </label>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function PeopleList({ online, meId }: { online: Visitor[]; meId: string | null }) {
  if (!online.length) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground"><Copy k="common.online-now.nobody-else-is-around-right">Nobody else is around right now.</Copy></p>
  }
  return (
    <ul className="max-h-80 overflow-y-auto p-1" aria-label="Members online">
      {online.map((v) => (
        <li key={v.member.id}>
          <Popover.Close
            render={
              <Link
                href={v.path as never}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none"
              />
            }
          >
            <span className="relative shrink-0">
              <ChatAvatar id={v.member.id} name={v.member.name} size={28} />
              <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-ok ring-2 ring-popover" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">
                {v.member.name}
                {v.member.id === meId && <span className="font-normal text-muted-foreground"> <Copy k="common.online-now.you">(you)</Copy></span>}
              </span>
              <span className="truncate text-xs text-muted-foreground">on {pageLabel(v.path)}</span>
            </span>
          </Popover.Close>
        </li>
      ))}
    </ul>
  )
}
