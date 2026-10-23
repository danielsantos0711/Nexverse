"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCwIcon, SparklesIcon } from "lucide-react"
import { CatalogBrowser, JobsOverview, PremiumSlots } from "@/components/admin/ai-jobs"
import { ChainEditor, ProviderCard, UsageTable } from "@/components/admin/ai-parts"
import { AdminHeading, Notice, SaveBar, SwitchRow } from "@/components/admin/controls"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AiRequestError } from "@/lib/ai-client"
import { aiAdmin2, type AdminStatus as AiAdminStatus } from "@/lib/ai/client"
import { DEFAULT_CHAINS, DEFAULT_QUOTAS, JOBS, PROVIDERS, type AiJob } from "@/lib/ai/models"
import { allModels, chainFor, DEFAULT_AI_SETTINGS, normalizeAiSettings, type AiSettings } from "@/lib/ai/settings"
import { db, live } from "@/lib/supabase"

/*
 * /admin/ai: what every job runs on and how well (model, provider, latency, success, tokens, cost, feedback, a
 * live test per job), which providers have a key (yes or no, never the key), the model order per job, the
 * opt-in premium slot per job with its monthly budget, the live model catalogue, members' daily quotas by role,
 * and one switch for everything. The settings are saved
 * to site_settings under "ai" (public, no secrets) and every save goes in the moderation log.
 */

type Status = { ok: boolean; text: string } | null

const ROLE_LABELS: Record<string, string> = { member: "Members", contributor: "Contributors", editor: "Editors", moderator: "Moderators", admin: "Admins" }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

type AiTab = "jobs" | "providers" | "order" | "premium" | "catalog" | "limits"
const AI_TABS: { id: AiTab; label: string }[] = [
  { id: "jobs", label: "Jobs" },
  { id: "providers", label: "Providers" },
  { id: "order", label: "Model order" },
  { id: "premium", label: "Premium" },
  { id: "catalog", label: "Catalogue" },
  { id: "limits", label: "Quotas and usage" },
]

/** Drop per-job orders that match the default, so a later change to the defaults still reaches this site. */
function clean(s: AiSettings): AiSettings {
  const chains: AiSettings["chains"] = {}
  for (const j of JOBS) {
    const c = s.chains[j.id]
    if (c && !same(c, DEFAULT_CHAINS[j.id])) chains[j.id] = c
  }
  return { ...s, chains }
}

async function saveAi(value: AiSettings, note: string) {
  const c = db()
  if (!c) throw new Error("Saving needs the database. Connect Supabase first.")
  const { error } = await c.from("site_settings").upsert({ key: "ai", value }, { onConflict: "key" })
  if (error) throw new Error(error.message)
  // The log is best effort: the save already happened.
  await c.rpc("log_moderation", { action: "ai_settings", target_kind: "site_setting", target_id: "ai", note: note.slice(0, 300) })
}

function describe(before: AiSettings, after: AiSettings): string {
  const parts: string[] = []
  if (before.enabled !== after.enabled) parts.push(after.enabled ? "AI switched on" : "AI switched off")
  const jobs = JOBS.filter((j) => !same(chainFor(j.id, before), chainFor(j.id, after))).map((j) => j.label.toLowerCase())
  if (jobs.length) parts.push(`model order: ${jobs.join(", ")}`)
  if (!same(before.quotas, after.quotas)) parts.push("quotas")
  if (!same(before.caps, after.caps)) parts.push("provider caps")
  if (!same(before.premium, after.premium)) parts.push(`premium slots: ${Object.keys(after.premium).join(", ") || "none"}`)
  if (before.premiumBudgetUsd !== after.premiumBudgetUsd) parts.push(`premium budget $${after.premiumBudgetUsd}`)
  if (!same(before.custom, after.custom)) parts.push(`added models: ${after.custom.length}`)
  return parts.join("; ") || "no change"
}

export function AiPanel() {
  const body = <Panel />
  return live ? (
    <Gate role="admin" action="manage AI">
      {body}
    </Gate>
  ) : (
    body
  )
}

