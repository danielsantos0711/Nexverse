/*
 * What members import, shared by the import form (browser) and the import route (server). Ids are checked here
 * the same way on both sides; the server never builds an address from anything else.
 */

export type ImportSite = "huggingface" | "openrouter"
export type ImportType = "model" | "dataset"

export type ImportRequest = { site: ImportSite; type: ImportType; id: string; preview?: boolean; publish?: boolean; copyFiles?: boolean }

/** What an import would create, shown before anything is written. */
export type ImportPreview = {
  site: ImportSite
  type: ImportType
  ref: string
  name: string
  summary: string
  tags: string[]
  license: string
  langs: string[]
  readmeChars: number
  facts: { label: string; value: string }[]
  /** Small files that would be copied into Nexverse storage (names and sizes). */
  files: { name: string; bytes: number | null }[]
}

export type ImportResult = { id: string; kind: "model" | "dataset"; href: string; files: number; skipped: string[] }

export const SITE_NAMES: Record<ImportSite, string> = { huggingface: "Hugging Face", openrouter: "OpenRouter" }

// owner/name, each part a Hugging Face repo name. Single names ("gpt2") are old canonical ids that still exist.
const HF_ID = /^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/
// author/model, optionally with a variant (":free", ":beta").
const OR_ID = /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,95}(?::[a-z0-9._-]{1,30})?$/i

/**
 * Accepts an id or the address members copy from the site, and returns the bare id. Only the two known hosts
 * are understood; anything else is refused.
 */
export function parseImportId(site: ImportSite, type: ImportType, raw: string): string | null {
  let s = raw.trim().replace(/\s+/g, "")
  if (!s) return null
  if (/^https?:\/\//i.test(s) || /^(www\.)?(huggingface\.co|hf\.co|openrouter\.ai)\//i.test(s)) {
    let u: URL
    try {
      u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
    } catch {
      return null
    }
    const host = u.hostname.replace(/^www\./, "")
    const parts = u.pathname.split("/").filter(Boolean)
    if (site === "huggingface") {
      if (host !== "huggingface.co" && host !== "hf.co") return null
      if (parts[0] === "datasets") {
        if (type !== "dataset") return null
        parts.shift()
      } else if (type === "dataset") return null
      if (parts[0] === "models" || parts[0] === "spaces") return null
      s = parts.slice(0, 2).join("/")
    } else {
      if (host !== "openrouter.ai") return null
      if (parts[0] === "models" || parts[0] === "api") return null
      s = parts.slice(0, 2).join("/")
    }
  }
  if (site === "huggingface") return HF_ID.test(s) && !s.includes("..") ? s : null
  return type === "model" && OR_ID.test(s) ? s.toLowerCase() : null
}
