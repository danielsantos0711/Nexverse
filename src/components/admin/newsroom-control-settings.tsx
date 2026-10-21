"use client"

import { useState } from "react"
import { CopyIcon, DatabaseIcon, KeyRoundIcon, PlusIcon, SaveIcon } from "lucide-react"
import { AdminHeading, Notice, StatusLine, SwitchRow } from "@/components/admin/controls"
import { engineCall, usd } from "@/components/admin/newsroom-control-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCaps } from "@/lib/caps"
import type { EngineState } from "@/lib/newsroom/engine/state"
import { ANTHROPIC_MODELS, callCost, EVIDENCE_LEVELS, PREMIUM_PROVIDERS, readEngineSettings, SCOUTS, STAGES, type Desk, type EngineSettings, type PremiumProvider, type Stage } from "@/lib/newsroom/engine/types"
import { cn } from "@/lib/utils"

/*
 * The engine's settings: the scheduler and its one-time setup, the mass import (Backfill), frequency and
 * limits, the editorial rules, the model of every stage (the best free model by default, an optional paid
 * model per stage with its estimated cost), the scouts, the desks and their research methods.
 */

/** Typical tokens of one call, per stage (input, output), and calls per researched story. For estimates only. */
const TYPICAL: Record<Stage, { in: number; out: number; perStory: number; perCycle: number }> = {
  planner: { in: 3_000, out: 800, perStory: 0, perCycle: 2 },
  triage: { in: 7_000, out: 1_800, perStory: 0, perCycle: 3 },
  research: { in: 45_000, out: 4_000, perStory: 2, perCycle: 0 },
  write: { in: 18_000, out: 5_000, perStory: 1, perCycle: 0 },
  factcheck: { in: 24_000, out: 3_000, perStory: 1, perCycle: 0 },
  update: { in: 16_000, out: 1_500, perStory: 0.3, perCycle: 0 },
  editor: { in: 4_000, out: 900, perStory: 1, perCycle: 0 },
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-3xl border border-border bg-gradient-to-b from-white/[0.025] to-transparent p-4 md:p-6">
      <div id={id}>
        <AdminHeading title={title} lead={lead} />
      </div>
      {children}
    </section>
  )
}

