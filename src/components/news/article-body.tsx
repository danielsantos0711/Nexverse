import { Fragment } from "react"
import { lexer, type Token, type Tokens } from "marked"
import { decodeEntities } from "@/lib/live/http"
import { slugify } from "@/lib/markdown/urls"
import type { PullQuote, StorySource } from "@/lib/newsroom"
import { Cite } from "./cite"

/*
 * A story's body for reading: the newsroom's Markdown (## sections, ### subheadings, paragraphs, lists,
 * quotes, emphasis, code) turned into React elements, with every [n] citation made a small link to the
 * source list that previews the source on hover or focus. Nothing is passed as HTML; raw HTML in the text
 * is shown as text. Links are kept only when they are https (they open in a new tab without a referrer).
 * The pull quote is set after the first section.
 */

export type Heading = { id: string; text: string; level: 2 | 3 }

const headingId = (text: string, used: Map<string, number>) => {
  const base = slugify(decodeEntities(text).replace(/[*_`]/g, "")) || "section"
  const n = used.get(base) ?? 0
  used.set(base, n + 1)
  return n ? `${base}-${n}` : base
}

/** The sections and subsections, for the table of contents. Same ids as the rendered headings. */
export function storyHeadings(body: string): Heading[] {
  const used = new Map<string, number>()
  const out: Heading[] = []
  for (const t of lexer(body)) {
    if (t.type === "heading" && (t.depth === 2 || t.depth === 3)) out.push({ id: headingId(t.text, used), text: decodeEntities(t.text).replace(/[*_`]/g, ""), level: t.depth })
  }
  return out
}

type Ctx = { sources: StorySource[]; key: string }

/** Plain text with [n] citations turned into citation links. */
function withCitations(text: string, ctx: Ctx, key: string) {
  const parts = decodeEntities(text).split(/(\[\d{1,2}\])/g)
  return parts.map((p, i) => {
    const m = p.match(/^\[(\d{1,2})\]$/)
    if (m) {
      const n = Number(m[1])
      const src = ctx.sources[n - 1]
      if (src) return <Cite key={`${key}-${i}`} n={n} source={src} />
    }
    return p ? <Fragment key={`${key}-${i}`}>{p}</Fragment> : null
  })
}

function inline(tokens: Token[] | undefined, ctx: Ctx, key: string): React.ReactNode[] {
  if (!tokens) return []
  return tokens.map((t, i) => {
    const k = `${key}.${i}`
    switch (t.type) {
      case "text":
      case "escape":
        return "tokens" in t && t.tokens?.length ? <Fragment key={k}>{inline(t.tokens, ctx, k)}</Fragment> : <Fragment key={k}>{withCitations(t.text, ctx, k)}</Fragment>
      case "strong":
        return <strong key={k} className="font-semibold text-foreground">{inline(t.tokens, ctx, k)}</strong>
      case "em":
        return <em key={k}>{inline(t.tokens, ctx, k)}</em>
      case "del":
        return <del key={k}>{inline(t.tokens, ctx, k)}</del>
      case "codespan":
        return (
          <code key={k} className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.88em]">
            {decodeEntities(t.text)}
          </code>
        )
      case "br":
        return <br key={k} />
      case "link": {
        const href = (t as Tokens.Link).href
        if (!/^https:\/\//.test(href)) return <Fragment key={k}>{inline(t.tokens, ctx, k)}</Fragment>
        return (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-ion underline decoration-ion/30 underline-offset-2 hover:decoration-ion">
            {inline(t.tokens, ctx, k)}
          </a>
        )
      }
      case "image":
        return null
      default:
        return <Fragment key={k}>{"text" in t && typeof t.text === "string" ? withCitations(t.text, ctx, k) : null}</Fragment>
    }
  })
}

