"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { EraserIcon, LanguagesIcon } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { estimateTokens, SCRIPTS } from "./tokens"
import { ActionButton, AnimatedNumber, fmtCompact, fmtInt, NumberInput, Panel, readStored, Segmented, ToolSkeleton, useHydrated, writeStored } from "./ui"

const SAMPLE = `Nexverse is a home for people who build with AI, in every language.
Nexverse é uma casa para quem constrói com IA, em qualquer língua.
Nexverse — это дом для всех, кто создаёт с помощью ИИ.
Nexverse 是一个为所有使用人工智能进行创造的人而建的家。
Nexverseは、AIでものづくりをするすべての人の居場所です。
넥스버스는 AI로 무언가를 만드는 모든 사람을 위한 공간입니다.
نيكسفيرس بيت لكل من يبني بالذكاء الاصطناعي، بكل اللغات.
नेक्सवर्स हर उस व्यक्ति का घर है जो एआई के साथ निर्माण करता है।
Nexverse ni nyumbani kwa wote wanaojenga kwa akili bandia. 🚀`

type Settings = { inPrice: number; outPrice: number; outTokens: number; perDay: number; days: number; currency: string }
const DEFAULTS: Settings = { inPrice: 1, outPrice: 2, outTokens: 300, perDay: 1000, days: 30, currency: "$" }
const KEY = "nexverse:lab:token-cost"
const CURRENCIES = ["$", "€", "£", "¥", "₹"]

export function TokenCost() {
  const hydrated = useHydrated()
  if (!hydrated) return <ToolSkeleton />
  return <TokenCostInner />
}

