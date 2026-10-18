import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** True when this copy of the app is connected to a database; otherwise writing stays in the browser. */
export const live = Boolean(url && key)

let client: SupabaseClient | null = null

/** The browser's database client. Row level security decides what it may read and write. */
export function db() {
  if (!live) return null
  if (typeof window === "undefined") return null
  client ??= createClient(url!, key!, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  })
  return client
}
