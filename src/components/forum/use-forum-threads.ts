"use client"

import { useEffect, useState } from "react"
import { listForumThreads } from "@/components/forum/forum-data"
import type { Topic } from "@/components/forum/topics"
import { useSession } from "@/lib/store"

type State = { topics: Topic[]; status: "loading" | "ready" | "error"; error: string }

/**
 * The forum's threads (all of them, or one category's), loaded in the browser. Reloads when the signed-in
 * member changes, because authors and staff also receive threads moderators hid.
 */
export function useForumThreads(category?: string) {
  const { ready, user } = useSession()
  const [state, setState] = useState<State>({ topics: [], status: "loading", error: "" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!ready) return
    let stale = false
    listForumThreads({ category })
      .then((topics) => !stale && setState({ topics, status: "ready", error: "" }))
      .catch((e: Error) => !stale && setState({ topics: [], status: "error", error: e.message }))
    return () => {
      stale = true
    }
  }, [category, ready, user?.id, attempt])

  return { ...state, retry: () => (setState((s) => ({ ...s, status: "loading" })), setAttempt((n) => n + 1)) }
}
