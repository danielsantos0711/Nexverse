"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { getMemberReputation, type RepStats } from "@/lib/community"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { MemberPlanet, PlanetLegend } from "./member-planet"
import { Copy } from "@/components/content/copy"

/**
 * The signed-in member's planet (or, without a database, the one this browser has built), from the same
 * reputation numbers as the card beside it. `projects` is what they have shared, counted by the page.
 */
export function MyPlanet({ seed, projects, size = 200 }: { seed: string; projects?: number; size?: number }) {
  const { ready, user } = useSession()
  const subject = user?.id ?? null
  const [stats, setStats] = useState<{ key: string; s: RepStats } | null>(null)
  const [failed, setFailed] = useState(false)
  const key = subject ?? "local"

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getMemberReputation(subject)
      .then((s) => !stale && setStats({ key, s }))
      .catch(() => !stale && setFailed(true))
    return () => {
      stale = true
    }
  }, [subject, ready, key])

  const s = stats?.key === key ? stats.s : null
  if (failed) return null
  if (!s) return <Skeleton aria-label="Loading your planet" className="shrink-0 rounded-full" style={{ width: size * 0.5, height: size * 0.5, margin: size * 0.25 }} />
  return (
    <div className="flex flex-col items-center gap-1 text-center" style={{ width: size + 40 }}>
      <MemberPlanet
        handle={seed}
        size={size}
        label={`Your planet: ${s.points.toLocaleString("en")} reputation, ${s.threads} threads, ${s.answers} replies, ${s.accepted} solutions.`}
        stats={{ points: s.points, threads: s.threads, replies: s.answers, accepted: s.accepted, projects, collections: s.collections, events: s.eventsHosted }}
      />
      {s.points === 0 && <p className="text-sm text-muted-foreground"><Copy k="you.my-planet.your-planet-grows-as-you">Your planet grows as you post, reply and share.</Copy></p>}
      <PlanetLegend className="justify-center" />
    </div>
  )
}
