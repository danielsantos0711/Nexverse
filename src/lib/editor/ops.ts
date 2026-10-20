/*
 * Markdown edits on plain text and a selection. Pure functions: each returns the range to replace, the text to
 * put there and the selection afterwards, so the editor can apply it through the browser's own undo stack.
 */

export type Edit = { from: number; to: number; insert: string; selStart: number; selEnd: number }

const lineStartOf = (text: string, pos: number) => text.lastIndexOf("\n", pos - 1) + 1
const lineEndOf = (text: string, pos: number) => {
  const i = text.indexOf("\n", pos)
  return i < 0 ? text.length : i
}

/** Wraps the selection in markers (**bold**), or unwraps it when it is already wrapped. */
export function wrap(text: string, s: number, e: number, before: string, after: string, placeholder: string): Edit {
  const sel = text.slice(s, e)
  // Already wrapped just outside the selection: take the markers off.
  if (sel && text.slice(s - before.length, s) === before && text.slice(e, e + after.length) === after) {
    return { from: s - before.length, to: e + after.length, insert: sel, selStart: s - before.length, selEnd: e - before.length }
  }
  // Selected with its markers: take them off.
  if (sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after) && sel.length > before.length + after.length) {
    const inner = sel.slice(before.length, sel.length - after.length)
    return { from: s, to: e, insert: inner, selStart: s, selEnd: s + inner.length }
  }
  // Markers sit on the outside of spaces: "** bold**" does not render, so keep spaces outside.
  const lead = sel.match(/^\s*/)![0]
  const trail = sel.slice(lead.length).match(/\s*$/)![0]
  const core = sel.slice(lead.length, sel.length - trail.length) || placeholder
  const insert = `${lead}${before}${core}${after}${trail}`
  const start = s + lead.length + before.length
  return { from: s, to: e, insert, selStart: start, selEnd: start + core.length }
}

/** The lines the selection touches. */
function lines(text: string, s: number, e: number) {
  const from = lineStartOf(text, s)
  const to = lineEndOf(text, e > s && text[e - 1] === "\n" ? e - 1 : e)
  return { from, to, list: text.slice(from, to).split("\n") }
}

const LIST_RE = /^(\s*)([-*+]\s\[[ xX]\]\s|[-*+]\s|\d{1,9}[.)]\s|>\s?)?/

export type LineKind = "bullet" | "number" | "task" | "quote"

const MARKER: Record<LineKind, (i: number) => string> = {
  bullet: () => "- ",
  number: (i) => `${i + 1}. `,
  task: () => "- [ ] ",
  quote: () => "> ",
}

const IS: Record<LineKind, RegExp> = {
  bullet: /^\s*[-*+]\s(?!\[[ xX]\]\s)/,
  number: /^\s*\d{1,9}[.)]\s/,
  task: /^\s*[-*+]\s\[[ xX]\]\s/,
  quote: /^\s*>\s?/,
}

/** Turns the selected lines into a list or quote, or back to plain lines when they all already are one. */
export function toggleLines(text: string, s: number, e: number, kind: LineKind): Edit {
  const { from, to, list } = lines(text, s, e)
  const nonEmpty = list.filter((l) => l.trim())
  const all = nonEmpty.length > 0 && nonEmpty.every((l) => IS[kind].test(l))
  let n = 0
  const out = list.map((l) => {
    if (all) return l.replace(IS[kind], (m) => m.match(/^\s*/)![0])
    if (!l.trim() && list.length > 1) return l
    const indent = l.match(/^\s*/)![0]
    const bare = l.slice(indent.length).replace(LIST_RE, "")
    return indent + MARKER[kind](n++) + bare
  })
  const insert = out.join("\n")
  const single = list.length === 1
  const caret = single ? from + insert.length : from
  return { from, to, insert, selStart: caret, selEnd: single ? caret : from + insert.length }
}

