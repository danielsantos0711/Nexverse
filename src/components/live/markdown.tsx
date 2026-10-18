import Link from "next/link"
import { Fragment } from "react"
import { lexer, type Token, type Tokens } from "marked"
import { decodeEntities, isOffSite } from "@/lib/live/http"
import { ALLOWED, tokenizeHtml } from "@/lib/markdown/html"
import { rewriteImage, rewriteLink, slugify, type MdContext } from "@/lib/markdown/urls"
import { cn } from "@/lib/utils"
import { CodeBlock } from "./code-block"

/*
 * Markdown to React, for READMEs, files and release notes from GitHub.
 *
 * Safety: nothing is ever passed as HTML. Markdown tokens become React elements (React escapes all text);
 * raw HTML in the source is tokenized and rebuilt from a short whitelist with validated attributes (see
 * lib/markdown/html.ts); links and images are resolved and filtered by lib/markdown/urls.ts, so javascript:
 * and data: URLs never reach the page. External links open in a new tab without a referrer.
 */

type El = { t: "el"; tag: string; attrs: Record<string, string>; children: Node[] }
type Node = El | { t: "text"; v: string } | { t: "md"; token: Token }

type R = { ctx: MdContext; slugs: Map<string, number> }

const MAX_DEPTH = 40

/** Folds raw-HTML tokens into a tree around the Markdown tokens between them, so <details>…</details> spanning paragraphs nests correctly. */
function build(tokens: Token[]): Node[] {
  const root: Node[] = []
  const stack: El[] = []
  const top = () => (stack.length ? stack[stack.length - 1].children : root)
  for (const tok of tokens) {
    if (tok.type !== "html") {
      top().push({ t: "md", token: tok })
      continue
    }
    for (const ev of tokenizeHtml(typeof tok.text === "string" ? tok.text : tok.raw)) {
      if (ev.t === "text") top().push({ t: "text", v: ev.v })
      else if (ev.t === "open") {
        if (!ALLOWED.has(ev.tag)) continue
        const el: El = { t: "el", tag: ev.tag, attrs: ev.attrs, children: [] }
        top().push(el)
        if (!ev.selfClosing && stack.length < MAX_DEPTH) stack.push(el)
      } else {
        const i = stack.findLastIndex((e) => e.tag === ev.tag)
        if (i >= 0) stack.length = i
      }
    }
  }
  return root
}

function textOf(tokens: Token[] | undefined): string {
  if (!tokens) return ""
  return tokens.map((t) => ("tokens" in t && Array.isArray(t.tokens) ? textOf(t.tokens) : "text" in t && typeof t.text === "string" ? t.text : "")).join("")
}

function headingId(r: R, text: string) {
  const base = slugify(decodeEntities(text)) || "section"
  const n = r.slugs.get(base) ?? 0
  r.slugs.set(base, n + 1)
  return n ? `${base}-${n}` : base
}

const LINK = "text-ion underline decoration-ion/30 underline-offset-2 transition-colors hover:decoration-ion"

function A({ href, r, children, title }: { href: string; r: R; children: React.ReactNode; title?: string }) {
  const link = rewriteLink(href, r.ctx)
  if (!link) return <>{children}</>
  if (link.internal && !link.href.startsWith("#")) {
    return (
      <Link href={link.href} className={LINK} title={title || undefined}>
        {children}
      </Link>
    )
  }
  if (link.internal) {
    return (
      <a href={link.href} className={LINK} title={title || undefined}>
        {children}
      </a>
    )
  }
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer nofollow ugc" className={LINK} title={title || undefined}>
      {children}
    </a>
  )
}

const dim = (v: string | undefined) => (v && /^\d{1,4}(px)?$/.test(v) ? Math.min(2000, parseInt(v, 10)) : undefined)

function Img({ src, alt, r, width, height, title }: { src: string; alt: string; r: R; width?: string; height?: string; title?: string }) {
  const url = rewriteImage(src, r.ctx)
  // Badges and images from off-site communities are left out entirely, alt text included.
  if (!url) return alt && !isOffSite(alt, src) ? <span className="text-muted-foreground">[{alt}]</span> : null
  const pct = width && /^\d{1,3}%$/.test(width) ? width : undefined
  return (
    // eslint-disable-next-line @next/next/no-img-element -- third-party README images from arbitrary hosts; no optimisation, no referrer
    <img
      src={url}
      alt={alt}
      title={title || undefined}
      width={dim(width)}
      height={dim(height)}
      style={pct ? { width: pct } : undefined}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="inline-block h-auto max-w-full rounded-sm align-middle"
    />
  )
}

