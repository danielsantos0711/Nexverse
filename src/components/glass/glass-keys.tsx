"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"

/*
 * Keyboard shortcuts as keycaps of frosted glass (adapted from HorizonX "Glass Keys"; the export's WebGL wall
 * of keys is far too heavy for a two-key hint, so this keeps its look and its azure palette in CSS: see
 * .glass-key in globals.css). The keys light up while they are held, and with the pointer on their button.
 */

const subscribe = () => () => {}
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** "⌘" on Apple devices, "Ctrl" elsewhere. Renders "⌘" on the server and first paint, then settles. */
export function useModKey() {
  return useSyncExternalStore(
    subscribe,
    () => (isMac() ? "⌘" : "Ctrl"),
    () => "⌘"
  )
}

/** Name of a key as the browser reports it in KeyboardEvent.key, for matching the cap to the key held down. */
const keyName = (label: string) => (label === "⌘" ? "Meta" : label === "Ctrl" ? "Control" : label === "⇧" ? "Shift" : label === "⌥" ? "Alt" : label.toLowerCase())

/** Shortcut keycaps: <GlassKeys keys={["mod", "K"]} />. "mod" becomes ⌘ or Ctrl. */
export function GlassKeys({ keys, size = "sm", className, live = true }: { keys: string[]; size?: "sm" | "lg"; className?: string; live?: boolean }) {
  const mod = useModKey()
  const labels = keys.map((k) => (k === "mod" ? mod : k))
  const [held, setHeld] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!live) return
    const down = (e: KeyboardEvent) => setHeld((h) => (h.has(e.key.toLowerCase()) ? h : new Set(h).add(e.key.toLowerCase())))
    const up = (e: KeyboardEvent) =>
      setHeld((h) => {
        if (!h.has(e.key.toLowerCase())) return h
        const n = new Set(h)
        n.delete(e.key.toLowerCase())
        return n
      })
    const clear = () => setHeld(new Set())
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", clear)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", clear)
    }
  }, [live])

  return (
    <kbd className={cn("inline-flex items-center gap-1 font-sans", className)} aria-label={labels.join(" ")}>
      {labels.map((l) => {
        const on = held.has(keyName(l).toLowerCase())
        return (
          <span key={l} aria-hidden className={cn("glass-key", size === "lg" && "glass-key-lg")} data-lit={on ? "" : undefined} data-pressed={on ? "" : undefined}>
            {l}
          </span>
        )
      })}
    </kbd>
  )
}