function Panel() {
  const [status, setStatus] = useState<AiAdminStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saved, setSaved] = useState<AiSettings>(DEFAULT_AI_SETTINGS)
  const [draft, setDraft] = useState<AiSettings | null>(null)
  const [saveStatus, setSaveStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(live)
  const [tab, setTab] = useState<AiTab>("jobs")
  const value = draft ?? saved
  const dirty = draft !== null && !same(clean(draft), clean(saved))

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!live) return
    setLoading(true)
    try {
      const s = await aiAdmin2.status(signal)
      setStatus(s)
      setSaved(normalizeAiSettings(s.settings))
      setLoadError(null)
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return
      setLoadError(err instanceof AiRequestError ? err.message : "Could not load the AI status.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    // Loading from the server is the point of this effect; the state it sets is the server's answer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const configured = useMemo(() => new Set((status?.providers ?? []).filter((p) => p.configured).map((p) => p.id)), [status])
  const roles = useMemo(() => [...new Set([...Object.keys(DEFAULT_QUOTAS), ...Object.keys(value.quotas)])], [value.quotas])

  function change(next: AiSettings) {
    setDraft(next)
    setSaveStatus(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!dirty || busy) return
    setBusy(true)
    setSaveStatus(null)
    try {
      const next = clean(value)
      await saveAi(next, describe(saved, next))
      setSaved(next)
      setDraft(null)
      setSaveStatus({ ok: true, text: "Saved. The AI routes use the new settings within a minute." })
    } catch (err) {
      const msg = (err as Error).message
      setSaveStatus({ ok: false, text: /row-level security|permission/i.test(msg) ? "Only admins can save AI settings." : /does not exist|schema cache/i.test(msg) ? "The settings table is not on this database yet." : msg })
    } finally {
      setBusy(false)
    }
  }

  const noKeys = status !== null && configured.size === 0

  const loadingCards = (n: number, cls: string, grid: string) => (
    <div className={grid}>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className={cls} />
      ))}
    </div>
  )

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-6">
      <AdminHeading title="AI">
        {live && (
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCwIcon aria-hidden data-icon="inline-start" className={loading ? "motion-safe:animate-spin" : undefined} />
            Refresh
          </Button>
        )}
      </AdminHeading>

      {loadError && (
        <Notice tone="warn" title="Could not load the AI status">
          {loadError}
        </Notice>
      )}
      {noKeys && <NoKeysNotice />}
      {status && status.usage === null && (
        <Notice tone="warn" title="The AI usage tables are not on this database yet">
          Apply the migration 20261019120000_ai_router.sql. Until then caps, quotas and the cache are counted per server instance only.
        </Notice>
      )}

      <SwitchRow
        id="ai-enabled"
        label="AI features"
        description={value.enabled ? (noKeys ? "On, but no free key is set, so members see no AI buttons yet." : "On. Free models first; paid ones only where you opt in.") : "Off. Every AI button is hidden and the AI routes refuse requests."}
        checked={value.enabled}
        onChange={(on) => change({ ...value, enabled: on })}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as AiTab)} className="flex flex-col gap-5">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList variant="line" aria-label="AI sections">
            {AI_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="px-2.5">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="jobs" className="flex flex-col gap-4">
          <Lead>What each job answers with right now and how it did over the last 7 days. A test runs one small real question through the job&apos;s chain.</Lead>
          {loading && !status ? loadingCards(3, "h-72 rounded-xl", "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3") : <JobsOverview status={status} settings={value} />}
        </TabsContent>

        <TabsContent value="providers" className="flex flex-col gap-4">
          <Lead>Keys live only in the server&apos;s environment. This page shows whether each one is set, never its value.</Lead>
          {loading && !status ? (
            loadingCards(PROVIDERS.length, "h-64 rounded-xl", "grid grid-cols-1 gap-3 lg:grid-cols-2")
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {PROVIDERS.map((p) => (
                <ProviderCard
                  key={p.id}
                  id={p.id}
                  status={status?.providers.find((x) => x.id === p.id) ?? null}
                  cap={value.caps[p.id]}
                  onCap={(n) => change({ ...value, caps: { ...value.caps, [p.id]: n } })}
                  canTest={saved.enabled && live}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="order" className="flex flex-col gap-4">
          <Lead>The first model with a key does the job. Reorder to change who goes first; switch one off to leave it out.</Lead>
          <Tabs defaultValue="news" className="flex flex-col gap-4">
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <TabsList aria-label="Jobs">
                {JOBS.map((j) => (
                  <TabsTrigger key={j.id} value={j.id} className="px-2.5">
                    {j.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {JOBS.map((j) => (
              <TabsContent key={j.id} value={j.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">{j.blurb}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={same(chainFor(j.id, value), DEFAULT_CHAINS[j.id])}
                    onClick={() => change({ ...value, chains: { ...value.chains, [j.id]: [...DEFAULT_CHAINS[j.id]] } })}
                  >
                    Reset to default order
                  </Button>
                </div>
                <ChainEditor
                  label={j.label}
                  chain={chainFor(j.id, value)}
                  onChange={(next) => change({ ...value, chains: { ...value.chains, [j.id as AiJob]: next } })}
                  configured={configured}
                  playground={j.id === "playground"}
                  models={allModels(value)}
                />
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="premium" className="flex flex-col gap-4">
          <Lead>Off by default. Pick a paid model for a job only where free ones are not good enough. It goes first while the month&apos;s spend is under budget; the free chain stays as the fallback.</Lead>
          <PremiumSlots status={status} settings={value} onChange={change} />
        </TabsContent>

        <TabsContent value="catalog" className="flex flex-col gap-4">
          <Lead>Read straight from each provider. New free models show up here first; add one and put it in a job&apos;s order.</Lead>
          <CatalogBrowser status={status} settings={value} onChange={change} canRefresh={live} />
        </TabsContent>

        <TabsContent value="limits" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Lead>AI requests each member can make per day, by role. Resets at midnight UTC; 0 switches AI off for that role.</Lead>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((r) => (
                <label key={r} className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3">
                  <span className="text-sm font-medium">{ROLE_LABELS[r] ?? r}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={5000}
                    value={value.quotas[r] ?? DEFAULT_QUOTAS.member}
                    onChange={(e) => change({ ...value, quotas: { ...value.quotas, [r]: Math.max(0, Math.min(5000, Math.round(Number(e.target.value) || 0))) } })}
                    className="w-24 tabular-nums"
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">Today</h3>
            <Lead>
              {status?.memberRequests != null ? `Members made ${status.memberRequests.toLocaleString("en")} AI requests today (UTC). ` : ""}A request can start more than one call when a model fails and the next takes over.
            </Lead>
            {status?.usage ? <UsageTable rows={status.usage} /> : <p className="text-sm text-muted-foreground">{live ? "Usage appears here once the migration is applied." : "Usage needs the database."}</p>}
          </div>
        </TabsContent>
      </Tabs>

      <SaveBar
        dirty={dirty}
        busy={busy}
        status={saveStatus}
        disabled={!live}
        onDiscard={() => {
          setDraft(null)
          setSaveStatus(null)
        }}
      />
    </form>
  )
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[68ch] text-sm text-muted-foreground">{children}</p>
}

/** Shown while no provider has a key: exactly which free keys to create, where, and the variable names. */
function NoKeysNotice() {
  return (
    <div role="note" className="flex flex-col gap-3 rounded-2xl border border-gold/30 bg-gold/[0.06] p-4 md:p-5">
      <div className="flex items-start gap-3">
        <SparklesIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">AI is not switched on yet: no free provider key is set</p>
          <p className="text-sm text-muted-foreground">
            Create one or more free keys below (no card needed), add them in Vercel under Project settings, Environment Variables, for Production, then redeploy. One key is enough to start; Gemini and Groq together cover every job well.
          </p>
        </div>
      </div>
      <ol className="flex flex-col gap-2 text-sm">
        {PROVIDERS.filter((p) => !p.premium).map((p, i) => (
          <li key={p.id} className="flex flex-col gap-0.5 rounded-xl border border-border bg-card/50 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="font-medium">
              {i + 1}. {p.label}
            </span>
            <code className="font-mono text-xs text-muted-foreground">{p.env.join(", ")}</code>
            <a href={p.signup} target="_blank" rel="noreferrer" className="text-ion underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:ml-auto">
              Get the free key
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}
