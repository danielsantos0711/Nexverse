/*
 * Token estimates per tokenizer family, without shipping any vocabulary.
 *
 * Method: the text is first cut with the real pre-tokenizer pattern that tiktoken-style tokenizers use
 * (words with their leading space, digit groups, punctuation runs, whitespace runs). Each piece is then
 * costed with per-family rates: how many characters of English a token usually covers, and how many tokens a
 * character of each other writing system usually takes. The rates come from comparing published vocabularies
 * on ordinary prose, so English lands within about ten percent and other scripts vary more. These are
 * estimates, never exact counts: for billing-grade numbers use the provider's own token counting endpoint.
 */

export type FamilyId = "o200k" | "cl100k" | "llama3" | "gemma" | "qwen" | "mistral" | "claude"

export type Family = {
  id: FamilyId
  label: string
  /** Who uses it, in a few words. */
  usedBy: string
  vocab: string
  /** English characters a typical long-word token covers. */
  latinChars: number
  /** Letters in a word that usually still fit in one token. */
  wholeWord: number
  /** Digits: tiktoken-style groups of up to three, or one token per digit (SentencePiece, Qwen). */
  digits: "group3" | "single"
  /** Tokens per character for each non-Latin script. */
  perChar: Partial<Record<Script, number>>
  /** Relative uncertainty for English; other scripts add their own. */
  spread: number
  note: string
}

export type Script = "latin" | "cyrillic" | "greek" | "han" | "kana" | "hangul" | "arabic" | "hebrew" | "devanagari" | "indic" | "thai" | "other"

export const FAMILIES: Family[] = [
  {
    id: "o200k",
    label: "o200k_base",
    usedBy: "OpenAI GPT-4o and newer",
    vocab: "~200k BPE",
    latinChars: 4.3,
    wholeWord: 8,
    digits: "group3",
    perChar: { cyrillic: 0.28, greek: 0.35, han: 0.7, kana: 0.6, hangul: 0.45, arabic: 0.3, hebrew: 0.35, devanagari: 0.32, indic: 0.45, thai: 0.35, other: 0.6 },
    spread: 0.1,
    note: "Public vocabulary (tiktoken). Rates calibrated against it on prose.",
  },
  {
    id: "cl100k",
    label: "cl100k_base",
    usedBy: "OpenAI GPT-4 and GPT-3.5",
    vocab: "~100k BPE",
    latinChars: 4,
    wholeWord: 7,
    digits: "group3",
    perChar: { cyrillic: 0.45, greek: 0.6, han: 1.1, kana: 0.95, hangul: 0.95, arabic: 0.55, hebrew: 0.6, devanagari: 1.1, indic: 1.4, thai: 0.9, other: 1 },
    spread: 0.1,
    note: "Public vocabulary (tiktoken). Weak outside Latin script, so other scripts cost more.",
  },
  {
    id: "llama3",
    label: "Llama 3 tokenizer",
    usedBy: "Meta Llama 3 and later",
    vocab: "128k BPE (tiktoken-style)",
    latinChars: 4.1,
    wholeWord: 7,
    digits: "group3",
    perChar: { cyrillic: 0.32, greek: 0.45, han: 0.8, kana: 0.75, hangul: 0.6, arabic: 0.36, hebrew: 0.45, devanagari: 0.45, indic: 0.7, thai: 0.4, other: 0.75 },
    spread: 0.12,
    note: "cl100k plus about 28k extra tokens for other languages.",
  },
  {
    id: "gemma",
    label: "Gemma / Gemini SentencePiece",
    usedBy: "Google Gemma and Gemini",
    vocab: "~256k SentencePiece",
    latinChars: 4.1,
    wholeWord: 8,
    digits: "single",
    perChar: { cyrillic: 0.27, greek: 0.33, han: 0.62, kana: 0.55, hangul: 0.42, arabic: 0.3, hebrew: 0.33, devanagari: 0.3, indic: 0.38, thai: 0.33, other: 0.55 },
    spread: 0.15,
    note: "Large multilingual vocabulary. Digits are split one per token.",
  },
  {
    id: "qwen",
    label: "Qwen tokenizer",
    usedBy: "Alibaba Qwen 2 and later",
    vocab: "~151k byte-level BPE",
    latinChars: 4.1,
    wholeWord: 7,
    digits: "single",
    perChar: { cyrillic: 0.35, greek: 0.45, han: 0.6, kana: 0.7, hangul: 0.6, arabic: 0.4, hebrew: 0.45, devanagari: 0.6, indic: 0.8, thai: 0.45, other: 0.75 },
    spread: 0.15,
    note: "Strong on Chinese. Digits are split one per token.",
  },
  {
    id: "mistral",
    label: "Tekken",
    usedBy: "Mistral models since Nemo",
    vocab: "~131k tiktoken-style",
    latinChars: 4.2,
    wholeWord: 7,
    digits: "group3",
    perChar: { cyrillic: 0.3, greek: 0.4, han: 0.75, kana: 0.7, hangul: 0.55, arabic: 0.33, hebrew: 0.4, devanagari: 0.4, indic: 0.6, thai: 0.4, other: 0.7 },
    spread: 0.15,
    note: "Trained on more than a hundred languages.",
  },
  {
    id: "claude",
    label: "Claude",
    usedBy: "Anthropic Claude",
    vocab: "not published",
    latinChars: 3.6,
    wholeWord: 6,
    digits: "group3",
    perChar: { cyrillic: 0.4, greek: 0.5, han: 0.9, kana: 0.85, hangul: 0.75, arabic: 0.45, hebrew: 0.5, devanagari: 0.6, indic: 0.9, thai: 0.6, other: 0.9 },
    spread: 0.25,
    note: "The vocabulary is not public, so this is the roughest estimate here. Anthropic's API has a free token counting endpoint for exact numbers.",
  },
]

