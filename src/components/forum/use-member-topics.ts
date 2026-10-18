"use client"

import { useEffect, useState } from "react"
import { memberTopic, sampleTopics, type Topic } from "@/components/forum/topics"
import { listThreadExtras } from "@/lib/community"
import { listQuestions } from "@/lib/store"

/**
 * Sample threads straight away, plus members' threads once they load from the database (or this browser), with
 * their tags (and, for threads kept in this browser, the reply marked as solved).
 * `ready` turns true when the members' threads have arrived, or failed to.
 */
export function useForumTopics() {
  const [members, setMembers] = useState<Topic[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stale = false
    Promise.all([listQuestions({ limit: 300 }), listThreadExtras().catch(() => ({}) as Awaited<ReturnType<typeof listThreadExtras>>)])
      .then(([qs, extras]) => {
        if (stale) return
        setMembers(
          qs.map((q) => {
            const t = memberTopic(q)
            const x = extras[q.id]
            return x ? { ...t, tags: x.tags, solved: t.solved || (q.local && x.accepted) } : t
          })
        )
      })
      .catch(() => {})
      .finally(() => !stale && setReady(true))
    return () => {
      stale = true
    }
  }, [])

  return { topics: members.length ? [...members, ...sampleTopics] : sampleTopics, members, ready }
}
