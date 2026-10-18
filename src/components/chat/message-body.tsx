import { Fragment, type ReactNode } from "react"
import { handleOf } from "@/components/chat/format"

/**
 * A message's text with ```code blocks```, `inline code`, links and @mentions. Built from React nodes,
 * never from HTML, so nothing a member writes can run in someone else's browser.
 */
export function MessageBody({ text, me }: { text: string; me?: string }) {
  const parts: ReactNode[] = []
  const fence = /```([\w+-]*)[^\S\n]*\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = fence.exec(text))) {
    if (m.index > last) parts.push(<Inline key={`t${last}`} text={text.slice(last, m.index)} me={me} />)
    parts.push(
      <pre
        key={`c${m.index}`}
        className="my-1 max-w-full overflow-x-auto rounded-lg border border-border bg-black/40 px-3 py-2 font-mono text-[13px] leading-relaxed whitespace-pre"
        data-lang={m[1] || undefined}
      >
        <code>{m[2].replace(/\n$/, "")}</code>
      </pre>
    )
    last = fence.lastIndex
  }
  if (last < text.length) parts.push(<Inline key={`t${last}`} text={text.slice(last)} me={me} />)
  return <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{parts}</div>
}

function Inline({ text, me }: { text: string; me?: string }) {
  const out: ReactNode[] = []
  const tick = /`([^`\n]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = tick.exec(text))) {
    if (m.index > last) out.push(<Rich key={`r${last}`} text={text.slice(last, m.index)} me={me} />)
    out.push(
      <code key={`k${m.index}`} className="rounded-md bg-white/[0.07] px-1.5 py-px font-mono text-[0.85em] text-foreground">
        {m[1]}
      </code>
    )
    last = tick.lastIndex
  }
  if (last < text.length) out.push(<Rich key={`r${last}`} text={text.slice(last)} me={me} />)
  return <>{out}</>
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
      out.push(
        <a key={start} href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-ion underline decoration-ion/40 hover:decoration-ion">
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