export const getFamily = (id: string) => FAMILIES.find((f) => f.id === id) ?? FAMILIES[0]

/** The spread added for each non-Latin script, on top of the family's own. */
const SCRIPT_SPREAD: Record<Script, number> = {
  latin: 0,
  cyrillic: 0.15,
  greek: 0.2,
  han: 0.2,
  kana: 0.2,
  hangul: 0.2,
  arabic: 0.25,
  hebrew: 0.25,
  devanagari: 0.3,
  indic: 0.35,
  thai: 0.3,
  other: 0.4,
}

export const SCRIPT_LABEL: Record<Script, string> = {
  latin: "Latin",
  cyrillic: "Cyrillic",
  greek: "Greek",
  han: "Chinese characters",
  kana: "Japanese kana",
  hangul: "Korean",
  arabic: "Arabic",
  hebrew: "Hebrew",
  devanagari: "Devanagari",
  indic: "Other Indic",
  thai: "Thai and Lao",
  other: "Other scripts",
}

function scriptOf(ch: string): Script {
  if (/\p{sc=Latin}/u.test(ch)) return "latin"
  if (/\p{sc=Cyrillic}/u.test(ch)) return "cyrillic"
  if (/\p{sc=Greek}/u.test(ch)) return "greek"
  if (/\p{sc=Han}/u.test(ch)) return "han"
  if (/[\p{sc=Hiragana}\p{sc=Katakana}ー]/u.test(ch)) return "kana"
  if (/\p{sc=Hangul}/u.test(ch)) return "hangul"
  if (/\p{sc=Arabic}/u.test(ch)) return "arabic"
  if (/\p{sc=Hebrew}/u.test(ch)) return "hebrew"
  if (/\p{sc=Devanagari}/u.test(ch)) return "devanagari"
  if (/[\p{sc=Bengali}\p{sc=Gurmukhi}\p{sc=Gujarati}\p{sc=Oriya}\p{sc=Tamil}\p{sc=Telugu}\p{sc=Kannada}\p{sc=Malayalam}\p{sc=Sinhala}]/u.test(ch)) return "indic"
  if (/[\p{sc=Thai}\p{sc=Lao}]/u.test(ch)) return "thai"
  return "other"
}

/**
 * The cl100k / o200k pre-tokenizer, written without inline flags: English contractions, an optional
 * non-letter followed by letters, digit groups, punctuation runs with trailing newlines, newline runs,
 * and whitespace.
 */
const PRE = /'(?:[sSdDmMtT]|[lL][lL]|[vV][eE]|[rR][eE])|[^\r\n\p{L}\p{N}]?[\p{L}\p{M}]+|\p{N}{1,3}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+/gu