const ALIGN: Record<string, string> = { center: "text-center [&_img]:mx-auto", right: "text-right", left: "text-left" }
const align = (a: Record<string, string>) => ALIGN[(a.align ?? "").toLowerCase()] ?? ""

const H_CLASS: Record<number, string> = {
  1: "mt-8 mb-4 border-b border-border pb-2 text-2xl font-semibold tracking-[-0.02em] first:mt-0",
  2: "mt-8 mb-3 border-b border-border pb-2 text-xl font-semibold tracking-[-0.01em] first:mt-0",
  3: "mt-6 mb-2 text-lg font-semibold first:mt-0",
  4: "mt-5 mb-2 text-base font-semibold first:mt-0",
  5: "mt-4 mb-2 text-sm font-semibold first:mt-0",
  6: "mt-4 mb-2 text-sm font-semibold text-muted-foreground first:mt-0",
}

function Heading({ depth, id, className, children }: { depth: number; id: string; className?: string; children: React.ReactNode }) {
  // The page already has an h1, so Markdown headings sit one level lower in the outline.
  const Tag = `h${Math.min(6, depth + 1)}` as "h2"
  return (
    <Tag id={id} className={cn("scroll-mt-24 font-sans", H_CLASS[depth], className)}>
      {children}
    </Tag>
  )
}

const TABLE_WRAP = "my-4 overflow-x-auto rounded-lg border border-border"
const TABLE = "w-full border-collapse text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:bg-secondary/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium"

function renderEl(el: El, r: R, key: number): React.ReactNode {
  const kids = renderNodes(el.children, r)
  const a = el.attrs
  switch (el.tag) {
    case "a":
      return a.href ? (
        <A key={key} href={a.href} r={r} title={a.title}>
          {kids}
        </A>
      ) : (
        <span key={key}>{kids}</span>
      )
    case "img":
      return a.src ? <Img key={key} src={a.src} alt={a.alt ?? ""} r={r} width={a.width} height={a.height} title={a.title} /> : null
    case "br":
      return <br key={key} />
    case "hr":
      return <hr key={key} className="my-6 border-border" />
    case "p":
      return (
        <p key={key} className={cn("my-3", align(a))}>
          {kids}
        </p>
      )
    case "div":
    case "center":
      return (
        <div key={key} className={cn(el.tag === "center" ? ALIGN.center : align(a))}>
          {kids}
        </div>
      )
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const depth = Number(el.tag[1])
      return (
        <Heading key={key} depth={depth} id={headingId(r, textOfNodes(el.children))} className={align(a)}>
          {kids}
        </Heading>
      )
    }
    case "b":
    case "strong":
      return (
        <strong key={key} className="font-semibold">
          {kids}
        </strong>
      )
    case "i":
    case "em":
    case "cite":
      return <em key={key}>{kids}</em>
    case "u":
    case "ins":
      return (
        <span key={key} className="underline">
          {kids}
        </span>
      )
    case "s":
    case "del":
    case "strike":
      return <del key={key}>{kids}</del>
    case "code":
    case "tt":
    case "samp":
      return (
        <code key={key} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em]">
          {kids}
        </code>
      )
    case "kbd":
      return (
        <kbd key={key} className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[0.8em]">
          {kids}
        </kbd>
      )
    case "pre":
      return <CodeBlock key={key} code={textOfNodes(el.children)} />
    case "sub":
      return <sub key={key}>{kids}</sub>
    case "sup":
      return <sup key={key}>{kids}</sup>
    case "small":
      return (
        <small key={key} className="text-xs">
          {kids}
        </small>
      )
    case "mark":
      return (
        <mark key={key} className="rounded bg-gold/20 px-0.5 text-foreground">
          {kids}
        </mark>
      )
    case "q":
      return <q key={key}>{kids}</q>
    case "abbr":
      return (
        <abbr key={key} title={a.title?.slice(0, 200)}>
          {kids}
        </abbr>
      )
    case "blockquote":
      return (
        <blockquote key={key} className="my-4 border-l-2 border-ion/40 pl-4 text-muted-foreground">
          {kids}
        </blockquote>
      )
    case "ul":
      return (
        <ul key={key} className="my-3 list-disc pl-6 marker:text-muted-foreground">
          {kids}
        </ul>
      )
    case "ol": {
      const start = /^\d{1,6}$/.test(a.start ?? "") ? Number(a.start) : undefined
      return (
        <ol key={key} start={start} className="my-3 list-decimal pl-6 marker:text-muted-foreground">
          {kids}
        </ol>
      )
    }
    case "li":
      return (
        <li key={key} className="my-1">
          {kids}
        </li>
      )
    case "dl":
      return (
        <dl key={key} className="my-3">
          {kids}
        </dl>
      )
    case "dt":
      return (
        <dt key={key} className="font-semibold">
          {kids}
        </dt>
      )
    case "dd":
      return (
        <dd key={key} className="mb-2 pl-4">
          {kids}
        </dd>
      )
    case "table":
      return (
        <div key={key} className={TABLE_WRAP}>
          <table className={TABLE}>{kids}</table>
        </div>
      )
    case "thead":
      return <thead key={key}>{kids}</thead>
    case "tbody":
      return <tbody key={key}>{kids}</tbody>
    case "tfoot":
      return <tfoot key={key}>{kids}</tfoot>
    case "tr":
      return <tr key={key}>{kids}</tr>
    case "th":
    case "td": {
      const Cell = el.tag
      const span = (v?: string) => (v && /^\d{1,2}$/.test(v) ? Math.min(20, Number(v)) : undefined)
      return (
        <Cell key={key} colSpan={span(a.colspan)} rowSpan={span(a.rowspan)} className={align(a)}>
          {kids}
        </Cell>
      )
    }
    case "details":
      return (
        <details key={key} open={"open" in a} className="group my-3 rounded-lg border border-border bg-card/40 px-4 py-2 [&>summary]:cursor-pointer">
          {kids}
        </details>
      )
    case "summary":
      return (
        <summary key={key} className="py-1 font-medium">
          {kids}
        </summary>
      )
    case "figure":
      return (
        <figure key={key} className="my-4">
          {kids}
        </figure>
      )
    case "figcaption":
      return (
        <figcaption key={key} className="mt-1 text-sm text-muted-foreground">
          {kids}
        </figcaption>
      )
    default:
      // span, picture: transparent wrappers.
      return <Fragment key={key}>{kids}</Fragment>
  }
}