/** Sets (or clears, at the same level) a heading on the current line. */
export function heading(text: string, s: number, e: number, level: number): Edit {
  const { from, to, list } = lines(text, s, e)
  const marker = "#".repeat(level) + " "
  const out = list.map((l) => {
    const bare = l.replace(/^#{1,6}\s+/, "")
    return l.startsWith(marker) && !l.startsWith(marker + "#") ? bare : marker + bare
  })
  const insert = out.join("\n")
  return { from, to, insert, selStart: from + insert.length, selEnd: from + insert.length }
}

/**
 * Inserts a block (table, code fence, divider) on its own lines, with a blank line before and after so it
 * never glues onto a paragraph. `select` picks a part of the block to select afterwards.
 */
export function block(text: string, s: number, e: number, body: string, select?: { start: number; end: number }): Edit {
  const before = text.slice(0, s)
  const after = text.slice(e)
  const lead = !before ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n"
  const trail = !after ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n"
  const insert = lead + body + trail
  const base = s + lead.length
  return select ? { from: s, to: e, insert, selStart: base + select.start, selEnd: base + select.end } : { from: s, to: e, insert, selStart: base + body.length, selEnd: base + body.length }
}

/** A fenced code block around the selection, with a language tag. */
export function codeBlock(text: string, s: number, e: number, lang = ""): Edit {
  const sel = text.slice(s, e)
  const body = "```" + lang + "\n" + (sel || "code") + "\n```"
  const start = 3 + lang.length + 1
  return block(text, s, e, body, { start, end: start + (sel || "code").length })
}

/** A link around the selection. With no URL, the "https://" is selected so it can be typed over. */
export function link(text: string, s: number, e: number, url?: string, label?: string): Edit {
  const sel = label ?? text.slice(s, e)
  const isUrl = /^https?:\/\/\S+$/.test(sel)
  const textPart = isUrl ? "link text" : sel || "link text"
  const href = url ?? (isUrl ? sel : "https://")
  const insert = `[${textPart}](${href})`
  if (url) return { from: s, to: e, insert, selStart: s + insert.length, selEnd: s + insert.length }
  if (isUrl) return { from: s, to: e, insert, selStart: s + 1, selEnd: s + 1 + textPart.length }
  const u = s + textPart.length + 3
  return { from: s, to: e, insert, selStart: u, selEnd: u + href.length }
}

/** A Markdown table with a header row; the first header cell is selected. */
export function table(text: string, s: number, e: number, cols = 3, rows = 2): Edit {
  const c = Math.max(1, Math.min(8, cols))
  const r = Math.max(1, Math.min(20, rows))
  const head = "| " + Array.from({ length: c }, (_, i) => `Column ${i + 1}`).join(" | ") + " |"
  const rule = "|" + Array.from({ length: c }, () => " --- ").join("|") + "|"
  const row = "| " + Array.from({ length: c }, () => "   ").join(" | ") + " |"
  const body = [head, rule, ...Array.from({ length: r }, () => row)].join("\n")
  return block(text, s, e, body, { start: 2, end: 2 + "Column 1".length })
}

export type CalloutKind = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION"

/** GitHub-style callout ("> [!TIP]"), quoting the selected lines. */
export function callout(text: string, s: number, e: number, kind: CalloutKind): Edit {
  const sel = text.slice(s, e) || "Write the callout here."
  const body = `> [!${kind}]\n` + sel.split("\n").map((l) => `> ${l}`).join("\n")
  const start = `> [!${kind}]\n> `.length
  return block(text, s, e, body, { start, end: start + sel.split("\n")[0].length })
}

export function details(text: string, s: number, e: number): Edit {
  const sel = text.slice(s, e) || "The hidden part. Markdown works here."
  const body = `<details>\n<summary>Show more</summary>\n\n${sel}\n\n</details>`
  const start = "<details>\n<summary>".length
  return block(text, s, e, body, { start, end: start + "Show more".length })
}

export const divider = (text: string, s: number, e: number) => block(text, s, e, "---")

/** Plain insertion at the caret (emoji, mention, an image line). */
export function insertText(s: number, e: number, insert: string): Edit {
  return { from: s, to: e, insert, selStart: s + insert.length, selEnd: s + insert.length }
}

/**
 * Enter inside a list continues it ("- " → next "- ", "3. " → "4. ", tasks start unchecked). Enter on an empty
 * item ends the list. Returns null when the caret is not in a list line, so the browser handles Enter.
 */
export function continueList(text: string, s: number, e: number): Edit | null {
  if (s !== e) return null
  const from = lineStartOf(text, s)
  const line = text.slice(from, s)
  const m = line.match(/^(\s*)([-*+]\s\[[ xX]\]\s|[-*+]\s|(\d{1,9})([.)])\s|>\s?)/)
  if (!m) return null
  // In a fenced code block, Enter is just Enter.
  const fences = (text.slice(0, from).match(/^```/gm) ?? []).length
  if (fences % 2 === 1) return null
  const rest = line.slice(m[0].length)
  if (!rest.trim() && lineEndOf(text, s) === s) {
    // Empty item: end the list by clearing the marker.
    return { from, to: s, insert: "", selStart: from, selEnd: from }
  }
  let marker = m[2]
  if (m[3]) marker = `${Number(m[3]) + 1}${m[4]} `
  else if (/\[[ xX]\]/.test(marker)) marker = marker.replace(/\[[xX ]\]/, "[ ]")
  const insert = "\n" + m[1] + marker
  return { from: s, to: s, insert, selStart: s + insert.length, selEnd: s + insert.length }
}

/** Tab / Shift+Tab inside list items indents or outdents them by two spaces. Null when not in a list. */
export function indentList(text: string, s: number, e: number, out: boolean): Edit | null {
  const { from, to, list } = lines(text, s, e)
  if (!list.every((l) => !l.trim() || /^\s*([-*+]\s|\d{1,9}[.)]\s)/.test(l))) return null
  const next = list.map((l) => (!l.trim() ? l : out ? l.replace(/^ {1,2}/, "") : "  " + l))
  const insert = next.join("\n")
  const delta = next[0].length - list[0].length
  return { from, to, insert, selStart: Math.max(from, s + delta), selEnd: from + insert.length - (to - e) }
}

/** Pasting a URL over selected text makes a link of it. */
export function pasteLink(text: string, s: number, e: number, pasted: string): Edit | null {
  if (s === e) return null
  const url = pasted.trim()
  if (!/^https?:\/\/\S+$/.test(url) || url.length > 2000) return null
  const sel = text.slice(s, e)
  if (sel.includes("\n") || /^https?:\/\//.test(sel)) return null
  return link(text, s, e, url, sel)
}

/** The trigger word right before the caret: "/table" for commands, "@ana" for people, ":smile" for emoji. */
export function triggerAt(text: string, caret: number): { kind: "slash" | "mention" | "emoji"; start: number; query: string } | null {
  const before = text.slice(Math.max(0, caret - 40), caret)
  const slash = before.match(/(?:^|\n)(\s*)\/([a-z0-9-]{0,20})$/i)
  if (slash) return { kind: "slash", start: caret - slash[2].length - 1, query: slash[2].toLowerCase() }
  const at = before.match(/(?:^|[\s(])@([\p{L}\p{N}_.-]{0,30})$/u)
  if (at) return { kind: "mention", start: caret - at[1].length - 1, query: at[1] }
  const colon = before.match(/(?:^|[\s(]):([a-z0-9_+-]{2,20})$/)
  if (colon) return { kind: "emoji", start: caret - colon[1].length - 1, query: colon[1] }
  return null
}

/** Words, characters and minutes to read (about 230 words a minute), ignoring Markdown syntax and code fences' markers. */
export function textStats(text: string) {
  const plain = text
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`|-]+/g, " ")
  const words = (plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length
  return { words, chars: text.length, minutes: words ? Math.max(1, Math.round(words / 230)) : 0 }
}
