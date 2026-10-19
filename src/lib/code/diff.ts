/*
 * Line diffs, written here so the code host needs no diff library.
 *
 * `diffLines` is Myers' O((N+M)·D) algorithm ("An O(ND) Difference Algorithm and Its Variations", 1986): it walks
 * diagonals of the edit graph, keeping the furthest-reaching path for each number of edits, and backtracks through
 * the saved frontiers to recover a shortest edit script. Common leading and trailing lines are stripped first,
 * which makes the usual "a few lines changed in a big file" case nearly linear. When two files differ in more than
 * MAX_EDITS places the script stops searching and reports the rest as replaced, so a huge rewrite cannot freeze
 * the page.
 *
 * `toHunks` groups the script into unified-diff hunks with context, and `splitRows` pairs deletions with additions
 * for the side-by-side view.
 */

export type Edit = { op: "eq" | "del" | "ins"; /** Index in the old lines (eq, del). */ a: number; /** Index in the new lines (eq, ins). */ b: number }

export type DiffLine = { kind: "ctx" | "del" | "add"; /** 1-based line in the old file. */ old: number | null; /** 1-based line in the new file. */ new: number | null; text: string }

export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[] }

export type SplitRow = { left: DiffLine | null; right: DiffLine | null; kind: "ctx" | "change" }

const MAX_EDITS = 4000

/** Splits text into lines the way git counts them: a trailing newline does not make an extra empty line. */
export function splitLines(text: string): string[] {
  if (!text) return []
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  if (lines[lines.length - 1] === "") lines.pop()
  return lines
}

/** Shortest edit script turning `a` into `b`. */
export function diffLines(a: readonly string[], b: readonly string[]): Edit[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const head: Edit[] = []
  for (let i = 0; i < start; i++) head.push({ op: "eq", a: i, b: i })
  const tail: Edit[] = []
  for (let i = 0; i < a.length - endA; i++) tail.push({ op: "eq", a: endA + i, b: endB + i })

  const middle = myers(a, b, start, endA, start, endB)
  return head.concat(middle, tail)
}

function myers(a: readonly string[], b: readonly string[], a0: number, a1: number, b0: number, b1: number): Edit[] {
  const n = a1 - a0
  const m = b1 - b0
  if (n === 0 && m === 0) return []
  if (n === 0) return Array.from({ length: m }, (_, i) => ({ op: "ins" as const, a: a0, b: b0 + i }))
  if (m === 0) return Array.from({ length: n }, (_, i) => ({ op: "del" as const, a: a0 + i, b: b0 }))

  const max = n + m
  const offset = max + 1
  // v[k + offset] = furthest x on diagonal k. One saved copy per d for backtracking.
  let v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  const limit = Math.min(max, MAX_EDITS)
  let found = -1

  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2))
    const next = v.slice()
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) {
        x++
        y++
      }
      next[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
    v = next
    if (found >= 0) break
  }

  if (found < 0) {
    // Too different to search further: everything in the middle is replaced.
    const out: Edit[] = []
    for (let i = 0; i < n; i++) out.push({ op: "del", a: a0 + i, b: b0 })
    for (let j = 0; j < m; j++) out.push({ op: "ins", a: a1, b: b0 + j })
    return out
  }

  // Backtrack from (n, m) through the saved frontiers.
  const out: Edit[] = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const saved = trace[d]
    const at = (k: number) => saved[k + d + 1]
    const k = x - y
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1
    const prevX = at(prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x--
      y--
      out.push({ op: "eq", a: a0 + x, b: b0 + y })
    }
    if (x === prevX) {
      y--
      out.push({ op: "ins", a: a0 + x, b: b0 + y })
    } else {
      x--
      out.push({ op: "del", a: a0 + x, b: b0 + y })
    }
  }
  while (x > 0 && y > 0) {
    x--
    y--
    out.push({ op: "eq", a: a0 + x, b: b0 + y })
  }
  return out.reverse()
}

/** Lines added and removed. */
export function diffStats(edits: Edit[]) {
  let added = 0
  let removed = 0
  for (const e of edits) {
    if (e.op === "ins") added++
    else if (e.op === "del") removed++
  }
  return { added, removed }
}

/** Groups an edit script into hunks with `context` unchanged lines around each change. */
export function toHunks(a: readonly string[], b: readonly string[], edits: Edit[], context = 3): Hunk[] {
  const hunks: Hunk[] = []
  const changes: number[] = []
  edits.forEach((e, i) => e.op !== "eq" && changes.push(i))
  if (!changes.length) return hunks

  let i = 0
  while (i < changes.length) {
    const from = Math.max(0, changes[i] - context)
    let to = Math.min(edits.length - 1, changes[i] + context)
    // Merge changes whose context windows touch.
    while (i + 1 < changes.length && changes[i + 1] - context <= to + 1) {
      i++
      to = Math.min(edits.length - 1, changes[i] + context)
    }
    i++
    const lines: DiffLine[] = []
    for (let j = from; j <= to; j++) {
      const e = edits[j]
      if (e.op === "eq") lines.push({ kind: "ctx", old: e.a + 1, new: e.b + 1, text: a[e.a] })
      else if (e.op === "del") lines.push({ kind: "del", old: e.a + 1, new: null, text: a[e.a] })
      else lines.push({ kind: "add", old: null, new: e.b + 1, text: b[e.b] })
    }
    const first = edits[from]
    const oldLines = lines.filter((l) => l.kind !== "add").length
    const newLines = lines.filter((l) => l.kind !== "del").length
    hunks.push({
      oldStart: oldLines ? (lines.find((l) => l.old !== null)?.old ?? first.a + 1) : first.a,
      oldLines,
      newStart: newLines ? (lines.find((l) => l.new !== null)?.new ?? first.b + 1) : first.b,
      newLines,
      lines,
    })
  }
  return hunks
}

/** Side-by-side rows: unchanged lines on both sides, each run of deletions paired with the additions after it. */
export function splitRows(hunk: Hunk): SplitRow[] {
  const rows: SplitRow[] = []
  const ls = hunk.lines
  let i = 0
  while (i < ls.length) {
    if (ls[i].kind === "ctx") {
      rows.push({ left: ls[i], right: ls[i], kind: "ctx" })
      i++
      continue
    }
    const dels: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < ls.length && ls[i].kind === "del") dels.push(ls[i++])
    while (i < ls.length && ls[i].kind === "add") adds.push(ls[i++])
    for (let j = 0; j < Math.max(dels.length, adds.length); j++) rows.push({ left: dels[j] ?? null, right: adds[j] ?? null, kind: "change" })
  }
  return rows
}

/** A unified diff in git's text format, for copying or downloading as a patch. */
export function unifiedPatch(oldPath: string | null, newPath: string | null, hunks: Hunk[]): string {
  const out = [`--- ${oldPath ? `a/${oldPath}` : "/dev/null"}`, `+++ ${newPath ? `b/${newPath}` : "/dev/null"}`]
  for (const h of hunks) {
    out.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`)
    for (const l of h.lines) out.push((l.kind === "ctx" ? " " : l.kind === "del" ? "-" : "+") + l.text)
  }
  return out.join("\n") + "\n"
}

/** Applies an edit script to the old lines; used by tests to prove a script really turns `a` into `b`. */
export function applyEdits(a: readonly string[], b: readonly string[], edits: Edit[]): string[] {
  const out: string[] = []
  for (const e of edits) {
    if (e.op === "eq") out.push(a[e.a])
    else if (e.op === "ins") out.push(b[e.b])
  }
  return out
}
