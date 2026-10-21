"use client"

import { useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { CheckIcon, CircleAlertIcon, EyeIcon, FlaskConicalIcon, PlusIcon, RefreshCwIcon, SearchIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { aiAdmin2, type AdminStatus, type CatalogEntry, type JobStat, type TestResult } from "@/lib/ai/client"
import { AiRequestError } from "@/lib/ai-client"
import { estimateCost, JOBS, MODELS, PROVIDERS, type AiJob, type ModelInfo, type ProviderId } from "@/lib/ai/models"
import { allModels, resolveModel, type AiSettings } from "@/lib/ai/settings"
import { cn } from "@/lib/utils"

/*
 * The round 11 parts of /admin/ai: what every job really runs on (model, provider, free or premium, last 7
 * days of calls, success rate, latency, tokens, cost, member feedback) with a live test per job; the premium
 * slot per job with its cost estimate and the monthly budget; and the live catalogue from each provider, from
 * which an admin adds new models without a deploy.
 */

const nf = new Intl.NumberFormat("en")
const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`)
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })

/** Feedback features, by the job that answers them. */
const FEATURE_JOB: Record<string, AiJob> = {
  "search-answer": "answer",
  "lab-explain": "explain",
  "explain-item": "explain",
  "news-tldr": "summary",
  "thread-summary": "summary",
  "forum-tags": "rewrite",
}

type JobAgg = { calls: number; ok: number; ms: number; tokens: number; cost: number; lastError: string | null; top: { id: string; n: number } | null }

function aggregate(stats: JobStat[] | null): Record<string, JobAgg> {
  const out: Record<string, JobAgg> = {}
  const byModel: Record<string, Record<string, number>> = {}
  for (const r of stats ?? []) {
    const a = (out[r.job] ??= { calls: 0, ok: 0, ms: 0, tokens: 0, cost: 0, lastError: null, top: null })
    a.calls += r.ok + r.fail
    a.ok += r.ok
    a.ms += r.ms_total
    a.tokens += r.tokens_in + r.tokens_out
    a.cost += r.cost_usd
    if (!a.lastError && r.last_error && r.fail > 0) a.lastError = `${r.last_error} on ${r.model}`
    const m = (byModel[r.job] ??= {})
    m[`${r.provider}:${r.model}`] = (m[`${r.provider}:${r.model}`] ?? 0) + r.ok
  }
  for (const [job, m] of Object.entries(byModel)) {
    const best = Object.entries(m).sort((a, b) => b[1] - a[1])[0]
    if (best && best[1] > 0) out[job].top = { id: best[0], n: best[1] }
  }
  return out
}

function votesFor(job: AiJob, feedback: AdminStatus["feedback"]) {
  let up = 0
  let down = 0
  for (const [f, v] of Object.entries(feedback ?? {})) {
    const j = FEATURE_JOB[f] ?? (f.startsWith("draft-") ? "draft" : null)
    if (j === job) {
      up += v.up
      down += v.down
    }
  }
  return { up, down }
}

/** Every job at a glance, with a real test call each. */
export function JobsOverview({ status, settings }: { status: AdminStatus | null; settings: AiSettings }) {
  const agg = useMemo(() => aggregate(status?.stats ?? null), [status])
  const reduce = useReducedMotion()
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {JOBS.filter((j) => j.id !== "playground").map((j, i) => {
        const first = status?.firstChoice?.[j.id] ?? null
        const m = first ? resolveModel(first, settings) : undefined
        const a = agg[j.id]
        const rate = a && a.calls ? Math.round((a.ok / a.calls) * 100) : null
        const v = votesFor(j.id, status?.feedback ?? null)
        return (
          <motion.li
            key={j.id}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 10) * 0.03, type: "spring", duration: 0.45, bounce: 0.1 }}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="text-sm font-semibold">{j.label}</h3>
                <p className="text-xs text-muted-foreground">{j.used}</p>
              </div>
              <Badge variant="outline" className="shrink-0 capitalize">
                {j.effort} effort
              </Badge>
            </div>
            <div className="flex flex-col gap-1 rounded-xl bg-white/[0.03] px-3 py-2">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Answers first with</span>
              {m ? (
                <span className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-xs text-muted-foreground">{PROVIDERS.find((p) => p.id === m.provider)?.label}</span>
                  {m.premium ? <Badge className="bg-gold/15 text-gold">Premium</Badge> : <Badge variant="secondary">Free</Badge>}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">{status ? "No model with a key: this job is off." : "Shown once the database is connected."}</span>
              )}
              {a?.top && a.top.id !== first && <span className="text-xs text-muted-foreground">Mostly answered by {resolveModel(a.top.id, settings)?.label ?? a.top.id} this week</span>}
            </div>
            <dl className="grid grid-cols-4 gap-2 text-center">
              <Metric label="Calls 7d" value={a ? compact.format(a.calls) : "0"} />
              <Metric label="Success" value={rate === null ? "–" : `${rate}%`} tone={rate !== null && rate < 80 ? "warn" : undefined} />
              <Metric label="Latency" value={a && a.calls ? `${(a.ms / a.calls / 1000).toFixed(1)}s` : "–"} />
              <Metric label="Cost" value={a ? usd(a.cost) : "$0"} />
            </dl>
            {rate !== null && (
              <div aria-hidden className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div initial={{ width: 0 }} animate={{ width: `${rate}%` }} transition={{ duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }} className={cn("h-full rounded-full", rate < 80 ? "bg-gold" : "bg-ion")} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{a ? `${compact.format(a.tokens)} tokens` : "No calls yet"}</span>
              {(v.up > 0 || v.down > 0) && (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <ThumbsUpIcon aria-label="Useful" className="size-3 text-ion" /> {v.up}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ThumbsDownIcon aria-label="Not useful" className="size-3" /> {v.down}
                  </span>
                </span>
              )}
            </div>
            {a?.lastError && (
              <p className="flex items-start gap-1.5 text-xs text-gold">
                <CircleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" /> Last failure: {a.lastError}
              </p>
            )}
            <JobTest job={j.id} disabled={!m} />
          </motion.li>
        )
      })}
    </ul>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className={cn("text-sm font-semibold tabular-nums", tone === "warn" && "text-gold")}>{value}</dd>
    </div>
  )
}

function JobTest({ job, disabled }: { job: AiJob; disabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ ok: boolean; r?: TestResult; text?: string } | null>(null)
  async function run() {
    setBusy(true)
    setRes(null)
    try {
      const r = await aiAdmin2.testJob(job)
      setRes({ ok: true, r: r.data })
    } catch (err) {
      setRes({ ok: false, text: err instanceof AiRequestError ? err.message : "The test failed." })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-auto flex flex-col gap-2">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy || disabled} className="self-start">
        <FlaskConicalIcon aria-hidden data-icon="inline-start" className={busy ? "motion-safe:animate-pulse" : undefined} />
        {busy ? "Testing…" : "Test this job"}
      </Button>
      {res && (
        <p role="status" className={cn("text-xs", res.ok ? "text-muted-foreground" : "text-destructive")}>
          {res.ok && res.r ? (
            <>
              <span className={cn("font-medium", res.r.correct ? "text-ion" : "text-gold")}>{res.r.correct ? "Correct" : "Answered, but wrong"}</span> · {res.r.label} in {(res.r.ms / 1000).toFixed(1)}s · {nf.format(res.r.tokens)} tokens{res.r.premium ? ` · ${usd(res.r.costUsd)}` : ""}
              <span className="mt-0.5 block text-muted-foreground">“{res.r.reply}”</span>
            </>
          ) : (
            res.text
          )}
        </p>
      )}
    </div>
  )
}

/** Typical tokens per call for a job, from this week's stats, else a fair default. */
function typical(job: AiJob, stats: JobStat[] | null): { tin: number; tout: number } {
  let calls = 0
  let tin = 0
  let tout = 0
  for (const r of stats ?? []) {
    if (r.job !== job) continue
    calls += r.ok
    tin += r.tokens_in
    tout += r.tokens_out
  }
  if (calls >= 3) return { tin: tin / calls, tout: tout / calls }
  const heavy = ["research", "factcheck", "editor", "news"].includes(job)
  return heavy ? { tin: 12_000, tout: 3_000 } : { tin: 3_000, tout: 900 }
}

/** The premium (paid) slot per job and the monthly budget. Off by default. */
export function PremiumSlots({ status, settings, onChange }: { status: AdminStatus | null; settings: AiSettings; onChange: (s: AiSettings) => void }) {
  const premiumModels = allModels(settings).filter((m) => m.premium)
  const keys = new Set((status?.providers ?? []).filter((p) => p.configured).map((p) => p.id))
  const spent = status?.premiumSpent ?? 0
  const pct = settings.premiumBudgetUsd > 0 ? Math.min(100, (spent / settings.premiumBudgetUsd) * 100) : 0
  const anyKey = premiumModels.some((m) => keys.has(m.provider))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm font-medium">This month: {usd(spent)} of {usd(settings.premiumBudgetUsd)}</p>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div style={{ width: `${pct}%` }} className={cn("h-full rounded-full transition-[width] duration-700", pct > 85 ? "bg-gold" : "bg-ion")} />
          </div>
          <p className="text-xs text-muted-foreground">When the budget is reached, every job goes back to its free models until the 1st of next month (UTC).</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Monthly budget, $
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={10000}
            step={1}
            value={settings.premiumBudgetUsd}
            onChange={(e) => onChange({ ...settings, premiumBudgetUsd: Math.max(0, Math.min(10_000, Number(e.target.value) || 0)) })}
            className="w-24 tabular-nums"
          />
        </label>
      </div>
      {!anyKey && (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          No premium key is set, so these slots do nothing. Add <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> or <code className="font-mono text-xs">OPENROUTER_PREMIUM_API_KEY</code> in Vercel to use them.
        </p>
      )}
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
        {JOBS.filter((j) => j.id !== "playground").map((j) => {
          const pick = settings.premium[j.id] ?? ""
          const m = pick ? resolveModel(pick, settings) : undefined
          const t = typical(j.id, status?.stats ?? null)
          const per100 = m ? estimateCost(m, t.tin * 100, t.tout * 100) : 0
          return (
            <li key={j.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{j.label}</span>
                <span className="text-xs text-muted-foreground">
                  {m ? `About ${usd(per100)} per 100 calls (≈${compact.format(t.tin)} in, ${compact.format(t.tout)} out each)${keys.has(m.provider) ? "" : " · its key is not set"}` : "Free models only"}
                </span>
              </div>
              <select
                aria-label={`Premium model for ${j.label}`}
                value={pick}
                onChange={(e) => {
                  const premium = { ...settings.premium }
                  if (e.target.value) premium[j.id] = e.target.value
                  else delete premium[j.id]
                  onChange({ ...settings, premium })
                }}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm sm:w-72"
              >
                <option value="">Off (free models)</option>
                {premiumModels.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.label} · ${pm.price?.in}/${pm.price?.out} per M{keys.has(pm.provider) ? "" : " · no key"}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The live catalogue: what each provider offers today, and a way to add a model this site does not know yet. */
export function CatalogBrowser({ status, settings, onChange, canRefresh }: { status: AdminStatus | null; settings: AiSettings; onChange: (s: AiSettings) => void; canRefresh: boolean }) {
  const [fresh, setFresh] = useState<{ providers: Record<string, CatalogEntry[]>; failed: string[]; fetchedAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [provider, setProvider] = useState<string>("openrouter")
  const [q, setQ] = useState("")
  const [freeOnly, setFreeOnly] = useState(true)
  const lists: Record<string, CatalogEntry[]> = useMemo(() => {
    if (fresh) return fresh.providers
    return Object.fromEntries((status?.catalog ?? []).map((r) => [r.provider, r.models]))
  }, [fresh, status])
  const fetchedAt = fresh?.fetchedAt ?? status?.catalog?.map((r) => r.fetched_at).sort().at(-1) ?? null
  const known = new Set(allModels(settings).map((m) => m.id))
  const builtIn = new Set(MODELS.map((m) => m.id))
  const all = lists[provider] ?? []
  const shown = all
    .filter((e) => !freeOnly || provider !== "openrouter" || e.model.endsWith(":free"))
    .filter((e) => !q || `${e.label} ${e.model}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60)

  async function refresh() {
    setBusy(true)
    setErr(null)
    try {
      const r = await aiAdmin2.refreshCatalog()
      setFresh(r)
      if (r.failed.length) setErr(`Could not read: ${r.failed.join(", ")}.`)
    } catch (e) {
      setErr(e instanceof AiRequestError ? e.message : "Could not refresh the catalogue.")
    } finally {
      setBusy(false)
    }
  }

  function add(e: CatalogEntry) {
    const custom: ModelInfo = {
      id: `${e.provider}:${e.model}`,
      provider: e.provider as ProviderId,
      model: e.model,
      label: e.label,
      context: e.context,
      notes: "Added from the live catalogue.",
      json: e.json,
      playground: e.provider !== "openrouterpaid" && e.provider !== "anthropic",
      tier: 2,
      ...(e.reasoning ? { reasoning: e.provider === "openrouter" || e.provider === "openrouterpaid" ? ("openrouter" as const) : undefined } : {}),
      ...(e.vision ? { vision: true } : {}),
      ...(e.price ? { premium: e.provider === "openrouterpaid" || e.provider === "anthropic", price: e.price } : {}),
    }
    onChange({ ...settings, custom: [...settings.custom, custom] })
  }

  const providers = PROVIDERS.map((p) => p.id).filter((id) => id === "openrouter" || id === "openrouterpaid" || lists[id])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
          {providers.map((id) => (
            <option key={id} value={id}>
              {PROVIDERS.find((p) => p.id === id)?.label} {lists[id] ? `(${lists[id].length})` : ""}
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter models" aria-label="Filter models" className="pl-8" />
        </div>
        {provider === "openrouter" && (
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Free only
          </label>
        )}
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={busy || !canRefresh} className="ml-auto">
          <RefreshCwIcon aria-hidden data-icon="inline-start" className={busy ? "motion-safe:animate-spin" : undefined} />
          {busy ? "Reading catalogues…" : "Refresh from providers"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {fetchedAt ? `Last read ${new Date(fetchedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. ` : "Not read yet. "}
        The router skips free OpenRouter models that disappear from this list. Added models appear in each job&apos;s list below (premium ones in the premium slots); save to keep them.
      </p>
      {err && <p className="text-xs text-gold">{err}</p>}
      {all.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{fetchedAt ? "Nothing listed for this provider (its key may not be set)." : "Press Refresh to read each provider's current models."}</p>
      ) : (
        <ul className="flex max-h-[28rem] flex-col divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-card">
          {shown.map((e) => {
            const id = `${e.provider}:${e.model}`
            const have = known.has(id)
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{e.label}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="truncate font-mono">{e.model}</span>
                    {e.context > 0 && <span>{compact.format(e.context)} ctx</span>}
                    {e.vision && (
                      <span className="inline-flex items-center gap-0.5">
                        <EyeIcon aria-hidden className="size-3" /> images
                      </span>
                    )}
                    {e.reasoning && <span>reasoning</span>}
                    {e.json !== "prompt" && <span>JSON</span>}
                    {e.price && <span>${e.price.in}/${e.price.out} per M</span>}
                  </span>
                </div>
                {have ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <CheckIcon aria-hidden className="size-3.5 text-ion" /> {builtIn.has(id) ? "Built in" : "Added"}
                  </span>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => add(e)} disabled={e.provider === "anthropic" && !e.price}>
                    <PlusIcon aria-hidden data-icon="inline-start" /> Add
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
