"use client"

import { saveBytes } from "@/lib/code/download"
import { sha256Hex } from "@/lib/code/hash"
import { hashFile } from "@/lib/publish/sha256"
import { savedUpload, TusUpload, type TusState } from "@/lib/publish/tus"
import { zipStore } from "@/lib/code/zip"
import { db, live } from "@/lib/supabase"

/*
 * Downloadable files on projects and shared links. The bytes live in the private "downloads" storage bucket; the
 * list (name, size, SHA-256, version, count) lives in public.files and is readable wherever its page is. Only
 * signed-in members can fetch the bytes, through short-lived signed URLs the database grants per file. Each
 * member's download is counted once a day per file by count_download().
 *
 * Limits (also enforced by the database and the bucket, see uploadLimits()): 5 GB per file by the bucket, capped by
 * the project-wide limit set in the Supabase dashboard (NEXT_PUBLIC_STORAGE_MAX_FILE_MB, 50 on the Free plan),
 * 1,000 files per page and 20 GB per member. Files over 6 MB go up as resumable uploads (lib/publish/tus.ts) with
 * progress, pause, resume and retries; smaller ones in one request.
 */

export type FileTargetKind = "project" | "share"

export type HostedFile = {
  id: string
  ownerId: string
  name: string
  path: string
  size: number
  mime: string
  sha256: string
  version: string | null
  note: string
  downloads: number
  createdAt: string
}

/** Round 9 defaults, used until the database says otherwise (uploadLimits). */
export const FILE_LIMITS = { fileBytes: 50 * 1024 * 1024, perPage: 100, memberBytes: 1024 * 1024 * 1024, zipBytes: 300 * 1024 * 1024 } as const

export type UploadLimits = { fileBytes: number; perPage: number; memberBytes: number; perHour: number; resumable: boolean }

/** Files over this size use the resumable endpoint. */
export const RESUMABLE_FROM = 6 * 1024 * 1024

/**
 * The project-wide upload limit set in the Supabase dashboard (Storage settings). The database cannot read it,
 * so the site is told through this public setting; 50 MB is the most the Free plan allows.
 */
const GLOBAL_MAX = (() => {
  const mb = Number(process.env.NEXT_PUBLIC_STORAGE_MAX_FILE_MB)
  return Number.isFinite(mb) && mb > 0 ? Math.round(mb * 1024 * 1024) : 50 * 1024 * 1024
})()

let limitsCache: Promise<UploadLimits> | null = null

/** What one file and one account may hold here: the bucket's limit, the dashboard's limit and the quotas. */
export function uploadLimits(): Promise<UploadLimits> {
  limitsCache ??= (async () => {
    const fallback: UploadLimits = { fileBytes: Math.min(FILE_LIMITS.fileBytes, GLOBAL_MAX), perPage: FILE_LIMITS.perPage, memberBytes: FILE_LIMITS.memberBytes, perHour: 100, resumable: true }
    const client = db()
    if (!client) return fallback
    const { data, error } = await client.rpc("upload_limits")
    if (error || !data) return fallback
    const d = data as Partial<UploadLimits>
    return {
      fileBytes: Math.min(Number(d.fileBytes) || FILE_LIMITS.fileBytes, GLOBAL_MAX),
      perPage: Number(d.perPage) || FILE_LIMITS.perPage,
      memberBytes: Number(d.memberBytes) || FILE_LIMITS.memberBytes,
      perHour: Number(d.perHour) || 100,
      resumable: true,
    }
  })()
  return limitsCache
}

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/

type Row = { id: string; owner_id: string; name: string; path: string; size: number; mime: string; sha256: string; version: string | null; note: string; download_count: number; created_at: string }

const fromRow = (r: Row): HostedFile => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  path: r.path,
  size: Number(r.size),
  mime: r.mime,
  sha256: r.sha256,
  version: r.version,
  note: r.note,
  downloads: Number(r.download_count),
  createdAt: r.created_at,
})

const notReady = (e: { code?: string; message: string } | null) => Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /relation .*files|Could not find the table/i.test(e.message)))

export type FileList = { files: HostedFile[]; available: boolean }

/** The files on a page, newest first. `available` is false when this site has no database or no files table yet. */
export async function listFiles(kind: FileTargetKind, id: string): Promise<FileList> {
  const client = db()
  if (!live || !client) return { files: [], available: false }
  const { data, error } = await client
    .from("files")
    .select("id, owner_id, name, path, size, mime, sha256, version, note, download_count, created_at")
    .eq("target_kind", kind)
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(FILE_LIMITS.perPage)
  if (error) {
    if (notReady(error)) return { files: [], available: false }
    throw new Error(error.message)
  }
  return { files: (data as Row[]).map(fromRow), available: true }
}

