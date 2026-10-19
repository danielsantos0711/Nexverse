import { AiError } from "./errors"

/*
 * Defensive helpers for model output. Structured output should already be valid JSON, but the fallback path
 * (prompt-only JSON) can wrap it in prose or code fences, so we look for the first balanced object.
 */

/** Parse a JSON object out of model text. Returns undefined when there is none. */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim()
  if (!t) return undefined
  try {
    return JSON.parse(t)
  } catch {}
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1])
    } catch {}
  }
  const start = t.indexOf("{")
  if (start < 0) return undefined
  // Walk to the matching brace, respecting strings, so trailing prose does not break parsing.
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < t.length; i++) {
    const c = t[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === "\\") esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === "{") depth++
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(t.slice(start, i + 1))
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** A trimmed string field, cut to `max` characters, or "" when missing. */
export function str(v: unknown, max: number): string {
  if (typeof v !== "string") return ""
  const s = v.replace(/\u0000/g, "").trim()
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s
}

/** An array of trimmed strings, dropping empties, at most `count` items of `max` characters each. */
export function strList(v: unknown, count: number, max: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => str(x, max))
    .filter(Boolean)
    .slice(0, count)
}

/** Read a field from a request body as a string within limits; throws a 400/413 AiError when invalid. */
export function field(body: Record<string, unknown>, name: string, opts: { max: number; min?: number; optional?: boolean; label?: string }): string {
  const v = body[name]
  const label = opts.label ?? name
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return ""
    throw new AiError(400, "bad_request", `${label} is required.`)
  }
  if (typeof v !== "string") throw new AiError(400, "bad_request", `${label} must be text.`)
  const s = v.trim()
  if (s.length < (opts.min ?? 0)) throw new AiError(400, "bad_request", `${label} is too short.`)
  if (s.length > opts.max) throw new AiError(413, "too_large", `${label} is too long (max ${opts.max.toLocaleString("en")} characters).`)
  return s
}