function Num({ id, label, value, onChange, min, max, step = 1, hint, disabled }: { id: string; label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; hint?: string; disabled?: boolean }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

const SQL = (origin: string) => `-- Run once in the Supabase SQL editor. The secret never goes in the repository.
select vault.create_secret('<the same value as CRON_SECRET on Vercel>', 'newsroom_cron_secret');
select vault.create_secret('${origin}/api/newsroom/tick', 'newsroom_tick_url');`

export function EngineSettingsPanel({ state, onSaved }: { state: EngineState; onSaved: () => void }) {
  const canEdit = useCaps().can("news.publish")
  const [s, setS] = useState<EngineSettings>(state.settings)
  const [sensitive, setSensitive] = useState(state.settings.rules.sensitive.join(", "))
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const origin = typeof window === "undefined" ? "https://<your-domain>" : window.location.origin
  const [bf, setBf] = useState({ desks: [] as string[], days: state.settings.backfill.days, perDesk: state.settings.backfill.perDesk })

  const save = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const next = readEngineSettings({ ...s, rules: { ...s.rules, sensitive: sensitive.split(",").map((x) => x.trim()).filter(Boolean) } })
      await engineCall({ action: "settings", settings: next })
      setS(next)
      setStatus({ ok: true, text: "Settings saved. The next tick uses them." })
      onSaved()
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Could not save." })
    } finally {
      setBusy(false)
    }
  }

  const backfill = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await engineCall({ action: "backfill", desks: bf.desks, days: bf.days, perDesk: bf.perDesk })
      setStatus({ ok: true, text: `Backfill started: the last ${bf.days} days, up to ${bf.perDesk} stories per desk. Follow it in Live.` })
      onSaved()
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Could not start the backfill." })
    } finally {
      setBusy(false)
    }
  }

  const sched = state.scheduler
  const cyclesPerDay = (24 * 60) / s.cycleMinutes
  const storiesPerDay = Math.min(s.rules.maxPerDay, s.limits.researchPerCycle * cyclesPerDay)
  const stageCost = (stage: Stage) => {
    const p = s.stages[stage].premium
    if (!p.enabled) return null
    if (p.provider !== "anthropic") return { perCall: null, perDay: null }
    const m = ANTHROPIC_MODELS.find((x) => x.id === p.model) ?? ANTHROPIC_MODELS[0]
    const t = TYPICAL[stage]
    const perCall = callCost(m, t.in, t.out)
    return { perCall, perDay: perCall * (t.perStory * storiesPerDay + t.perCycle * cyclesPerDay) }
  }
  const dayTotal = STAGES.reduce((a, st) => a + (stageCost(st.id)?.perDay ?? 0), 0)
  const set = <K extends keyof EngineSettings>(k: K, v: EngineSettings[K]) => setS((x) => ({ ...x, [k]: v }))
  const setStage = (id: Stage, v: Partial<EngineSettings["stages"][Stage]>) => setS((x) => ({ ...x, stages: { ...x.stages, [id]: { ...x.stages[id], ...v } } }))

  return (
    <div className="flex flex-col gap-6">
      {!canEdit && <Notice title="Read only">Only editors who can publish change the engine&apos;s settings.</Notice>}
      <StatusLine status={status} />

      <Section id="sched-h" title="Scheduler" lead="Supabase pg_cron posts a tick to the site every ten minutes through pg_net, 24/7. Each tick works the queue for up to four minutes; a research cycle starts when one is due.">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { ok: Boolean(sched?.jobs.some((j) => j.active)), label: "pg_cron job nexverse-newsroom-tick", hint: sched?.jobs[0]?.schedule ?? (sched?.cronError ? sched.cronError : "created by the migration") },
            { ok: Boolean(sched?.vault.url), label: "Vault: newsroom_tick_url", hint: "where the database sends ticks" },
            { ok: Boolean(sched?.vault.secret), label: "Vault: newsroom_cron_secret", hint: "the same value as CRON_SECRET" },
            { ok: state.keys.cron, label: "CRON_SECRET on the server", hint: "16 characters or more" },
            { ok: state.keys.service, label: "SUPABASE_SERVICE_ROLE_KEY", hint: "scheduled ticks act as the service role" },
            { ok: state.keys.free.length > 0, label: "A free AI key", hint: state.keys.free.join(", ") || "GEMINI_API_KEY is the strongest free choice" },
            { ok: state.keys.github, label: "GITHUB_TOKEN (optional)", hint: "raises GitHub's search limit from 10 to 30 a minute" },
            { ok: state.keys.illustrations, label: "Cloudflare Workers AI (optional)", hint: "for labelled AI illustrations" },
          ].map((x) => (
            <li key={x.label} className={cn("flex flex-col rounded-xl border px-3 py-2 text-sm", x.ok ? "border-ok/30" : "border-gold/30 bg-gold/[0.04]")}>
              <span className="flex items-center gap-2 font-medium">
                <span aria-hidden className={cn("size-2 rounded-full", x.ok ? "bg-ok" : "bg-gold")} />
                {x.label}
              </span>
              <span className="text-xs text-muted-foreground">{x.ok ? "Set" : "Missing"} · {x.hint}</span>
            </li>
          ))}
        </ul>
        {!(sched?.vault.url && sched.vault.secret) && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <KeyRoundIcon aria-hidden className="size-4 text-gold" /> One-time setup
            </p>
            <pre className="overflow-x-auto rounded-xl border border-border bg-black/40 p-3 font-mono text-xs leading-relaxed">{SQL(origin)}</pre>
            <Button size="xs" variant="outline" className="self-start" onClick={() => void navigator.clipboard.writeText(SQL(origin)).then(() => setStatus({ ok: true, text: "SQL copied." }))}>
              <CopyIcon aria-hidden /> Copy SQL
            </Button>
          </div>
        )}
        {sched && sched.runs.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Last scheduler runs: {sched.runs.slice(0, 6).map((r) => `${new Date(r.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ${r.status}`).join(" · ")}
            {sched.responses[0] ? ` · last answer from the site: ${sched.responses[0].status ?? sched.responses[0].error}` : ""}
          </p>
        )}
      </Section>

      <Section id="backfill-h" title="Backfill: mass import" lead="Imports real news from a past window at once: every chosen desk scouts the period, triage keeps what is worth it, and up to the set number of stories per desk is researched and written from the original sources. Nothing is invented: a desk with nothing worth reporting gets nothing.">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm font-medium">Desks (none chosen: all)</legend>
          {state.desks
            .filter((d) => d.enabled && !d.leakTrack)
            .map((d) => {
              const on = bf.desks.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setBf({ ...bf, desks: on ? bf.desks.filter((x) => x !== d.id) : [...bf.desks, d.id] })}
                  className={cn("rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-ion/60 bg-ion/15" : "border-border text-muted-foreground hover:text-foreground")}
                >
                  {d.label}
                </button>
              )
            })}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Num id="bf-days" label="Days back" value={bf.days} min={1} max={30} onChange={(n) => setBf({ ...bf, days: n })} />
          <Num id="bf-per" label="Stories per desk" value={bf.perDesk} min={1} max={6} onChange={(n) => setBf({ ...bf, perDesk: n })} />
          <div className="flex items-end">
            <Button disabled={busy || !state.ready} onClick={() => void backfill()} className="w-full">
              <DatabaseIcon aria-hidden /> Start backfill
            </Button>
          </div>
        </div>
      </Section>

      <Section id="freq-h" title="Frequency and limits" lead="How often a cycle starts and how much one tick may spend. Ticks stop starting work when any limit is reached; what is left waits for the next tick.">
        <SwitchRow id="eng-paused" label="Pause the engine" description="Scheduled ticks do nothing while paused. Run now and Backfill still work." checked={s.paused} onChange={(v) => set("paused", v)} disabled={!canEdit} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Num id="cyc" label="Cycle every (minutes)" value={s.cycleMinutes} min={15} max={1440} onChange={(n) => set("cycleMinutes", n)} hint="60 is hourly" disabled={!canEdit} />
          <Num id="rpc" label="Stories researched per cycle" value={s.limits.researchPerCycle} min={0} max={12} onChange={(n) => set("limits", { ...s.limits, researchPerCycle: n })} hint="shared by desk activity and priority" disabled={!canEdit} />
          <Num id="tick" label="Seconds per tick" value={s.limits.tickSeconds} min={60} max={280} onChange={(n) => set("limits", { ...s.limits, tickSeconds: n })} disabled={!canEdit} />
          <Num id="fetch" label="Web requests per tick" value={s.limits.fetchesPerTick} min={10} max={500} onChange={(n) => set("limits", { ...s.limits, fetchesPerTick: n })} disabled={!canEdit} />
          <Num id="calls" label="AI calls per tick" value={s.limits.aiCallsPerTick} min={0} max={80} onChange={(n) => set("limits", { ...s.limits, aiCallsPerTick: n })} disabled={!canEdit} />
          <Num id="tok" label="Tokens per tick" value={s.limits.tokensPerTick} min={20000} max={3000000} step={10000} onChange={(n) => set("limits", { ...s.limits, tokensPerTick: n })} disabled={!canEdit} />
          <Num id="callsday" label="AI calls per day" value={s.limits.aiCallsPerDay} min={0} max={3000} onChange={(n) => set("limits", { ...s.limits, aiCallsPerDay: n })} disabled={!canEdit} />
          <Num id="maxday" label="AI stories per day, at most" value={s.rules.maxPerDay} min={0} max={60} onChange={(n) => set("rules", { ...s.rules, maxPerDay: n })} hint="drafts included" disabled={!canEdit} />
        </div>
      </Section>

      <Section id="rules-h" title="Editorial rules" lead="A story is published without review only when every rule passes; otherwise it waits in Review with the reasons. Leaks and unconfirmed reports always wait for an editor.">
        <div className="grid gap-2 lg:grid-cols-2">
          <SwitchRow id="r-auto" label="Publish automatically" description="Master switch. Each desk must also allow it." checked={s.rules.autoPublish} onChange={(v) => set("rules", { ...s.rules, autoPublish: v })} disabled={!canEdit} />
          <SwitchRow id="r-fc" label="Require the fact check" description="No auto-publish when the second pass did not run." checked={s.rules.requireFactCheck} onChange={(v) => set("rules", { ...s.rules, requireFactCheck: v })} disabled={!canEdit} />
          <SwitchRow id="r-upd" label="Apply updates automatically" description="Timeline updates to published stories from confirmed or observed evidence." checked={s.rules.autoUpdate} onChange={(v) => set("rules", { ...s.rules, autoUpdate: v })} disabled={!canEdit} />
          <SwitchRow id="r-ill" label="AI illustrations" description="When no official or free-licensed image fits. Always labelled as an illustration." checked={s.illustrations} onChange={(v) => set("illustrations", v)} disabled={!canEdit} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="r-ev">Evidence needed to auto-publish</FieldLabel>
            <select id="r-ev" disabled={!canEdit} value={s.rules.minEvidence} onChange={(e) => set("rules", { ...s.rules, minEvidence: e.target.value === "confirmed" ? "confirmed" : "observed" })} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
              {EVIDENCE_LEVELS.slice(0, 2).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Num id="r-src" label="Independent sources" value={s.rules.minSources} min={1} max={6} onChange={(n) => set("rules", { ...s.rules, minSources: n })} disabled={!canEdit} />
          <Num id="r-score" label="Score to auto-publish" value={s.rules.minScore} min={0} max={100} onChange={(n) => set("rules", { ...s.rules, minScore: n })} disabled={!canEdit} />
          <Num id="r-leak" label="Leak confidence to research" value={s.rules.leakMinConfidence} min={0} max={100} onChange={(n) => set("rules", { ...s.rules, leakMinConfidence: n })} disabled={!canEdit} />
        </div>
        <Field>
          <FieldLabel htmlFor="r-sens">Sensitive subjects (always reviewed)</FieldLabel>
          <Textarea id="r-sens" rows={2} value={sensitive} onChange={(e) => setSensitive(e.target.value)} disabled={!canEdit} />
          <FieldDescription>Comma separated. A story mentioning any of these waits for an editor.</FieldDescription>
        </Field>
      </Section>

      <Section id="models-h" title="Models per stage" lead="Every stage uses the best free model available by default (the AI router's order, with fallbacks). A paid model can be switched on per stage; it is used only while its key is on the server and the spending limits allow, and falls back to free otherwise.">
        <ul className="flex flex-col gap-3">
          {STAGES.map((st) => {
            const v = s.stages[st.id]
            const cost = stageCost(st.id)
            const keyOn = state.keys.premium[v.premium.provider]
            return (
              <li key={st.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 lg:flex-row lg:items-start">
                <div className="min-w-0 lg:w-64">
                  <p className="flex items-center gap-2 font-medium">
                    {st.label}
                    {st.hard && <Badge variant="outline">hard</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{st.blurb}</p>
                </div>
                <Field className="lg:w-64">
                  <FieldLabel htmlFor={`m-${st.id}`}>Free model</FieldLabel>
                  <select id={`m-${st.id}`} disabled={!canEdit} value={v.model} onChange={(e) => setStage(st.id, { model: e.target.value })} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
                    <option value="auto">Best available (automatic)</option>
                    {state.freeModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                        {m.active ? "" : " (no key)"}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" disabled={!canEdit} checked={v.premium.enabled} onChange={(e) => setStage(st.id, { premium: { ...v.premium, enabled: e.target.checked } })} className="size-4 accent-[var(--color-ion)]" />
                    Paid model for this stage
                    {v.premium.enabled && !keyOn && <span className="text-xs text-gold">({PREMIUM_PROVIDERS.find((p) => p.id === v.premium.provider)?.env} is not set: stays free)</span>}
                  </label>
                  {v.premium.enabled && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select aria-label={`${st.label} paid provider`} disabled={!canEdit} value={v.premium.provider} onChange={(e) => setStage(st.id, { premium: { ...v.premium, provider: e.target.value as PremiumProvider, model: e.target.value === "anthropic" ? ANTHROPIC_MODELS[0].id : "" } })} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
                        {PREMIUM_PROVIDERS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      {v.premium.provider === "anthropic" ? (
                        <select aria-label={`${st.label} paid model`} disabled={!canEdit} value={v.premium.model} onChange={(e) => setStage(st.id, { premium: { ...v.premium, model: e.target.value } })} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
                          {ANTHROPIC_MODELS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label} (${m.inUsd} / ${m.outUsd} per M)
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input aria-label={`${st.label} OpenRouter model id`} disabled={!canEdit} placeholder="vendor/model" value={v.premium.model} onChange={(e) => setStage(st.id, { premium: { ...v.premium, model: e.target.value } })} />
                      )}
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        {cost?.perCall != null ? `About ${usd(cost.perCall)} a call, ${usd(cost.perDay ?? 0)} a day at the current settings (estimate from typical sizes; the real cost is logged per call).` : "Billed at OpenRouter's price for the model; the real cost is logged per call."}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <div className="grid gap-3 sm:grid-cols-3">
          <Num id="p-day" label="Paid spending per day (USD)" value={s.premium.dailyUsd} min={0} max={500} step={0.5} onChange={(n) => set("premium", { ...s.premium, dailyUsd: n })} disabled={!canEdit} />
          <Num id="p-month" label="Paid spending per month (USD)" value={s.premium.monthlyUsd} min={0} max={5000} step={1} onChange={(n) => set("premium", { ...s.premium, monthlyUsd: n })} disabled={!canEdit} />
          <div className="flex flex-col justify-end rounded-xl border border-border px-3 py-2 text-sm">
            <span className="text-xs text-muted-foreground">Estimated paid cost per day</span>
            <span className="text-lg font-semibold tabular-nums">{usd(dayTotal)}</span>
            <span className="text-xs text-muted-foreground">about {Math.round(storiesPerDay)} stories a day; capped by the limits</span>
          </div>
        </div>
      </Section>

      <Section id="scouts-h" title="Scouts" lead="Where the researchers look. Discovery-only sources are never linked or cited: stories cite the original paper, repository or official post.">
        <div className="grid gap-2 lg:grid-cols-2">
          {SCOUTS.map((x) => (
            <SwitchRow key={x.id} id={`sc-${x.id}`} label={x.label} description={x.blurb} checked={s.scouts[x.id]} onChange={(v) => set("scouts", { ...s.scouts, [x.id]: v })} disabled={!canEdit} />
          ))}
        </div>
      </Section>

      {canEdit && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button size="lg" disabled={busy} onClick={() => void save()} className="shadow-[0_10px_40px_-10px] shadow-ion/50">
            <SaveIcon aria-hidden /> Save settings
          </Button>
        </div>
      )}

      <DesksEditor desks={state.desks} canEdit={canEdit} onSaved={onSaved} />
    </div>
  )
}

// ─── Desks ──────────────────────────────────────────────────────────────────────────────────────────────────

const BLANK: Desk = { id: "", label: "", one: "", blurb: "", scope: "", audience: "", kind: "industry", priority: 3, enabled: true, hidden: false, leakTrack: false, autoPublish: false, minScore: 65, methods: {}, tint: "#7aa2ff", sort: 100 }

function DeskForm({ desk, canEdit, onSaved, isNew }: { desk: Desk; canEdit: boolean; onSaved: () => void; isNew?: boolean }) {
  const [d, setD] = useState(desk)
  const [methods, setMethods] = useState(JSON.stringify(desk.methods, null, 2))
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    let m: unknown
    try {
      m = JSON.parse(methods || "{}")
    } catch {
      setStatus({ ok: false, text: "The research methods are not valid JSON." })
      return
    }
    setBusy(true)
    try {
      await engineCall({ action: "desk", desk: { ...d, methods: m } })
      setStatus({ ok: true, text: "Desk saved." })
      onSaved()
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Could not save the desk." })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor={`d-id-${desk.id}`}>Id</FieldLabel>
          <Input id={`d-id-${desk.id}`} value={d.id} disabled={!isNew || !canEdit} onChange={(e) => setD({ ...d, id: e.target.value.toLowerCase() })} placeholder="robotics" required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`d-label-${desk.id}`}>Name</FieldLabel>
          <Input id={`d-label-${desk.id}`} value={d.label} disabled={!canEdit} onChange={(e) => setD({ ...d, label: e.target.value })} required />
        </Field>
        <Num id={`d-pri-${desk.id}`} label="Priority (0 to 5)" value={d.priority} min={0} max={5} onChange={(n) => setD({ ...d, priority: n })} disabled={!canEdit} />
        <Num id={`d-min-${desk.id}`} label="Score bar" value={d.minScore} min={0} max={100} onChange={(n) => setD({ ...d, minScore: n })} disabled={!canEdit} />
      </div>
      <Field>
        <FieldLabel htmlFor={`d-scope-${desk.id}`}>What this desk covers (the researchers read this)</FieldLabel>
        <Textarea id={`d-scope-${desk.id}`} rows={2} value={d.scope} disabled={!canEdit} onChange={(e) => setD({ ...d, scope: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`d-aud-${desk.id}`}>Readers</FieldLabel>
          <Input id={`d-aud-${desk.id}`} value={d.audience} disabled={!canEdit} onChange={(e) => setD({ ...d, audience: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`d-blurb-${desk.id}`}>Line under the tab</FieldLabel>
          <Input id={`d-blurb-${desk.id}`} value={d.blurb} disabled={!canEdit} onChange={(e) => setD({ ...d, blurb: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {(
          [
            ["enabled", "On"],
            ["autoPublish", "May auto-publish"],
            ["leakTrack", "Leak track"],
            ["hidden", "Hidden from readers"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" disabled={!canEdit} checked={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.checked })} className="size-4" />
            {label}
          </label>
        ))}
        <label className="flex items-center gap-2">
          Colour <input type="color" disabled={!canEdit} value={d.tint ?? "#7aa2ff"} onChange={(e) => setD({ ...d, tint: e.target.value })} className="h-6 w-8 rounded" />
        </label>
      </div>
      <Field>
        <FieldLabel htmlFor={`d-m-${desk.id}`}>Research methods (JSON)</FieldLabel>
        <Textarea id={`d-m-${desk.id}`} rows={6} value={methods} disabled={!canEdit} onChange={(e) => setMethods(e.target.value)} className="font-mono text-xs" />
        <FieldDescription>github (rising, topics, queries, watchRepos), arxiv (categories, queries), hf (models, datasets), federal (terms), gdelt (queries), hn (enabled, minPoints), keywords.</FieldDescription>
      </Field>
      <StatusLine status={status} />
      {canEdit && (
        <Button type="submit" size="sm" disabled={busy} className="self-start">
          {isNew ? <PlusIcon aria-hidden /> : <SaveIcon aria-hidden />} {isNew ? "Add desk" : "Save desk"}
        </Button>
      )}
    </form>
  )
}

function DesksEditor({ desks, canEdit, onSaved }: { desks: Desk[]; canEdit: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Section id="desks-h" title="Desks" lead="The editorial categories. Each desk has its own researchers, priority, publishing rule and methods. Readers see the enabled, visible desks as tabs on /news.">
      <ul className="flex flex-col gap-2">
        {desks.map((d) => (
          <li key={d.id} className="rounded-2xl border border-border">
            <button type="button" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm">
              <span aria-hidden className="size-3 rounded-full" style={{ background: d.tint ?? "#7aa2ff" }} />
              <span className="font-medium">{d.label}</span>
              <span className="text-xs text-muted-foreground">
                priority {d.priority} · bar {d.minScore}
                {d.autoPublish ? " · auto-publish" : " · reviewed"}
                {d.leakTrack ? " · leaks" : ""}
                {!d.enabled ? " · off" : ""}
              </span>
            </button>
            {open === d.id && (
              <div className="border-t border-border p-4">
                <DeskForm desk={d} canEdit={canEdit} onSaved={onSaved} />
              </div>
            )}
          </li>
        ))}
        {canEdit && (
          <li className="rounded-2xl border border-dashed border-border">
            <button type="button" aria-expanded={open === "__new"} onClick={() => setOpen(open === "__new" ? null : "__new")} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
              <PlusIcon aria-hidden className="size-4" /> New desk
            </button>
            {open === "__new" && (
              <div className="border-t border-border p-4">
                <DeskForm desk={BLANK} canEdit={canEdit} onSaved={onSaved} isNew />
              </div>
            )}
          </li>
        )}
      </ul>
    </Section>
  )
}
