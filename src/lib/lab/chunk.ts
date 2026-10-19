import { quickTokens } from "./tokenizers"

/*
 * Chunking for retrieval. Four splitters, each returning chunks with their offsets in the original text so
 * the planner can colour them in place:
 *
 *   chars     fixed windows of N characters, stepping N − overlap, nudged back to the last space
 *   tokens    windows of about N tokens (estimated), built from whole words, with an overlap in tokens
 *   sentences whole sentences packed up to N characters, repeating the last `overlap` sentences
 *   markdown  one section per heading; sections longer than N characters are cut like `chars`
 */

export type Splitter = "chars" | "tokens" | "sentences" | "markdown"

export type ChunkOptions = { splitter: Splitter; size: number; overlap: number }

export type Chunk = { index: number; start: number; end: number; text: string; chars: number; tokens: number; heading?: string }

export const SPLITTERS: { id: Splitter; label: string; sizeUnit: string; overlapUnit: string; hint: string }[] = [
  { id: "chars", label: "Characters", sizeUnit: "chars", overlapUnit: "chars", hint: "Fixed windows, cut at the nearest space" },
  { id: "tokens", label: "Tokens", sizeUnit: "tokens", overlapUnit: "tokens", hint: "Windows of whole words, sized by estimated tokens" },
  { id: "sentences", label: "Sentences", sizeUnit: "chars", overlapUnit: "sentences", hint: "Whole sentences packed up to the size" },
  { id: "markdown", label: "Markdown headings", sizeUnit: "chars", overlapUnit: "chars", hint: "One chunk per section, long sections cut" },
]

const MAX_CHUNKS = 2000

function make(text: string, start: number, end: number, index: number, heading?: string): Chunk {
  const t = text.slice(start, end)
  return { index, start, end, text: t, chars: t.length, tokens: quickTokens(t), heading }
}

function byChars(text: string, from: number, to: number, size: number, overlap: number, out: Chunk[], heading?: string) {
  const step = Math.max(1, size - Math.min(overlap, size - 1))
  let start = from
  while (start < to && out.length < MAX_CHUNKS) {
    let end = Math.min(to, start + size)
    if (end < to) {
      // Prefer to end on whitespace in the last fifth of the window.
      const cut = text.lastIndexOf(" ", end)
      const nl = text.lastIndexOf("\n", end)
      const best = Math.max(cut, nl)
      if (best > start + size * 0.8) end = best + 1
    }
    out.push(make(text, start, end, out.length, heading))
    if (end >= to) break
    start = Math.max(start + 1, end - (size - step))
  }
}

function byTokens(text: string, size: number, overlap: number): Chunk[] {
  const words = [...text.matchAll(/\S+\s*/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, tokens: quickTokens(m[0]) }))
  const out: Chunk[] = []
  let i = 0
  while (i < words.length && out.length < MAX_CHUNKS) {
    let j = i
    let n = 0
    while (j < words.length && (n + words[j].tokens <= size || j === i)) n += words[j++].tokens
    out.push(make(text, words[i].start, words[j - 1].end, out.length))
    if (j >= words.length) break
    // Step back over `overlap` tokens of words, but always move forward.
    let back = j
    let o = 0
    while (back > i + 1 && o + words[back - 1].tokens <= overlap) o += words[--back].tokens
    i = back
  }
  return out
}

/** Sentence ends: . ! ? … and CJK full stops, followed by space or end; also blank lines. */
const SENTENCE = /[^.!?…。！？\n]+(?:[.!?…。！？]+["'”’)\]]*|\n\n+|\n|$)\s*/g

export function sentences(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  for (const m of text.matchAll(SENTENCE)) if (m[0].trim()) out.push({ start: m.index, end: m.index + m[0].length })
  return out
}

function bySentences(text: string, size: number, overlap: number): Chunk[] {
  const s = sentences(text)
  const out: Chunk[] = []
  let i = 0
  while (i < s.length && out.length < MAX_CHUNKS) {
    let j = i
    while (j < s.length && (s[j].end - s[i].start <= size || j === i)) j++
    out.push(make(text, s[i].start, s[j - 1].end, out.length))
    if (j >= s.length) break
    i = Math.max(i + 1, j - Math.max(0, Math.round(overlap)))
  }
  return out
}

function byMarkdown(text: string, size: number, overlap: number): Chunk[] {
  const heads = [...text.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ at: m.index, title: m[2].trim() }))
  const bounds = heads.length && heads[0].at === 0 ? heads : [{ at: 0, title: "" }, ...heads]
  const out: Chunk[] = []
  for (let k = 0; k < bounds.length && out.length < MAX_CHUNKS; k++) {
    const from = bounds[k].at
    const to = k + 1 < bounds.length ? bounds[k + 1].at : text.length
    if (!text.slice(from, to).trim()) continue
    if (to - from <= size) out.push(make(text, from, to, out.length, bounds[k].title || undefined))
    else byChars(text, from, to, size, overlap, out, bounds[k].title || undefined)
  }
  return out
}

export function chunk(text: string, o: ChunkOptions): Chunk[] {
  const size = Math.max(1, Math.round(o.size))
  const overlap = Math.max(0, Math.round(o.overlap))
  if (!text.trim()) return []
  switch (o.splitter) {
    case "chars": {
      const out: Chunk[] = []
      byChars(text, 0, text.length, size, overlap, out)
      return out
    }
    case "tokens":
      return byTokens(text, size, overlap)
    case "sentences":
      return bySentences(text, size, overlap)
    case "markdown":
      return byMarkdown(text, size, overlap)
  }
}

export type ChunkStats = { count: number; totalTokens: number; avgTokens: number; minTokens: number; maxTokens: number; duplicatedChars: number }

export function stats(chunks: Chunk[], textLength: number): ChunkStats {
  const t = chunks.map((c) => c.tokens)
  const totalTokens = t.reduce((a, b) => a + b, 0)
  const covered = chunks.reduce((a, c) => a + c.chars, 0)
  return {
    count: chunks.length,
    totalTokens,
    avgTokens: chunks.length ? totalTokens / chunks.length : 0,
    minTokens: t.length ? Math.min(...t) : 0,
    maxTokens: t.length ? Math.max(...t) : 0,
    duplicatedChars: Math.max(0, covered - textLength),
  }
}
