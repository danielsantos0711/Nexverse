"use client"

import { useState } from "react"
import { CheckIcon, CircleHelpIcon, ExternalLinkIcon, MinusIcon, PlusIcon, ScaleIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { FACTS, getLicence, LICENCES, USES, VERDICT, type LicenceId, type Verdict } from "./licences"
import { ActionButton, CopyAction, NativeSelect, Panel, SwitchRow } from "./ui"
import { Copy } from "@/components/content/copy"

const ICON: Record<Verdict, typeof CheckIcon> = { yes: CheckIcon, conditions: TriangleAlertIcon, no: XIcon, unclear: CircleHelpIcon }

type Row = { label: string; value: (id: LicenceId) => string; render?: (id: LicenceId) => React.ReactNode }

const yesNo = (b: boolean) => (b ? "Yes" : "No")

const ROWS: Row[] = [
  { label: "Family", value: (id) => getLicence(id).family },
  { label: "SPDX identifier", value: (id) => FACTS[id].spdx },
  { label: "Copyleft", value: (id) => FACTS[id].copyleft },
  { label: "Patent licence", value: (id) => FACTS[id].patentGrant },
  { label: "Attribution required", value: (id) => yesNo(FACTS[id].attribution) },
  { label: "Network use triggers sharing", value: (id) => yesNo(FACTS[id].networkClause) },
  { label: "Limits on how it is used", value: (id) => yesNo(FACTS[id].useRestrictions) },
  { label: "OSI-approved open source", value: (id) => yesNo(FACTS[id].osiApproved) },
  ...USES.map<Row>((u) => ({
    label: u.label,
    value: (id) => VERDICT[getLicence(id).answers[u.id].verdict].short,
    render: (id) => {
      const a = getLicence(id).answers[u.id]
      const v = VERDICT[a.verdict]
      const Icon = ICON[a.verdict]
      return (
        <div className="flex flex-col gap-1">
          <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", v.cls)}>
            <Icon aria-hidden className="size-3" />
            {v.short}
          </span>
          <span className="text-xs text-muted-foreground">{a.summary}</span>
        </div>
      )
    },
  })),
]

export function LicenceCompare() {
  const [ids, setIds] = useState<LicenceId[]>(["apache-2.0", "mit", "llama-style"])
  const [onlyDiff, setOnlyDiff] = useState(false)

  const rows = ROWS.filter((r) => !onlyDiff || new Set(ids.map(r.value)).size > 1)
  const cols = ids.length
  const md = () =>
    [
      `| | ${ids.map((id) => getLicence(id).name).join(" | ")} |`,
      `|---|${ids.map(() => "---").join("|")}|`,
      ...ROWS.map((r) => `| ${r.label} | ${ids.map(r.value).join(" | ")} |`),
      `| Licence text | ${ids.map((id) => FACTS[id].url).join(" | ")} |`,
    ].join("\n")

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Licences"
        actions={
          <>
            {ids.length < 3 && (
              <ActionButton onClick={() => setIds((s) => [...s, LICENCES.find((l) => !s.includes(l.id))!.id])}>
                <PlusIcon aria-hidden className="size-3.5" />
                Add a third
              </ActionButton>
            )}
            <CopyAction text={md} label="Copy as Markdown" />
          </>
        }
      >
        <div className={cn("grid gap-3", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {ids.map((id, k) => (
            <div key={k} className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <label htmlFor={`lc-${k}`} className="text-sm font-medium text-foreground/90">
                  Licence {k + 1}
                </label>
                <NativeSelect id={`lc-${k}`} value={id} onChange={(v) => setIds((s) => s.map((x, j) => (j === k ? (v as LicenceId) : x)))}>
                  {LICENCES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {ids.length > 2 && (
                <button type="button" aria-label={`Remove licence ${k + 1}`} onClick={() => setIds((s) => s.filter((_, j) => j !== k))} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                  <MinusIcon aria-hidden className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 max-w-sm">
          <SwitchRow label="Only show differences" checked={onlyDiff} onChange={setOnlyDiff} />
        </div>
      </Panel>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-2xl border border-border bg-card/60 text-sm">
          <caption className="sr-only">Licence comparison</caption>
          <thead>
            <tr>
              <th scope="col" className="w-48 border-b border-border p-3 text-left text-xs font-medium text-muted-foreground">
                <span className="sr-only"><Copy k="lab-tool.licence-compare.fact">Fact</Copy></span>
              </th>
              {ids.map((id, k) => {
                const l = getLicence(id)
                return (
                  <th key={k} scope="col" className="border-b border-l border-border p-3 text-left align-top">
                    <div className="text-[15px] font-semibold">{l.name}</div>
                    <p className="mt-1 text-xs font-normal text-muted-foreground">{l.blurb}</p>
                    <a href={FACTS[id].url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-normal text-ion hover:underline">
                      Official text on {FACTS[id].urlLabel}
                      <ExternalLinkIcon aria-hidden className="size-3" />
                    </a>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const differs = new Set(ids.map(r.value)).size > 1
              return (
                <tr key={r.label} className={cn(differs && "bg-gold/[0.04]")}>
                  <th scope="row" className="border-b border-border p-3 text-left align-top text-[13px] font-medium text-foreground/85">
                    <span className="flex items-center gap-1.5">
                      {differs && <span aria-hidden className="size-1.5 rounded-full bg-gold" />}
                      {r.label}
                      {differs && <span className="sr-only"><Copy k="lab-tool.licence-compare.differs">(differs)</Copy></span>}
                    </span>
                  </th>
                  {ids.map((id, k) => (
                    <td key={k} className="border-b border-l border-border p-3 align-top text-[13px]">
                      {r.render ? r.render(id) : r.value(id)}
                    </td>
                  ))}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols + 1} className="p-6 text-center text-sm text-muted-foreground">
                  These licences agree on every row.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {ids.some((id) => getLicence(id).caveat) && (
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {[...new Set(ids)].map((id) => {
            const l = getLicence(id)
            return l.caveat ? (
              <li key={id}>
                <span className="text-foreground/85">{l.name}:</span> {l.caveat}
              </li>
            ) : null
          })}
        </ul>
      )}

      <p className="flex gap-2 rounded-xl border border-border bg-white/[0.02] px-4 py-3 text-sm text-muted-foreground">
        <ScaleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-medium text-foreground/90"><Copy k="lab-tool.licence-compare.not-legal-advice">Not legal advice.</Copy></span> Facts are read from the official licence texts linked above; the use rows are plain-language summaries. Model licences often add their own terms, so read the licence attached to the exact model.
        </span>
      </p>
    </div>
  )
}
