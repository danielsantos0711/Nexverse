"use client"

import { useSyncExternalStore } from "react"

/*
 * The editor's one-line status ("Saved", "Your account cannot change this"), shown by <ContentEditor> and read
 * out by screen readers. Inline edits and the panel both report here.
 */

export type EditStatus = { ok: boolean; text: string; at: number } | null

let status: EditStatus = null
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined

export function announce(ok: boolean, text: string) {
  status = { ok, text, at: Date.now() }
  listeners.forEach((l) => l())
  clearTimeout(timer)
  timer = setTimeout(
    () => {
      status = null
      listeners.forEach((l) => l())
    },
    ok ? 2600 : 6000
  )
}

export function useEditStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
    () => null
  )
}