function block(t: Token, ctx: Ctx, key: string, used: Map<string, number>): React.ReactNode {
  switch (t.type) {
    case "heading": {
      const id = headingId(t.text, used)
      if (t.depth <= 2)
        return (
          <h2 key={key} id={id} className="mt-14 mb-4 scroll-mt-28 font-display text-[1.45rem] leading-snug font-semibold tracking-[-0.02em] text-balance first:mt-0 md:text-[1.6rem]">
            {inline(t.tokens, ctx, key)}
          </h2>
        )
      return (
        <h3 key={key} id={id} className="mt-9 mb-3 scroll-mt-28 text-lg font-semibold">
          {inline(t.tokens, ctx, key)}
        </h3>
      )
    }
    case "paragraph":
      return (
        <p key={key} className="my-5">
          {inline(t.tokens, ctx, key)}
        </p>
      )
    case "list": {
      const l = t as Tokens.List
      const Tag = l.ordered ? "ol" : "ul"
      return (
        <Tag key={key} className={l.ordered ? "my-5 list-decimal space-y-2 pl-6 marker:text-muted-foreground" : "my-5 space-y-2 pl-1"}>
          {l.items.map((it, i) => (
            <li key={`${key}.${i}`} className={l.ordered ? "pl-1" : "relative pl-6 before:absolute before:top-[0.72em] before:left-1 before:size-1.5 before:rounded-full before:bg-ion/70"}>
              {it.tokens.map((c, j) => (c.type === "text" ? <Fragment key={j}>{inline((c as Tokens.Text).tokens ?? [c], ctx, `${key}.${i}.${j}`)}</Fragment> : block(c, ctx, `${key}.${i}.${j}`, used)))}
            </li>
          ))}
        </Tag>
      )
    }
    case "blockquote":
      return (
        <blockquote key={key} className="my-6 border-l-2 border-ion/50 pl-5 text-foreground/85 italic">
          {(t as Tokens.Blockquote).tokens.map((c, i) => block(c, ctx, `${key}.${i}`, used))}
        </blockquote>
      )
    case "code":
      return (
        <pre key={key} className="my-6 overflow-x-auto rounded-xl border border-border bg-black/40 p-4 font-mono text-sm leading-relaxed">
          <code>{t.text}</code>
        </pre>
      )
    case "hr":
      return <hr key={key} className="my-10 border-border" />
    case "table": {
      const tb = t as Tokens.Table
      return (
        <div key={key} className="my-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04]">
              <tr>
                {tb.header.map((h, i) => (
                  <th key={i} className="px-3 py-2 font-medium">
                    {inline(h.tokens, ctx, `${key}.h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 align-top">
                      {inline(c.tokens, ctx, `${key}.${i}.${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case "html":
      return (
        <p key={key} className="my-5">
          {decodeEntities(t.text.replace(/<[^>]+>/g, " "))}
        </p>
      )
    case "space":
      return null
    default:
      return "text" in t && typeof t.text === "string" ? (
        <p key={key} className="my-5">
          {withCitations(t.text, ctx, key)}
        </p>
      ) : null
  }
}

function Quote({ quote, source }: { quote: PullQuote; source: StorySource | undefined }) {
  return (
    <figure className="liquid-glass relative my-12 overflow-hidden rounded-3xl px-6 py-7 md:-mx-10 md:px-10 md:py-9">
      <span aria-hidden className="pointer-events-none absolute -top-6 left-4 font-display text-[7rem] leading-none text-ion/20 select-none">
        “
      </span>
      <blockquote className="relative font-display text-xl leading-snug font-medium tracking-[-0.01em] text-balance md:text-2xl">{quote.text}</blockquote>
      {source && (
        <figcaption className="relative mt-4 text-sm text-muted-foreground">
          {source.publisher || "Source"}
          {quote.source ? (
            <>
              {" "}
              <a href={`#source-${quote.source}`} className="rounded-sm text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                [{quote.source}]
              </a>
            </>
          ) : null}
        </figcaption>
      )}
    </figure>
  )
}

export function ArticleBody({ body, sources, pullQuote, className }: { body: string; sources: StorySource[]; pullQuote: PullQuote | null; className?: string }) {
  const tokens = lexer(body)
  const used = new Map<string, number>()
  const ctx: Ctx = { sources, key: "b" }
  // The pull quote goes before the second section (or after the third block of a story without sections).
  const sectionStarts = tokens.map((t, i) => (t.type === "heading" && t.depth <= 2 ? i : -1)).filter((i) => i >= 0)
  const quoteAt = sectionStarts.length >= 2 ? sectionStarts[1] : Math.min(3, tokens.length)
  return (
    <div className={className}>
      {tokens.map((t, i) => (
        <Fragment key={i}>
          {pullQuote && i === quoteAt && <Quote quote={pullQuote} source={pullQuote.source ? sources[pullQuote.source - 1] : undefined} />}
          {block(t, ctx, `b${i}`, used)}
        </Fragment>
      ))}
    </div>
  )
}
