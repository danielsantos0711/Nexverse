import { connection } from "next/server"
import { jobsReady } from "@/lib/ai/catalog"
import { aiEnabled } from "@/lib/ai/config"
import { JOBS, type AiJob } from "@/lib/ai/models"

/**
 * Whether AI assist is switched on, and for which jobs, so the interface can show or hide its buttons.
 * `{ enabled, jobs: { [job]: boolean } }` and nothing else: no keys, no providers, no models.
 */
export async function GET() {
  // Read the environment and the admin's settings at request time, so adding a key in Vercel works without a rebuild.
  await connection()
  const off = Object.fromEntries(JOBS.map((j) => [j.id, false])) as Record<AiJob, boolean>
  if (!aiEnabled()) return Response.json({ enabled: false, jobs: off }, { headers: { "cache-control": "no-store" } })
  const ready = await jobsReady()
  return Response.json(ready, { headers: { "cache-control": "no-store" } })
}
