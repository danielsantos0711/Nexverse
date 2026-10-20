"use server"

import { updateTag } from "next/cache"

/*
 * After an editor saves a text, list or page setting, expire the server's cached copy of the site's content so
 * the next request of every page renders the change (open tabs already update live). The caller's access token
 * proves, to the database, that they may write that key.
 */

async function mayWrite(token: string, key: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon || typeof token !== "string" || !/^[A-Za-z0-9._~+/=-]{20,4096}$/.test(token) || typeof key !== "string" || key.length > 300) return false
  try {
    const res = await fetch(`${url}/rest/v1/rpc/site_content_can_write`, {
      method: "POST",
      headers: { apikey: anon, authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ k: key }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    })
    return res.ok && (await res.json()) === true
  } catch {
    return false
  }
}

export async function refreshContent(token: string, key: string): Promise<{ ok: boolean }> {
  if (!(await mayWrite(token, key))) return { ok: false }
  updateTag("site-content")
  return { ok: true }
}
