"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIcon,
  BotIcon,
  CheckIcon,
  CircleDollarSignIcon,
  ClockIcon,
  DatabaseZapIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GaugeIcon,
  HistoryIcon,
  InboxIcon,
  PlayIcon,
  RadarIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchCheckIcon,
  ServerCogIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { AdminHeading, Notice, StatusLine, when } from "@/components/admin/controls"
import { compact, engineCall, loadEngineState, usd } from "@/components/admin/newsroom-control-api"
import { EngineSettingsPanel } from "@/components/admin/newsroom-control-settings"
import { Gate } from "@/components/moderation/gate"
import { EvidenceBadge } from "@/components/news/evidence"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useCaps } from "@/lib/caps"
import type { EngineState } from "@/lib/newsroom/engine/state"
import { JOB_LABELS, LEAD_LABELS, type Decision, type Job, type Lead, type LeadDecision } from "@/lib/newsroom/engine/types"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/*
 * Newsroom control: the research engine at work. What the researchers are doing now, what they found and why
 * they kept or dropped it, the stories waiting for review, model use and cost, failures, the run history, and
 * the controls: Run now, Backfill (the mass import), frequency, limits, desks, models, editorial rules and
 * scouts. Refreshes itself every fifteen seconds while open.
 */

const TABS = [
  { id: "live", label: "Live", icon: ActivityIcon },
  { id: "leads", label: "Discoveries", icon: RadarIcon },
  { id: "review", label: "Review", icon: InboxIcon },
  { id: "log", label: "Decisions", icon: BotIcon },
  { id: "usage", label: "Models and cost", icon: CircleDollarSignIcon },
  { id: "runs", label: "Runs and failures", icon: HistoryIcon },
  { id: "sources", label: "Sources and watchers", icon: DatabaseZapIcon },
  { id: "settings", label: "Settings", icon: SlidersHorizontalIcon },
] as const
type Tab = (typeof TABS)[number]["id"]

export function NewsroomControl() {
  return (
    <Gate cap="news.write" action="work in the newsroom">
      <Control />
    </Gate>
  )
}

function Control() {
  const [state, setState] = useState<EngineState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("live")
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const reduce = useReducedMotion()

  const refresh = useCallback(async () => {
    try {
      setState(await loadEngineState())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the engine.")
    }
  }, [])

  useEffect(() => {
    if (!live) return
    const first = window.setTimeout(() => void refresh(), 0)
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 15_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(t)
    }
  }, [refresh])

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    setStatus(null)
    try {
      await engineCall(body)
      setStatus({ ok: true, text: done })
      window.setTimeout(() => void refresh(), 1500)
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "That did not work." })
    } finally {
      setBusy(false)
    }
  }

  if (!live) return <Notice tone="warn" title="Not connected">This copy of the site has no database, so the research engine cannot run here.</Notice>
  if (!state && !error) return <Skeleton className="h-[32rem] w-full rounded-2xl" />

  return (
    <div className="flex flex-col gap-6">
      <AdminHeading
        title="Newsroom control"
        lead="The research engine runs around the clock: desks of AI researchers scout official sources, repositories, papers and public records, judge what they find, research and write, and publish or send to review by your rules."
      >
        <Button variant="outline" size="sm" onClick={() => void refresh()} aria-label="Refresh">
          <RefreshCwIcon aria-hidden /> Refresh
        </Button>
        <Button size="sm" disabled={busy || !state?.ready} onClick={() => void act({ action: "run" }, "A research cycle started. Results appear here as the researchers work.")}>
          <PlayIcon aria-hidden /> Run now
        </Button>
        <Link href="/admin/newsroom" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground">
          Editors&apos; desk <ExternalLinkIcon aria-hidden className="size-3.5" />
        </Link>
      </AdminHeading>
      <StatusLine status={status} />
      {error && <Notice tone="warn" title="Could not load the engine">{error}</Notice>}
      {state && !state.ready && (
        <Notice tone="warn" title="The research engine is not installed yet">
          {state.missing} Until then the daily collector in the editors&apos; desk keeps working.
        </Notice>
      )}

      {state && (
        <>
          <Pulse state={state} />
          <div role="tablist" aria-label="Newsroom control sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            {TABS.map((t) => {
              const on = t.id === tab
              const badge = t.id === "review" ? state.review.length + state.leads.filter((l) => l.decision === "review" && !l.storyId).length : t.id === "runs" ? state.jobs.filter((j) => j.status === "dead").length : 0
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.id)}
                  className={cn("relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {on && <motion.span layoutId="nc-tab" className="absolute inset-0 rounded-full bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.18, duration: 0.45 }} />}
                  <span className="relative inline-flex items-center gap-1.5">
                    <t.icon aria-hidden className="size-3.5" />
                    {t.label}
                    {badge > 0 && <span className={cn("rounded-full px-1.5 font-mono text-[10px]", on ? "bg-black/20" : "bg-gold/20 text-gold")}>{badge}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} role="tabpanel" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {tab === "live" && <LivePanel state={state} act={act} busy={busy} />}
              {tab === "leads" && <LeadsPanel state={state} act={act} busy={busy} />}
              {tab === "review" && <ReviewPanel state={state} act={act} busy={busy} />}
              {tab === "log" && <DecisionLogPanel decisions={state.decisions} />}
              {tab === "usage" && <UsagePanel state={state} />}
              {tab === "runs" && <RunsPanel state={state} act={act} busy={busy} />}
              {tab === "sources" && <SourcesPanel state={state} act={act} busy={busy} />}
              {tab === "settings" && <EngineSettingsPanel state={state} onSaved={() => void refresh()} />}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