function textOfNodes(nodes: Node[]): string {
  return nodes.map((n) => (n.t === "text" ? n.v : n.t === "el" ? textOfNodes(n.children) : n.token.type === "code" || n.token.type === "codespan" ? String(n.token.text) : textOf([n.token]))).join("")
}

function renderNodes(nodes: Node[], r: R): React.ReactNode[] {
  return nodes.map((n, i) => (n.t === "text" ? <Fragment key={i}>{n.v}</Fragment> : n.t === "el" ? renderEl(n, r, i) : renderToken(n.token, r, i)))
}

/** Renders a run of tokens (block or inline), folding any raw HTML among them. */
function renderTokens(tokens: Token[] | undefined, r: R): React.ReactNode[] {
  if (!tokens?.length) return []
  return renderNodes(build(tokens), r)
}

const ALERTS = {
  NOTE: { label: "Note", tone: "border-ion/50 text-ion" },
  TIP: { label: "Tip", tone: "border-ok/50 text-ok" },
  IMPORTANT: { label: "Important", tone: "border-[#b48cff]/60 text-[#c9a8ff]" },
  WARNING: { label: "Warning", tone: "border-gold/60 text-gold" },
  CAUTION: { label: "Caution", tone: "border-[#ff7a7a]/60 text-[#ff9a9a]" },
} as const

/** GitHub's "> [!NOTE]" callouts. Returns null for an ordinary quote. */
function alertOf(q: Tokens.Blockquote): { kind: keyof typeof ALERTS; tokens: Token[] } | null {
  const first = q.tokens[0]
  if (first?.type !== "paragraph") return null
  const p = first as Tokens.Paragraph
  const lead = p.tokens[0]
  if (lead?.type !== "text") return null
  const m = (lead as Tokens.Text).text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i)
  if (!m) return null
  const rest = { ...(lead as Tokens.Text), text: (lead as Tokens.Text).text.slice(m[0].length), tokens: undefined }
  const para: Tokens.Paragraph = { ...p, tokens: [rest, ...p.tokens.slice(1)] }
  return { kind: m[1].toUpperCase() as keyof typeof ALERTS, tokens: [para, ...q.tokens.slice(1)] }
}

