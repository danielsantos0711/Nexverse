"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { loadSavedLists, type Availability, type Saved } from "@/lib/lists/admin"

/*
 * The saved lists, loaded once per visit to /admin/lists and shared by the index and every editor, so moving
 * between lists is instant. `reload()` after a save or reset.
 */

type State = { ready: boolean; saved: Record<string, Saved>; availability: Availability | null }

const EMPTY: State = { ready: false, saved: {}, availability: null }
let state: State = EMPTY
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

function load() {
  loading ??= loadSavedLists()
    .then(({ saved, availability }) => set({ ready: true, saved, availability }))
    .catch((err: unknown) => set({ ready: true, saved: {}, availability: { ok: false, reason: "error", message: err instanceof Error ? err.message : undefined } }))
    .finally(() => {
      loading = null
    })
  return loading
}

export function useSavedLists() {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => EMPTY
  )
  useEffect(() => {
    if (!state.ready) void load()
  }, [])
  const reload = useCallback(() => load(), [])
  return { ...s, reload }
}
