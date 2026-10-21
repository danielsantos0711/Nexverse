import { sha256Hex } from "@/lib/code/hash"
import { rest, supabase, type Member } from "@/lib/code/server"
import { KINDS } from "@/lib/data"
import { slugify } from "@/lib/projects"
import { legacyLicense } from "@/lib/publish/licenses"
import { storageName } from "@/lib/publish/storage-name"
import { ImportError } from "./fetch"
import { creditCover, storeCover, type StoredCover } from "./images"
import { readSource, type Draft } from "./sources"
import type { ImportPreview, ImportRequest, ImportResult } from "./types"

/*
 * Creating the Nexverse project for an import, as the member: every write goes through Supabase with their own
 * session, so the usual rules apply (project.create, suspensions, 20 projects a day, file quotas), and the
 * import log row written first is the rate limit (10 an hour, 30 a day, see the hub migration).
 */

const FILE_MAX = 5 * 1024 * 1024
const FILES_MAX = 8

/** A short in-memory brake on previews, which read the source but write nothing (per server instance). */
const previews = new Map<string, number[]>()
export function previewAllowed(memberId: string) {
  const now = Date.now()
  const recent = (previews.get(memberId) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= 20) return false
  recent.push(now)
  previews.set(memberId, recent)
  if (previews.size > 5000) previews.clear()
  return true
}

export async function previewImport(req: ImportRequest): Promise<ImportPreview> {
  const d = await readSource(req.site, req.type, req.id)
  return {
    site: req.site,
    type: d.type,
    ref: d.source.ref,
    name: d.name,
    summary: d.summary,
    tags: d.tags,
    license: d.license,
    langs: d.langs,
    readmeChars: d.readme.length,
    facts: d.facts,
    files: d.files.slice(0, FILES_MAX).map((f) => ({ name: f.name, bytes: f.bytes })),
  }
}

