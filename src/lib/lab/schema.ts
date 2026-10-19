/*
 * JSON Schema for structured outputs: a field tree you can build visually, turned into JSON Schema
 * (draft 2020-12), an example value, and a validator for the subset this builder writes.
 *
 * Supported keywords: type, properties, required, additionalProperties (false), items, enum, description,
 * minLength, maxLength, pattern, format (date, date-time, email, uri), minimum, maximum, minItems, maxItems.
 * Anything else in a schema is ignored by the validator, and the validator says so.
 */

export type FieldType = "string" | "number" | "integer" | "boolean" | "enum" | "array" | "object"

export type Field = {
  id: string
  name: string
  type: FieldType
  description: string
  required: boolean
  /** enum values, for type "enum". */
  values: string[]
  /** Item type for arrays. */
  items?: Field
  /** Children for objects. */
  children: Field[]
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: "" | "date" | "date-time" | "email" | "uri"
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
}

let seq = 0
export const newId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`

export function field(name: string, type: FieldType, extra: Partial<Field> = {}): Field {
  return { id: newId(), name, type, description: "", required: true, values: [], children: [], ...extra }
}

export type JsonSchema = {
  type?: string | string[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  enum?: unknown[]
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  title?: string
  $schema?: string
  [k: string]: unknown
}

function fieldSchema(f: Field, strict: boolean): JsonSchema {
  const s: JsonSchema = {}
  if (f.type === "enum") {
    s.type = "string"
    s.enum = f.values.filter((v) => v !== "")
  } else s.type = f.type
  if (f.description.trim()) s.description = f.description.trim()
  if (f.type === "string") {
    if (f.minLength != null) s.minLength = f.minLength
    if (f.maxLength != null) s.maxLength = f.maxLength
    if (f.pattern) s.pattern = f.pattern
    if (f.format) s.format = f.format
  }
  if (f.type === "number" || f.type === "integer") {
    if (f.minimum != null) s.minimum = f.minimum
    if (f.maximum != null) s.maximum = f.maximum
  }
  if (f.type === "array") {
    s.items = f.items ? fieldSchema(f.items, strict) : { type: "string" }
    if (f.minItems != null) s.minItems = f.minItems
    if (f.maxItems != null) s.maxItems = f.maxItems
  }
  if (f.type === "object") Object.assign(s, objectSchema(f.children, strict))
  return s
}

function objectSchema(children: Field[], strict: boolean): JsonSchema {
  const named = children.filter((c) => c.name.trim())
  const properties: Record<string, JsonSchema> = {}
  for (const c of named) properties[c.name.trim()] = fieldSchema(c, strict)
  const s: JsonSchema = { type: "object", properties, required: named.filter((c) => c.required || strict).map((c) => c.name.trim()) }
  if (strict) s.additionalProperties = false
  return s
}

/**
 * The root is always an object (what structured-output APIs expect). In strict mode every property is
 * required and no extra properties are allowed, which is what strict structured-output modes ask for;
 * optional fields should then allow null in the prompt instead.
 */
export function toSchema(fields: Field[], o: { title?: string; strict: boolean }): JsonSchema {
  const s: JsonSchema = { $schema: "https://json-schema.org/draft/2020-12/schema" }
  if (o.title?.trim()) s.title = o.title.trim()
  return { ...s, ...objectSchema(fields, o.strict) }
}

/* ---------------------------------------------------------------- example */

export function example(s: JsonSchema): unknown {
  if (s.enum?.length) return s.enum[0]
  const type = Array.isArray(s.type) ? s.type[0] : s.type
  switch (type) {
    case "string":
      if (s.format === "date") return "2026-01-31"
      if (s.format === "date-time") return "2026-01-31T09:30:00Z"
      if (s.format === "email") return "name@example.com"
      if (s.format === "uri") return "https://example.com"
      return "text".padEnd(Math.max(4, s.minLength ?? 0), "x").slice(0, s.maxLength ?? 64)
    case "integer":
      return Math.max(s.minimum ?? 0, Math.min(s.maximum ?? 1, 1))
    case "number":
      return Math.max(s.minimum ?? 0, Math.min(s.maximum ?? 0.5, 0.5))
    case "boolean":
      return true
    case "array": {
      const n = Math.max(1, s.minItems ?? 1)
      return Array.from({ length: Math.min(n, s.maxItems ?? n) }, () => example(s.items ?? { type: "string" }))
    }
    case "object": {
      const o: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(s.properties ?? {})) o[k] = example(v)
      return o
    }
    default:
      return null
  }
}

/* -------------------------------------------------------------- validator */

export type Issue = { path: string; message: string }

const FORMATS: Record<string, RegExp> = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  "date-time": /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uri: /^[a-z][a-z0-9+.-]*:\S+$/i,
}

const SUPPORTED = new Set([
  "type",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "title",
  "$schema",
])

function typeOf(v: unknown): string {
  if (v === null) return "null"
  if (Array.isArray(v)) return "array"
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number"
  return typeof v
}

function matchesType(v: unknown, t: string) {
  const actual = typeOf(v)
  return actual === t || (t === "number" && actual === "integer")
}

export function validate(schema: JsonSchema, value: unknown): { issues: Issue[]; ignored: string[] } {
  const issues: Issue[] = []
  const ignored = new Set<string>()
  const walk = (s: JsonSchema, v: unknown, path: string) => {
    for (const k of Object.keys(s)) if (!SUPPORTED.has(k)) ignored.add(k)
    if (s.type) {
      const types = Array.isArray(s.type) ? s.type : [s.type]
      if (!types.some((t) => matchesType(v, t))) {
        issues.push({ path, message: `expected ${types.join(" or ")}, got ${typeOf(v)}` })
        return
      }
    }
    if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) issues.push({ path, message: `must be one of ${s.enum.map((e) => JSON.stringify(e)).join(", ")}` })
    if (typeof v === "string") {
      const len = Array.from(v).length
      if (s.minLength != null && len < s.minLength) issues.push({ path, message: `shorter than ${s.minLength} characters` })
      if (s.maxLength != null && len > s.maxLength) issues.push({ path, message: `longer than ${s.maxLength} characters` })
      if (s.pattern) {
        try {
          if (!new RegExp(s.pattern, "u").test(v)) issues.push({ path, message: `does not match /${s.pattern}/` })
        } catch {
          issues.push({ path, message: `pattern /${s.pattern}/ is not a valid regular expression` })
        }
      }
      if (s.format && FORMATS[s.format] && !FORMATS[s.format].test(v)) issues.push({ path, message: `is not a valid ${s.format}` })
    }
    if (typeof v === "number") {
      if (s.minimum != null && v < s.minimum) issues.push({ path, message: `less than ${s.minimum}` })
      if (s.maximum != null && v > s.maximum) issues.push({ path, message: `greater than ${s.maximum}` })
    }
    if (Array.isArray(v)) {
      if (s.minItems != null && v.length < s.minItems) issues.push({ path, message: `fewer than ${s.minItems} items` })
      if (s.maxItems != null && v.length > s.maxItems) issues.push({ path, message: `more than ${s.maxItems} items` })
      if (s.items) v.forEach((x, i) => walk(s.items!, x, `${path}[${i}]`))
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>
      for (const r of s.required ?? []) if (!(r in o)) issues.push({ path: `${path}.${r}`, message: "is required" })
      for (const [k, x] of Object.entries(o)) {
        const sub = s.properties?.[k]
        if (sub) walk(sub, x, `${path}.${k}`)
        else if (s.additionalProperties === false) issues.push({ path: `${path}.${k}`, message: "is not allowed (additionalProperties is false)" })
        else if (s.additionalProperties && typeof s.additionalProperties === "object") walk(s.additionalProperties, x, `${path}.${k}`)
      }
    }
  }
  walk(schema, value, "$")
  return { issues, ignored: [...ignored] }
}

/** Turns a JSON Schema produced elsewhere back into fields, as far as the builder supports it. */
export function fromSchema(s: JsonSchema): Field[] {
  const req = new Set(s.required ?? [])
  return Object.entries(s.properties ?? {}).map(([name, p]) => toField(name, p, req.has(name)))
}

function toField(name: string, p: JsonSchema, required: boolean): Field {
  const t = Array.isArray(p.type) ? p.type.find((x) => x !== "null") : p.type
  const type: FieldType = p.enum ? "enum" : t === "number" || t === "integer" || t === "boolean" || t === "array" || t === "object" ? t : "string"
  const f = field(name, type, {
    required,
    description: typeof p.description === "string" ? p.description : "",
    values: p.enum ? p.enum.map(String) : [],
    minLength: p.minLength,
    maxLength: p.maxLength,
    pattern: p.pattern,
    format: (["date", "date-time", "email", "uri"].includes(p.format ?? "") ? p.format : "") as Field["format"],
    minimum: p.minimum,
    maximum: p.maximum,
    minItems: p.minItems,
    maxItems: p.maxItems,
  })
  if (type === "array") f.items = toField("item", p.items ?? { type: "string" }, true)
  if (type === "object") f.children = fromSchema(p)
  return f
}
