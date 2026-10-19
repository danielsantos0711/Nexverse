import type { Lang } from "./lang"

/*
 * A small syntax highlighter. The site had no highlighter (READMEs show code plainly), and a full grammar engine
 * would be a heavy dependency, so this is a single-pass scanner with a profile per family of languages: comments,
 * strings, numbers, keywords, function calls and type-like names. It is not a parser; it aims to colour code the
 * way a reader expects, across multi-line comments and strings, and to stay fast on big files.
 */

export type TokenKind = "plain" | "com" | "str" | "num" | "kw" | "fn" | "type" | "tag" | "attr" | "punct"
export type Token = { k: TokenKind; v: string }

type Profile = { line: string[]; block: [string, string][]; quotes: string[]; triple?: boolean; ci?: boolean }

const PROFILES: Record<Lang["syntax"], Profile> = {
  c: { line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'", "`"] },
  hash: { line: ["#"], block: [], quotes: ['"', "'"], triple: true },
  json: { line: [], block: [], quotes: ['"'] },
  css: { line: [], block: [["/*", "*/"]], quotes: ['"', "'"] },
  sql: { line: ["--"], block: [["/*", "*/"]], quotes: ["'"], ci: true },
  markup: { line: [], block: [], quotes: [] },
  markdown: { line: [], block: [], quotes: [] },
  plain: { line: [], block: [], quotes: [] },
}

const MAX_CHARS = 400_000

const isIdStart = (c: string) => /[A-Za-z_$@]/.test(c)

/** Matches a sticky regex at position `at` without slicing the source (slicing per token is quadratic). */
function at(re: RegExp, src: string, pos: number): string | null {
  re.lastIndex = pos
  const m = re.exec(src)
  return m ? m[0] : null
}
const COLON = /\s*:/y
const PSEUDO = /\s*:[a-z-]+\s*[{,(]/y
const NUMBER = /(0x[0-9a-fA-F_]+|0b[01_]+|[0-9][0-9_]*(\.[0-9_]+)?([eE][+-]?[0-9]+)?|\.[0-9]+)[a-zA-Z%]*/y
const isId = (c: string) => /[A-Za-z0-9_$]/.test(c)

function scan(src: string, lang: Lang): Token[] {
  const p = PROFILES[lang.syntax]
  const words = new Set((lang.keywords ?? (lang.syntax === "json" ? "true false null" : "")).split(" ").filter(Boolean).map((w) => (p.ci ? w.toLowerCase() : w)))
  const out: Token[] = []
  const push = (k: TokenKind, v: string) => {
    const last = out[out.length - 1]
    if (last && last.k === k) last.v += v
    else out.push({ k, v })
  }
  let i = 0
  const n = src.length
  outer: while (i < n) {
    const c = src[i]
    for (const l of p.line) {
      if (src.startsWith(l, i)) {
        const end = src.indexOf("\n", i)
        const stop = end < 0 ? n : end
        push("com", src.slice(i, stop))
        i = stop
        continue outer
      }
    }
    for (const [open, close] of p.block) {
      if (src.startsWith(open, i)) {
        const end = src.indexOf(close, i + open.length)
        const stop = end < 0 ? n : end + close.length
        push("com", src.slice(i, stop))
        i = stop
        continue outer
      }
    }
    if (p.quotes.includes(c)) {
      const triple = p.triple && src.startsWith(c.repeat(3), i) ? c.repeat(3) : null
      let j = i + (triple ? 3 : 1)
      while (j < n) {
        if (src[j] === "\\") {
          j += 2
          continue
        }
        if (triple ? src.startsWith(triple, j) : src[j] === c) {
          j += triple ? 3 : 1
          break
        }
        // Ordinary quotes end at a newline (except template strings), so one stray quote cannot colour a whole file.
        if (!triple && c !== "`" && src[j] === "\n") break
        j++
      }
      const v = src.slice(i, j)
      // A JSON or CSS key ("name": / name:) reads better as an attribute.
      const after = at(COLON, src, j) !== null
      push((lang.syntax === "json" || lang.syntax === "css") && after ? "attr" : "str", v)
      i = j
      continue
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const v = at(NUMBER, src, i) ?? c
      push("num", v)
      i += v.length
      continue
    }
    if (isIdStart(c)) {
      let j = i + 1
      while (j < n && (isId(src[j]) || (lang.syntax === "css" && src[j] === "-"))) j++
      const word = src.slice(i, j)
      const key = p.ci ? word.toLowerCase() : word
      if (words.has(key)) push("kw", word)
      else if (lang.syntax === "css" && at(COLON, src, j) !== null && at(PSEUDO, src, j) === null) push("attr", word)
      else if (src[j] === "(") push("fn", word)
      else if (c === "@" || (/^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(word) && lang.syntax !== "sql")) push("type", word)
      else push("plain", word)
      i = j
      continue
    }
    push(/[{}()[\];,.:<>=+\-*/%!&|^~?]/.test(c) ? "punct" : "plain", c)
    i++
  }
  return out
}

function scanMarkup(src: string): Token[] {
  const out: Token[] = []
  const re = /<!--[\s\S]*?(-->|$)|<\/?[A-Za-z][\w:.-]*|\/?>|"[^"]*"|'[^']*'|[A-Za-z_:][\w:.-]*(?==)|[^<>"']+|./g
  let inTag = false
  for (const m of src.matchAll(re)) {
    const v = m[0]
    if (v.startsWith("<!--")) out.push({ k: "com", v })
    else if (v.startsWith("<")) {
      out.push({ k: "tag", v })
      inTag = true
    } else if (v === ">" || v === "/>") {
      out.push({ k: "tag", v })
      inTag = false
    } else if (inTag && (v.startsWith('"') || v.startsWith("'"))) out.push({ k: "str", v })
    else if (inTag && /^[A-Za-z_:]/.test(v) && src[m.index! + v.length] === "=") out.push({ k: "attr", v })
    else out.push({ k: "plain", v })
  }
  return out
}

function scanMarkdown(src: string): Token[] {
  return src.split(/(\n)/).flatMap((line): Token[] => {
    if (line === "\n") return [{ k: "plain", v: line }]
    if (/^\s{0,3}#{1,6}\s/.test(line)) return [{ k: "kw", v: line }]
    if (/^\s*(```|~~~)/.test(line)) return [{ k: "com", v: line }]
    return line.split(/(`[^`]+`)/).map((part) => ({ k: part.startsWith("`") && part.endsWith("`") && part.length > 1 ? "str" : "plain", v: part }) as Token)
  })
}

/** Tokens per line. Files too big to colour quickly come back as plain lines. */
export function highlightLines(text: string, lang: Lang | null): Token[][] {
  const src = text.replace(/\r\n?/g, "\n")
  const tokens: Token[] =
    !lang || src.length > MAX_CHARS || lang.syntax === "plain" ? [{ k: "plain", v: src }] : lang.syntax === "markup" ? scanMarkup(src) : lang.syntax === "markdown" ? scanMarkdown(src) : scan(src, lang)
  const lines: Token[][] = [[]]
  for (const t of tokens) {
    const parts = t.v.split("\n")
    parts.forEach((part, i) => {
      if (i > 0) lines.push([])
      if (part) lines[lines.length - 1].push({ k: t.k, v: part })
    })
  }
  if (lines.length > 1 && lines[lines.length - 1].length === 0 && src.endsWith("\n")) lines.pop()
  return lines
}

/** Tailwind classes per token kind, tuned for the dark code surface. */
export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "",
  com: "text-[#7d8698] italic",
  str: "text-[#9fe3cf]",
  num: "text-[#e9c79a]",
  kw: "text-[#b9a7ff]",
  fn: "text-[#8fb4ff]",
  type: "text-[#d8c59e]",
  tag: "text-[#ff9f8f]",
  attr: "text-[#a9c2ff]",
  punct: "text-[#a3a9b8]",
}