/** The member's next free address for this name: "llama-3", then "llama-3-2", … */
async function freeSlug(m: Member, name: string): Promise<string> {
  const base = (slugify(name) || "imported").slice(0, 54).replace(/-+$/, "") || "imported"
  const rows = await rest<{ slug: string }[]>(m, `projects?owner_id=eq.${m.id}&slug=like.${encodeURIComponent(base)}*&select=slug&limit=200`)
  const taken = new Set(rows.map((r) => r.slug))
  if (!taken.has(base)) return base
  for (let i = 2; i < 200; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${crypto.randomUUID().slice(0, 5)}`
}

function friendly(err: unknown): never {
  const msg = (err as Error)?.message ?? ""
  if (/project_imports|schema cache|does not exist|project_type|column/i.test(msg)) throw new ImportError(503, "Imports are still being switched on for this site. Ask an admin to run the latest database update.")
  if (/imported \d+ items/i.test(msg)) throw new ImportError(429, msg)
  if (/row-level security|not allowed/i.test(msg)) throw new ImportError(403, "Your account cannot publish projects yet, so it cannot import either.")
  if (/up to 20 projects a day/i.test(msg)) throw new ImportError(429, "You can create up to 20 projects a day. Try again tomorrow.")
  throw err
}

/** Uploads one small file into the project's downloads, the same way the upload area does. */
async function storeFile(m: Member, projectId: string, name: string, data: Uint8Array): Promise<void> {
  const env = supabase()
  const path = `project/${projectId}/${crypto.randomUUID()}/${storageName(name)}`
  const type = /\.jsonl$/i.test(name) ? "application/jsonl" : /\.json$/i.test(name) ? "application/json" : /\.md$/i.test(name) ? "text/markdown" : "text/plain"
  const res = await fetch(`${env.url}/storage/v1/object/downloads/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: { apikey: env.key, authorization: `Bearer ${m.token}`, "content-type": type, "x-upsert": "false" },
    body: new Blob([data.slice().buffer], { type }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new ImportError(400, "Storage refused a file.")
  await rest(m, "files", {
    method: "POST",
    body: { target_kind: "project", target_id: projectId, path, name: name.slice(0, 200), sha256: await sha256Hex(data), note: "Copied at import" },
    prefer: "return=minimal",
  })
}

/**
 * Creates the project. `curated` is the admin mass import: it is logged in mass_imports by the caller instead of
 * the member's own import log (and its hourly limit), and the project is published straight away.
 */
export async function runImport(m: Member, req: ImportRequest, { curated = false }: { curated?: boolean } = {}): Promise<ImportResult> {
  // The log row first: when the member is over the limit nothing is fetched at all.
  let logId: string | null = null
  if (!curated) {
    try {
      const rows = await rest<{ id: string }[]>(m, "project_imports", { method: "POST", body: { site: req.site, item_type: req.type, ref: req.id }, prefer: "return=representation" })
      logId = rows[0].id
    } catch (e) {
      friendly(e)
    }
  }
  const d: Draft = await readSource(req.site, req.type, req.id)
  const kind = d.type
  // The cover is copied into Nexverse storage before the project exists, so the project is born with it.
  const cover: StoredCover | null = req.images === false ? null : await d.covers().then((c) => storeCover(m, c)).catch(() => null)
  let id: string
  try {
    const slug = await freeSlug(m, d.name)
    const rows = await rest<{ id: string }[]>(m, "projects", {
      method: "POST",
      prefer: "return=representation",
      body: {
        owner_id: m.id,
        kind,
        project_type: kind,
        name: d.name.trim().slice(0, 80),
        slug,
        summary: d.summary,
        readme: d.readme,
        tags: d.tags,
        license: legacyLicense(d.license),
        license_id: d.license === "unspecified" ? null : d.license,
        langs: d.langs,
        status: req.publish || curated ? "published" : "draft",
        visibility: "public",
        specs: d.specs,
        source: curated ? { ...d.source, curated: true } : d.source,
        ...(cover ? { cover_url: cover.url } : {}),
      },
    })
    id = rows[0].id
  } catch (e) {
    friendly(e)
  }
  if (logId) await rest(m, `project_imports?id=eq.${logId}`, { method: "PATCH", body: { project_id: id }, prefer: "return=minimal" }).catch(() => null)
  if (cover) await creditCover(m, id, req.site, cover)

  let files = 0
  const skipped: string[] = []
  if (req.copyFiles !== false) {
    for (const f of d.files.slice(0, FILES_MAX)) {
      try {
        const data = await f.get()
        if (!data || !data.length || data.length > FILE_MAX) {
          skipped.push(f.name)
          continue
        }
        await storeFile(m, id, f.name, data)
        files++
      } catch {
        skipped.push(f.name)
      }
    }
  }
  return { id, kind, href: `${KINDS[kind].path}/${id}`, files, skipped, cover: cover?.origin ?? null }
}

type ImportedRow = { id: string; owner_id: string; cover_url: string | null; source: { site?: string; type?: string; ref?: string } | null }

/**
 * Fetches a cover for projects imported earlier without one (or, with `replace`, a fresh one). Members refresh
 * their own imports; admins any imported project. Up to `limit` projects per call, oldest first.
 */
export async function reimageProjects(m: Member, { ids, all = false, replace = false, limit = 6 }: { ids?: string[]; all?: boolean; replace?: boolean; limit?: number }) {
  const n = Math.min(10, Math.max(1, limit))
  let q = `projects?source=not.is.null&select=id,owner_id,cover_url,source&order=created_at.asc&limit=${n}`
  if (!replace) q += "&cover_url=is.null"
  if (ids?.length) q += `&id=in.(${ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 10).join(",")})`
  else if (!all) q += `&owner_id=eq.${m.id}`
  const rows = await rest<ImportedRow[]>(m, q).catch(friendly)
  const done: { id: string; ok: boolean; origin?: string; note?: string }[] = []
  for (const r of rows) {
    const site = r.source?.site
    const type = r.source?.type
    const ref = r.source?.ref
    if ((site !== "huggingface" && site !== "openrouter") || (type !== "model" && type !== "dataset") || typeof ref !== "string") {
      done.push({ id: r.id, ok: false, note: "Not an import Nexverse can read again." })
      continue
    }
    try {
      const d = await readSource(site, type, ref)
      const cover = await storeCover(m, await d.covers())
      if (!cover) {
        done.push({ id: r.id, ok: false, note: "The source has no picture Nexverse can use." })
        continue
      }
      await rest(m, `projects?id=eq.${r.id}`, { method: "PATCH", body: { cover_url: cover.url }, prefer: "return=minimal" })
      await creditCover(m, r.id, site, cover)
      done.push({ id: r.id, ok: true, origin: cover.origin })
    } catch (e) {
      done.push({ id: r.id, ok: false, note: ((e as Error)?.message ?? "Failed.").slice(0, 160) })
    }
  }
  const left = await rest<{ id: string }[]>(m, `projects?source=not.is.null&cover_url=is.null&select=id&limit=200${all ? "" : `&owner_id=eq.${m.id}`}`).catch(() => [])
  return { done, remaining: left.length }
}
