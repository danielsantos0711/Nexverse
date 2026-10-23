"use client"

import Link from "next/link"
import type { Route } from "next"
import { Fragment, useState, type ReactNode } from "react"
import { CheckIcon, CopyIcon, FileTextIcon, GitBranchIcon } from "lucide-react"
import { handleOf } from "@/components/chat/format"
import { highlightLines, TOKEN_CLASS } from "@/lib/code/highlight"
import { langOf } from "@/lib/code/lang"
import { internalHref } from "@/lib/live/ids"
import { cn } from "@/lib/utils"

/**
 * A message's text with ```code blocks``` (coloured, with a copy button), `inline code`, links, @mentions and
 * ||spoilers||, plus a small card for GitHub repositories (opened inside Nexverse) and arXiv papers. Built from
 * React nodes, never from HTML, so nothing a member writes can run in someone else's browser.
 */
export function MessageBody({ text, me, compact, previews = true }: { text: string; me?: string; compact?: boolean; previews?: boolean }) {
  const parts: ReactNode[] = []
  const fence = /```([\w+#.-]*)[^\S\n]*\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = fence.exec(text))) {
    if (m.index > last) parts.push(<Inline key={`t${last}`} text={text.slice(last, m.index)} me={me} />)
    parts.push(<CodeBlock key={`c${m.index}`} lang={m[1]} code={m[2].replace(/\n$/, "")} />)
    last = fence.lastIndex
  }
  if (last < text.length) parts.push(<Inline key={`t${last}`} text={text.slice(last)} me={me} />)
  const cards = previews ? linkCards(text) : []
  return (
    <>
      <div className={cn("leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]", compact ? "text-sm" : "text-[15px]")}>{parts}</div>
      {cards.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {cards.map((c) => (
            <li key={c.key}>
              <LinkCard card={c} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const LANG_ALIAS: Record<string, string> = { js: "js", javascript: "js", ts: "ts", typescript: "ts", py: "py", python: "py", sh: "sh", bash: "sh", shell: "sh", rs: "rs", rust: "rs", go: "go", json: "json", yaml: "yaml", yml: "yaml", sql: "sql", html: "html", css: "css", tsx: "tsx", jsx: "jsx", c: "c", cpp: "cpp", "c++": "cpp", java: "java", rb: "rb", ruby: "rb", md: "md", toml: "toml", kt: "kt", swift: "swift", php: "php", cs: "cs" }

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const ext = LANG_ALIAS[lang.toLowerCase()] ?? lang.toLowerCase()
  const info = ext ? langOf(`snippet.${ext}`) : null
  const lines = highlightLines(code, info)
  return (
    <figure className="group/code relative my-1.5 max-w-full overflow-hidden rounded-lg border border-border bg-black/40 whitespace-normal">
      <figcaption className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {info && <span aria-hidden className="size-2 rounded-full" style={{ background: info.color }} />}
          {info?.name ?? (lang || "Code")}
        </span>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }
          className="pressable inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <CheckIcon aria-hidden className="size-3 text-ok" /> : <CopyIcon aria-hidden className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[13px] leading-relaxed">
        <code>
          {lines.map((line, i) => (
            <span key={i} className="block min-h-[1.2em] whitespace-pre">
              {line.map((t, j) => (
                <span key={j} className={TOKEN_CLASS[t.k]}>
                  {t.v}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  )
}

function Inline({ text, me }: { text: string; me?: string }) {
  const out: ReactNode[] = []
  const tick = /`([^`\n]+)`|\|\|([^|\n]{1,400})\|\|/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = tick.exec(text))) {
    if (m.index > last) out.push(<Rich key={`r${last}`} text={text.slice(last, m.index)} me={me} />)
    if (m[1] !== undefined) {
      out.push(
        <code key={`k${m.index}`} className="rounded-md bg-white/[0.07] px-1.5 py-px font-mono text-[0.85em] text-foreground">
          {m[1]}
        </code>
      )
    } else {
      out.push(<Spoiler key={`s${m.index}`} text={m[2]} me={me} />)
    }
    last = tick.lastIndex
  }
  if (last < text.length) out.push(<Rich key={`r${last}`} text={text.slice(last)} me={me} />)
  return <>{out}</>
}

