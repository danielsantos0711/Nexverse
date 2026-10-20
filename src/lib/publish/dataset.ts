/*
 * The dataset viewer's reading side: CSV, TSV, JSON (an array of objects, or {data: [...]}) and JSON Lines,
 * parsed in the browser into rows with column types and simple stats. Parquet is binary and needs a
 * decompressor, so it is listed but not previewed (no heavy dependency for it).
 */

export type Cell = string | number | boolean | null | object

export type ColumnType = "string" | "integer" | "float" | "boolean" | "date" | "list" | "object" | "empty"

export type ColumnStats = {
  name: string
  type: ColumnType
  nulls: number
  unique: number
  /** Numbers. */
  min?: number
  max?: number
  mean?: number
  /** Strings: shortest and longest length. */
  minLength?: number
  maxLength?: number
  /** The commonest values (up to 5), with counts. */
  top: { value: string; count: number }[]
  /** Ten bins for numbers and string lengths, for the little histogram. */
  bins: number[]
}

export type Table = { columns: string[]; rows: Cell[][]; stats: ColumnStats[]; format: DataFormat; truncated: boolean; problems: string[] }

export type DataFormat = "csv" | "tsv" | "json" | "jsonl" | "parquet"

const MAX_ROWS = 50_000

export function formatOf(name: string): DataFormat | null {
  const n = name.toLowerCase()
  if (n.endsWith(".csv")) return "csv"
  if (n.endsWith(".tsv")) return "tsv"
  if (n.endsWith(".jsonl") || n.endsWith(".ndjson")) return "jsonl"
  if (n.endsWith(".json")) return "json"
  if (n.endsWith(".parquet")) return "parquet"
  return null
}

/** "train-00000-of-00002.csv", "data/test.jsonl", "validation.json" → the split it belongs to. */
export function splitOf(name: string): string | null {
  const n = name.toLowerCase()
  const m = n.match(/(?:^|[/_.-])(train|training|test|testing|validation|valid|val|dev|eval|sample)(?=[/_.-]|$)/)
  if (!m) return null
  const k = m[1]
  return k.startsWith("train") ? "train" : k.startsWith("test") ? "test" : k === "valid" || k === "val" || k === "validation" ? "validation" : k
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
function parseDelimited(text: string, sep: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"' && field === "") quoted = true
    else if (c === sep) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      field = ""
      if (row.length > 1 || row[0] !== "") out.push(row)
      row = []
      if (out.length > MAX_ROWS) break
    } else field += c
  }
  if (field !== "" || row.length) {
    row.push(field)
    out.push(row)
  }
  return out
}

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/
const DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

/** CSV cells are text: numbers, booleans and empty cells get their real types. */
function typed(s: string): Cell {
  const t = s.trim()
  if (t === "" || /^(null|nan|none|n\/a)$/i.test(t)) return null
  if (NUM.test(t)) return Number(t)
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true"
  return s
}

function fromObjects(list: unknown[]): { columns: string[]; rows: Cell[][] } {
  const columns: string[] = []
  const seen = new Set<string>()
  for (const o of list.slice(0, 2000)) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue
    for (const k of Object.keys(o)) {
      if (seen.has(k) || seen.size >= 200) continue
      seen.add(k)
      columns.push(k)
    }
  }
  if (!columns.length) columns.push("value")
  const rows = list.map((o) => (o && typeof o === "object" && !Array.isArray(o) ? columns.map((c) => ((o as Record<string, unknown>)[c] ?? null) as Cell) : [o as Cell]))
  return { columns, rows }
}

function typeOfValue(v: Cell): ColumnType {
  if (v === null || v === undefined) return "empty"
  if (typeof v === "boolean") return "boolean"
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "float"
  if (Array.isArray(v)) return "list"
  if (typeof v === "object") return "object"
  return DATE.test(v) ? "date" : "string"
}

export const cellText = (v: Cell): string => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))

function statsOf(name: string, values: Cell[]): ColumnStats {
  const counts = new Map<ColumnType, number>()
  let nulls = 0
  for (const v of values) {
    const t = typeOfValue(v)
    if (t === "empty") nulls++
    else counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  let type: ColumnType = "empty"
  if (counts.size) {
    // Integers mixed with floats are floats; anything else mixed is text.
    if (counts.size === 2 && counts.has("integer") && counts.has("float")) type = "float"
    else type = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  const freq = new Map<string, number>()
  for (const v of values) {
    if (v === null) continue
    const k = cellText(v).slice(0, 200)
    freq.set(k, (freq.get(k) ?? 0) + 1)
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }))
  const s: ColumnStats = { name, type, nulls, unique: freq.size, top, bins: [] }
  const nums = type === "integer" || type === "float" ? values.filter((v): v is number => typeof v === "number") : type === "string" ? values.filter((v) => typeof v === "string").map((v) => (v as string).length) : []
  if (nums.length) {
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (const n of nums) {
      if (n < min) min = n
      if (n > max) max = n
      sum += n
    }
    if (type === "string") {
      s.minLength = min
      s.maxLength = max
    } else {
      s.min = min
      s.max = max
      s.mean = sum / nums.length
    }
    const bins = new Array(10).fill(0)
    const span = max - min || 1
    for (const n of nums) bins[Math.min(9, Math.floor(((n - min) / span) * 10))]++
    s.bins = bins
  }
  return s
}

/** Parses a file's text for the viewer. Problems (a bad line, a ragged row) are reported, not thrown. */
export function parseTable(text: string, format: Exclude<DataFormat, "parquet">, truncated = false): Table {
  const problems: string[] = []
  let columns: string[] = []
  let rows: Cell[][] = []
  if (format === "csv" || format === "tsv") {
    const grid = parseDelimited(text.replace(/^﻿/, ""), format === "csv" ? "," : "\t")
    if (truncated && grid.length > 1) grid.pop() // the last line may be cut in half
    const head = grid.shift() ?? []
    columns = head.map((h, i) => h.trim() || `column ${i + 1}`)
    let ragged = 0
    rows = grid.map((r) => {
      if (r.length !== columns.length) ragged++
      return columns.map((_, i) => typed(r[i] ?? ""))
    })
    if (ragged) problems.push(`${ragged.toLocaleString("en")} ${ragged === 1 ? "row has" : "rows have"} a different number of cells than the header.`)
  } else if (format === "jsonl") {
    const list: unknown[] = []
    let bad = 0
    const lines = text.split(/\r?\n/)
    if (truncated) lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        list.push(JSON.parse(line))
      } catch {
        bad++
      }
      if (list.length >= MAX_ROWS) break
    }
    if (bad) problems.push(`${bad.toLocaleString("en")} ${bad === 1 ? "line is" : "lines are"} not valid JSON and were skipped.`)
    ;({ columns, rows } = fromObjects(list))
  } else {
    try {
      const v = JSON.parse(text) as unknown
      const list = Array.isArray(v) ? v : v && typeof v === "object" ? (Object.values(v).find(Array.isArray) as unknown[] | undefined) : undefined
      if (!list) problems.push("This JSON file is not a list of records, so it shows as one row.")
      ;({ columns, rows } = fromObjects(list ?? [v]))
    } catch {
      problems.push(truncated ? "Only the start of this JSON file was read, and it cannot be parsed on its own. Download it to read it all." : "This file is not valid JSON.")
    }
  }
  if (rows.length > MAX_ROWS) {
    rows = rows.slice(0, MAX_ROWS)
    truncated = true
  }
  const stats = columns.map((c, i) => statsOf(c, rows.map((r) => r[i] ?? null)))
  return { columns, rows, stats, format, truncated, problems }
}
