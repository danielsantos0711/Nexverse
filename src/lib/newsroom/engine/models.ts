import { AiError } from "@/lib/ai/errors"
import { askJson, type JsonSchema, type LlmOptions } from "@/lib/ai/llm"
import { JOBS, type AiJob } from "@/lib/ai/models"
import { insert, select, type Db } from "../rest"
import { ANTHROPIC_MODELS, callCost, STAGES, type EngineSettings, type PremiumProvider, type Stage } from "./types"

/*
 * Server only. Which model each step of the engine uses, and what it cost.
 *
 * Free first (the site rule): every stage goes through the shared free router (`askJson` from @/lib/ai/llm),
 * either with the model the admin picked for that stage or, on "auto" or when that model fails, the router's
 * own order for the stage's job. Stages ask for their own job names ("research", "editor", "factcheck") when
 * the AI catalogue has them, and use "news" until it does.
 *
 * Premium (optional, clearly labelled, off by default): an admin may switch on a paid model for a stage. It
 * runs only when the server has that provider's key and the day's and month's premium budget has room; any
 * failure falls back to the free route. Paid calls report their real token counts and cost; free calls are
 * estimated from the text length and cost nothing.
 *
 * Every call is counted against the tick's limits (calls and tokens) and written to news_usage.
 */

export type ResearchStep = "research" | "write" | "factcheck"
export type AskFn = (o: LlmOptions & { schema: JsonSchema; step?: ResearchStep }) => Promise<{ json: unknown; model: string }>

/** Thrown when this tick's (or today's) allowance is used: the job goes back in the queue, it did not fail. */
export class BudgetError extends AiError {
  constructor(message: string) {
    super(503, "rate_limited", message)
  }
}

const estimate = (s: string) => Math.ceil(s.length / 4)

export type UsageToday = { calls: number; premiumUsdToday: number; premiumUsdMonth: number }

export async function usageToday(db: Db): Promise<UsageToday> {
  const now = new Date()
  const month = `${now.toISOString().slice(0, 7)}-01T00:00:00Z`
  const day = `${now.toISOString().slice(0, 10)}T00:00:00Z`
  const rows = await select<{ cost_usd: number | string; premium: boolean; created_at: string }>(db, "news_usage", `created_at=gte.${month}&select=cost_usd,premium,created_at&limit=20000`).catch(() => [])
  let calls = 0
  let premiumUsdToday = 0
  let premiumUsdMonth = 0
  for (const r of rows) {
    const today = r.created_at >= day
    if (today) calls++
    if (r.premium) {
      const c = Number(r.cost_usd) || 0
      premiumUsdMonth += c
      if (today) premiumUsdToday += c
    }
  }
  return { calls, premiumUsdToday, premiumUsdMonth }
}

/** Counts one tick's model use against its limits. */
export class Meter {
  calls = 0
  tokens = 0
  costUsd = 0
  premiumCalls = 0
  constructor(
    public settings: EngineSettings,
    public today: UsageToday
  ) {}
  check() {
    const l = this.settings.limits
    if (this.calls >= l.aiCallsPerTick) throw new BudgetError("This tick's AI call limit is reached; the rest waits for the next tick.")
    if (this.tokens >= l.tokensPerTick) throw new BudgetError("This tick's token limit is reached; the rest waits for the next tick.")
    if (this.today.calls + this.calls >= l.aiCallsPerDay) throw new BudgetError("Today's AI call limit for the newsroom is reached; it resets at midnight UTC.")
  }
  premiumRoom(): boolean {
    const p = this.settings.premium
    return this.today.premiumUsdToday + this.costUsd < p.dailyUsd && this.today.premiumUsdMonth + this.costUsd < p.monthlyUsd
  }
}

const KNOWN_JOBS = new Set<string>(JOBS.map((j) => j.id))
/** The AI job a stage runs as: its own name once the catalogue knows it, else "news". */
export function jobFor(stage: Stage): AiJob {
  const want = STAGES.find((s) => s.id === stage)?.job ?? "news"
  return (KNOWN_JOBS.has(want) ? want : "news") as AiJob
}

export function premiumKey(provider: PremiumProvider): string | null {
  const v = (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.NEWSROOM_OPENROUTER_PAID_KEY)?.trim()
  return v || null
}

type PremiumAnswer = { json: unknown; tokensIn: number; tokensOut: number; costUsd: number; label: string }

async function anthropic(model: string, key: string, o: LlmOptions & { schema: JsonSchema }, hard: boolean): Promise<PremiumAnswer> {
  const info = ANTHROPIC_MODELS.find((m) => m.id === model) ?? ANTHROPIC_MODELS[0]
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: info.id,
      max_tokens: Math.min(16_000, Math.max(4_096, o.maxTokens * 2)),
      system: o.system,
      messages: [{ role: "user", content: o.prompt }],
      output_config: { effort: hard ? "high" : "low", format: { type: "json_schema", schema: o.schema } },
    }),
    signal: AbortSignal.timeout(150_000),
    cache: "no-store",
  })
  const body = (await res.json().catch(() => null)) as {
    content?: { type: string; text?: string }[]
    stop_reason?: string
    usage?: { input_tokens?: number; output_tokens?: number }
  } | null
  if (!res.ok || !body) throw new Error(`Anthropic answered ${res.status}`)
  if (body.stop_reason === "refusal") throw new Error("the model declined")
  const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("")
  const json = JSON.parse(text) as unknown
  const tokensIn = body.usage?.input_tokens ?? estimate(o.system + o.prompt)
  const tokensOut = body.usage?.output_tokens ?? estimate(text)
  return { json, tokensIn, tokensOut, costUsd: callCost(info, tokensIn, tokensOut), label: info.label }
}