const PRE_SINGLE_DIGIT = /'(?:[sSdDmMtT]|[lL][lL]|[vV][eE]|[rR][eE])|[^\r\n\p{L}\p{N}]?[\p{L}\p{M}]+|\p{N}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+/gu

/** One estimated token, as a slice of the original text, for the coloured view. */
export type Piece = { text: string; start: number }

export type TokenCount = {
  tokens: number
  low: number
  high: number
  chars: number
  words: number
  /** Estimated pieces, in order. Cut at `maxPieces` for display. */
  pieces: Piece[]
  truncated: boolean
  byScript: { script: Script; chars: number; tokens: number }[]
}

/** Cuts a string into `n` nearly equal slices (by code point). */
function slices(s: string, n: number): string[] {
  const cps = Array.from(s)
  if (n <= 1 || cps.length <= 1) return [s]
  const out: string[] = []
  const size = cps.length / n
  for (let i = 0; i < n; i++) {
    const a = Math.round(i * size)
    const b = Math.round((i + 1) * size)
    if (b > a) out.push(cps.slice(a, b).join(""))
  }
  return out
}

/** Tokens for one pre-token piece, with the script that dominates it. */
function costPiece(piece: string, f: Family): { n: number; script: Script; words: number } {
  const letters = piece.match(/[\p{L}\p{M}]/gu)
  if (!letters) {
    // Digits, punctuation, whitespace.
    if (/^\p{N}+$/u.test(piece)) return { n: 1, script: "latin", words: 0 }
    if (/^\s+$/.test(piece)) return { n: /[\r\n]/.test(piece) ? 1 : piece.length > 1 ? Math.ceil((piece.length - 1) / 4) || 1 : 1, script: "latin", words: 0 }
    const sym = Array.from(piece.trim())
    const pict = sym.filter((c) => /\p{Extended_Pictographic}/u.test(c)).length
    return { n: Math.max(1, Math.ceil((sym.length - pict) / 2) + pict * 2), script: "latin", words: 0 }
  }
  const script = scriptOf(letters[0])
  if (script === "latin") {
    const len = letters.length
    let accents = 0
    for (const c of letters) if (c.charCodeAt(0) > 0x7f) accents++
    const base = len <= f.wholeWord ? 1 : 1 + Math.ceil((len - f.wholeWord) / f.latinChars)
    // Capitalised or mixed-case words and accented letters split more often.
    const extra = accents * 0.4 + (/[A-Z].*[A-Z]/.test(piece) ? 0.5 : 0)
    return { n: Math.max(1, Math.round(base + extra)), script, words: 1 }
  }
  const rate = f.perChar[script] ?? f.perChar.other ?? 0.8
  const words = script === "han" || script === "kana" || script === "thai" ? letters.length / 2 : 1
  return { n: Math.max(1, Math.round(letters.length * rate)), script, words }
}

export function countTokens(text: string, familyId: FamilyId, maxPieces = 4000): TokenCount {
  const f = getFamily(familyId)
  const re = f.digits === "single" ? PRE_SINGLE_DIGIT : PRE
  const pieces: Piece[] = []
  const acc = new Map<Script, { chars: number; tokens: number }>()
  let tokens = 0
  let words = 0
  let spreadAbs = 0
  for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
    const s = m[0]
    const { n, script, words: w } = costPiece(s, f)
    tokens += n
    words += w
    spreadAbs += n * (f.spread + SCRIPT_SPREAD[script])
    const cur = acc.get(script) ?? { chars: 0, tokens: 0 }
    cur.chars += Array.from(s).length
    cur.tokens += n
    acc.set(script, cur)
    if (pieces.length < maxPieces) {
      let at = m.index
      for (const part of slices(s, n)) {
        pieces.push({ text: part, start: at })
        at += part.length
      }
    }
  }
  return {
    tokens,
    low: Math.max(0, Math.floor(tokens - spreadAbs)),
    high: Math.ceil(tokens + spreadAbs),
    chars: Array.from(text).length,
    words: Math.round(words),
    pieces: pieces.slice(0, maxPieces),
    truncated: pieces.length >= maxPieces,
    byScript: [...acc.entries()].map(([script, v]) => ({ script, ...v })).sort((a, b) => b.tokens - a.tokens),
  }
}

/** A quick count for other tools (chunk planner, context calculator): the default family. */
export const quickTokens = (text: string, family: FamilyId = "o200k") => countTokens(text, family, 0).tokens
