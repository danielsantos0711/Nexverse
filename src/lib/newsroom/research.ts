import { AiError } from "@/lib/ai/errors"
import type { JsonSchema, LlmOptions } from "@/lib/ai/llm"
import { DEPTH_WORDS, type CoverCandidate, type Depth, type KeyFact, type NewsroomSettings, type PullQuote, type StorySource } from "@/lib/newsroom"
import type { Signal } from "./cluster"
import { coverQuery, findCovers } from "./cover"
import {
  briefRequest,
  checkRequest,
  factsRequest,
  groupMaterial,
  MIN_FACTS,
  planRequest,
  readCheck,
  readDraft,
  readFacts,
  readPlan,
  renumber,
  writeRequest,
  type DeepDraft,
  type Fact,
  type Plan,
} from "./deep"
import { gather, type Doc } from "./gather"
import type { Db } from "./rest"
import { readStory, storyRequest, type Material, type WrittenStory } from "./writer"

/*
 * Server only. One researched story from start to finish: gather the pages, brief, write, check, find the
 * cover. Every model call goes through the `ask` it is given (the free router in production; a stand-in in
 * tests), and the step count is kept small on purpose: a deep story is three calls (four or five when the
 * material is long), a short one is one. When the material is too thin for the depth asked, the story is
 * written one depth shorter rather than padded.
 */

export type AskFn = (o: LlmOptions & { schema: JsonSchema }) => Promise<{ json: unknown; model: string }>

export type CheckReport = {
  verified: number
  dropped: { claim: string; why: string }[]
  removed: { text: string; why: string }[]
  unconfirmed: string[]
  steps: string[]
  sources: number
  checked: boolean
  note: string
}

export type Researched = WrittenStory & {
  depth: Depth
  keyFacts: KeyFact[]
  pullQuote: PullQuote | null
  words: number
  cover: CoverCandidate
  candidates: CoverCandidate[]
  report: CheckReport
}

export type ResearchResult = { ok: true; story: Researched; model: string } | { ok: false; reason: string; skipped?: boolean }

const RELATED: Record<Depth, number> = { short: 1, standard: 2, deep: 4 }

/** Asks once; an AI that is not configured at all stops the whole run, any other failure is this story's. */
async function call(ask: AskFn, req: Omit<LlmOptions, "job"> & { schema: JsonSchema }, models: Set<string>): Promise<{ ok: true; json: unknown } | { ok: false; reason: string }> {
  try {
    const res = await ask({ ...req, job: "news" })
    models.add(res.model)
    return { ok: true, json: res.json }
  } catch (err) {
    // No AI at all, or today's free allowance is gone: stop the run instead of failing story after story.
    if (err instanceof AiError && (err.code === "not_configured" || err.code === "rate_limited")) throw err
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 200) : "the AI request failed" }
  }
}

/** The story's source list: every page that was read, numbered as the citations are, with a preview line. */
function sourcesOf(docs: Doc[], facts: Fact[]): StorySource[] {
  return docs.slice(0, 12).map((d) => {
    const quote = facts.find((f) => f.source === d.n)?.quote
    return { url: d.url, title: d.title, publisher: d.publisher, excerpt: (quote || d.description || d.text.slice(0, 300)).slice(0, 400), publishedAt: d.publishedAt }
  })
}

const materialOf = (docs: Doc[]): Material[] =>
  docs.map((d) => ({
    signal: { hash: "", url: d.url, title: d.title, excerpt: d.description, publisher: d.publisher, publishedAt: d.publishedAt, internalOnly: d.internalOnly, categoryHint: null, kind: "site" },
    page: { title: d.title, text: [d.description, d.text].filter(Boolean).join("\n\n").slice(0, 6000) },
  }))