/** Bytes the signed-in member's files take, out of FILE_LIMITS.memberBytes. */
export async function myUsage(): Promise<number | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await client.rpc("my_file_usage")
  return error ? null : Number(data ?? 0)
}

import { storageName } from "@/lib/publish/storage-name"
export { storageName }

const mb = (n: number) => (n >= 1024 ** 3 ? `${+(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`)

export function fileProblem(file: File, limits: Pick<UploadLimits, "fileBytes"> = FILE_LIMITS): string | null {
  if (!file.size) return `${file.name} is empty.`
  if (file.size > limits.fileBytes) return `${file.name} is over ${mb(limits.fileBytes)}, the limit for one file on this site.`
  if (file.name.length > 200) return "File names can be up to 200 characters."
  return null
}

function friendly(message: string) {
  if (/bucket not found/i.test(message)) return "Downloads are not switched on yet. Ask an admin to run the latest database update."
  if (/row-level security|policy|violates/i.test(message)) return "You cannot add files here, or you are over your storage for files, or you uploaded too many files in the last hour."
  if (/exceeded the maximum allowed size|payload too large|413/i.test(message)) return "That file is over the limit for one file on this site."
  return message
}

export type UploadStage = "hashing" | "uploading" | "paused" | "retrying" | "saving"

/** Pause, resume or cancel an upload in progress (resumable uploads only; small files finish in one go). */
export type UploadControl = { pause: () => void; resume: () => void; cancel: () => Promise<void> }

/**
 * Uploads a file to a page you can edit and lists it. `onStage` reports each step, `onProgress` the share done
 * (0–1) of the current step, and `onControl` hands over pause/resume/cancel for resumable uploads.
 */
export async function uploadFile(
  kind: FileTargetKind,
  targetId: string,
  file: File,
  opts: { version?: string; note?: string; onStage?: (s: UploadStage, detail?: string) => void; onProgress?: (share: number) => void; onControl?: (c: UploadControl) => void } = {}
): Promise<HostedFile> {
  const limits = await uploadLimits()
  const problem = fileProblem(file, limits)
  if (problem) throw new Error(problem)
  const version = opts.version?.trim() || null
  if (version && !VERSION.test(version)) throw new Error(`"${version}" is not a version name. Use something like 1.0.0 or v2-beta.`)
  const client = db()
  if (!client) throw new Error("Downloads need the site's database.")
  const { data: s } = await client.auth.getSession()
  if (!s.session) throw new Error("Sign in to add files.")
  opts.onStage?.("hashing")
  const sha256 = await hashFile(file, opts.onProgress)
  const contentType = file.type || "application/octet-stream"
  const fingerprint = `${kind}/${targetId}/${file.name}/${file.size}/${file.lastModified}`
  // A half-finished upload of the same file from an earlier visit carries on where it stopped.
  const resumed = file.size > RESUMABLE_FROM ? savedUpload(fingerprint) : null
  const path = resumed?.objectName ?? `${kind}/${targetId}/${crypto.randomUUID()}/${storageName(file.name)}`
  opts.onStage?.("uploading")
  opts.onProgress?.(0)
  if (file.size > RESUMABLE_FROM) {
    const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" }
    const up = new TusUpload({
      supabaseUrl: env.url,
      apiKey: env.key,
      token: async () => (await client.auth.getSession()).data.session?.access_token ?? null,
      bucket: "downloads",
      objectName: path,
      file,
      contentType,
      fingerprint,
      onProgress: (sent, total) => opts.onProgress?.(total ? sent / total : 0),
      onState: (st: TusState, detail?: string) => {
        if (st === "paused" || st === "retrying" || st === "uploading") opts.onStage?.(st, detail)
      },
    })
    opts.onControl?.({ pause: () => up.pause(), resume: () => up.resume(), cancel: () => up.cancel() })
    try {
      await up.start()
    } catch (e) {
      throw new Error(friendly((e as Error).message))
    }
  } else {
    const up = await client.storage.from("downloads").upload(path, file, { contentType, upsert: false })
    if (up.error) throw new Error(friendly(up.error.message))
  }
  opts.onProgress?.(1)
  opts.onStage?.("saving")
  const { data, error } = await client
    .from("files")
    .insert({ target_kind: kind, target_id: targetId, path, name: file.name.slice(0, 200), sha256, version, note: (opts.note ?? "").slice(0, 300) })
    .select("id, owner_id, name, path, size, mime, sha256, version, note, download_count, created_at")
    .single()
  if (error) {
    // Do not leave an unlisted object taking the member's space.
    await client.storage.from("downloads").remove([path])
    throw new Error(friendly(error.message))
  }
  return fromRow(data as Row)
}

