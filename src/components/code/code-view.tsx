"use client"

import { useEffect, useMemo, useState } from "react"
import { highlightLines, TOKEN_CLASS, type Token } from "@/lib/code/highlight"
import { langOf } from "@/lib/code/lang"
import { cn } from "@/lib/utils"

const LINE_MAX = 8000

export function Tokens({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((t, i) =>
        t.k === "plain" ? (
          <span key={i}>{t.v}</span>
        ) : (
          <span key={i} className={TOKEN_CLASS[t.k]}>
            {t.v}
          </span>
        )
      )}
    </>
  )
}

/**
 * A file with line numbers and syntax colours. Line numbers are links (#L12) and not selectable, so copying grabs
 * only code; shift-click selects a range (#L12-L20) to share.
 */
export function CodeLines({ text, path }: { text: string; path: string }) {
  const lines = useMemo(() => highlightLines(text, langOf(path)), [text, path])
  const shown = lines.slice(0, LINE_MAX)
  const width = String(shown.length).length
  const [sel, setSel] = useState<[number, number] | null>(null)

  useEffect(() => {
    const read = () => {
      const m = location.hash.match(/^#L(\d+)(?:-L(\d+))?$/)
      if (!m) return setSel(null)
      const a = Number(m[1])
      const b = Number(m[2] ?? m[1])
      setSel([Math.min(a, b), Math.max(a, b)])
      document.getElementById(`L${Math.min(a, b)}`)?.scrollIntoView({ block: "center" })
    }
    read()
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [])

  const pick = (n: number, range: boolean) => {
    const next: [number, number] = range && sel ? [Math.min(sel[0], n), Math.max(sel[0], n)] : [n, n]
    setSel(next)
    history.replaceState(null, "", next[0] === next[1] ? `#L${next[0]}` : `#L${next[0]}-L${next[1]}`)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[13px] leading-[1.65]">
        <tbody>
          {shown.map((toks, i) => {
            const n = i + 1
            const on = sel && n >= sel[0] && n <= sel[1]
            return (
              <tr key={i} id={`L${n}`} className={cn("transition-colors", on ? "bg-ion/10" : "hover:bg-white/[0.025]")}>
                <td className={cn("sticky left-0 w-px bg-[#07080d] p-0 text-right align-top select-none", on && "bg-[#0e1526]")} style={{ minWidth: `${width + 3}ch` }}>
                  <a
                    href={`#L${n}`}
                    onClick={(e) => {
                      e.preventDefault()
                      pick(n, e.shiftKey)
                    }}
                    className={cn("block pr-3 pl-4 tabular text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:text-ion", on && "text-ion")}
                    aria-label={`Line ${n}`}
                  >
                    {n}
                  </a>
                </td>
                <td className="pr-6 whitespace-pre text-[#d6deec]">{toks.length ? <Tokens tokens={toks} /> : " "}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {lines.length > LINE_MAX && <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Showing the first {LINE_MAX.toLocaleString("en")} lines. Use Raw or Download for the whole file.</p>}
    </div>
  )
}
