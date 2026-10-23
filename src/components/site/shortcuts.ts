"use client"

import { useEffect } from "react"
import { shortcutsOn } from "@/components/settings/ui-prefs"

/*
 * Single-key shortcuts that work anywhere on the site, except while typing in a field or with a modifier held:
 *   /  search (the command menu)     C  create something     G then a letter  go to a place (see GO_KEYS)
 *   J / K  next and previous item in the page's list (elements marked data-nav-item), Enter opens it
 * Pages add their own with useShortcut (J/K to move through a list, L to like, and so on).
 */

export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest("[role=dialog],[role=menu],[role=listbox]") !== null
}

/** Run `fn` when `key` is pressed on its own (no ⌘, Ctrl or Alt) outside any field. */
export function useShortcut(key: string, fn: (e: KeyboardEvent) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e) || !shortcutsOn()) return
      if (e.key.toLowerCase() !== key.toLowerCase()) return
      fn(e)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [key, fn, enabled])
}

/** G then a letter: the places people jump between most. Shown in the command menu's footer and on /explore. */
export const GO_KEYS: { key: string; href: string; label: string }[] = [
  { key: "h", href: "/", label: "Home" },
  { key: "e", href: "/explore", label: "Explore" },
  { key: "f", href: "/forum", label: "Forum" },
  { key: "n", href: "/news", label: "News" },
  { key: "l", href: "/lab", label: "Lab" },
  { key: "c", href: "/chat", label: "Chat" },
  { key: "p", href: "/code", label: "Code" },
  { key: "y", href: "/you", label: "Your page" },
]