type Act = (body: Record<string, unknown>, done: string) => Promise<void>

// ─── The pulse: is it alive, is it scheduled, what is it doing ──────────────────────────────────────────────

function Stat({ icon: Icon, label, value, note, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-gradient-to-b from-white/[0.035] to-transparent p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </p>
      <p className={cn("text-2xl font-semibold tabular-nums", tone === "ok" && "text-ok", tone === "warn" && "text-gold", tone === "bad" && "text-destructive")}>{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

function Pulse({ state }: { state: EngineState }) {
  const running = state.jobs.filter((j) => j.status === "running")
  const queued = state.jobs.filter((j) => j.status === "queued")
  const lastRun = state.runs[0]
  const sched = state.scheduler
  const scheduled = Boolean(sched?.vault.url && sched.vault.secret && sched.jobs.some((j) => j.active))
  const published24 = state.articles.filter((a) => a.status === "published" && a.ai_generated && a.published_at && Date.parse(state.now) - Date.parse(a.published_at) < 864e5).length
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Stat
        icon={ServerCogIcon}
        label="Scheduler"
        value={scheduled ? "Every 10 min" : "Not scheduled"}
        tone={scheduled ? "ok" : "warn"}
        note={scheduled ? `Cycle every ${state.settings.cycleMinutes} min${state.settings.paused ? " · paused" : ""}` : "Store the Vault secrets (Settings)"}
      />
      <Stat
        icon={ActivityIcon}
        label="Researchers now"
        value={
          <span className="inline-flex items-center gap-2">
            {running.length > 0 && <span aria-hidden className="pulse-dot size-2 rounded-full bg-ion" />}
            {running.length}
          </span>
        }
        note={`${queued.length} jobs waiting`}
      />
      <Stat icon={ClockIcon} label="Last tick" value={lastRun ? when(lastRun.started_at) : "Never"} note={lastRun ? `${lastRun.jobs_done ?? 0} jobs · ${lastRun.status}` : "Press Run now to start"} tone={lastRun?.status === "failed" ? "bad" : undefined} />
      <Stat icon={FileTextIcon} label="AI stories, 24 h" value={published24} note={`${state.review.length} waiting for review`} />
      <Stat icon={CircleDollarSignIcon} label="Premium spend" value={usd(state.usage.premiumTodayUsd)} note={`${usd(state.usage.premiumMonthUsd)} this month · ${state.usage.callsToday} AI calls today`} />
    </div>
  )
}

// ─── Live ───────────────────────────────────────────────────────────────────────────────────────────────────

function JobRow({ job, act, busy, desks, now }: { job: Job; act?: Act; busy?: boolean; desks: Map<string, string>; now: number }) {
  const tone = job.status === "running" ? "text-ion" : job.status === "done" ? "text-ok" : job.status === "dead" || job.status === "failed" ? "text-destructive" : "text-muted-foreground"
  const what = [JOB_LABELS[job.kind], job.desk ? desks.get(job.desk) ?? job.desk : null, typeof job.payload.query === "string" ? `“${job.payload.query}”` : null, typeof job.payload.lead === "number" ? `lead #${job.payload.lead}` : null].filter(Boolean).join(" · ")
  const result = job.result ? Object.entries(job.result).filter(([, v]) => typeof v !== "object").map(([k, v]) => `${k}: ${String(v)}`).slice(0, 4).join(", ") : ""
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 text-sm">
      <span className={cn("w-20 shrink-0 text-xs font-medium capitalize", tone)}>
        {job.status === "running" && <span aria-hidden className="pulse-dot mr-1.5 inline-block size-1.5 rounded-full bg-ion align-middle" />}
        {job.status}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{what}</span>
        {(job.lastError || result) && <span className={cn("block truncate text-xs", job.lastError ? "text-destructive" : "text-muted-foreground")}>{job.lastError || result}</span>}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {job.status === "queued" && Date.parse(job.runAfter) > now ? `from ${new Date(job.runAfter).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : when(job.finishedAt ?? job.startedAt ?? job.createdAt)}
        {job.attempts > 1 ? ` · try ${job.attempts}/${job.maxAttempts}` : ""}
      </span>
      {act && (job.status === "failed" || job.status === "dead" || job.status === "cancelled") && (
        <Button size="xs" variant="outline" disabled={busy} onClick={() => void act({ action: "job", id: job.id, op: "retry" }, "Job queued again.")}>
          <RotateCcwIcon aria-hidden /> Retry
        </Button>
      )}
      {act && job.status === "queued" && (
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => void act({ action: "job", id: job.id, op: "cancel" }, "Job cancelled.")} aria-label={`Cancel ${what}`}>
          <XIcon aria-hidden />
        </Button>
      )}
    </li>
  )
}

function LivePanel({ state, act, busy }: { state: EngineState; act: Act; busy: boolean }) {
  const desks = new Map(state.desks.map((d) => [d.id, d.label]))
  const active = state.jobs.filter((j) => j.status === "running" || j.status === "queued")
  const recent = state.jobs.filter((j) => j.status !== "running" && j.status !== "queued").slice(0, 25)
  // Each desk's last hour: discoveries kept and dropped.
  const now = Date.parse(state.now)
  const hour = now - 36e5 * 6
  const perDesk = state.desks
    .filter((d) => d.enabled)
    .map((d) => {
      const leads = state.leads.filter((l) => l.desk === d.id && Date.parse(l.createdAt) > hour)
      const busyNow = state.jobs.some((j) => j.status === "running" && j.desk === d.id)
      return { d, found: leads.length, kept: leads.filter((l) => ["accepted", "queued", "researching", "review", "published"].includes(l.decision)).length, busyNow }
    })
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="desks-live-h" className="flex flex-col gap-3">
        <h3 id="desks-live-h" className="text-sm font-semibold">
          Research desks, last 6 hours
        </h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {perDesk.map(({ d, found, kept, busyNow }) => (
            <li key={d.id} className="relative overflow-hidden rounded-2xl border border-border p-4" style={{ background: `linear-gradient(160deg, ${d.tint ?? "#7aa2ff"}14, transparent 60%)` }}>
              <p className="flex items-center justify-between gap-2 text-sm font-medium">
                {d.label}
                <span className={cn("inline-flex items-center gap-1 text-[11px]", busyNow ? "text-ion" : "text-muted-foreground")}>
                  <span aria-hidden className={cn("size-1.5 rounded-full", busyNow ? "pulse-dot bg-ion" : "bg-white/25")} />
                  {busyNow ? "researching" : "idle"}
                </span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {found} found · {kept} kept · priority {d.priority}
                {d.leakTrack ? " · leaks" : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="jobs-now-h">
        <h3 id="jobs-now-h" className="text-sm font-semibold">
          Working and waiting ({active.length})
        </h3>
        {active.length ? (
          <ul className="mt-2 divide-y divide-border">
            {active.map((j) => (
              <JobRow key={j.id} job={j} act={act} busy={busy} desks={desks} now={Date.parse(state.now)} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Nothing queued. The next cycle starts on the hour, or press Run now.</p>
        )}
      </section>
      <section aria-labelledby="jobs-done-h">
        <h3 id="jobs-done-h" className="text-sm font-semibold">
          Finished in the last two days
        </h3>
        <ul className="mt-2 divide-y divide-border">
          {recent.map((j) => (
            <JobRow key={j.id} job={j} act={act} busy={busy} desks={desks} now={Date.parse(state.now)} />
          ))}
        </ul>
      </section>
    </div>
  )
}

// ─── Discoveries ────────────────────────────────────────────────────────────────────────────────────────────

const DECISION_TONE: Partial<Record<LeadDecision, string>> = {
  published: "text-ok",
  accepted: "text-ok",
  queued: "text-ion",
  researching: "text-ion",
  review: "text-gold",
  update: "text-gold",
  rejected: "text-muted-foreground",
  duplicate: "text-muted-foreground",
  failed: "text-destructive",
}

function ScoreBar({ parts }: { parts: Record<string, number | string> }) {
  const keys = ["freshness", "authority", "independence", "momentum", "novelty", "priority", "impact", "originality"].filter((k) => typeof parts[k] === "number")
  if (!keys.length) return null
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2 text-[11px]">
          <dt className="w-20 shrink-0 text-muted-foreground capitalize">{k}</dt>
          <dd className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="absolute inset-y-0 left-0 rounded-full bg-ion/70" style={{ width: `${Math.max(0, Math.min(100, Number(parts[k])))}%` }} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function LeadCard({ lead, desks, act, busy }: { lead: Lead; desks: Map<string, string>; act: Act; busy: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] font-mono text-sm tabular-nums" title="Score out of 100">
          {lead.score}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("font-medium", DECISION_TONE[lead.decision])}>{LEAD_LABELS[lead.decision]}</span>
            <span>{lead.desk ? desks.get(lead.desk) ?? lead.desk : "No desk"}</span>
            {lead.track === "leak" && <Badge variant="destructive">Leak track</Badge>}
            {lead.evidenceLevel && <EvidenceBadge level={lead.evidenceLevel} />}
            {lead.leakConfidence !== null && lead.track === "leak" && <span>confidence {lead.leakConfidence}</span>}
            <span>{lead.scout}</span>
            <span>{when(lead.createdAt)}</span>
          </p>
          <p className="mt-1 font-medium leading-snug">{lead.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">Why: </span>
            {lead.reason || "No reason recorded."}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="xs" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
          <SearchCheckIcon aria-hidden /> {open ? "Hide evidence" : `Evidence (${lead.evidence.length})`}
        </Button>
        {lead.storyId && (
          <Link href={`/admin/newsroom?edit=${lead.storyId}`} className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-ion hover:underline">
            Open the story <ExternalLinkIcon aria-hidden className="size-3" />
          </Link>
        )}
        {["rejected", "duplicate", "new", "failed"].includes(lead.decision) && (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void act({ action: "lead", id: lead.id, op: "research" }, "Queued for research.")}>
            Research it
          </Button>
        )}
        {lead.decision === "review" && !lead.storyId && lead.proposal && (
          <Button size="xs" disabled={busy} onClick={() => void act({ action: "lead", id: lead.id, op: "apply" }, "Update applied to the story.")}>
            <CheckIcon aria-hidden /> Apply update
          </Button>
        )}
        {["new", "queued", "review", "update", "accepted"].includes(lead.decision) && (
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void act({ action: "lead", id: lead.id, op: "reject" }, "Lead rejected.")}>
            <XIcon aria-hidden /> Reject
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 border-t border-border pt-3">
          <ScoreBar parts={lead.scoreParts} />
          {typeof lead.scoreParts.flags === "string" && <p className="mt-2 text-xs text-gold">{lead.scoreParts.flags}</p>}
          {typeof lead.scoreParts.alternatives === "string" && <p className="mt-2 text-xs text-muted-foreground">Other explanations: {lead.scoreParts.alternatives}</p>}
          <ol className="mt-3 flex flex-col gap-2">
            {lead.evidence.map((e, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground">{e.kind}</span>
                <span className="min-w-0">
                  <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-ion hover:underline">
                    {e.url.replace(/^https:\/\//, "").slice(0, 90)}
                  </a>
                  {e.note && <span className="block text-muted-foreground">{e.note}</span>}
                  {e.quote && <q className="block text-foreground/80 italic">{e.quote}</q>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  )
}

const LEAD_FILTERS: { id: string; label: string; test: (l: Lead) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "kept", label: "Kept", test: (l) => ["accepted", "queued", "researching", "review", "published"].includes(l.decision) },
  { id: "rejected", label: "Rejected", test: (l) => l.decision === "rejected" || l.decision === "duplicate" },
  { id: "leaks", label: "Leaks", test: (l) => l.track === "leak" },
  { id: "updates", label: "Updates", test: (l) => l.decision === "update" || Boolean(l.matchStory) },
  { id: "failed", label: "Failed", test: (l) => l.decision === "failed" },
]

function LeadsPanel({ state, act, busy }: { state: EngineState; act: Act; busy: boolean }) {
  const [filter, setFilter] = useState("all")
  const [q, setQ] = useState("")
  const desks = useMemo(() => new Map(state.desks.map((d) => [d.id, d.label])), [state.desks])
  const f = LEAD_FILTERS.find((x) => x.id === filter) ?? LEAD_FILTERS[0]
  const list = state.leads.filter((l) => f.test(l) && (!q || `${l.title} ${l.reason} ${l.publisher}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {LEAD_FILTERS.map((x) => (
          <Button key={x.id} size="xs" variant={x.id === filter ? "default" : "outline"} onClick={() => setFilter(x.id)}>
            {x.label} <span className="font-mono opacity-70">{state.leads.filter(x.test).length}</span>
          </Button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search discoveries" aria-label="Search discoveries" className="ml-auto h-8 w-full sm:w-60" />
      </div>
      {list.length ? (
        <ul className="flex flex-col gap-3">
          {list.map((l) => (
            <LeadCard key={l.id} lead={l} desks={desks} act={act} busy={busy} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No discoveries here yet. They appear after the first cycle&apos;s triage.</p>
      )}
    </div>
  )
}

// ─── Review ─────────────────────────────────────────────────────────────────────────────────────────────────

function ReviewPanel({ state, act, busy }: { state: EngineState; act: Act; busy: boolean }) {
  const updates = state.leads.filter((l) => l.decision === "review" && l.proposal && !l.storyId)
  const desks = new Map(state.desks.map((d) => [d.id, d.label]))
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="rev-stories-h" className="flex flex-col gap-3">
        <h3 id="rev-stories-h" className="text-sm font-semibold">
          Stories waiting for an editor ({state.review.length})
        </h3>
        {state.review.length ? (
          <ul className="flex flex-col gap-3">
            {state.review.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card/40 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{s.desk ? desks.get(s.desk) ?? s.desk : s.category}</span>
                    {s.evidence && <EvidenceBadge level={s.evidence as never} />}
                    {s.unconfirmed && <Badge variant="destructive">Unconfirmed</Badge>}
                    <span>{s.sources} sources</span>
                    <span>{when(s.created_at)}</span>
                  </p>
                  <p className="mt-1 font-medium">{s.title}</p>
                  {s.dek && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{s.dek}</p>}
                  {s.review_reason && (
                    <p className="mt-2 flex gap-1.5 text-xs text-gold">
                      <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
                      {s.review_reason}
                    </p>
                  )}
                </div>
                <Link href={`/admin/newsroom?edit=${s.id}`} className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
                  Review and publish
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing waiting. Stories that do not pass every auto-publish rule land here with the reason.</p>
        )}
      </section>
      <section aria-labelledby="rev-updates-h" className="flex flex-col gap-3">
        <h3 id="rev-updates-h" className="text-sm font-semibold">
          Proposed updates to published stories ({updates.length})
        </h3>
        {updates.length ? (
          <ul className="flex flex-col gap-3">
            {updates.map((l) => (
              <LeadCard key={l.id} lead={l} desks={desks} act={act} busy={busy} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No updates waiting.</p>
        )}
      </section>
    </div>
  )
}

// ─── Decision log ───────────────────────────────────────────────────────────────────────────────────────────

const AGENT_TONE: Record<string, string> = { planner: "text-gold", scout: "text-ion", triage: "text-model", researcher: "text-dataset", checker: "text-repo", editor: "text-gold", publisher: "text-ok", updater: "text-ion", leaks: "text-[#f6c4c4]", system: "text-destructive", human: "text-foreground" }

function DecisionLogPanel({ decisions }: { decisions: Decision[] }) {
  const [agent, setAgent] = useState("all")
  const agents = [...new Set(decisions.map((d) => d.agent))]
  const list = decisions.filter((d) => agent === "all" || d.agent === agent)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {["all", ...agents].map((a) => (
          <Button key={a} size="xs" variant={a === agent ? "default" : "outline"} onClick={() => setAgent(a)} className="capitalize">
            {a}
          </Button>
        ))}
      </div>
      {list.length ? (
        <ol className="relative flex flex-col gap-4 border-l border-white/10 pl-5">
          {list.map((d) => (
            <li key={d.id} className="relative text-sm">
              <span aria-hidden className="absolute top-1.5 -left-[23.5px] size-2 rounded-full bg-white/25 ring-4 ring-background" />
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("font-semibold capitalize", AGENT_TONE[d.agent])}>{d.agent}</span>
                <span>{d.action}</span>
                {d.outcome && <span className="rounded-full bg-white/[0.06] px-1.5">{d.outcome}</span>}
                <time dateTime={d.createdAt}>{when(d.createdAt)}</time>
                {d.runId && <span>run #{d.runId}</span>}
              </p>
              <p className="mt-0.5 text-foreground/85">{d.reason}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">The agents have not decided anything yet.</p>
      )}
    </div>
  )
}

// ─── Usage and cost ─────────────────────────────────────────────────────────────────────────────────────────

function UsagePanel({ state }: { state: EngineState }) {
  const [range, setRange] = useState<"today" | "week">("today")
  const rows = state.usage[range]
  const total = rows.reduce((a, r) => ({ calls: a.calls + r.calls, tin: a.tin + r.tokensIn, tout: a.tout + r.tokensOut, cost: a.cost + r.costUsd, failed: a.failed + r.failed }), { calls: 0, tin: 0, tout: 0, cost: 0, failed: 0 })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" variant={range === "today" ? "default" : "outline"} onClick={() => setRange("today")}>
          Today
        </Button>
        <Button size="xs" variant={range === "week" ? "default" : "outline"} onClick={() => setRange("week")}>
          Last 7 days
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">
          Free providers with a key: {state.keys.free.length ? state.keys.free.join(", ") : "none"} · Premium: {Object.entries(state.keys.premium).filter(([, v]) => v).map(([k]) => k).join(", ") || "no key set"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={BotIcon} label="AI calls" value={total.calls} note={`${total.failed} failed`} />
        <Stat icon={GaugeIcon} label="Tokens in" value={compact(total.tin)} note="estimated where the provider does not say" />
        <Stat icon={GaugeIcon} label="Tokens out" value={compact(total.tout)} />
        <Stat icon={CircleDollarSignIcon} label="Premium cost" value={usd(total.cost)} note={`Limits: ${usd(state.settings.premium.dailyUsd)}/day, ${usd(state.settings.premium.monthlyUsd)}/month`} />
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">Calls</th>
                <th className="px-3 py-2 text-right font-medium">Tokens</th>
                <th className="px-3 py-2 text-right font-medium">Avg time</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={`${r.stage}-${r.provider}-${r.model}`}>
                  <td className="px-3 py-2 capitalize">{r.stage}</td>
                  <td className="px-3 py-2">
                    {r.model}
                    {r.premium && <Badge variant="outline" className="ml-2">premium</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.calls}
                    {r.failed ? <span className="text-destructive"> ({r.failed} failed)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{compact(r.tokensIn + r.tokensOut)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{(r.avgMs / 1000).toFixed(1)} s</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.premium ? usd(r.costUsd) : "free"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No model calls in this period.</p>
      )}
    </div>
  )
}

// ─── Runs and failures ──────────────────────────────────────────────────────────────────────────────────────

function RunsPanel({ state, act, busy }: { state: EngineState; act: Act; busy: boolean }) {
  const dead = state.jobs.filter((j) => j.status === "dead" || j.status === "failed")
  const desks = new Map(state.desks.map((d) => [d.id, d.label]))
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="dead-h">
        <h3 id="dead-h" className="text-sm font-semibold">
          Failed jobs ({dead.length})
        </h3>
        {dead.length ? (
          <ul className="mt-2 divide-y divide-border">
            {dead.map((j) => (
              <JobRow key={j.id} job={j} act={act} busy={busy} desks={desks} now={Date.parse(state.now)} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No failures in the last two days.</p>
        )}
      </section>
      <section aria-labelledby="runs-h">
        <h3 id="runs-h" className="text-sm font-semibold">
          Run history
        </h3>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Jobs</th>
                <th className="px-3 py-2 text-right font-medium">AI calls</th>
                <th className="px-3 py-2 text-right font-medium">Published</th>
                <th className="px-3 py-2 text-right font-medium">Drafts</th>
                <th className="px-3 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.runs.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{when(r.started_at)}</td>
                  <td className="px-3 py-2">
                    {r.kind ?? "collect"} · {r.trigger}
                  </td>
                  <td className={cn("px-3 py-2", r.status === "failed" ? "text-destructive" : r.status === "partial" ? "text-gold" : r.status === "ok" ? "text-ok" : "text-ion")}>{r.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.jobs_done ?? "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.ai_calls ?? "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.published}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.drafts}</td>
                  <td className="max-w-[24rem] px-3 py-2 text-xs text-muted-foreground">
                    {r.note}
                    {r.errors.length > 0 && <span className="block text-destructive">{r.errors.slice(0, 3).map((e) => `${e.where}: ${e.error}`).join(" · ")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ─── Sources and watchers ───────────────────────────────────────────────────────────────────────────────────

function SourcesPanel({ state, act, busy }: { state: EngineState; act: Act; busy: boolean }) {
  const canPublish = useCaps().can("news.publish")
  const [w, setW] = useState({ kind: "file", target: "", label: "", publisher: "", pattern: "" })
  const failing = state.sources.filter((s) => s.enabled && s.last_ok === false)
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="src-h" className="flex flex-col gap-3">
        <h3 id="src-h" className="text-sm font-semibold">
          Official sources ({state.sources.filter((s) => s.enabled).length} on, {failing.length} failing)
        </h3>
        <p className="text-sm text-muted-foreground">
          Add or remove sources in the{" "}
          <Link href="/admin/newsroom?tab=sources" className="text-ion hover:underline">
            editors&apos; desk
          </Link>
          . Scouts (GitHub, arXiv, the Hugging Face API, public records, the news index) are set per desk in Settings.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {state.sources.map((s) => (
            <li key={s.id} className={cn("rounded-xl border px-3 py-2 text-sm", s.last_ok === false ? "border-destructive/40" : "border-border", !s.enabled && "opacity-50")}>
              <p className="flex items-center justify-between gap-2 font-medium">
                <span className="truncate">{s.label}</span>
                <span className={cn("size-2 shrink-0 rounded-full", s.last_ok === false ? "bg-destructive" : s.last_ok ? "bg-ok" : "bg-white/25")} aria-label={s.last_ok === false ? "failing" : s.last_ok ? "working" : "not checked yet"} />
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {s.kind} · {s.last_checked ? when(s.last_checked) : "never checked"}
                {s.last_count !== null ? ` · ${s.last_count} items` : ""}
              </p>
              {s.last_error && <p className="truncate text-xs text-destructive">{s.last_error}</p>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="watch-h" className="flex flex-col gap-3">
        <h3 id="watch-h" className="text-sm font-semibold">
          Leak and change watchers
        </h3>
        <p className="text-sm text-muted-foreground">
          Public SDK files and pages, compared snapshot to snapshot. A new identifier becomes a lead on the leak track, is corroborated against other official files and credible coverage, weighed on the five evidence levels, and always reviewed by an editor.
        </p>
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
          {state.watchers.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{x.label}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">{x.target}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {x.tokens} identifiers · {x.last_checked ? `checked ${when(x.last_checked)}` : "not checked yet"}
                {x.last_changed ? ` · changed ${when(x.last_changed)}` : ""}
              </span>
              {x.last_error && <span className="w-full text-xs text-destructive">{x.last_error}</span>}
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void act({ action: "watch", op: "toggle", id: x.id, enabled: !x.enabled }, x.enabled ? "Watcher paused." : "Watcher on.")}>
                {x.enabled ? "Pause" : "Turn on"}
              </Button>
            </li>
          ))}
        </ul>
        {canPublish && (
          <form
            className="grid gap-2 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-[8rem_1fr_1fr]"
            onSubmit={(e) => {
              e.preventDefault()
              void act({ action: "watch", op: "add", ...w }, "Watcher added. Its first check takes a baseline.")
              setW({ kind: "file", target: "", label: "", publisher: "", pattern: "" })
            }}
          >
            <select value={w.kind} onChange={(e) => setW({ ...w, kind: e.target.value })} aria-label="Watcher kind" className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
              <option value="file">Repository file</option>
              <option value="page">Public page</option>
            </select>
            <Input required value={w.target} onChange={(e) => setW({ ...w, target: e.target.value })} placeholder={w.kind === "file" ? "owner/repo:main:path/to/file.py" : "https://…"} aria-label="What to watch" />
            <Input required value={w.label} onChange={(e) => setW({ ...w, label: e.target.value })} placeholder="Label" aria-label="Label" />
            <Input value={w.publisher} onChange={(e) => setW({ ...w, publisher: e.target.value })} placeholder="Publisher (the company)" aria-label="Publisher" />
            <Input value={w.pattern} onChange={(e) => setW({ ...w, pattern: e.target.value })} placeholder="Identifier pattern (optional regex)" aria-label="Identifier pattern" className="sm:col-span-1" />
            <Button type="submit" size="sm" disabled={busy}>
              Add watcher
            </Button>
          </form>
        )}
      </section>
    </div>
  )
}