async function openrouterPaid(model: string, key: string, o: LlmOptions & { schema: JsonSchema }): Promise<PremiumAnswer> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-title": "Nexverse newsroom" },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(16_000, Math.max(4_096, o.maxTokens * 2)),
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: o.prompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: o.schema } },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(150_000),
    cache: "no-store",
  })
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } } | null
  if (!res.ok || !body) throw new Error(`OpenRouter answered ${res.status}`)
  const text = body.choices?.[0]?.message?.content ?? ""
  const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as unknown
  return {
    json,
    tokensIn: body.usage?.prompt_tokens ?? estimate(o.system + o.prompt),
    tokensOut: body.usage?.completion_tokens ?? estimate(text),
    costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : 0,
    label: model,
  }
}

export type StageContext = { db: Db; settings: EngineSettings; meter: Meter; runId: number | null; jobId: number | null }

async function logUsage(ctx: StageContext, row: { stage: Stage; provider: string; model: string; premium: boolean; tokensIn: number; tokensOut: number; measured: boolean; costUsd: number; ms: number; ok: boolean; error?: string }) {
  await insert(
    ctx.db,
    "news_usage",
    {
      run_id: ctx.runId,
      job_id: ctx.jobId,
      stage: row.stage,
      provider: row.provider.slice(0, 40),
      model: row.model.slice(0, 200),
      premium: row.premium,
      tokens_in: row.tokensIn,
      tokens_out: row.tokensOut,
      measured: row.measured,
      cost_usd: Math.round(row.costUsd * 1e6) / 1e6,
      ms: row.ms,
      ok: row.ok,
      error: row.error?.slice(0, 300) ?? null,
    },
    { returning: false }
  ).catch(() => {})
}

/**
 * The model call for one stage.
 */
export function stageAsk(ctx: StageContext, stage: Stage): AskFn {
  return async (o) => {
    ctx.meter.check()
    const cfg = ctx.settings.stages[stage]
    const hard = STAGES.find((s) => s.id === stage)?.hard ?? false
    const t0 = Date.now()
    const inTokens = estimate(o.system + o.prompt)

    // 1. The premium slot, when switched on, keyed and within budget.
    if (cfg.premium.enabled && ctx.meter.premiumRoom()) {
      const key = premiumKey(cfg.premium.provider)
      if (key) {
        try {
          const a = cfg.premium.provider === "anthropic" ? await anthropic(cfg.premium.model, key, o, hard) : await openrouterPaid(cfg.premium.model, key, o)
          ctx.meter.calls++
          ctx.meter.premiumCalls++
          ctx.meter.tokens += a.tokensIn + a.tokensOut
          ctx.meter.costUsd += a.costUsd
          await logUsage(ctx, { stage, provider: cfg.premium.provider, model: cfg.premium.model, premium: true, tokensIn: a.tokensIn, tokensOut: a.tokensOut, measured: true, costUsd: a.costUsd, ms: Date.now() - t0, ok: true })
          return { json: a.json, model: `${a.label} (premium)` }
        } catch (err) {
          await logUsage(ctx, { stage, provider: cfg.premium.provider, model: cfg.premium.model, premium: true, tokensIn: 0, tokensOut: 0, measured: false, costUsd: 0, ms: Date.now() - t0, ok: false, error: err instanceof Error ? err.message : "failed" })
          // Fall through to the free route.
        }
      }
    }

    // 2. The free router: the stage's picked model first, then the job's own order.
    const job = jobFor(stage)
    const attempt = async (model?: string) => {
      const { step: _step, ...req } = o
      void _step
      return askJson({ ...req, job, ...(model ? { model } : {}) })
    }
    let r: Awaited<ReturnType<typeof attempt>>
    try {
      try {
        r = await attempt(cfg.model !== "auto" ? cfg.model : undefined)
      } catch (err) {
        if (cfg.model === "auto" || (err instanceof AiError && err.code === "not_configured" && !/model/i.test(err.message))) throw err
        r = await attempt()
      }
    } catch (err) {
      ctx.meter.calls++
      ctx.meter.tokens += inTokens
      await logUsage(ctx, { stage, provider: "free", model: cfg.model, premium: false, tokensIn: inTokens, tokensOut: 0, measured: false, costUsd: 0, ms: Date.now() - t0, ok: false, error: err instanceof Error ? err.message : "failed" })
      throw err
    }
    const outTokens = estimate(JSON.stringify(r.json ?? ""))
    ctx.meter.calls++
    ctx.meter.tokens += inTokens + outTokens
    if (!r.cached) await logUsage(ctx, { stage, provider: r.provider, model: r.model, premium: false, tokensIn: inTokens, tokensOut: outTokens, measured: false, costUsd: 0, ms: r.ms, ok: true })
    return { json: r.json, model: r.label }
  }
}

/** For the research pipeline: one AskFn that sends each of its steps (o.step) to the right stage. */
export function researchAsk(ctx: StageContext): AskFn {
  const research = stageAsk(ctx, "research")
  const write = stageAsk(ctx, "write")
  const check = stageAsk(ctx, "factcheck")
  return (o) => (o.step === "write" ? write(o) : o.step === "factcheck" ? check(o) : research(o))
}