function TokenCostInner() {
  const [text, setText] = useState(SAMPLE)
  const deferred = useDeferredValue(text)
  const est = useMemo(() => estimateTokens(deferred), [deferred])
  const [s, setS] = useState<Settings>(() => ({ ...DEFAULTS, ...readStored<Partial<Settings>>(KEY, {}) }))
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    const t = setTimeout(() => writeStored(KEY, s), 300)
    return () => clearTimeout(t)
  }, [s])

  const money = useMemo(() => {
    const c = s.currency
    return (n: number) => {
      if (!Number.isFinite(n)) return `${c}∞`
      const digits = n === 0 ? 2 : n < 0.01 ? 5 : n < 1 ? 4 : n < 1000 ? 2 : 0
      return `${c}${n.toLocaleString("en", { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })}`
    }
  }, [s.currency])

  const cost = (inTok: number) => {
    const perReq = (inTok * s.inPrice + s.outTokens * s.outPrice) / 1e6
    return { perReq, perDay: perReq * s.perDay, perMonth: perReq * s.perDay * s.days }
  }
  const mid = cost(est.tokens)
  const lo = cost(est.low)
  const hi = cost(est.high)
  const monthlyTokens = (est.tokens + s.outTokens) * s.perDay * s.days
  const totalTok = est.scripts.reduce((n, x) => n + x.tokens, 0)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <div className="flex flex-col gap-4">
        <Panel
          title="Your text"
          description="One request’s worth of input: a prompt, a document, a chat turn."
          actions={
            <>
              <ActionButton onClick={() => setText(SAMPLE)}>
                <LanguagesIcon aria-hidden className="size-3.5" />
                Sample
              </ActionButton>
              <ActionButton onClick={() => setText("")} disabled={!text}>
                <EraserIcon aria-hidden className="size-3.5" />
                Clear
              </ActionButton>
            </>
          }
        >
          <label htmlFor="tc-text" className="sr-only">
            Text to estimate
          </label>
          <Textarea
            id="tc-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste text in any language…"
            spellCheck={false}
            className="max-h-[60vh] min-h-56 resize-y text-[15px] leading-relaxed md:text-sm"
          />
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Characters" value={est.chars} />
            <Stat label="Words (approx.)" value={est.words} />
            <div className="flex flex-col gap-0.5 rounded-xl bg-ion/[0.07] p-3 ring-1 ring-ion/20">
              <dt className="text-xs text-ion/90">Estimated tokens</dt>
              <dd className="text-xl font-semibold text-foreground">
                ≈<AnimatedNumber value={est.tokens} />
              </dd>
              <dd className="text-[11px] text-muted-foreground tabular">
                range {fmtInt(est.low)}–{fmtInt(est.high)}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel title="By writing system" description="Scripts with less training data tend to need more tokens per character, and vary more between tokenisers.">
          {est.scripts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Paste some text to see the breakdown.</p>
          ) : (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.05]" role="img" aria-label="Share of estimated tokens by writing system">
                {est.scripts.map((x) => (
                  <div
                    key={x.id}
                    className="h-full transition-[width] duration-700 ease-[var(--ease-out)] motion-reduce:transition-none"
                    style={{ width: `${totalTok ? (x.tokens / totalTok) * 100 : 0}%`, background: SCRIPTS[x.id].color }}
                  />
                ))}
              </div>
              <table className="mt-4 w-full text-sm">
                <caption className="sr-only">Estimated tokens per writing system</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="pb-2 font-normal">Script</th>
                    <th scope="col" className="pb-2 text-right font-normal">Chars</th>
                    <th scope="col" className="pb-2 text-right font-normal">≈ Tokens</th>
                    <th scope="col" className="hidden pb-2 text-right font-normal sm:table-cell">Chars / token</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {est.scripts.map((x) => (
                    <tr key={x.id}>
                      <th scope="row" className="py-2 text-left font-normal">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: SCRIPTS[x.id].color }} />
                          {SCRIPTS[x.id].label}
                        </span>
                      </th>
                      <td className="py-2 text-right text-muted-foreground tabular">{fmtInt(x.chars)}</td>
                      <td className="py-2 text-right tabular">
                        <AnimatedNumber value={x.tokens} />
                      </td>
                      <td className="hidden py-2 text-right text-muted-foreground tabular sm:table-cell">{x.tokens >= 0.5 ? (x.chars / x.tokens).toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Panel title="Monthly cost" description="Enter your provider’s prices. The starting values are placeholders, not real prices.">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground/90">Currency</span>
              <Segmented label="Currency" value={s.currency} onChange={(v) => set("currency", v)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Input price" hint="per 1M tokens" value={s.inPrice} onChange={(v) => set("inPrice", Math.max(0, v))} min={0} step={0.1} smallStep={0.01} largeStep={1} />
              <NumberInput label="Output price" hint="per 1M tokens" value={s.outPrice} onChange={(v) => set("outPrice", Math.max(0, v))} min={0} step={0.1} smallStep={0.01} largeStep={1} />
              <NumberInput label="Output tokens" hint="per request" value={s.outTokens} onChange={(v) => set("outTokens", Math.max(0, Math.round(v)))} min={0} step={50} largeStep={500} smallStep={1} />
              <NumberInput label="Requests" hint="per day" value={s.perDay} onChange={(v) => set("perDay", Math.max(0, Math.round(v)))} min={0} step={100} largeStep={1000} smallStep={1} />
              <NumberInput label="Days per month" value={s.days} onChange={(v) => set("days", Math.min(31, Math.max(1, Math.round(v))))} min={1} max={31} className="col-span-2 sm:col-span-1" />
            </div>

            <div className="rounded-2xl bg-[radial-gradient(120%_120%_at_0%_0%,rgb(216_197_158/0.12),transparent_60%)] p-4 ring-1 ring-gold/20">
              <div className="text-xs text-gold/90">Per month</div>
              <div className="mt-0.5 text-4xl font-semibold tracking-tight">
                <AnimatedNumber value={mid.perMonth} format={money} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular">
                likely {money(lo.perMonth)} to {money(hi.perMonth)} given the token range
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-3">
              <MoneyStat label="Per request" value={mid.perReq} money={money} />
              <MoneyStat label="Per day" value={mid.perDay} money={money} />
              <MoneyStat label="Per year" value={mid.perMonth * 12} money={money} />
            </dl>
            <p className="text-xs text-muted-foreground">
              About <span className="text-foreground/90 tabular">{fmtCompact(monthlyTokens)}</span> tokens a month ({fmtInt(est.tokens)} in + {fmtInt(s.outTokens)} out per request). Caching, batching discounts and retries are not included.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-white/[0.03] p-3 ring-1 ring-border">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">
        <AnimatedNumber value={value} />
      </dd>
    </div>
  )
}

function MoneyStat({ label, value, money }: { label: string; value: number; money: (n: number) => string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-white/[0.03] p-3 ring-1 ring-border">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-base font-semibold">
        <AnimatedNumber value={value} format={money} />
      </dd>
    </div>
  )
}
