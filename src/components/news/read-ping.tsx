"use client"

import { useEffect } from "react"
import { db } from "@/lib/supabase"

/*
 * Counts one read of a story for "Rising in Nexverse news": once per story per browser session, after the
 * reader has stayed twelve seconds with the page visible. Anonymous: only the story and the day are stored.
 */
export function ReadPing({ storyId }: { storyId: string }) {
  useEffect(() => {
    const key = `nx-read:${storyId}`
    try {
      if (sessionStorage.getItem(key)) return
    } catch {
      // Storage blocked: still count, at most once per page view.
    }
    let seen = 0
    let last = document.visibilityState === "visible" ? Date.now() : 0
    let done = false
    const send = () => {
      if (done) return
      done = true
      try {
        sessionStorage.setItem(key, "1")
      } catch {}
      const c = db()
      if (c) void c.rpc("news_story_read", { story: storyId }).then(() => undefined, () => undefined)
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && last) {
        seen += Date.now() - last
        last = Date.now()
      }
      if (seen >= 12_000) {
        send()
        window.clearInterval(timer)
      }
    }, 2_000)
    const onVis = () => {
      last = document.visibilityState === "visible" ? Date.now() : 0
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [storyId])
  return null
}
