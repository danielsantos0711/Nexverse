"use client"

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { TriangleAlertIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createRegexRunner, type RegexOutcome } from "@/lib/lab/regex"
import { useRegexLibrary } from "@/lib/lists/hooks"
import { cn } from "@/lib/utils"
import { ActionButton, CopyAction, fmtInt, Panel, useHydrated } from "./ui"
import { Copy } from "@/components/content/copy"

const FLAGS: { f: string; label: string }[] = [
  { f: "g", label: "global" },
  { f: "i", label: "ignore case" },
  { f: "m", label: "multiline" },
  { f: "s", label: "dot matches newline" },
  { f: "u", label: "unicode" },
]

const EMPTY: RegexOutcome = { result: { ok: true, matches: [], groupNames: [], groupCount: 0, capped: false, ms: 0 }, replaced: null }

const HUES = ["143 180 255", "127 224 176", "216 197 158", "211 180 255"]

export function RegexTester() {
  const LIBRARY = useRegexLibrary()
  const first = LIBRARY[0]
  const [pattern, setPattern] = useState(first.pattern)
  const [flags, setFlags] = useState(first.flags)
  const [text, setText] = useState(first.sample)
  const [replacement, setReplacement] = useState("$<json>")
  const [libId, setLibId] = useState(first.id)
  const hydrated = useHydrated()
  const dp = useDeferredValue(pattern)
  const dt = useDeferredValue(text)

  const runner = useRef<ReturnType<typeof createRegexRunner> | null>(null)
  const [outcome, setOutcome] = useState<RegexOutcome>(EMPTY)
  useEffect(() => {
    runner.current = createRegexRunner()
    return () => runner.current?.dispose()
  }, [])
  useEffect(() => {
    let live = true
    void runner.current?.run(dp, flags, dt, replacement).then((o) => live && setOutcome(o))
    return () => {
      live = false
    }
  }, [dp, flags, dt, replacement])
  const { result, replaced } = outcome
  const lib = LIBRARY.find((l) => l.id === libId)

  function toggle(f: string) {
    setFlags((s) => (s.includes(f) ? s.replace(f, "") : [...s, f].sort((a, b) => "gimsuy".indexOf(a) - "gimsuy".indexOf(b)).join("")))
  }

  function load(id: string) {
    const l = LIBRARY.find((x) => x.id === id)
    if (!l) return
    setLibId(id)
    setPattern(l.pattern)
    setFlags(l.flags)
    setText(l.sample)
    setReplacement("")
  }

  const parts = useMemo(() => {
    if (!result.ok) return [{ t: dt, m: -1 }]
    const out: { t: string; m: number }[] = []
    let at = 0
    result.matches.forEach((m, k) => {
      if (m.index > at) out.push({ t: dt.slice(at, m.index), m: -1 })
      out.push({ t: m.text || "", m: k })
      at = Math.max(at, m.end)
    })
    out.push({ t: dt.slice(at), m: -1 })
    return out
  }, [result, dt])

  const groupHeaders = result.ok ? Array.from({ length: result.groupCount }, (_, k) => k + 1) : []
  const namedByIndex = result.ok ? result.groupNames : []
  const tsv = () => (result.ok ? [["match", ...groupHeaders.map((g) => `group ${g}`)].join("\t"), ...result.matches.map((m) => [m.text, ...m.groups.map((g) => g ?? "")].join("\t"))].join("\n") : "")
  const literal = `/${pattern}/${flags}`

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Pattern" actions={<CopyAction text={literal} label="Copy as literal" />}>
        <div className="flex flex-col gap-3">
          <div className={cn("flex h-11 items-center rounded-xl border bg-input/30 px-3 font-mono text-[14px] focus-within:ring-3 focus-within:ring-ring/50", result.ok ? "border-input focus-within:border-ring" : "border-destructive/60")}>
            <span aria-hidden className="text-muted-foreground">
              /
            </span>
            <label htmlFor="rx-pattern" className="sr-only">
              <Copy k="lab-tool.regex-tester.regular-expression">Regular expression</Copy>
            </label>
            <input id="rx-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} autoComplete="off" className="h-full min-w-0 flex-1 bg-transparent px-1 text-base outline-none md:text-[14px]" />
            <span aria-hidden className="text-muted-foreground">
              /{flags}
            </span>
          </div>
          {!result.ok && (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <TriangleAlertIcon aria-hidden className="size-4" />
              {result.error}
            </p>
          )}
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only"><Copy k="lab-tool.regex-tester.flags">Flags</Copy></legend>
            {FLAGS.map((x) => (
              <label key={x.f} className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50", flags.includes(x.f) ? "border-ion/40 bg-ion/10 text-ion" : "border-border text-muted-foreground hover:text-foreground")}>
                <input type="checkbox" className="sr-only" checked={flags.includes(x.f)} onChange={() => toggle(x.f)} />
                <span className="font-mono">{x.f}</span> {x.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground/90"><Copy k="lab-tool.regex-tester.library">Library</Copy></span>
            <div className="flex flex-wrap gap-1.5">
              {LIBRARY.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => load(l.id)}
                  aria-pressed={l.id === libId}
                  className={cn("pressable h-8 rounded-full border px-3 text-[13px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50", l.id === libId ? "border-white/25 bg-white/[0.07] text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {lib && lib.pattern === pattern && <p className="text-xs text-muted-foreground">{lib.note}</p>}
          </div>
        </div>
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Test text" description={result.ok ? `${fmtInt(result.matches.length)} match${result.matches.length === 1 ? "" : "es"}${result.capped ? " (stopped early)" : ""}${hydrated ? ` · ${result.ms.toFixed(1)} ms` : ""}` : "Fix the pattern to see matches."}>
          <label htmlFor="rx-text" className="sr-only">
            <Copy k="lab-tool.regex-tester.test-text">Test text</Copy>
          </label>
          <Textarea id="rx-text" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="min-h-36 resize-y font-mono text-[13px] md:text-[13px]" />
          <div className="mt-3 max-h-[40vh] overflow-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[13px] leading-[1.8] break-words whitespace-pre-wrap" tabIndex={0} role="region" aria-label="Text with matches highlighted">
            {parts.map((p, k) =>
              p.m < 0 ? (
                <span key={k} className="text-foreground/70">
                  {p.t}
                </span>
              ) : (
                <mark key={k} className="rounded-[3px] px-px text-foreground" style={{ background: `rgb(${HUES[p.m % HUES.length]} / 0.22)`, boxShadow: `inset 0 -2px 0 rgb(${HUES[p.m % HUES.length]} / 0.7)` }}>
                  {p.t || "∅"}
                </mark>
              )
            )}
          </div>
          {result.ok && result.capped && <p className="mt-2 text-xs text-gold">Stopped after {fmtInt(result.matches.length)} matches so the page stays responsive.</p>}
        </Panel>

        <Panel title="Replace" description="Use $1, $2 or $<name> for groups, $& for the whole match." actions={replaced != null && <CopyAction text={replaced} label="Copy result" />}>
          <label htmlFor="rx-replace" className="sr-only">
            <Copy k="lab-tool.regex-tester.replacement">Replacement</Copy>
          </label>
          <Input id="rx-replace" value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="Replacement (empty removes matches)" className="h-9 font-mono" spellCheck={false} />
          <pre className="mt-3 max-h-[40vh] min-h-24 overflow-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground/90" tabIndex={0} aria-label="Text after replacement">
            {replaced ?? "The replaced text appears here."}
          </pre>
          {!flags.includes("g") && <p className="mt-2 text-xs text-muted-foreground"><Copy k="lab-tool.regex-tester.without-the-g-flag-only">Without the g flag only the first match is replaced.</Copy></p>}
        </Panel>
      </div>

      <Panel title="Matches and groups" actions={result.ok && result.matches.length > 0 && <CopyAction text={tsv} label="Copy as TSV" />}>
        {!result.ok || result.matches.length === 0 ? (
          <p className="text-sm text-muted-foreground"><Copy k="lab-tool.regex-tester.no-matches-yet">No matches yet.</Copy></p>
        ) : (
          <div className="-mx-1 max-h-[50vh] overflow-auto px-1">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">#</th>
                  <th className="py-1.5 pr-3 font-medium"><Copy k="lab-tool.regex-tester.at">At</Copy></th>
                  <th className="py-1.5 pr-3 font-medium"><Copy k="lab-tool.regex-tester.match">Match</Copy></th>
                  {groupHeaders.map((g) => (
                    <th key={g} className="py-1.5 pr-3 font-medium">
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono text-[12px]">
                {result.matches.slice(0, 500).map((m, k) => (
                  <tr key={k}>
                    <td className="py-1.5 pr-3 text-muted-foreground tabular">{k + 1}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground tabular">{m.index}</td>
                    <td className="max-w-80 truncate py-1.5 pr-3">{m.text}</td>
                    {m.groups.map((g, i) => (
                      <td key={i} className="max-w-60 truncate py-1.5 pr-3 text-foreground/80">
                        {g ?? <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {namedByIndex.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Named groups: {namedByIndex.join(", ")}.</p>}
            {result.matches.length > 500 && <p className="mt-2 text-xs text-muted-foreground">Showing 500 of {fmtInt(result.matches.length)}; copy as TSV for all.</p>}
          </div>
        )}
      </Panel>
      <ActionButton onClick={() => load(LIBRARY[0].id)} className="self-start">
        Start over
      </ActionButton>
    </div>
  )
}
