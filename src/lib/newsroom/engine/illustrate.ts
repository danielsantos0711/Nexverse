import { randomBytes } from "node:crypto"
import type { Db } from "../rest"

/*
 * Server only. An AI illustration for a story with no usable real image, made with Cloudflare Workers AI's free
 * image model when CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are set and the editors switched illustrations
 * on. The picture is stored in the public news-media bucket and the story is marked cover_ai, so the page labels
 * it "AI illustration" and never presents it as a photo of the event.
 */

const MODEL = "@cf/black-forest-labs/flux-1-schnell"

export async function illustrate(db: Db, o: { title: string; dek: string; desk: string }): Promise<{ url: string; model: string } | null> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (!account || !token) return null
  const prompt = `Editorial illustration, abstract and conceptual, for a technology news story in the ${o.desk} section: "${o.title}". ${o.dek}. Deep blue and violet light, soft depth, no text, no letters, no logos, no real people, no brand marks.`.slice(0, 900)
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ prompt, steps: 6 }),
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null)
  if (!res?.ok) return null
  const data = (await res.json().catch(() => null)) as { result?: { image?: string } } | null
  const b64 = data?.result?.image
  if (!b64) return null
  const bytes = Buffer.from(b64, "base64")
  if (bytes.length < 2000) return null
  const path = `illustrations/${new Date().toISOString().slice(0, 7)}/${randomBytes(10).toString("hex")}.jpg`
  const up = await fetch(`${db.url}/storage/v1/object/news-media/${path}`, {
    method: "POST",
    headers: { ...db.headers, "content-type": "image/jpeg", "cache-control": "max-age=31536000", "x-upsert": "false" },
    body: new Blob([bytes], { type: "image/jpeg" }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null)
  if (!up?.ok) return null
  return { url: `${db.url}/storage/v1/object/public/news-media/${path}`, model: "Cloudflare Workers AI, FLUX.1 schnell" }
}
