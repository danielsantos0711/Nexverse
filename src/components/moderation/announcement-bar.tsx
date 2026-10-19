"use client"

import type { Route } from "next"
import Link from "next/link"
import { useSyncExternalStore } from "react"
import { ArrowRightIcon, MegaphoneIcon, RocketIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { isSafeHref, useSiteSettings, type SiteSettings } from "@/lib/site-settings"
import { cn } from "@/lib/utils"

type Announcement = SiteSettings["announcement"]

const KEY = "nexverse-announcement-dismissed"
const listeners = new Set<() => void>()

function readDismissed() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function dismiss(text: string) {
  try {
    localStorage.setItem(KEY, text)
  } catch {}
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => e.key === KEY && l()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

const TONES = {
  info: { icon: MegaphoneIcon, className: "border-ion/25 bg-ion/[0.08] [--tone:var(--ion)]" },
  launch: { icon: RocketIcon, className: "border-gold/30 bg-gold/[0.08] [--tone:var(--gold)]" },
  warning: { icon: TriangleAlertIcon, className: "border-destructive/30 bg-destructive/[0.08] [--tone:var(--destructive)]" },
} as const

/** The announcement line itself, also used as the live preview in the admin panel. */
export function AnnouncementLine({ a, onDismiss, preview = false }: { a: Announcement; onDismiss?: () => void; preview?: boolean }) {
  const tone = TONES[a.tone] ?? TONES.info
  const Icon = tone.icon
  const href = a.href.trim()
  const link = href && isSafeHref(href) ? href : null
  const external = link?.startsWith("https://")
  const label = (
    <>
      <span className="min-w-0">{a.text}</span>
      {link && <ArrowRightIcon aria-hidden className="size-3.5 shrink-0 text-(--tone) transition-transform group-hover:translate-x-0.5" />}
    </>
  )
  return (
    <div className={cn("relative border-b text-sm", tone.className)}>
      <div className="shell flex min-h-10 items-center gap-2.5 py-2 pr-10">
        <Icon aria-hidden className="size-4 shrink-0 text-(--tone)" />
        {link && !preview ? (
          external ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 items-center gap-1.5 rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {label}
            </a>
          ) : (
            <Link href={link as Route} className="group flex min-w-0 items-center gap-1.5 rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {label}
            </Link>
          )
        ) : (
          <p className="flex min-w-0 items-center gap-1.5">{label}</p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss announcement"
          className="pressable absolute top-1/2 right-[max(0.5rem,calc(var(--gutter)-0.5rem))] grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      )}
    </div>
  )
}

/**
 * The site-wide announcement above the header, when an admin switched one on. Dismissing it hides that
 * announcement in this browser; a new text shows again.
 */
export function AnnouncementBar() {
  const { settings } = useSiteSettings()
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => null)
  const a = settings.announcement
  const text = a.text.trim()
  if (!a.enabled || !text || dismissed === text) return null
  return (
    <aside aria-label="Announcement">
      <AnnouncementLine a={{ ...a, text }} onDismiss={() => dismiss(text)} />
    </aside>
  )
}