export async function research(o: {
  db?: Db | null
  primary: Signal
  cluster?: Signal[]
  settings: NewsroomSettings
  depth: Depth
  ask: AskFn
  note?: string
  officialSites?: Map<string, string>
  extraUrls?: string[]
  /** Stop starting optional steps after this time (ms since epoch). */
  deadline?: number
}): Promise<ResearchResult> {
  const { settings, ask, note = "" } = o
  const deadline = o.deadline ?? Date.now() + 240_000
  const models = new Set<string>()
  const steps: string[] = []
  let depth: Depth = o.depth
  const report: CheckReport = { verified: 0, dropped: [], removed: [], unconfirmed: [], steps, sources: 0, checked: false, note: "" }

  // 1. Gather.
  const related = depth === "short" ? RELATED.short : Math.min(RELATED[depth], settings.relatedSources)
  const g = await gather({ db: o.db, primary: o.primary, cluster: (o.cluster ?? []).filter((s) => s.url !== o.primary.url), maxRelated: related, officialSites: o.officialSites, extraUrls: o.extraUrls })
  steps.push(`gather: ${g.docs.length} page${g.docs.length === 1 ? "" : "s"}${g.cached ? ` (${g.cached} from the cache)` : ""}`)
  const docs = g.docs
  report.sources = docs.length
  const main = docs[0]
  if (main.text.length < 200 && !main.description) return { ok: false, reason: "the main page has almost no readable text (it may need JavaScript)" }

  const finish = async (s: Omit<Researched, "cover" | "candidates" | "report">, model: string): Promise<ResearchResult> => {
    // Cover: the free photo search is skipped when time is short; the source image and the generated cover still work.
    const policy = Date.now() > deadline - 20_000 ? { ...settings.cover, order: settings.cover.order.filter((t) => t !== "free") } : settings.cover
    const covers = await findCovers({ docs, title: s.title, query: coverQuery(s.title, imageQuery), policy }).catch(() => null)
    steps.push(covers ? `cover: ${covers.chosen.kind}, ${covers.candidates.length} candidate${covers.candidates.length === 1 ? "" : "s"}` : "cover: generated (search failed)")
    const generated = { url: "", kind: "generated" as const, width: 1200, height: 630, alt: `Nexverse cover for “${s.title}”`, credit: null }
    return { ok: true, model, story: { ...s, cover: covers?.chosen ?? generated, candidates: covers?.candidates ?? [generated], report } }
  }

  let imageQuery = ""

  // A short story: one call, the original single-pass writer, from the gathered pages.
  const writeShort = async (): Promise<ResearchResult> => {
    const res = await call(ask, storyRequest(materialOf(docs), note), models)
    steps.push("write: short, one pass")
    if (!res.ok) return res
    const v = readStory(res.json, materialOf(docs))
    if (!v.ok) return v
    report.note = "Written short in one pass: no separate fact check. Read it against the sources."
    const words = v.story.body.split(/\s+/).filter(Boolean).length
    const sources = v.story.sources.map((s) => {
      const d = docs.find((x) => x.url === s.url)
      return d ? { ...s, excerpt: (d.description || d.text.slice(0, 300)).slice(0, 400), publishedAt: d.publishedAt } : s
    })
    return finish({ ...v.story, sources, depth: "short", keyFacts: [], pullQuote: null, words }, [...models].join(", "))
  }

  if (depth === "short") return writeShort()

  // 2. Brief: facts tied to quoted passages, then the outline. One call when the material fits one request.
  const { groups, leftOut } = groupMaterial(docs)
  if (leftOut) steps.push(`material: ${Math.round(leftOut / 1000)}k characters left out to stay within one story's free quota`)
  let facts: Fact[] = []
  let plan: Plan | null = null
  if (groups.length === 1) {
    const res = await call(ask, briefRequest(groups[0], docs, { depth, sections: settings.sections, note }), models)
    steps.push("brief: facts and outline in one call")
    if (!res.ok) return res
    const f = readFacts(res.json, docs)
    report.dropped.push(...f.dropped)
    const r = renumber(f.facts)
    facts = r.facts
    const p = readPlan(res.json, facts, settings.sections, r.map)
    if (!p.ok) return p
    plan = p.plan
  } else {
    const found: Fact[] = []
    for (let i = 0; i < groups.length; i++) {
      const res = await call(ask, factsRequest(groups[i], docs, i + 1, groups.length), models)
      if (!res.ok) {
        steps.push(`facts ${i + 1}/${groups.length}: failed (${res.reason})`)
        continue
      }
      const f = readFacts(res.json, docs)
      report.dropped.push(...f.dropped)
      found.push(...f.facts)
    }
    steps.push(`brief: facts from ${groups.length} chunks`)
    facts = renumber(found).facts
    if (facts.length < MIN_FACTS.standard) return facts.length >= 3 ? writeShort() : { ok: false, reason: `only ${facts.length} facts could be verified in the pages` }
    const res = await call(ask, planRequest(facts, docs, { sections: settings.sections, note }), models)
    steps.push("brief: outline")
    if (!res.ok) return res
    const p = readPlan(res.json, facts, settings.sections)
    if (!p.ok) return p
    plan = p.plan
  }
  report.verified = facts.length
  imageQuery = plan.imageQuery

  // Thin material: write one depth shorter instead of padding.
  if (depth === "deep" && facts.length < MIN_FACTS.deep) {
    depth = facts.length >= MIN_FACTS.standard ? "standard" : "short"
    steps.push(`depth: ${depth} (only ${facts.length} facts verified)`)
  }
  if (depth === "standard" && facts.length < MIN_FACTS.standard) {
    steps.push(`depth: short (only ${facts.length} facts verified)`)
    return writeShort()
  }
  if (depth === "short") return writeShort()

  // 3. Write from the verified facts only.
  const d = depth
  const wrote = await call(ask, writeRequest(facts, plan, docs, { depth: d, targetWords: d === o.depth ? settings.targetWords : DEPTH_WORDS[d].target, sections: settings.sections, tone: settings.tone, styleNote: settings.styleNote, note }), models)
  steps.push(`write: ${d}`)
  if (!wrote.ok) return wrote
  const v = readDraft(wrote.json, facts, docs, { depth: d })
  if (!v.ok) return v
  let draft: DeepDraft = v.draft

  // 4. Check every claim, when the editors want it and time allows.
  if (!settings.factCheck) report.note = "The fact-check pass is switched off in the newsroom settings."
  else if (Date.now() > deadline - 45_000) report.note = "The fact-check pass was skipped to stay within the run's time limit."
  else {
    const checked = await call(ask, checkRequest(draft, facts, docs), models)
    steps.push("check: second pass")
    if (!checked.ok) report.note = `The fact-check pass could not run (${checked.reason}).`
    else {
      const c = readCheck(checked.json, draft, docs, { depth: d })
      if (!c.ok) report.note = `The fact-check answer was not used: ${c.reason}. The draft is the writer's version.`
      else {
        draft = c.draft
        report.checked = true
        report.removed = c.removed
        report.unconfirmed = c.unconfirmed
      }
    }
  }

  const unconfirmed = plan.category === "rumor" || plan.unconfirmed
  const internalOnly = docs.every((x) => x.internalOnly)
  if (internalOnly && plan.category !== "research") return { ok: false, reason: "a story from internal signals only must be research" }
  return finish(
    {
      title: draft.title,
      dek: draft.dek,
      body: draft.body,
      category: plan.category,
      unconfirmed,
      sources: sourcesOf(docs, facts),
      depth: d,
      keyFacts: draft.keyFacts,
      pullQuote: draft.pullQuote,
      words: draft.words,
    },
    [...models].join(", ")
  )
}