/** Reads a file's bytes for a preview (the dataset viewer). Signed-in members only; at most `maxBytes`. */
export async function readFileText(f: HostedFile, maxBytes = 20 * 1024 * 1024): Promise<{ text: string; truncated: boolean }> {
  const url = await signedUrl(f, false)
  const res = await fetch(url, { headers: f.size > maxBytes ? { range: `bytes=0-${maxBytes - 1}` } : undefined })
  if (!res.ok && res.status !== 206) throw new Error(`The file could not be read (${res.status}).`)
  const buf = await res.arrayBuffer()
  const truncated = f.size > buf.byteLength
  return { text: new TextDecoder().decode(buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf), truncated }
}

export async function updateFile(id: string, patch: { name?: string; version?: string | null; note?: string }) {
  const client = db()
  if (!client) throw new Error("Downloads need the site's database.")
  if (patch.version && !VERSION.test(patch.version)) throw new Error(`"${patch.version}" is not a version name. Use something like 1.0.0 or v2-beta.`)
  if (patch.name !== undefined && (!patch.name.trim() || /[/\\]/.test(patch.name))) throw new Error("Give the file a name without slashes.")
  const { error } = await client.from("files").update(patch).eq("id", id)
  if (error) throw new Error(friendly(error.message))
}

export async function removeFile(f: HostedFile) {
  const client = db()
  if (!client) throw new Error("Downloads need the site's database.")
  const st = await client.storage.from("downloads").remove([f.path])
  if (st.error && !/not found/i.test(st.error.message)) throw new Error(friendly(st.error.message))
  const { error } = await client.from("files").delete().eq("id", f.id)
  if (error) throw new Error(friendly(error.message))
}

async function signedUrl(f: HostedFile, download: boolean) {
  const client = db()
  if (!client) throw new Error("Downloads need the site's database.")
  const { data, error } = await client.storage.from("downloads").createSignedUrl(f.path, 120, download ? { download: f.name } : undefined)
  if (error || !data?.signedUrl) throw new Error(/not found|row-level|policy/i.test(error?.message ?? "") ? "Sign in to download, or this file is no longer available." : (error?.message ?? "The download link could not be made."))
  return data.signedUrl
}

/** Counts the download (once a day per member and file) and returns the new total, or null if it could not count. */
async function count(f: HostedFile): Promise<number | null> {
  const client = db()
  if (!client) return null
  const { data, error } = await client.rpc("count_download", { file: f.id })
  return error ? null : Number(data)
}

/** Starts the browser's download of one file. Returns the new count. */
export async function downloadFile(f: HostedFile): Promise<number | null> {
  const url = await signedUrl(f, true)
  const a = document.createElement("a")
  a.href = url
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  return count(f)
}

/**
 * "Download all": fetches every file (signed URLs, four at a time), checks each against its SHA-256 and saves one
 * .zip built in the browser. Refuses past 300 MB so a modest computer does not run out of memory.
 */
export async function downloadAll(files: HostedFile[], zipName: string, onProgress?: (done: number, total: number) => void): Promise<Record<string, number | null>> {
  const total = files.reduce((n, f) => n + f.size, 0)
  if (total > FILE_LIMITS.zipBytes) throw new Error("These files are over 300 MB together, too big to zip in the browser. Download them one by one.")
  const entries: { path: string; data: Uint8Array; date: Date }[] = []
  const used = new Set<string>()
  const counts: Record<string, number | null> = {}
  let done = 0
  const queue = [...files]
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        const res = await fetch(await signedUrl(f, false))
        if (!res.ok) throw new Error(`${f.name} could not be downloaded (${res.status}).`)
        const data = new Uint8Array(await res.arrayBuffer())
        if ((await sha256Hex(data)) !== f.sha256) throw new Error(`${f.name} did not match its checksum. Try again.`)
        // Same name twice (two versions): put the version in front.
        let name = f.name
        if (used.has(name)) name = `${f.version ?? f.id.slice(0, 8)}/${f.name}`
        used.add(name)
        entries.push({ path: name, data, date: new Date(f.createdAt) })
        counts[f.id] = await count(f)
        onProgress?.(++done, files.length)
      }
    })
  )
  entries.sort((a, b) => a.path.localeCompare(b.path))
  saveBytes(zipStore(entries), zipName.endsWith(".zip") ? zipName : `${zipName}.zip`, "application/zip")
  return counts
}
