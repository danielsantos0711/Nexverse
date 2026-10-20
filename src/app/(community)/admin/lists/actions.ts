"use server"

import { updateTag } from "next/cache"
import { getJson, isRecord } from "@/lib/live/http"
import { ghRepo } from "@/lib/live/github"
import { isGhOwner, isGhRepo, isGhTopic } from "@/lib/live/ids"
import { CONTENT_TAG } from "@/lib/lists/server"
import { LISTS } from "@/lib/lists/registry"

/*
 * Server actions behind /admin/lists. Saving happens in the browser with the admin's own session (the database
 * checks it); these only do what needs the server: expire the cached lists so server pages show the change at
 * once, and ask GitHub whether a topic or repository exists (with the server's optional GITHUB_TOKEN). Each one
 * first checks, with the caller's access token, that the database counts them as staff.
 */

async function isStaff(token: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || typeof token !== "string" || !/^[A-Za-z0-9._~+/=-]{20,4096}$/.test(token)) return false
  try {
    const res = await fetch(`${url}/rest/v1/rpc/is_staff`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    })
    return res.ok && (await res.json()) === true
  } catch {
    return false
  }
}

/** Expires the cached copy of a saved list, so the next request of every server page reads the new one. */
export async function refreshList(token: string, key: string): Promise<{ ok: boolean }> {
  if (!LISTS.some((l) => l.key === key) || !(await isStaff(token))) return { ok: false }
  updateTag(CONTENT_TAG)
  return { ok: true }
}

export type TopicCheck = { status: "found"; repos: number; name: string; description: string } | { status: "missing" } | { status: "unknown"; reason: string }

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return headers
}

/** Whether a GitHub topic is in use: how many public repositories carry it, and GitHub's own description. */
export async function checkGithubTopic(token: string, topic: string): Promise<TopicCheck> {
  if (!(await isStaff(token))) return { status: "unknown", reason: "Only the team can check topics." }
  const t = String(topic).trim().toLowerCase()
  if (!isGhTopic(t)) return { status: "missing" }
  try {
    const [repos, topics] = await Promise.all([
      getJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(`topic:${t}`)}&per_page=1`, { headers: ghHeaders(), timeout: 8000 }),
      getJson(`https://api.github.com/search/topics?q=${encodeURIComponent(t)}&per_page=10`, { headers: ghHeaders(), timeout: 8000 }).catch(() => null),
    ])
    const count = isRecord(repos) && typeof repos.total_count === "number" ? repos.total_count : 0
    if (!count) return { status: "missing" }
    const items = isRecord(topics) && Array.isArray(topics.items) ? topics.items.filter(isRecord) : []
    const own = items.find((i) => i.name === t)
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
    return { status: "found", repos: count, name: text(own?.display_name, 60) || t, description: text(own?.short_description, 200) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    return { status: "unknown", reason: /403|429|rate/i.test(msg) ? "GitHub's search limit was reached. Try again in a minute." : "GitHub did not answer. Try again in a moment." }
  }
}

export type RepoCheck = { status: "found"; fullName: string; stars: number; description: string; archived: boolean } | { status: "missing" } | { status: "unknown"; reason: string }

/** Whether owner/name is a public GitHub repository, with its star count. */
export async function checkGithubRepo(token: string, full: string): Promise<RepoCheck> {
  if (!(await isStaff(token))) return { status: "unknown", reason: "Only the team can check repositories." }
  const [owner, name, extra] = String(full).trim().split("/")
  if (extra !== undefined || !owner || !name || !isGhOwner(owner) || !isGhRepo(name)) return { status: "missing" }
  const res = await ghRepo(owner, name)
  if (!res.ok) return res.reason === "notfound" ? { status: "missing" } : { status: "unknown", reason: res.reason === "ratelimit" ? "GitHub's limit was reached. Try again in a minute." : "GitHub did not answer. Try again in a moment." }
  return { status: "found", fullName: res.data.fullName, stars: res.data.stars, description: res.data.description, archived: res.data.archived }
}
