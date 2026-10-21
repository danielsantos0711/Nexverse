"use client"

import { useSyncExternalStore } from "react"

/*
 * One shared reading of the page's scroll, for the chrome: which way the reader is going, and whether they are at
 * the top or the bottom. One passive listener for the whole site; subscribers re-render only when one of those
 * facts changes, never per scroll event. The header and the phone tab bar both read it, so they can take turns
 * (only one bar on screen at a time on phones).
 */

export type ScrollFacts = {
  /** "up" also covers the resting state at the top of a page. */
  dir: "up" | "down"
  atTop: boolean
  atBottom: boolean
}

const INITIAL: ScrollFacts = { dir: "up", atTop: true, atBottom: false }
let facts = INITIAL
let last = 0
let travelled = 0
const listeners = new Set<() => void>()

function read() {
  const y = window.scrollY
  const max = document.documentElement.scrollHeight - window.innerHeight
  const delta = y - last
  last = y
  // a direction only counts after 12px of travel that way, so a trembling finger or a trackpad's rebound does not flip the bars
  travelled = Math.sign(delta) === Math.sign(travelled) ? travelled + delta : delta
  let dir = facts.dir
  if (travelled > 12) dir = "down"
  else if (travelled < -12) dir = "up"
  const atTop = y < 64
  const atBottom = max > 200 && y > max - 48
  if (atTop) dir = "up"
  if (dir !== facts.dir || atTop !== facts.atTop || atBottom !== facts.atBottom) {
    facts = { dir, atTop, atBottom }
    listeners.forEach((l) => l())
  }
}

function subscribe(l: () => void) {
  if (!listeners.size) {
    last = window.scrollY
    window.addEventListener("scroll", read, { passive: true })
    read()
  }
  listeners.add(l)
  return () => {
    listeners.delete(l)
    if (!listeners.size) window.removeEventListener("scroll", read)
  }
}

export function useScrollFacts(): ScrollFacts {
  return useSyncExternalStore(subscribe, () => facts, () => INITIAL)
}

/**
 * Which bar a phone shows. At the top, and while scrolling up, the header (brand, search, menu); while reading
 * down, and at the very end of a page, the tab bar (in reach of the thumb). Never both. With the header pinned
 * (Settings › Your experience), the header stays and the tab bar stays away (the header's menu has Create).
 */
export function usePhoneBar(pinned: boolean): "header" | "tabs" {
  const f = useScrollFacts()
  if (pinned) return "header"
  if (f.atTop) return "header"
  return f.dir === "down" || f.atBottom ? "tabs" : "header"
}
