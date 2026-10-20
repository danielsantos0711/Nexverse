"use client"

/*
 * Resumable uploads to Supabase Storage, by the TUS 1.0 protocol (what Supabase's /storage/v1/upload/resumable
 * speaks), written out here instead of adding tus-js-client:
 *
 *   POST   <endpoint>        creates the upload (length, bucket, object name, type) and answers its own URL
 *   HEAD   <upload url>      tells how many bytes the server already has
 *   PATCH  <upload url>      sends the next 6 MB from that offset (Supabase needs exactly 6 MB chunks)
 *
 * Each chunk goes through XMLHttpRequest for progress events. A dropped connection retries with growing
 * delays; pause aborts the chunk in flight and resume asks the server where to carry on. The upload URL is kept
 * in this browser for 24 hours (Supabase's lifetime for it), so a reload can resume the same file too.
 */

export const TUS_CHUNK = 6 * 1024 * 1024
const RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000]
const STORE = "nexverse-tus"
const DAY = 24 * 60 * 60 * 1000

export type TusState = "uploading" | "paused" | "retrying" | "done" | "error"

export type TusOptions = {
  /** Supabase project URL, e.g. https://abc.supabase.co */
  supabaseUrl: string
  apiKey: string
  /** Called before every request, so a long upload keeps a fresh session token. */
  token: () => Promise<string | null>
  bucket: string
  objectName: string
  file: File
  contentType: string
  /** Identifies this file for resuming after a reload (page + file name + size + date). */
  fingerprint: string
  onProgress?: (sent: number, total: number) => void
  onState?: (s: TusState, detail?: string) => void
}

export class TusError extends Error {
  constructor(
    message: string,
    public status = 0
  ) {
    super(message)
  }
}

type Saved = { url: string; objectName: string; at: number }

function readStore(): Record<string, Saved> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, Saved>
    const now = Date.now()
    return Object.fromEntries(Object.entries(v).filter(([, s]) => s && typeof s.url === "string" && now - s.at < DAY - 60_000))
  } catch {
    return {}
  }
}

function writeStore(v: Record<string, Saved>) {
  try {
    localStorage.setItem(STORE, JSON.stringify(v))
  } catch {}
}

/** An unfinished upload of this file from an earlier visit, if the server still keeps it. */
export function savedUpload(fingerprint: string): Saved | null {
  return readStore()[fingerprint] ?? null
}

export function forgetUpload(fingerprint: string) {
  const s = readStore()
  delete s[fingerprint]
  writeStore(s)
}

/** Supabase recommends the direct storage host for big uploads: abc.supabase.co → abc.storage.supabase.co. */
export function tusEndpoint(supabaseUrl: string) {
  const u = supabaseUrl.replace(/\/+$/, "")
  const m = u.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)
  return m ? `https://${m[1]}.storage.supabase.co/storage/v1/upload/resumable` : `${u}/storage/v1/upload/resumable`
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))

function friendly(status: number, body: string) {
  if (status === 413 || /maximum allowed size|too large|exceeded/i.test(body)) return "This file is bigger than this site's storage allows for one file."
  if (status === 401) return "Your session ended. Sign in again, then resume."
  if (status === 403 || /row-level|policy|unauthorized/i.test(body)) return "Storage refused the upload: you may not add files here, you are over your storage, or you uploaded too many files in the last hour."
  if (status === 409 || /already exists/i.test(body)) return "A file with this name is already being uploaded here."
  return body.slice(0, 200) || `Storage answered with an error (${status}).`
}

/**
 * One resumable upload. `start()` resolves when every byte is stored; `pause()` and `resume()` may be called
 * meanwhile. Errors that retrying cannot fix reject with a TusError.
 */
export class TusUpload {
  private url: string | null = null
  private xhr: XMLHttpRequest | null = null
  private paused = false
  private stopped = false
  private wake: (() => void) | null = null
  private offset = 0

  constructor(private o: TusOptions) {
    const saved = savedUpload(o.fingerprint)
    if (saved && saved.objectName === o.objectName) this.url = saved.url
  }

  get objectName() {
    return this.o.objectName
  }

  private async headers(extra: Record<string, string> = {}) {
    const token = await this.o.token()
    if (!token) throw new TusError("Sign in to upload files.", 401)
    return { authorization: `Bearer ${token}`, apikey: this.o.apiKey, "tus-resumable": "1.0.0", ...extra }
  }

