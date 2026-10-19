import { connection } from "next/server"
import { aiEnabled } from "@/lib/ai/config"

/** Whether AI assist is switched on, so the interface can show or hide its buttons. No secrets, ever. */
export async function GET() {
  // Read the environment at request time, so adding the key in Vercel works without a rebuild.
  await connection()
  return Response.json({ enabled: aiEnabled() }, { headers: { "cache-control": "no-store" } })
}
