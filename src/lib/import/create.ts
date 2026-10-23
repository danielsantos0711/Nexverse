import { sha256Hex } from "@/lib/code/hash"
import { rest, supabase, type Member } from "@/lib/code/server"
import { KINDS } from "@/lib/data"
import { cleanSpecs, slugify, type SourceSite } from "@/lib/projects"
import { legacyLicense } from "@/lib/publish/licenses"
import { storageName } from "@/lib/publish/storage-name"
import { ImportError } from "./fetch"
import { creditCover, storeCover, type StoredCover } from "./images"
import { readSource, type Draft, type SourceType } from "./sources"
import type { ImportPreview, ImportRequest, ImportResult, ImportType } from "./types"

/** Any import: the members' form (Hugging Face, OpenRouter) or the admin mass import (also GitHub and arXiv). */
export type AnyImport = { site: SourceSite; type: SourceType; id: string; publish?: boolean; copyFiles?: boolean; images?: boolean }

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
    type: d.type as ImportType,
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
export async function runImport(m: Member, req: ImportRequest | AnyImport, { curated = false }: { curated?: boolean } = {}): Promise<ImportResult> {
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
  const kind = d.kind
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
        project_type: d.projectType,
        ...(d.repoUrl ? { repo_url: d.repoUrl } : {}),
        ...(d.paperUrl ? { paper_url: d.paperUrl } : {}),
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
        specs: cleanSpecs(d.specs, d.projectType),
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
    if (!site || !SITES.has(site) || !type || !TYPES.has(type) || typeof ref !== "string") {
      done.push({ id: r.id, ok: false, note: "Not an import Nexverse can read again." })
      continue
    }
    try {
      const d = await readSource(site as SourceSite, type as SourceType, ref)
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

// ─── Refresh details ────────────────────────────────────────────────────────────────────────────────────────

type RefreshRow = { id: string; kind: string; project_type: string | null; readme: string; summary: string; tags: string[]; license: string; license_id: string | null; langs: string[]; cover_url: string | null; specs: Record<string, unknown> | null; source: { site?: string; type?: string; ref?: string; importedAt?: string; curated?: boolean } | null; created_at: string; updated_at: string }

const SITES = new Set(["huggingface", "openrouter", "github", "arxiv"])
const TYPES = new Set(["model", "dataset", "repo", "tool", "paper"])

/**
 * Reads imported projects from their source again and fills what is missing or out of date: the README or card
 * when the page still has the imported one (or a thin one), the specs and the facts from the source (numbers,
 * dates, files, release, a dataset preview), tags, licence and languages when empty, and the cover when there is
 * none. Anything an owner wrote by hand stays. Up to `limit` projects a call, the least recently refreshed first.
 */
export async function refreshProjects(m: Member, { ids, all = false, limit = 4 }: { ids?: string[]; all?: boolean; limit?: number }) {
  const n = Math.min(8, Math.max(1, limit))
  let q = `projects?source=not.is.null&select=id,kind,project_type,readme,summary,tags,license,license_id,langs,cover_url,specs,source,created_at,updated_at&order=updated_at.asc&limit=${n}`
  if (ids?.length) q += `&id=in.(${ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 10).join(",")})`
  else {
    // Only what has not been refreshed in the last six hours, so repeated calls walk through the list.
    q += `&or=${encodeURIComponent(`(specs->imported->>at.is.null,specs->imported->>at.lt.${new Date(Date.now() - 6 * 36e5).toISOString()})`)}`
    if (!all) q += `&owner_id=eq.${m.id}`
  }
  const rows = await rest<RefreshRow[]>(m, q).catch(friendly)
  const done: { id: string; ok: boolean; filled: string[]; note?: string }[] = []
  for (const r of rows) {
    const site = r.source?.site
    const type = r.source?.type ?? (r.kind === "dataset" ? "dataset" : r.kind === "model" ? "model" : undefined)
    const ref = r.source?.ref
    if (!site || !SITES.has(site) || !type || !TYPES.has(type) || typeof ref !== "string") {
      done.push({ id: r.id, ok: false, filled: [], note: "Not an import Nexverse can read again." })
      continue
    }
    try {
      const d = await readSource(site as SourceSite, type as SourceType, ref)
      const patch: Record<string, unknown> = {}
      const filled: string[] = []
      // The README: replaced when the page still holds a thin card, or one shorter than the source's.
      const current = r.readme ?? ""
      if (d.readme && (current.trim().length < 400 || (current.length < d.readme.length && current.length < 50_000 && d.readme.startsWith(current.slice(0, 200))))) {
        if (d.readme !== current) {
          patch.readme = d.readme
          filled.push("readme")
        }
      }
      const specs = cleanSpecs({ ...(r.specs ?? {}), ...d.specs }, d.projectType)
      patch.specs = specs
      filled.push("facts")
      if (!r.tags?.length && d.tags.length) {
        patch.tags = d.tags
        filled.push("tags")
      }
      if ((r.license === "unspecified" || !r.license) && !r.license_id && d.license !== "unspecified") {
        patch.license = legacyLicense(d.license)
        patch.license_id = d.license
        filled.push("licence")
      }
      if (!r.langs?.length && d.langs.length) {
        patch.langs = d.langs
        filled.push("languages")
      }
      if (/imported from|on Nexverse$/i.test(r.summary) && d.summary && !/imported from/i.test(d.summary)) {
        patch.summary = d.summary
        filled.push("summary")
      }
      if (d.repoUrl) patch.repo_url = d.repoUrl
      if (d.paperUrl) patch.paper_url = d.paperUrl
      // projects.source is the import credit, fixed at creation (no update grant, and a trigger keeps it); the
      // refresh time lives in specs.imported.at.
      await rest(m, `projects?id=eq.${r.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" })
      if (!r.cover_url) {
        const cover = await d.covers().then((c) => storeCover(m, c)).catch(() => null)
        if (cover) {
          await rest(m, `projects?id=eq.${r.id}`, { method: "PATCH", body: { cover_url: cover.url }, prefer: "return=minimal" })
          await creditCover(m, r.id, site, cover)
          filled.push("cover")
        }
      }
      done.push({ id: r.id, ok: true, filled })
    } catch (e) {
      done.push({ id: r.id, ok: false, filled: [], note: ((e as Error)?.message ?? "Failed.").slice(0, 160) })
    }
  }
  const left = ids?.length
    ? []
    : await rest<{ id: string }[]>(m, `projects?source=not.is.null&select=id&limit=300&or=${encodeURIComponent(`(specs->imported->>at.is.null,specs->imported->>at.lt.${new Date(Date.now() - 6 * 36e5).toISOString()})`)}${all ? "" : `&owner_id=eq.${m.id}`}`).catch(() => [])
  return { done, remaining: left.length }
}