  private async create() {
    const meta = [
      `bucketName ${b64(this.o.bucket)}`,
      `objectName ${b64(this.o.objectName)}`,
      `contentType ${b64(this.o.contentType || "application/octet-stream")}`,
      `cacheControl ${b64("3600")}`,
    ].join(",")
    const res = await fetch(tusEndpoint(this.o.supabaseUrl), {
      method: "POST",
      headers: await this.headers({ "upload-length": String(this.o.file.size), "upload-metadata": meta, "x-upsert": "false" }),
    })
    if (res.status !== 201) throw new TusError(friendly(res.status, await res.text().catch(() => "")), res.status)
    const loc = res.headers.get("location")
    if (!loc) throw new TusError("Storage did not say where to send the file.")
    this.url = new URL(loc, tusEndpoint(this.o.supabaseUrl)).toString()
    const s = readStore()
    s[this.o.fingerprint] = { url: this.url, objectName: this.o.objectName, at: Date.now() }
    writeStore(s)
    this.offset = 0
  }

  /** Where the server is. Null when it forgot the upload (expired or finished elsewhere). */
  private async head(): Promise<number | null> {
    const res = await fetch(this.url!, { method: "HEAD", headers: await this.headers(), cache: "no-store" })
    if (res.status === 404 || res.status === 410 || res.status === 403) return null
    if (!res.ok) throw new TusError(friendly(res.status, ""), res.status)
    const n = Number(res.headers.get("upload-offset"))
    return Number.isFinite(n) ? n : null
  }

  private patch(chunk: Blob, headers: Record<string, string>): Promise<number> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      this.xhr = xhr
      xhr.open("PATCH", this.url!)
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
      xhr.setRequestHeader("upload-offset", String(this.offset))
      xhr.setRequestHeader("content-type", "application/offset+octet-stream")
      xhr.upload.onprogress = (e) => this.o.onProgress?.(this.offset + e.loaded, this.o.file.size)
      xhr.onload = () => {
        this.xhr = null
        if (xhr.status === 204 || xhr.status === 200) {
          const n = Number(xhr.getResponseHeader("upload-offset"))
          resolve(Number.isFinite(n) && n > 0 ? n : this.offset + chunk.size)
        } else reject(new TusError(friendly(xhr.status, xhr.responseText ?? ""), xhr.status))
      }
      xhr.onerror = () => {
        this.xhr = null
        reject(new TusError("The connection dropped.", 0))
      }
      xhr.onabort = () => {
        this.xhr = null
        reject(new TusError("paused", -1))
      }
      xhr.send(chunk)
    })
  }

  pause() {
    if (this.stopped) return
    this.paused = true
    this.xhr?.abort()
    this.o.onState?.("paused")
  }

  resume() {
    if (!this.paused) return
    this.paused = false
    this.o.onState?.("uploading")
    this.wake?.()
  }

  /** Stops for good and asks the server to drop what it has. */
  async cancel() {
    this.stopped = true
    this.xhr?.abort()
    this.wake?.()
    if (this.url) {
      await fetch(this.url, { method: "DELETE", headers: await this.headers().catch(() => ({}) as Record<string, string>) }).catch(() => null)
    }
    forgetUpload(this.o.fingerprint)
  }

  private waitWhilePaused() {
    if (!this.paused) return Promise.resolve()
    return new Promise<void>((r) => (this.wake = r))
  }

  async start(): Promise<void> {
    this.o.onState?.("uploading")
    let attempt = 0
    for (;;) {
      await this.waitWhilePaused()
      if (this.stopped) throw new TusError("Upload cancelled.", -2)
      try {
        if (!this.url) await this.create()
        else {
          const at = await this.head()
          if (at === null) {
            this.url = null
            continue
          }
          this.offset = at
        }
        this.o.onProgress?.(this.offset, this.o.file.size)
        while (this.offset < this.o.file.size) {
          await this.waitWhilePaused()
          if (this.stopped) throw new TusError("Upload cancelled.", -2)
          const chunk = this.o.file.slice(this.offset, this.offset + TUS_CHUNK)
          this.offset = await this.patch(chunk, await this.headers())
          this.o.onProgress?.(this.offset, this.o.file.size)
          attempt = 0
        }
        forgetUpload(this.o.fingerprint)
        this.o.onState?.("done")
        return
      } catch (e) {
        const err = e instanceof TusError ? e : new TusError((e as Error).message || "The connection dropped.")
        if (err.status === -2) throw err
        if (err.status === -1) continue // paused: wait, then ask where to carry on
        // A conflict means our offset is stale: ask the server and go on.
        if (err.status === 409 && this.url) {
          attempt++
          if (attempt <= RETRY_DELAYS.length) continue
        }
        const retryable = err.status === 0 || err.status === 423 || err.status === 429 || err.status >= 500
        if (!retryable || attempt >= RETRY_DELAYS.length) {
          this.o.onState?.("error", err.message)
          throw err
        }
        const delay = RETRY_DELAYS[attempt++]
        this.o.onState?.("retrying", `Connection lost. Trying again${delay ? ` in ${Math.round(delay / 1000)} s` : ""}…`)
        await new Promise((r) => setTimeout(r, delay))
        if (!this.paused) this.o.onState?.("uploading")
      }
    }
  }
}
