/*
 * Embedding similarity for pasted vectors: parsing (JSON arrays or one vector per line), cosine similarity,
 * dot product and Euclidean distance, and a pairwise matrix.
 */

export type Vec = { label: string; values: number[] }

export type Parsed = { vectors: Vec[]; errors: string[] }

/**
 * Accepts: a JSON array of arrays, a JSON object of label → array, or lines like `label: 0.1, 0.2, …`
 * (the label is optional; commas, spaces or tabs separate numbers).
 */
export function parseVectors(input: string): Parsed {
  const text = input.trim()
  if (!text) return { vectors: [], errors: [] }
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const j = JSON.parse(text) as unknown
      const entries: [string, unknown][] = Array.isArray(j) ? j.map((v, i) => [`v${i + 1}`, v]) : Object.entries(j as Record<string, unknown>)
      const errors: string[] = []
      const vectors: Vec[] = []
      for (const [label, v] of entries) {
        if (Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x))) vectors.push({ label, values: v as number[] })
        else errors.push(`${label} is not an array of numbers`)
      }
      return { vectors, errors }
    } catch (e) {
      return { vectors: [], errors: [`Not valid JSON: ${(e as Error).message}`] }
    }
  }
  const vectors: Vec[] = []
  const errors: string[] = []
  text.split(/\n+/).forEach((line, i) => {
    const m = /^\s*([^:\d\-[.][^:]*):\s*(.*)$/.exec(line)
    const label = m ? m[1].trim() : `v${i + 1}`
    const body = (m ? m[2] : line).replace(/[[\]]/g, "")
    const nums = body.split(/[\s,;]+/).filter(Boolean).map(Number)
    if (!nums.length || nums.some((n) => !Number.isFinite(n))) errors.push(`Line ${i + 1} has something that is not a number`)
    else vectors.push({ label, values: nums })
  })
  return { vectors, errors }
}

export const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0)
export const norm = (a: number[]) => Math.sqrt(dot(a, a))
export const cosine = (a: number[], b: number[]) => {
  const d = norm(a) * norm(b)
  return d === 0 ? 0 : dot(a, b) / d
}
export const euclidean = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, x, i) => s + (x - (b[i] ?? 0)) ** 2, 0))

export type Metric = "cosine" | "dot" | "euclidean"

export function matrix(vs: Vec[], metric: Metric): number[][] {
  const f = metric === "cosine" ? cosine : metric === "dot" ? dot : euclidean
  return vs.map((a) => vs.map((b) => f(a.values, b.values)))
}