function Spoiler({ text, me }: { text: string; me?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={open ? undefined : "Spoiler. Tap to show"}
      className={cn(
        "rounded px-1 transition-[background-color,color,filter] duration-200",
        open ? "cursor-text bg-white/[0.06] text-foreground" : "cursor-pointer bg-white/[0.14] text-transparent [filter:blur(3px)] hover:bg-white/[0.2]"
      )}
    >
      <Rich text={text} me={me} />
    </button>
  )
}

const TOKEN = /(https?:\/\/[^\s<>"'`]+)|((?<![\p{L}\p{N}_])@[\p{L}\p{N}_][\p{L}\p{N}_.-]{0,39})/gu

function Rich({ text, me }: { text: string; me?: string }) {
  const out: ReactNode[] = []
  const mine = me ? `@${handleOf(me)}`.toLowerCase() : null
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    if (m[1]) {
      // Punctuation that ends a sentence is not part of the link.
      const url = m[1].replace(/[.,:;!?)\]}'"]+$/, "")
      // A GitHub repo or file opens in its Nexverse view rather than on github.com.
      const inside = internalHref(url)
      out.push(
        inside ? (
          <Link key={start} href={inside as Route} className="text-ion underline decoration-ion/40 hover:decoration-ion">
            {url}
          </Link>
        ) : <a key={start} href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-ion underline decoration-ion/40 hover:decoration-ion">
          {url}
        </a>
      )
      last = start + url.length
      continue
    }
    const handle = m[2].replace(/[.-]+$/, "")
    const isMe = mine === handle.toLowerCase()
    out.push(
      <span key={start} className={isMe ? "rounded bg-gold/20 px-0.5 font-medium text-gold" : "rounded bg-ion/10 px-0.5 font-medium text-ion"}>
        {handle}
      </span>
    )
    last = start + handle.length
  }
  if (last < text.length) out.push(text.slice(last))
  return <Fragment>{out}</Fragment>
}

// ─── Link cards ─────────────────────────────────────────────────────────────────────────────────────────────

type Card = { key: string; kind: "github"; owner: string; repo: string } | { key: string; kind: "arxiv"; id: string; url: string }

/** GitHub repositories and arXiv papers mentioned in a message, up to two cards. */
function linkCards(text: string): Card[] {
  const out: Card[] = []
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?=[/#?\s]|$)/g)) {
    const repo = m[2].replace(/\.git$/, "").replace(/[.,:;!?)]+$/, "")
    const key = `gh:${m[1]}/${repo}`.toLowerCase()
    if (!out.some((c) => c.key === key)) out.push({ key, kind: "github", owner: m[1], repo })
  }
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(v\d+)?/g)) {
    const key = `arxiv:${m[1]}`
    if (!out.some((c) => c.key === key)) out.push({ key, kind: "arxiv", id: m[1] + (m[2] ?? ""), url: `https://arxiv.org/abs/${m[1]}${m[2] ?? ""}` })
  }
  return out.slice(0, 2)
}

function LinkCard({ card }: { card: Card }) {
  if (card.kind === "github") {
    return (
      <Link
        href={`/gh/${card.owner}/${card.repo}` as Route}
        className="group/card flex max-w-md items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-ion/40 hover:bg-ion/[0.04]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white/[0.06] text-muted-foreground group-hover/card:text-ion">
          <GitBranchIcon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {card.owner}/<span className="text-ion">{card.repo}</span>
          </span>
          <span className="block text-xs text-muted-foreground">GitHub repository · open its files here on Nexverse</span>
        </span>
      </Link>
    )
  }
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="group/card flex max-w-md items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-gold/40 hover:bg-gold/[0.04]"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white/[0.06] text-muted-foreground group-hover/card:text-gold">
        <FileTextIcon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">arXiv {card.id}</span>
        <span className="block text-xs text-muted-foreground">Research paper · abstract and PDF</span>
      </span>
    </a>
  )
}
