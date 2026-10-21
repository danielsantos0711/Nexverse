import { DbError, insert, rpc, type Db } from "../rest"
import { toJob, type Agent, type Job, type JobKind, type JobRow } from "./types"

/*
 * Server only. The engine's durable state, through the database functions of migration 20261021100000: the
 * job queue (claim with a lease, finish with retries and backoff), the named lock that keeps two ticks from
 * running together, and the agents' decision log. Everything goes through row level security as the caller
 * (the service role for scheduled ticks, the editor for "Run now").
 */

export type NewJob = {
  kind: JobKind
  desk?: string | null
  payload?: Record<string, unknown>
  /** Lower runs first. Cycles 5, scouts 20, triage 40, research 50 to 70, updates 45. */
  priority?: number
  /** Start no earlier than this many seconds from now. */
  delaySeconds?: number
  /** One queued or running job per key. */
  dedupe?: string
  maxAttempts?: number
  runId?: number | null
}

/** Queues a job. Returns null when an identical one (same dedupe key) is already waiting or running. */
export async function enqueue(db: Db, j: NewJob): Promise<number | null> {
  try {
    const rows = await insert<{ id: number }>(db, "news_jobs", {
      kind: j.kind,
      desk: j.desk ?? null,
      payload: j.payload ?? {},
      priority: Math.max(0, Math.min(100, Math.round(j.priority ?? 50))),
      run_after: new Date(Date.now() + (j.delaySeconds ?? 0) * 1000).toISOString(),
      dedupe: j.dedupe?.slice(0, 200) ?? null,
      max_attempts: j.maxAttempts ?? 4,
      run_id: j.runId ?? null,
    })
    return rows[0]?.id ?? null
  } catch (err) {
    if (err instanceof DbError && (err.code === "23505" || err.status === 409)) return null
    throw err
  }
}

export async function claim(db: Db, worker: string, { n = 1, leaseSeconds = 300, kinds }: { n?: number; leaseSeconds?: number; kinds?: JobKind[] } = {}): Promise<Job[]> {
  const rows = await rpc<JobRow[]>(db, "news_job_claim", { worker, n, lease_seconds: leaseSeconds, kinds: kinds ?? null })
  return (rows ?? []).map(toJob)
}

export async function finish(db: Db, id: number, o: { ok: boolean; result?: Record<string, unknown>; error?: string; retryInSeconds?: number }) {
  await rpc(db, "news_job_finish", { job: id, ok: o.ok, outcome: o.result ?? null, err: o.error?.slice(0, 600) ?? null, retry_in: Math.max(0, Math.round(o.retryInSeconds ?? 0)) })
}

export async function takeLock(db: Db, name: string, holder: string, seconds: number): Promise<boolean> {
  return (await rpc<boolean>(db, "news_lock_take", { lock_name: name, who: holder, seconds })) === true
}

export async function releaseLock(db: Db, name: string, holder: string) {
  await rpc(db, "news_lock_release", { lock_name: name, who: holder }).catch(() => {})
}

export type DecisionInput = {
  agent: Agent
  action: string
  outcome?: string
  reason?: string
  detail?: Record<string, unknown>
  leadId?: number | null
  storyId?: string | null
}

/** The decision log: who decided what, and why. A failed write never stops the work it describes. */
export class DecisionLog {
  private rows: Record<string, unknown>[] = []
  constructor(
    private db: Db,
    public runId: number | null,
    public jobId: number | null = null
  ) {}
  add(d: DecisionInput) {
    let detail = d.detail ?? null
    if (detail && JSON.stringify(detail).length > 11_000) detail = { note: "detail too large to keep" }
    this.rows.push({
      run_id: this.runId,
      job_id: this.jobId,
      lead_id: d.leadId ?? null,
      story_id: d.storyId ?? null,
      agent: d.agent,
      action: d.action.slice(0, 60),
      outcome: (d.outcome ?? "").slice(0, 40),
      reason: (d.reason ?? "").slice(0, 1200),
      detail,
    })
    if (this.rows.length >= 25) void this.flush()
  }
  async flush() {
    if (!this.rows.length) return
    const batch = this.rows.splice(0)
    await insert(this.db, "news_decisions", batch, { returning: false }).catch((err: unknown) => console.warn("[newsroom] decision log:", err instanceof Error ? err.message : err))
  }
}
