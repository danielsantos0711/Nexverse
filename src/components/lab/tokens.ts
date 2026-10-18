/*
 * Token estimates without a tokeniser.
 *
 * Text is split into runs by writing system, and each run is costed with a rule of thumb for how
 * modern byte-pair tokenisers with large vocabularies tend to treat that script. English prose lands
 * close to real counts; scripts that are under-represented in training data vary much more between
 * tokenisers, so each script carries its own uncertainty band. These are estimates, never counts.
 */

export type ScriptId =
  | "latin"
  | "cyrillic"
  | "greek"
  | "han"
  | "kana"
  | "hangul"
  | "arabic"
  | "hebrew"
  | "devanagari"
  | "indic"
  | "thai"
  | "ethiopic"
  | "other-script"
  | "digits"
  | "emoji"
  | "punct"
  | "space"

type ScriptInfo = {
  label: string
  /** Relative uncertainty of the estimate, e.g. 0.15 for ±15%. */
  spread: number
  color: string
}

export const SCRIPTS: Record<ScriptId, ScriptInfo> = {
  latin: { label: "Latin", spread: 0.15, color: "#8fb4ff" },
  cyrillic: { label: "Cyrillic", spread: 0.3, color: "#a9c2ff" },
  greek: { label: "Greek", spread: 0.35, color: "#b7a6ff" },
  han: { label: "Chinese characters (Han)", spread: 0.35, color: "#ff9f8a" },
  kana: { label: "Japanese kana", spread: 0.35, color: "#ffb8c9" },
  hangul: { label: "Korean (Hangul)", spread: 0.35, color: "#ffc58a" },
  arabic: { label: "Arabic script", spread: 0.4, color: "#9fe3cf" },
  hebrew: { label: "Hebrew", spread: 0.4, color: "#7fd6e0" },
  devanagari: { label: "Devanagari", spread: 0.5, color: "#e9c79a" },
  indic: { label: "Other Indic scripts", spread: 0.5, color: "#d8c59e" },
  thai: { label: "Thai", spread: 0.45, color: "#c4e38f" },
  ethiopic: { label: "Ethiopic", spread: 0.5, color: "#e3a6d9" },
  "other-script": { label: "Other scripts", spread: 0.6, color: "#d3b4ff" },
  digits: { label: "Digits", spread: 0.25, color: "#c9d1e0" },
  emoji: { label: "Emoji", spread: 0.4, color: "#ffd86b" },
  punct: { label: "Punctuation and symbols", spread: 0.3, color: "#949cad" },
  space: { label: "Whitespace and line breaks", spread: 0.5, color: "#5d6577" },
}

/** Tokens per character for scripts costed per character. */
const PER_CHAR: Partial<Record<ScriptId, number>> = {
  cyrillic: 0.32,
  greek: 0.38,
  han: 0.8,
  kana: 0.7,
  hangul: 0.62,
  arabic: 0.34,
  hebrew: 0.38,
  devanagari: 0.45,
  indic: 0.55,
  thai: 0.38,
  ethiopic: 0.6,
  "other-script": 0.7,
}

