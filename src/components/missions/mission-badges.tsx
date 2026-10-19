"use client"

import { useEffect, useState } from "react"
import { AwardIcon } from "lucide-react"
import type { Who } from "@/lib/community"
import { getMissionRecord, MISSION_BADGES, type MissionRecord } from "@/lib/missions"
import { cn } from "@/lib/utils"

/**
 * The mission badges someone has earned (won a mission, won three, won a Commander mission, posted a mission
 * that found its winner), for profile pages. Pass a sample person (handle) or a member (memberId); with neither,
 * and no database, it shows what this browser earned. Renders nothing until there is at least one badge.
 */
export function MissionBadges({ who, className }: { who: Who | null; className?: string }) {
  const [record, setRecord] = useState<MissionRecord | null>(null)
  const key = who?.memberId ?? who?.handle ?? ""

  useEffect(() => {
    let stale = false
    getMissionRecord(who)
      .then((r) => !stale && setRecord(r))
      .catch(() => !stale && setRecord(null))
    return () => {
      stale = true
    }
    // The person is identified by key; a new object for the same person should not refetch.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!record) return null
  const earned = MISSION_BADGES.filter((b) => b.earned(record))
  if (!earned.length) return null
  return (
    <section aria-label="Mission badges" className={cn("flex flex-col gap-2", className)}>
      <h3 className="font-sans text-sm font-semibold tracking-normal">
        Missions{" "}
        <span className="font-normal text-muted-foreground tabular">
          · {record.won} won
          {record.pointsWon > 0 ? ` · ${record.pointsWon.toLocaleString("en")} points` : ""}
        </span>
      </h3>
      <ul className="flex flex-wrap gap-2">
        {earned.map((b) => (
          <li key={b.id} title={b.description} className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold">
            <AwardIcon aria-hidden className="size-3.5" />
            {b.name}
            <span className="sr-only">: {b.description}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
