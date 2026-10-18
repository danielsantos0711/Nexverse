/**
 * A tiny, forgiving tokenizer for the raw HTML that READMEs mix into Markdown. It never produces HTML: it
 * turns markup into events (open, close, void, text) that the renderer rebuilds as React elements from a
 * short whitelist with validated attributes. Unknown tags are dropped but their text is kept; the contents
 * of script-like elements and comments are discarded entirely.
 */
import { decodeEntities } from "@/lib/live/http"

export type HtmlEvent =
  | { t: "open"; tag: string; attrs: Record<string, string>; selfClosing: boolean }
  | { t: "close"; tag: string }
  | { t: "text"; v: string }

/** Elements rebuilt by the renderer. Anything else is unwrapped. */
export const ALLOWED = new Set([
  "a", "img", "br", "hr", "p", "div", "span", "center", "h1", "h2", "h3", "h4", "h5", "h6", "b", "strong", "i", "em", "u", "s", "del", "strike",
  "code", "kbd", "samp", "sub", "sup", "small", "mark", "blockquote", "pre", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody",
  "tfoot", "tr", "th", "td", "details", "summary", "picture", "figure", "figcaption", "abbr", "ins", "q", "cite", "tt",
])

export const VOID = new Set(["br", "hr", "img", "source", "input", "meta", "link", "wbr", "area", "col", "embed", "param", "track", "base"])

/** Elements whose whole content is discarded. */
const DROP = new Set(["script", "style", "iframe", "object", "noscript", "template", "svg", "math", "form", "textarea", "select", "button", "video", "audio", "canvas", "frameset", "frame", "title", "head"])

const TAG = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(ATTR)) {
    const name = m[1].toLowerCase()
    if (name in out || Object.keys(out).length > 20) continue
    out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").slice(0, 2048)
  }
  return out
}

export function tokenizeHtml(src: string): HtmlEvent[] {
  const out: HtmlEvent[] = []
  let last = 0
  let dropping: string | null = null
  const pushText = (s: string) => {
    if (!dropping && s) out.push({ t: "text", v: decodeEntities(s) })
  }
  for (const m of src.matchAll(TAG)) {
    pushText(src.slice(last, m.index))
    last = m.index + m[0].length
    const tag = m[2]?.toLowerCase()
    if (!tag) continue // comment, doctype, CDATA, processing instruction
    const closing = m[1] === "/"
    if (dropping) {
      if (closing && tag === dropping) dropping = null
      continue
    }
    if (DROP.has(tag)) {
      if (!closing && !m[4]) dropping = tag
      continue
    }
    if (closing) out.push({ t: "close", tag })
    else out.push({ t: "open", tag, attrs: parseAttrs(m[3] ?? ""), selfClosing: m[4] === "/" || VOID.has(tag) })
  }
  pushText(src.slice(last))
  return out
}
