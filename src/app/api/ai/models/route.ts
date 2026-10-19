import { connection } from "next/server"
import { listModels } from "@/lib/ai/catalog"

/**
 * The free models members can pick in the Lab playground: only ones whose provider has a key and that the
 * admin has not switched off. Public (no sign-in needed) and free of secrets:
 * `{ models: [{ id, label, provider, context, notes }] }`.
 */
export async function GET() {
  await connection()
  const models = await listModels().catch(() => [])
  return Response.json({ models }, { headers: { "cache-control": "no-store" } })
}
