"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { ArrowLeftRightIcon, CheckIcon, CircleHelpIcon, ScaleIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { getLicence, LICENCES, USES, VERDICT, type LicenceId, type UseId, type Verdict } from "./licences"
import { ActionButton, EASE, NativeSelect, Panel, Segmented } from "./ui"
import { Copy } from "@/components/content/copy"

const ICON: Record<Verdict, typeof CheckIcon> = { yes: CheckIcon, conditions: TriangleAlertIcon, no: XIcon, unclear: CircleHelpIcon }

export function LicenceChecker() {
  return (
    <Tabs defaultValue="check" className="gap-4">
      <TabsList className="w-full rounded-xl p-1 group-data-horizontal/tabs:h-10 sm:w-fit">
        <TabsTrigger value="check" className="h-full rounded-lg px-4">
          <Copy k="lab-tool.licence-checker.check-a-use">Check a use</Copy>
        </TabsTrigger>
        <TabsTrigger value="compare" className="h-full rounded-lg px-4">
          <Copy k="lab-tool.licence-checker.compare-two">Compare two</Copy>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="check">
        <Check />
      </TabsContent>
      <TabsContent value="compare">
        <Compare />
      </TabsContent>
      <LegalNote />
    </Tabs>
  )
}

function LegalNote() {
  return (
    <p className="flex gap-2 rounded-xl border border-border bg-white/[0.02] px-4 py-3 text-sm text-muted-foreground">
      <ScaleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="font-medium text-foreground/90"><Copy k="lab-tool.licence-checker.not-legal-advice">Not legal advice.</Copy></span> These are simplified summaries of the licence texts to help you orient. The licence attached to the model or dataset is what counts, and models often add their own terms. For anything that matters, read it in full and ask a lawyer.
      </span>
    </p>
  )
}

function VerdictPill({ verdict, short, className }: { verdict: Verdict; short?: boolean; className?: string }) {
  const v = VERDICT[verdict]
  const Icon = ICON[verdict]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", v.cls, className)}>
      <Icon aria-hidden className="size-3" />
      {short ? v.short : v.label}
    </span>
  )
}

