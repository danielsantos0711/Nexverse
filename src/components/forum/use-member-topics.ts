"use client"

import { useEffect, useState } from "react"
import { memberTopic, sampleTopics, type Topic } from "@/components/forum/topics"
import { listQuestions } from "@/lib/store"

/**
 * Sample threads straight away, plus members' threads once they load from the database (or this browser).
 * `ready` turns true when the members' threads have arrived, or failed to.
 */
export function useForumTopics() {
  const [members, setMembers] = useState<Topic[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stale = false
    listQuestions({ limit: 300 })
      .then((qs) => !stale && setMembers(qs.map(memberTopic)))
      .catch(() => {})
      .finally(() => !stale && setReady(true))
    return () => {
      stale = true
    }
  }, [])

  return { topics: members.length ? [...members, ...sampleTopics] : sampleTopics, members, ready }
}
