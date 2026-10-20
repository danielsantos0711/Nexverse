import { db, live } from "@/lib/supabase"

/**
 * Pictures members add to what they write (pasted, dropped or picked): stored in the public "post-media" bucket
 * under the member's own folder. Large photos are scaled down in the browser first (longest side 2560 px, WebP),
 * so uploads stay small and fast. The database enforces the folder, type, 5 MB size and pace limits too.
 */

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"] as const
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const MAX_SIDE = 2560

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" }

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`

/** Why this file cannot be added, or null when it can. */
export function imageProblem(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return `${file.name || "This file"} is not a PNG, JPEG, WebP, GIF or AVIF picture.`
  // Photos over the limit are usually fine after scaling; only refuse what cannot shrink (GIF) or is absurd.
  if (file.size > (file.type === "image/gif" ? IMAGE_MAX_BYTES : 40 * 1024 * 1024)) return `${file.name || "This picture"} is ${formatBytes(file.size)}. Pictures can be up to 5 MB.`
  return null
}

/** Scales big photos down and re-encodes them as WebP. GIFs (animation) and small pictures pass through. */
async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    return file
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    bmp.close()
    return file
  }
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.86))
  return out && out.size < file.size ? out : file
}

function randomName() {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Uploads a picture and returns its public address. Throws a sentence the editor can show. */
export async function uploadImage(file: File): Promise<string> {
  const problem = imageProblem(file)
  if (problem) throw new Error(problem)
  const client = db()
  if (!live || !client) throw new Error("Pictures need the site's database, which this copy of Nexverse does not have. Link to a picture instead.")
  const { data } = await client.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) throw new Error("Sign in to add pictures.")
  const blob = await shrink(file)
  if (blob.size > IMAGE_MAX_BYTES) throw new Error(`${file.name || "This picture"} is still ${formatBytes(blob.size)} after scaling. Pictures can be up to 5 MB.`)
  const type = blob.type || file.type
  const path = `${uid}/${randomName()}.${EXT[type] ?? "png"}`
  const { error } = await client.storage.from("post-media").upload(path, blob, { contentType: type, cacheControl: "31536000", upsert: false })
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("Picture uploads are not switched on yet. Ask an admin to run the latest database update.")
    if (/row-level security|policy/i.test(error.message)) throw new Error("You have added a lot of pictures in the last hour. Try again later.")
    throw new Error(`The picture could not be uploaded: ${error.message}`)
  }
  return client.storage.from("post-media").getPublicUrl(path).data.publicUrl
}

/** "Screenshot 2026-10-19.png" → "Screenshot 2026-10-19", for alt text the member can then improve. */
export const altFromName = (name: string) =>
  name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[[\]()]/g, "")
    .slice(0, 100) || "Picture"