function Check() {
  const [lic, setLic] = useState<LicenceId>("apache-2.0")
  const [use, setUse] = useState<UseId>("commercial")
  const reduce = useReducedMotion()
  const l = getLicence(lic)
  const a = l.answers[use]
  const Icon = ICON[a.verdict]
  const u = USES.find((x) => x.id === use)!
  const must = a.must ?? []
  const cant = [...new Set([...(a.cant ?? []), ...l.cant])]

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <Panel title="1. The licence">
        <Segmented<LicenceId>
          label="Licence"
          value={lic}
          onChange={setLic}
          options={LICENCES.map((x) => ({ value: x.id, label: x.name }))}
          itemClassName="flex-auto"
        />
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="text-foreground/80">{l.family}.</span> {l.blurb}
        </p>
        <h3 className="mt-6 mb-3 text-[15px] font-medium tracking-normal"><Copy k="lab-tool.licence-checker.2-what-you-want-to">2. What you want to do</Copy></h3>
        <Segmented<UseId> label="Intended use" value={use} onChange={setUse} options={USES.map((x) => ({ value: x.id, label: x.label, hint: x.question }))} itemClassName="flex-auto" />
      </Panel>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Panel className="overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70 transition-[background] duration-500" style={{ background: `radial-gradient(90% 70% at 0% 0%, color-mix(in oklab, ${VERDICT[a.verdict].dot} 14%, transparent), transparent 70%)` }} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${lic}-${use}`}
              initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.26, ease: EASE }}
              className="relative"
              aria-live="polite"
            >
              <p className="text-sm text-muted-foreground">
                {u.question}, under {l.name}?
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", VERDICT[a.verdict].cls)}>
                  <Icon aria-hidden className="size-5" />
                </span>
                <h2 className="text-xl font-semibold tracking-tight">{VERDICT[a.verdict].label}</h2>
              </div>
              <p className="mt-3 text-[15px] text-foreground/90">{a.summary}</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <List title="You must" tone="gold" items={must.length ? must : a.verdict === "yes" ? ["Nothing specific for this use"] : l.must} />
                <List title="You can't" tone="red" items={cant.length ? cant : ["Nothing notable"]} />
              </div>
              {l.must.length > 0 && a.verdict !== "no" && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">All obligations in {l.name}</summary>
                  <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                    {l.must.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </details>
              )}
              {l.caveat && <p className="mt-4 rounded-lg bg-ion/[0.06] px-3 py-2 text-xs text-ion/90">{l.caveat}</p>}
            </motion.div>
          </AnimatePresence>
        </Panel>

        <Panel title={`${l.name} at a glance`}>
          <ul className="flex flex-col divide-y divide-border">
            {USES.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setUse(x.id)}
                  aria-current={x.id === use || undefined}
                  className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors outline-none hover:bg-white/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50", x.id === use && "bg-white/[0.05]")}
                >
                  <span>{x.label}</span>
                  <VerdictPill verdict={l.answers[x.id].verdict} short />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function List({ title, items, tone }: { title: string; items: string[]; tone: "gold" | "red" }) {
  return (
    <div>
      <h3 className={cn("mb-2 text-xs font-medium tracking-wide uppercase", tone === "gold" ? "text-gold" : "text-destructive")}>{title}</h3>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((m) => (
          <li key={m} className="flex gap-2">
            <span aria-hidden className={cn("mt-2 size-1.5 shrink-0 rounded-full", tone === "gold" ? "bg-gold/70" : "bg-destructive/70")} />
            <span className="text-foreground/85">{m}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Compare() {
  const [a, setA] = useState<LicenceId>("apache-2.0")
  const [b, setB] = useState<LicenceId>("cc-by-nc-4.0")
  const la = getLicence(a)
  const lb = getLicence(b)
  const diffs = USES.filter((u) => la.answers[u.id].verdict !== lb.answers[u.id].verdict).length

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lc-a" className="text-sm font-medium text-foreground/90">
              <Copy k="lab-tool.licence-checker.licence-a">Licence A</Copy>
            </label>
            <NativeSelect id="lc-a" value={a} onChange={(v) => setA(v as LicenceId)}>
              {LICENCES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <ActionButton
            aria-label="Swap licences"
            className="size-9 justify-center px-0"
            onClick={() => {
              setA(b)
              setB(a)
            }}
          >
            <ArrowLeftRightIcon aria-hidden className="size-4" />
          </ActionButton>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lc-b" className="text-sm font-medium text-foreground/90">
              <Copy k="lab-tool.licence-checker.licence-b">Licence B</Copy>
            </label>
            <NativeSelect id="lc-b" value={b} onChange={(v) => setB(v as LicenceId)}>
              {LICENCES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
          {a === b ? "Pick two different licences." : diffs === 0 ? "Same answer for every use; the conditions may still differ." : `They differ on ${diffs} of ${USES.length} uses.`}
        </p>
      </Panel>

      <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">
            {la.name} compared with {lb.name}
          </caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="w-[28%] p-3 font-normal text-muted-foreground sm:p-4">
                <Copy k="lab-tool.licence-checker.use">Use</Copy>
              </th>
              <th scope="col" className="p-3 font-medium sm:p-4">
                {la.name}
              </th>
              <th scope="col" className="p-3 font-medium sm:p-4">
                {lb.name}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {USES.map((u) => {
              const x = la.answers[u.id]
              const y = lb.answers[u.id]
              const differs = x.verdict !== y.verdict
              return (
                <tr key={u.id} className={cn("align-top transition-colors", differs && "bg-ion/[0.04]")}>
                  <th scope="row" className="p-3 text-left font-normal sm:p-4">
                    <span className="block">{u.label}</span>
                    {differs && <span className="mt-1 inline-block text-[11px] text-ion"><Copy k="lab-tool.licence-checker.differs">Differs</Copy></span>}
                  </th>
                  {[x, y].map((ans, i) => (
                    <td key={i} className="p-3 sm:p-4">
                      <VerdictPill verdict={ans.verdict} short />
                      <p className="mt-1.5 hidden text-[13px] text-muted-foreground sm:block">{ans.summary}</p>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[la, lb].map((l) => (
          <Panel key={l.id} title={l.name} description={l.blurb}>
            <div className="grid gap-4 sm:grid-cols-2">
              <List title="You must" tone="gold" items={l.must.length ? l.must : ["Nothing"]} />
              <List title="You can't" tone="red" items={l.cant.length ? l.cant : ["Nothing notable"]} />
            </div>
            {l.caveat && <p className="mt-4 rounded-lg bg-ion/[0.06] px-3 py-2 text-xs text-ion/90">{l.caveat}</p>}
          </Panel>
        ))}
      </div>
    </div>
  )
}
