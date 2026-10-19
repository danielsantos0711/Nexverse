"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { boostLaunch, currentMemberId, listLaunches, subscribeLaunchpad, type Launch } from "@/lib/launchpad"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

/**
 * Launches for the Launchpad pages and the home card, kept live: other members' boosts bump the counts as they
 * arrive (and are counted in `incoming`, so buttons can float a "+1"), new or scrubbed launches reload the list.
 * `boost` counts your boost straight away and takes it back if the database says no.
 */
export function useLaunches() {
  const { ready, user } = useSession()
  const [launches, setLaunches] = useState<Launch[] | null>(null)
  const [error, setError] = useState("")
  const [incoming, setIncoming] = useState<Record<string, number>>({})
  const meRef = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      setLaunches(await listLaunches())
      setError("")
    } catch (e) {
      setError((e as Error).message)
      setLaunches((l) => l ?? [])
    }
  }, [])

  useEffect(() => {
    if (live && !ready) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the database (or reads the address) once mounted; state is set when it answers
    void load()
    void currentMemberId().then((id) => (meRef.current = id))
    const stop = subscribeLaunchpad((s) => {
      if (s.type === "changed" || !live) {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void load(), 300)
        if (s.type === "boost")
          setIncoming((m) => ({
            ...m,
            [s.launchId]: (m[s.launchId] ?? 0) + 1,
          }))
        return
      }
      // Your own boost was already counted when you pressed the button.
      if (s.userId === meRef.current) return
      setLaunches((list) => list?.map((l) => (l.id === s.launchId ? { ...l, boosts: l.boosts + 1 } : l)) ?? list)
      setIncoming((m) => ({ ...m, [s.launchId]: (m[s.launchId] ?? 0) + 1 }))
    })
    return () => {
      stop()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [ready, user?.id, load])

  const boost = useCallback(async (l: Launch) => {
    setLaunches((list) => list?.map((x) => (x.id === l.id ? { ...x, boosted: true, boosts: x.boosts + 1 } : x)) ?? list)
    try {
      await boostLaunch(l)
    } catch (e) {
      setLaunches((list) => list?.map((x) => (x.id === l.id ? { ...x, boosted: false, boosts: Math.max(0, x.boosts - 1) } : x)) ?? list)
      throw e
    }
  }, [])

  return { launches, error, incoming, boost, reload: load }
}