function renderToken(tok: Token, r: R, key: number): React.ReactNode {
  switch (tok.type) {
    case "space":
    case "def":
      return null
    case "heading": {
      const t = tok as Tokens.Heading
      return (
        <Heading key={key} depth={t.depth} id={headingId(r, textOf(t.tokens))}>
          {renderTokens(t.tokens, r)}
        </Heading>
      )
    }
    case "paragraph":
      return (
        <p key={key} className="my-3">
          {renderTokens((tok as Tokens.Paragraph).tokens, r)}
        </p>
      )
    case "code": {
      const t = tok as Tokens.Code
      return <CodeBlock key={key} code={t.text} lang={(t.lang ?? "").split(/\s/)[0].slice(0, 20)} />
    }
    case "blockquote": {
      const q = tok as Tokens.Blockquote
      const alert = alertOf(q)
      if (alert) {
        const a = ALERTS[alert.kind]
        return (
          <div key={key} className={cn("my-4 border-l-2 bg-card/40 py-1 pr-3 pl-4", a.tone.split(" ")[0])}>
            <p className={cn("mt-2 text-sm font-medium", a.tone.split(" ")[1])}>{a.label}</p>
            <div className="text-foreground/90">{renderTokens(alert.tokens, r)}</div>
          </div>
        )
      }
      return (
        <blockquote key={key} className="my-4 border-l-2 border-ion/40 pl-4 text-muted-foreground">
          {renderTokens(q.tokens, r)}
        </blockquote>
      )
    }
    case "list": {
      const l = tok as Tokens.List
      const items = l.items.map((it, i) => (
        <li key={i} className={cn("my-1", it.task && "list-none")}>
          {renderTokens(it.tokens, r)}
        </li>
      ))
      return l.ordered ? (
        <ol key={key} start={typeof l.start === "number" && l.start !== 1 ? l.start : undefined} className="my-3 list-decimal pl-6 marker:text-muted-foreground">
          {items}
        </ol>
      ) : (
        <ul key={key} className={cn("my-3 pl-6 marker:text-muted-foreground", l.items.some((i) => i.task) ? "list-none pl-1" : "list-disc")}>
          {items}
        </ul>
      )
    }
    case "checkbox":
      return <input key={key} type="checkbox" checked={(tok as Tokens.Checkbox).checked} readOnly disabled className="mr-2 align-middle accent-[var(--color-ion)]" />
    case "table": {
      const t = tok as Tokens.Table
      const cls = (al: string | null) => (al === "center" ? "text-center" : al === "right" ? "text-right" : undefined)
      return (
        <div key={key} className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                {t.header.map((c, i) => (
                  <th key={i} className={cls(c.align)}>
                    {renderTokens(c.tokens, r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((c, j) => (
                    <td key={j} className={cls(c.align)}>
                      {renderTokens(c.tokens, r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case "hr":
      return <hr key={key} className="my-6 border-border" />
    case "text": {
      const t = tok as Tokens.Text
      return t.tokens ? <Fragment key={key}>{renderTokens(t.tokens, r)}</Fragment> : <Fragment key={key}>{decodeEntities(t.text)}</Fragment>
    }
    case "escape":
      return <Fragment key={key}>{(tok as Tokens.Escape).text}</Fragment>
    case "strong":
      return (
        <strong key={key} className="font-semibold">
          {renderTokens((tok as Tokens.Strong).tokens, r)}
        </strong>
      )
    case "em":
      return <em key={key}>{renderTokens((tok as Tokens.Em).tokens, r)}</em>
    case "del":
      return <del key={key}>{renderTokens((tok as Tokens.Del).tokens, r)}</del>
    case "codespan":
      return (
        <code key={key} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em]">
          {(tok as Tokens.Codespan).text}
        </code>
      )
    case "br":
      return <br key={key} />
    case "link": {
      const t = tok as Tokens.Link
      return (
        <A key={key} href={t.href} r={r} title={t.title ?? undefined}>
          {renderTokens(t.tokens, r)}
        </A>
      )
    }
    case "image": {
      const t = tok as Tokens.Image
      return <Img key={key} src={t.href} alt={decodeEntities(t.text)} title={t.title ?? undefined} r={r} />
    }
    default:
      return "raw" in tok && typeof tok.raw === "string" ? <Fragment key={key}>{tok.raw}</Fragment> : null
  }
}

/**
 * Renders Markdown from a repository. `ctx` says where relative links and images resolve. Long or broken
 * input never throws: it falls back to plain preformatted text.
 */
export function Markdown({ source, ctx, className }: { source: string; ctx: MdContext; className?: string }) {
  let body: React.ReactNode
  try {
    const tokens = lexer(source.slice(0, 500_000), { gfm: true })
    body = renderTokens(tokens, { ctx, slugs: new Map() })
  } catch {
    body = <pre className="font-mono text-sm whitespace-pre-wrap">{source.slice(0, 200_000)}</pre>
  }
  return <div className={cn("min-w-0 text-[15px] leading-relaxed break-words text-foreground/90", className)}>{body}</div>
}