const M = "\\p{M}"
const RUN = new RegExp(
  [
    `(?<latin>[\\p{sc=Latin}${M}'’]*\\p{sc=Latin}[\\p{sc=Latin}${M}]*)`,
    `(?<cyrillic>[\\p{sc=Cyrillic}${M}]+)`,
    `(?<greek>[\\p{sc=Greek}${M}]+)`,
    `(?<han>[\\p{sc=Han}${M}]+)`,
    `(?<kana>[\\p{sc=Hiragana}\\p{sc=Katakana}ー${M}]+)`,
    `(?<hangul>[\\p{sc=Hangul}${M}]+)`,
    `(?<arabic>[\\p{sc=Arabic}${M}\\u200c\\u200d]+)`,
    `(?<hebrew>[\\p{sc=Hebrew}${M}]+)`,
    `(?<devanagari>[\\p{sc=Devanagari}${M}\\u200c\\u200d]+)`,
    `(?<indic>[\\p{sc=Bengali}\\p{sc=Gurmukhi}\\p{sc=Gujarati}\\p{sc=Oriya}\\p{sc=Tamil}\\p{sc=Telugu}\\p{sc=Kannada}\\p{sc=Malayalam}\\p{sc=Sinhala}${M}\\u200c\\u200d]+)`,
    `(?<thai>[\\p{sc=Thai}\\p{sc=Lao}${M}]+)`,
    `(?<ethiopic>[\\p{sc=Ethiopic}${M}]+)`,
    `(?<digits>\\p{Nd}+)`,
    `(?<emoji>\\p{Extended_Pictographic}(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}]|\\u200D\\p{Extended_Pictographic})*|[\\u{1F1E6}-\\u{1F1FF}]{2})`,
    `(?<space>\\s+)`,
    `(?<punct>[\\p{P}\\p{S}])`,
    `(?<letter>\\p{L}[\\p{L}${M}]*)`,
    `(?<rest>[^])`,
  ].join("|"),
  "gu"
)

export type ScriptCount = { id: ScriptId; chars: number; tokens: number; low: number; high: number }
export type TokenEstimate = { tokens: number; low: number; high: number; chars: number; words: number; scripts: ScriptCount[] }

const chars = (s: string) => Array.from(s).length

/** Latin words: one token for a common short word, more for long or accented ones. */
function latinWord(w: string) {
  const len = w.length
  let accents = 0
  for (const c of w) if (c.charCodeAt(0) > 0x7f) accents++
  return 1 + Math.max(0, len - 6) / 4 + accents * 0.3
}

function whitespace(s: string) {
  let newlines = 0
  for (const c of s) if (c === "\n") newlines++
  if (newlines) return Math.ceil(newlines / 2) + Math.max(0, s.length - newlines - 1) / 4
  // A single space usually merges into the next word; runs of spaces (indentation) do not.
  return s.length > 1 ? (s.length - 1) / 4 : 0
}

export function estimateTokens(text: string): TokenEstimate {
  const acc = new Map<ScriptId, { chars: number; tokens: number }>()
  let words = 0
  const add = (id: ScriptId, c: number, t: number) => {
    const cur = acc.get(id) ?? { chars: 0, tokens: 0 }
    cur.chars += c
    cur.tokens += t
    acc.set(id, cur)
  }
  for (const m of text.matchAll(RUN)) {
    const g = m.groups!
    const s = m[0]
    if (g.latin) {
      words++
      add("latin", chars(s), latinWord(s))
    } else if (g.digits) add("digits", s.length, Math.ceil(s.length / 3))
    else if (g.emoji) add("emoji", chars(s), 1.5 + (s.match(/‍/g)?.length ?? 0) * 1.5)
    else if (g.space) add("space", s.length, whitespace(s))
    else if (g.punct) add("punct", 1, 0.75)
    else if (g.rest) add("other-script", 1, 1)
    else {
      const id = (Object.keys(PER_CHAR) as ScriptId[]).find((k) => g[k]) ?? "other-script"
      const n = chars(s)
      if (id !== "han" && id !== "kana" && id !== "thai") words++
      else words += n / 2
      add(id, n, Math.max(1, n * (PER_CHAR[id] ?? 0.7)))
    }
  }
  const scripts: ScriptCount[] = [...acc.entries()]
    .map(([id, v]) => {
      const sp = SCRIPTS[id].spread
      return { id, chars: v.chars, tokens: v.tokens, low: v.tokens * (1 - sp), high: v.tokens * (1 + sp) }
    })
    .filter((s) => s.chars > 0)
    .sort((a, b) => b.tokens - a.tokens)
  const sum = (k: "tokens" | "low" | "high") => scripts.reduce((n, s) => n + s[k], 0)
  return {
    tokens: Math.round(sum("tokens")),
    low: Math.floor(sum("low")),
    high: Math.ceil(sum("high")),
    chars: chars(text),
    words: Math.round(words),
    scripts,
  }
}
