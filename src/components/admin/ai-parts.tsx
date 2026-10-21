"use client"

import { useId, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowDownIcon, ArrowUpIcon, CircleCheckIcon, CircleDashedIcon, ExternalLinkIcon, KeyRoundIcon, MinusIcon, PlusIcon, ZapIcon } from "lucide-react"
import { StatusLine } from "@/components/admin/controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { aiAdmin, AiRequestError, type AiAdminStatus } from "@/lib/ai-client"
import { MODELS, PROVIDERS, type ModelInfo, type ProviderId } from "@/lib/ai/models"
import { cn } from "@/lib/utils"

/*
 * Pieces of the /admin/ai page: a provider card (key present, today's use against its cap, a live test), the
 * model order for one job, and today's usage table. The page in ai-panel.tsx owns the settings draft.
 */

type ProviderStatus = AiAdminStatus["providers"][number]

const nf = new Intl.NumberFormat("en")

/** One free provider: whether its key is set, today's calls against the cap, and a real one-call test. */
export function ProviderCard({
  id,
  status,
  cap,
  onCap,
  canTest,
}: {
  id: ProviderId
  status: ProviderStatus | null
  cap: number
  onCap: (n: number) => void
  canTest: boolean
}) {
  const p = PROVIDERS.find((x) => x.id === id)!
  const models = MODELS.filter((m) => m.provider === id)
  const [model, setModel] = useState(models[0].id)
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const capId = useId()
  const selectId = useId()
  const configured = status?.configured ?? false
  const used = status?.usedToday ?? null
  const pct = used !== null && cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0

  async function run() {
    setBusy(true)
    setTest(null)
    try {
      const r = await aiAdmin.test(model)
      setTest({ ok: true, text: `${r.data.label} answered in ${nf.format(r.data.ms)} ms: “${r.data.reply}”` })
    } catch (err) {
      setTest({ ok: false, text: err instanceof AiRequestError ? err.message : "The test failed. Try again." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article aria-labelledby={`${capId}-name`} className="flex flex-col gap-4 rounded-2xl border border-border bg-card/50 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={`${capId}-name`} className="font-medium">
            {p.label}
          </h3>
          <p className="font-mono text-xs text-muted-foreground">{p.env.join(" + ")}</p>
        </div>
        {status === null ? (
          <Badge variant="outline">Unknown</Badge>
        ) : configured ? (
          <Badge variant="outline" className="border-ok/40 text-ok">
            <CircleCheckIcon aria-hidden /> Key set
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <CircleDashedIcon aria-hidden /> No key
          </Badge>
        )}
      </header>

      {status && !configured && p.env.length > 1 && Object.values(status.envSet).some(Boolean) && (
        <p className="text-sm text-gold">
          Only part of it is set: missing {p.env.filter((e) => !status.envSet[e]).join(" and ")}
          {p.id === "cloudflare" ? " (the account id is the 32-character id in your Cloudflare dashboard URL)" : ""}.
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        {p.free}{" "}
        <a href={p.source} target="_blank" rel="noreferrer" className="text-ion underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Source
        </a>
      </p>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={capId} className="text-sm font-medium">
            Daily cap
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">{used === null ? "Usage not available" : `${nf.format(used)} of ${nf.format(cap)} used today`}</span>
        </div>
        <div className="flex items-center gap-3">
          <Input
            id={capId}
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            step={1}
            value={cap}
            onChange={(e) => onCap(Math.max(0, Math.min(100_000, Math.round(Number(e.target.value) || 0))))}
            className="w-28 tabular-nums"
            aria-describedby={`${capId}-help`}
          />
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]"
            role="meter"
            aria-label={`${p.label} use today`}
            aria-valuemin={0}
            aria-valuemax={cap}
            aria-valuenow={used ?? 0}
          >
            <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-gold" : "bg-ion")} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p id={`${capId}-help`} className="text-xs text-muted-foreground">
          Calls a day across the site. At the cap this provider is skipped until midnight UTC. 0 switches it off.
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        {configured ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="sr-only">
              Model to test
            </label>
            <select
              id={selectId}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-input/30 px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy || !canTest} title={canTest ? "One tiny real call. It counts toward the daily cap." : "Turn AI on and save first."}>
              <ZapIcon aria-hidden data-icon="inline-start" />
              {busy ? "Testing…" : "Test"}
            </Button>
          </div>
        ) : (
          <a
            href={p.signup}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-ion underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <KeyRoundIcon aria-hidden className="size-4" />
            {p.premium ? "Create a paid key" : "Create a free key"}
            <ExternalLinkIcon aria-hidden className="size-3.5" />
          </a>
        )}
        <StatusLine status={test} />
      </div>
    </article>
  )
}

/** The model order for one job: try first at the top, switch models off or back on, move them up and down. */
export function ChainEditor({
  label,
  chain,
  onChange,
  configured,
  playground,
  models = MODELS,
}: {
  label: string
  chain: string[]
  onChange: (next: string[]) => void
  configured: Set<string>
  playground: boolean
  /** Every model this site knows (built in plus added from the catalogue). Premium models are left out here. */
  models?: ModelInfo[]
}) {
  const reduce = useReducedMotion()
  const pool = models.filter((m) => !m.premium && (!playground || m.playground))
  const off = pool.filter((m) => !chain.includes(m.id))
  const move = (i: number, d: -1 | 1) => {
    const next = [...chain]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  const firstReady = chain.find((id) => configured.has(models.find((m) => m.id === id)?.provider ?? ""))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {playground
          ? "Members choose one of these in the Lab. Only models with a key show up there."
          : firstReady
            ? `Right now ${label.toLowerCase()} use ${models.find((m) => m.id === firstReady)?.label}. When it fails or reaches its cap, the next one with a key takes over.`
            : "None of these models has a key yet, so this job is off."}
      </p>
      {chain.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Every model is switched off for this job. Add one below.</p>
      ) : (
        <ol className="flex flex-col gap-1.5" aria-label={`${label}: model order`}>
          {chain.map((id, i) => {
            const m = models.find((x) => x.id === id)
            if (!m) return null
            const ready = configured.has(m.provider)
            return (
              <motion.li
                key={id}
                layout={!reduce}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={cn("flex items-center gap-3 rounded-xl border border-border bg-card/50 px-3 py-2", !ready && "opacity-60")}
              >
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.06] text-xs tabular-nums">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{m.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {PROVIDERS.find((p) => p.id === m.provider)?.label} · {nf.format(m.context)} tokens{ready ? "" : " · no key, skipped"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${m.label} up`}>
                    <ArrowUpIcon aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={i === chain.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${m.label} down`}>
                    <ArrowDownIcon aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(chain.filter((x) => x !== id))} aria-label={`Switch ${m.label} off for ${label.toLowerCase()}`}>
                    <MinusIcon aria-hidden />
                  </Button>
                </span>
              </motion.li>
            )
          })}
        </ol>
      )}
      {off.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Switched off</h4>
          <ul className="flex flex-wrap gap-1.5">
            {off.map((m) => (
              <li key={m.id}>
                <Button type="button" variant="outline" size="sm" onClick={() => onChange([...chain, m.id])} aria-label={`Add ${m.label} to ${label.toLowerCase()}`}>
                  <PlusIcon aria-hidden data-icon="inline-start" />
                  {m.label}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Today's calls per provider, model and job. */
export function UsageTable({ rows }: { rows: NonNullable<AiAdminStatus["usage"]> }) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No AI calls yet today.</p>
  }
  const sorted = [...rows].sort((a, b) => b.requests - a.requests)
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">AI calls today by provider, model and job</caption>
        <thead className="bg-white/[0.03] text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Model
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Job
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Calls
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Failed
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const m = MODELS.find((x) => x.provider === r.provider && x.model === r.model)
            return (
              <tr key={`${r.provider}|${r.model}|${r.job}`} className="border-t border-border">
                <td className="px-3 py-2">
                  <span className="font-medium">{m?.label ?? r.model}</span>
                  <span className="block text-xs text-muted-foreground">{PROVIDERS.find((p) => p.id === r.provider)?.label ?? r.provider}</span>
                </td>
                <td className="px-3 py-2 capitalize">{r.job}</td>
                <td className="px-3 py-2 text-right tabular-nums">{nf.format(r.requests)}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.failures > 0 && "text-gold")}>{nf.format(r.failures)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
