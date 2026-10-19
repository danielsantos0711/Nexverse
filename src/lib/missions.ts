import { getPerson, getResource, resourcePath } from "@/lib/data"
// Types only from the store (it pulls in React hooks); community.ts is plain functions and safe to import.
import type { Member } from "@/lib/store"
import { isUuid, normalizeTag, TAG, type Who } from "@/lib/community"
import { db } from "@/lib/supabase"

/**
 * Missions: challenges members post for each other. A mission has a brief, acceptance criteria, a difficulty, a
 * reward in reputation points the poster pledges from their own points, tags and a deadline. Members join its
 * crew, submit an entry (a project page, a GitHub repository or a paper), and the poster picks the winner.
 *
 * With a database everything reads and writes Supabase (supabase/migrations/…_missions_launchpad.sql), where
 * triggers keep the status and send notifications. Without one, the sample missions below are shown and what you
 * do (missions you post, crews you join, entries you submit) stays in this browser.
 */

// ─── Plumbing ───────────────────────────────────────────────────────────────────────────────────────────────

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(friendly(error.message))
}

function friendly(message: string) {
  if (/violates row-level security/.test(message)) return "You are not allowed to do that. Are you signed in?"
  if (/mission_entries_check/.test(message)) return "That link does not match the kind of entry. Check it and try again."
  if (/missions_tags_check/.test(message)) return "Tags are lowercase letters, numbers and hyphens, up to 24 characters, and at most 5."
  if (/duplicate key/.test(message)) return "That is already there."
  if (/JWT|not authenticated/i.test(message)) return "Your session ran out. Sign in again."
  if (/schema cache|does not exist/.test(message)) return "Missions are still being switched on for this site. Try again soon."
  return message
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error("This browser would not save that. Free some storage or allow site data, then try again.")
  }
  // Other tabs hear about it through the storage event; this tab through a custom one.
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_EVENT))
  } catch {}
}

const LOCAL_EVENT = "nexverse-missions-changed"

async function me(): Promise<string | null> {
  const client = db()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session?.user.id ?? null
}

async function requireMe() {
  const id = await me()
  if (!id) throw new Error("Sign in first. It takes an email address and nothing else.")
  return id
}

const personWho = (handle: string): Who => ({
  handle,
  name: getPerson(handle)?.name ?? handle,
})
const memberWho = (m: Member | null | undefined, fallback = "A member"): Who => (m ? { name: m.name, memberId: m.id } : { name: fallback })
const YOU: Who = { name: "You" }

// ─── Vocabulary ─────────────────────────────────────────────────────────────────────────────────────────────

export type Difficulty = "cadet" | "pilot" | "commander"

export const DIFFICULTIES: Record<Difficulty, { label: string; blurb: string; rank: number }> = {
  cadet: {
    label: "Cadet",
    blurb: "A weekend or less. Good first mission.",
    rank: 1,
  },
  pilot: { label: "Pilot", blurb: "A week or two of focused work.", rank: 2 },
  commander: {
    label: "Commander",
    blurb: "A serious build: weeks, compute, real expertise.",
    rank: 3,
  },
}

export const isDifficulty = (s: string): s is Difficulty => s in DIFFICULTIES

/** What a mission is right now. "expired" is worked out from the clock, never stored. */
export type MissionStatus = "open" | "in-progress" | "review" | "completed" | "expired"

export const STATUSES: Record<MissionStatus, { label: string; blurb: string }> = {
  open: { label: "Open", blurb: "Nobody has accepted it yet." },
  "in-progress": { label: "In progress", blurb: "A crew is working on it." },
  review: {
    label: "In review",
    blurb: "Entries are in; the poster is reviewing them.",
  },
  completed: { label: "Completed", blurb: "A winner was picked." },
  expired: {
    label: "Expired",
    blurb: "The deadline passed without a winner; the pledge went back.",
  },
}

export const STATUS_ORDER: MissionStatus[] = ["open", "in-progress", "review", "completed", "expired"]

export type EntryKind = "project" | "repo" | "paper"

export const ENTRY_KINDS: Record<EntryKind, { label: string; hint: string; placeholder: string }> = {
  project: {
    label: "Project on Nexverse",
    hint: "One of your published projects.",
    placeholder: "Pick a project",
  },
  repo: {
    label: "GitHub repository",
    hint: "The repository with the code, weights or data.",
    placeholder: "https://github.com/you/your-repo",
  },
  paper: {
    label: "Paper",
    hint: "A paper or write-up, for example on arXiv.",
    placeholder: "https://arxiv.org/abs/2610.00001",
  },
}

/** How long after the deadline a poster still has to pick a winner before the mission expires. */
export const REVIEW_GRACE_DAYS = 14
const DAY = 864e5

export const LIMITS = {
  title: [8, 120],
  brief: 8000,
  criteria: 12,
  criterion: 200,
  reward: 1000,
  notes: 2000,
  deadlineDays: [1, 180],
} as const
export const REWARD_PRESETS = [0, 10, 25, 50, 100, 250]

// ─── Types ──────────────────────────────────────────────────────────────────────────────────────────────────

type StoredStatus = Exclude<MissionStatus, "expired">

export type Mission = {
  id: string
  title: string
  brief: string
  criteria: string[]
  difficulty: Difficulty
  reward: number
  tags: string[]
  deadline: string
  /** The status the database keeps; use missionState() for what it is now. */
  status: StoredStatus
  createdAt: string
  completedAt: string | null
  poster: Who
  winner: Who | null
  winnerEntryId: string | null
  crewCount: number
  entryCount: number
  /** One of the examples kept in this file. */
  sample: boolean
  /** Posted in this browser (no database). */
  local: boolean
}

export type CrewMember = { who: Who; joinedAt: string; mine: boolean }

export type MissionEntry = {
  id: string
  kind: EntryKind
  url: string
  notes: string
  createdAt: string
  updatedAt: string
  author: Who
  mine: boolean
}

export type MissionCrew = {
  crew: CrewMember[]
  entries: MissionEntry[]
  joined: boolean
  myEntry: MissionEntry | null
}

export function missionState(m: Pick<Mission, "status" | "deadline">, now: number): MissionStatus {
  const deadline = Date.parse(m.deadline)
  if (m.status === "completed") return "completed"
  if ((m.status === "open" || m.status === "in-progress") && deadline < now) return "expired"
  if (m.status === "review" && deadline < now - REVIEW_GRACE_DAYS * DAY) return "expired"
  return m.status
}

/** Whether pilots can still join and submit. */
export const isTakingEntries = (m: Mission, now: number) => m.status !== "completed" && Date.parse(m.deadline) >= now

/** Where an entry's link goes: project pages and hub pages stay on Nexverse, the rest open on their own site. */
export function entryHref(e: Pick<MissionEntry, "url">): {
  href: string
  internal: boolean
} {
  return { href: e.url, internal: e.url.startsWith("/") }
}

/** A short label for an entry's link: "owner/repo", "arXiv 2610.00001", the project or resource name. */
export function entryLabel(e: Pick<MissionEntry, "kind" | "url">): string {
  if (e.url.startsWith("/p/")) return "Project page"
  if (e.url.startsWith("/")) {
    const slug = e.url.split("/").pop() ?? ""
    return getResource(slug)?.name ?? slug
  }
  try {
    const u = new URL(e.url)
    if (u.hostname === "github.com") return u.pathname.replace(/^\/|\/$/g, "")
    const arxiv = /^\/(?:abs|pdf)\/([\w.]+)/.exec(u.pathname)
    if (u.hostname.endsWith("arxiv.org") && arxiv) return `arXiv ${arxiv[1].replace(/\.pdf$/, "")}`
    return u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname : "")
  } catch {
    return e.url
  }
}

// ─── Sample missions (shown when no database is connected) ──────────────────────────────────────────────────

type SampleEntry = {
  by: string
  kind: EntryKind
  url: string
  notes: string
  daysAgo: number
}
type SampleMission = {
  id: string
  title: string
  brief: string
  criteria: string[]
  difficulty: Difficulty
  reward: number
  tags: string[]
  poster: string
  /** Days before today it was posted, and days from today to its deadline (negative: already passed). */
  postedDaysAgo: number
  deadlineInDays: number
  crew: { by: string; daysAgo: number }[]
  entries: SampleEntry[]
  winner?: { by: string; daysAgo: number }
}

const res = (slug: string) => {
  const r = getResource(slug)
  return r ? resourcePath(r) : "/explore"
}

const SAMPLE_DATA: SampleMission[] = [
  {
    id: "pt-pt-3b-finetune",
    title: "Fine-tune a 3B model for European Portuguese",
    brief:
      "General models drift into Brazilian Portuguese the moment you stop watching: *ônibus* instead of *autocarro*, *você* everywhere. I want a small model that stays in PT-PT.\n\n**What I am looking for**\n\n- A 3B (or smaller) open-weights model, fine-tuned with LoRA or full fine-tuning\n- Trained on data you are allowed to use; `pt-pt-instruct` is a good start\n- Evaluated on the PT-PT eval set, with the numbers in the model card\n\nShare the training recipe so others can reproduce it. Questions go in the forum's Portuguese channel.",
    criteria: [
      "Open weights under a permissive licence",
      "Scores within 3 points of an 8B baseline on the PT-PT eval set",
      "Fewer than 2% Brazilian forms on the 500-prompt drift test",
      "Training recipe and data sources documented",
    ],
    difficulty: "pilot",
    reward: 150,
    tags: ["portuguese", "fine-tuning", "lora"],
    poster: "ines",
    postedDaysAgo: 9,
    deadlineInDays: 12,
    crew: [
      { by: "tunde", daysAgo: 8 },
      { by: "priya", daysAgo: 6 },
      { by: "sofia", daysAgo: 3 },
    ],
    entries: [],
  },
  {
    id: "yoruba-speech-dataset",
    title: "Build a dataset of Yoruba speech with tone marks",
    brief:
      "Most Yoruba speech data drops the tone marks in the transcripts, which makes them useless for tone-aware ASR. This mission is for a consented, documented dataset of read and conversational Yoruba.\n\nConsent forms must be in Yoruba and English. Pay contributors fairly and say how in the datasheet.",
    criteria: [
      "At least 40 hours of audio from 60 or more speakers",
      "Transcripts with full tone marks, reviewed by a second speaker",
      "A datasheet: consent, payment, demographics, licence",
      "A train/dev/test split with no speaker overlap",
    ],
    difficulty: "commander",
    reward: 400,
    tags: ["yoruba", "speech", "datasets"],
    poster: "tunde",
    postedDaysAgo: 21,
    deadlineInDays: 40,
    crew: [
      { by: "amara", daysAgo: 20 },
      { by: "layla", daysAgo: 12 },
    ],
    entries: [],
  },
  {
    id: "loop-guard-benchmark",
    title: "A benchmark for agents that get stuck in loops",
    brief:
      "loop-guard decides when an agent is going in circles, but we test it on hand-picked traces. We need a proper benchmark: real traces, labelled, with a scoring script.\n\nUse `agent-traces` as a starting point or collect your own.",
    criteria: ["At least 500 labelled traces from 3 or more agent frameworks", "A scoring script anyone can run", "Baseline numbers for loop-guard and one other method"],
    difficulty: "pilot",
    reward: 120,
    tags: ["agents", "evaluation"],
    poster: "rafa",
    postedDaysAgo: 18,
    deadlineInDays: 2,
    crew: [
      { by: "mei", daysAgo: 17 },
      { by: "noah", daysAgo: 15 },
      { by: "kai", daysAgo: 10 },
    ],
    entries: [
      {
        by: "mei",
        kind: "project",
        url: res("agent-traces"),
        notes: "612 traces from four frameworks, each labelled by two people. Scoring script and baselines are in the README; loop-guard gets 0.81 F1.",
        daysAgo: 2,
      },
      {
        by: "noah",
        kind: "paper",
        url: "https://arxiv.org/abs/2610.04417",
        notes: "Write-up of a smaller benchmark (340 traces) with a retrieval-based detector as the second baseline.",
        daysAgo: 1,
      },
    ],
  },
  {
    id: "phone-under-2gb",
    title: "Get Orbit 1B under 2 GB with less than 1 point lost",
    brief: "Quantise Orbit 1B Mobile so it runs on a 4 GB phone with room to spare. Measure on a real device, not a desktop.",
    criteria: ["Model file under 2 GB", "Loses less than 1 point on the general eval", "At least 15 tokens a second on a mid-range Android phone"],
    difficulty: "cadet",
    reward: 60,
    tags: ["on-device", "quantization"],
    poster: "priya",
    postedDaysAgo: 30,
    deadlineInDays: -6,
    crew: [
      { by: "kai", daysAgo: 29 },
      { by: "sofia", daysAgo: 25 },
      { by: "leo", daysAgo: 22 },
    ],
    entries: [
      {
        by: "kai",
        kind: "project",
        url: res("pocket-run"),
        notes: "4-bit build at 1.6 GB, 0.6 points lower, 21 tokens a second on a Pixel 7a. Numbers and the device log are in the app's notes.",
        daysAgo: 8,
      },
      {
        by: "sofia",
        kind: "project",
        url: res("quant-cookbook"),
        notes: "Recipe for mixed 4/8-bit at 1.9 GB that loses 0.3 points, 17 tokens a second.",
        daysAgo: 7,
      },
    ],
    winner: { by: "kai", daysAgo: 5 },
  },
  {
    id: "swahili-tts-voices",
    title: "Two new Swahili voices for Sauti TTS",
    brief: "Record and train two more Swahili voices (one coastal, one upcountry accent) with speakers who agreed to it in writing.",
    criteria: ["Two voices, each from at least 3 hours of studio audio", "Signed consent from both speakers", "A listening test with 20 native speakers"],
    difficulty: "pilot",
    reward: 100,
    tags: ["swahili", "tts"],
    poster: "amara",
    postedDaysAgo: 4,
    deadlineInDays: 26,
    crew: [],
    entries: [],
  },
  {
    id: "arabic-dialect-tokenizer",
    title: "A tokenizer that does not punish Arabic dialects",
    brief: "Darija and Levantine text costs two to three times more tokens than English in most tokenizers. Build one that brings fertility close to English without hurting MSA.",
    criteria: ["Fertility within 1.3x of English on the dialect test set", "No more than 5% worse on MSA", "Released with the training script"],
    difficulty: "commander",
    reward: 250,
    tags: ["arabic", "tokenizers"],
    poster: "layla",
    postedDaysAgo: 70,
    deadlineInDays: -25,
    crew: [{ by: "noah", daysAgo: 60 }],
    entries: [],
  },
]

/** The sample missions, dated against `now` so open ones stay open whenever you look. */
export function sampleMissions(now = Date.now()): Mission[] {
  return SAMPLE_DATA.map((s) => {
    const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString()
    const status: StoredStatus = s.winner ? "completed" : s.entries.length ? "review" : s.crew.length ? "in-progress" : "open"
    return {
      id: s.id,
      title: s.title,
      brief: s.brief,
      criteria: s.criteria,
      difficulty: s.difficulty,
      reward: s.reward,
      tags: s.tags,
      deadline: new Date(now + s.deadlineInDays * DAY).toISOString(),
      status,
      createdAt: at(s.postedDaysAgo),
      completedAt: s.winner ? at(s.winner.daysAgo) : null,
      poster: personWho(s.poster),
      winner: s.winner ? personWho(s.winner.by) : null,
      winnerEntryId: s.winner ? `${s.id}-${s.winner.by}` : null,
      crewCount: s.crew.length,
      entryCount: s.entries.length,
      sample: true,
      local: false,
    }
  })
}

export const SAMPLE_MISSION_IDS = SAMPLE_DATA.map((s) => s.id)
const sampleData = (id: string) => SAMPLE_DATA.find((s) => s.id === id)

/** Title and brief of a sample mission, for page metadata. */
export function getSampleMissionMeta(id: string) {
  const s = sampleData(id)
  return s
    ? {
        title: s.title,
        description: s.brief.split("\n")[0].replace(/[*_`]/g, "").slice(0, 160),
      }
    : null
}

// ─── Browser-only storage ───────────────────────────────────────────────────────────────────────────────────

const MISSIONS_KEY = "nexverse-missions"
const CREW_KEY = "nexverse-mission-crew"
const ENTRIES_KEY = "nexverse-mission-entries"

type LocalMission = Omit<Mission, "poster" | "winner" | "sample" | "local" | "crewCount" | "entryCount">
type LocalEntry = {
  id: string
  kind: EntryKind
  url: string
  notes: string
  createdAt: string
  updatedAt: string
}

const readMissions = () => readLocal<LocalMission[]>(MISSIONS_KEY, []).filter((m) => m && typeof m.id === "string")
const readCrew = () => readLocal<Record<string, string>>(CREW_KEY, {})
const readEntries = () => readLocal<Record<string, LocalEntry>>(ENTRIES_KEY, {})

/** A mission with your browser-only crew membership and entry applied (no database). */
function withLocal(m: Mission): Mission {
  const joined = Boolean(readCrew()[m.id])
  const entered = Boolean(readEntries()[m.id])
  const crewCount = m.crewCount + (joined ? 1 : 0)
  const entryCount = m.entryCount + (entered ? 1 : 0)
  let status = m.status
  if (status !== "completed") status = entryCount ? "review" : crewCount ? "in-progress" : "open"
  return { ...m, crewCount, entryCount, status }
}

const fromLocalMission = (m: LocalMission): Mission => ({
  ...m,
  poster: YOU,
  winner: null,
  crewCount: 0,
  entryCount: 0,
  sample: false,
  local: true,
})

// ─── Database rows ──────────────────────────────────────────────────────────────────────────────────────────

const COLUMNS =
  "id, title, brief, criteria, difficulty, reward, tags, deadline, status, created_at, completed_at, winner_entry, poster:profiles!missions_poster_id_fkey(id, name), winner:profiles!missions_winner_id_fkey(id, name), crew:mission_crew(count), entries:mission_entries!mission_entries_mission_id_fkey(count)"

type Row = {
  id: string
  title: string
  brief: string
  criteria: string[]
  difficulty: Difficulty
  reward: number
  tags: string[] | null
  deadline: string
  status: StoredStatus
  created_at: string
  completed_at: string | null
  winner_entry: string | null
  poster: Member | null
  winner: Member | null
  crew: { count: number }[] | null
  entries: { count: number }[] | null
}

const fromRow = (r: Row): Mission => ({
  id: r.id,
  title: r.title,
  brief: r.brief,
  criteria: r.criteria ?? [],
  difficulty: r.difficulty,
  reward: r.reward,
  tags: r.tags ?? [],
  deadline: r.deadline,
  status: r.status,
  createdAt: r.created_at,
  completedAt: r.completed_at,
  poster: memberWho(r.poster),
  winner: r.winner ? memberWho(r.winner) : null,
  winnerEntryId: r.winner_entry,
  crewCount: r.crew?.[0]?.count ?? 0,
  entryCount: r.entries?.[0]?.count ?? 0,
  sample: false,
  local: false,
})

// ─── Reading ────────────────────────────────────────────────────────────────────────────────────────────────

/** Every mission, newest first. Without a database: yours from this browser, then the samples. */
export async function listMissions(): Promise<Mission[]> {
  const client = db()
  if (!client) return [...readMissions().map(fromLocalMission), ...sampleMissions()].map(withLocal)
  const { data, error } = await client.from("missions").select(COLUMNS).order("created_at", { ascending: false }).limit(300)
  fail(error)
  return (data as unknown as Row[]).map(fromRow)
}

export async function getMission(id: string): Promise<Mission | null> {
  const sample = sampleMissions().find((m) => m.id === id)
  const client = db()
  if (sample) return client ? sample : withLocal(sample)
  if (!client) {
    const m = readMissions().find((x) => x.id === id)
    return m ? withLocal(fromLocalMission(m)) : null
  }
  if (!isUuid(id)) return null
  const { data, error } = await client.from("missions").select(COLUMNS).eq("id", id).maybeSingle()
  fail(error)
  return data ? fromRow(data as unknown as Row) : null
}

type EntryRow = {
  id: string
  kind: EntryKind
  url: string
  notes: string
  created_at: string
  updated_at: string
  author_id: string
  author: Member | null
}

/** A mission's crew (earliest first) and its entries, with yours marked. */
export async function getMissionCrew(m: Mission): Promise<MissionCrew> {
  const client = db()
  if (m.sample || !client) {
    const s = sampleData(m.id)
    const now = Date.now()
    const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString()
    const crew: CrewMember[] = (s?.crew ?? []).map((c) => ({
      who: personWho(c.by),
      joinedAt: at(c.daysAgo),
      mine: false,
    }))
    const entries: MissionEntry[] = (s?.entries ?? []).map((e) => ({
      id: `${m.id}-${e.by}`,
      kind: e.kind,
      url: e.url,
      notes: e.notes,
      createdAt: at(e.daysAgo),
      updatedAt: at(e.daysAgo),
      author: personWho(e.by),
      mine: false,
    }))
    let myEntry: MissionEntry | null = null
    let joined = false
    if (!client) {
      const joinedAt = readCrew()[m.id]
      if (joinedAt) {
        joined = true
        crew.push({ who: YOU, joinedAt, mine: true })
      }
      const local = readEntries()[m.id]
      if (local) {
        myEntry = { ...local, author: YOU, mine: true }
        entries.push(myEntry)
      }
    }
    return { crew, entries, joined, myEntry }
  }
  const [userId, crewRes, entryRes] = await Promise.all([
    me(),
    client.from("mission_crew").select("user_id, created_at, member:profiles(id, name)").eq("mission_id", m.id).order("created_at").limit(100),
    client.from("mission_entries").select("id, kind, url, notes, created_at, updated_at, author_id, author:profiles(id, name)").eq("mission_id", m.id).order("created_at").limit(100),
  ])
  fail(crewRes.error)
  fail(entryRes.error)
  const crew = (
    crewRes.data as unknown as {
      user_id: string
      created_at: string
      member: Member | null
    }[]
  ).map((r) => ({
    who: memberWho(r.member),
    joinedAt: r.created_at,
    mine: r.user_id === userId,
  }))
  const entries = (entryRes.data as unknown as EntryRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    url: r.url,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    author: memberWho(r.author),
    mine: r.author_id === userId,
  }))
  return {
    crew,
    entries,
    joined: crew.some((c) => c.mine),
    myEntry: entries.find((e) => e.mine) ?? null,
  }
}

// ─── Posting ────────────────────────────────────────────────────────────────────────────────────────────────

export type NewMission = {
  title: string
  brief: string
  criteria: string[]
  difficulty: Difficulty
  reward: number
  tags: string[]
  deadline: string
}

export type MissionErrors = Partial<Record<keyof NewMission | "form", string>>

/** The same rules the database enforces, checked first so the form can say exactly what to fix. */
export function validateMission(m: NewMission, available: number | null, now = Date.now()): MissionErrors {
  const e: MissionErrors = {}
  const title = m.title.trim()
  if (title.length < LIMITS.title[0]) e.title = "Give the mission a title of at least 8 characters that says what to build."
  else if (title.length > LIMITS.title[1]) e.title = "Keep the title under 120 characters."
  if (m.brief.length > LIMITS.brief) e.brief = "Keep the brief under 8,000 characters."
  const criteria = m.criteria.map((c) => c.trim()).filter(Boolean)
  if (!criteria.length) e.criteria = "Add at least one acceptance criterion, so pilots know when they are done."
  else if (criteria.length > LIMITS.criteria) e.criteria = "Use at most 12 criteria."
  else if (criteria.some((c) => c.length > LIMITS.criterion)) e.criteria = "Keep each criterion under 200 characters."
  if (!Number.isInteger(m.reward) || m.reward < 0 || m.reward > LIMITS.reward) e.reward = "The reward is a whole number of points from 0 to 1,000."
  else if (available !== null && m.reward > Math.max(0, available)) e.reward = `You have ${Math.max(0, available)} points free to pledge.`
  if (m.tags.length > 5) e.tags = "Use at most 5 tags."
  else if (m.tags.some((t) => !TAG.test(t))) e.tags = "Tags are lowercase letters, numbers and hyphens."
  const deadline = Date.parse(m.deadline)
  if (!Number.isFinite(deadline)) e.deadline = "Pick a deadline."
  else if (deadline < now + LIMITS.deadlineDays[0] * DAY - 60_000) e.deadline = "Give pilots at least a day."
  else if (deadline > now + LIMITS.deadlineDays[1] * DAY) e.deadline = "A mission can run for up to six months."
  return e
}

/** Points you can still pledge: your reputation minus rewards held by your running missions. Null without a database. */
export async function pointsAvailable(): Promise<number | null> {
  const client = db()
  if (!client) return null
  const userId = await me()
  if (!userId) return 0
  const { data, error } = await client.rpc("mission_points_available", {
    member: userId,
  })
  fail(error)
  return Number(data ?? 0)
}

export async function createMission(input: NewMission): Promise<Mission> {
  const client = db()
  const clean: NewMission = {
    ...input,
    title: input.title.trim(),
    brief: input.brief.trim(),
    criteria: input.criteria.map((c) => c.trim()).filter(Boolean),
    tags: [...new Set(input.tags.map(normalizeTag).filter(Boolean))].slice(0, 5),
  }
  const errors = validateMission(clean, client ? await pointsAvailable() : null)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
  if (!client) {
    const m: LocalMission = {
      ...clean,
      id: crypto.randomUUID(),
      status: "open",
      createdAt: new Date().toISOString(),
      completedAt: null,
      winnerEntryId: null,
    }
    writeLocal(MISSIONS_KEY, [m, ...readMissions()])
    return fromLocalMission(m)
  }
  await requireMe()
  const { data, error } = await client.from("missions").insert(clean).select(COLUMNS).single()
  fail(error)
  return fromRow(data as unknown as Row)
}

/** Calls off your mission (only before anyone has submitted an entry). The pledge is returned. */
export async function deleteMission(id: string) {
  const client = db()
  if (!client) {
    writeLocal(
      MISSIONS_KEY,
      readMissions().filter((m) => m.id !== id),
    )
    return
  }
  const { data, error } = await client.from("missions").delete().eq("id", id).select("id")
  fail(error)
  if (!(data ?? []).length) throw new Error("This mission already has entries, so it can no longer be called off.")
}

// ─── Crew and entries ───────────────────────────────────────────────────────────────────────────────────────

export async function joinCrew(missionId: string) {
  const client = db()
  if (!client) {
    writeLocal(CREW_KEY, {
      ...readCrew(),
      [missionId]: new Date().toISOString(),
    })
    return
  }
  await requireMe()
  const { error } = await client.from("mission_crew").insert({ mission_id: missionId })
  fail(error)
}

export async function leaveCrew(missionId: string) {
  const client = db()
  if (!client) {
    if (readEntries()[missionId]) throw new Error("You have an entry in this mission. Withdraw it before leaving the crew.")
    const crew = readCrew()
    delete crew[missionId]
    writeLocal(CREW_KEY, crew)
    return
  }
  const userId = await requireMe()
  const { error } = await client.from("mission_crew").delete().eq("mission_id", missionId).eq("user_id", userId)
  fail(error)
}

export type NewEntry = { kind: EntryKind; url: string; notes: string }

const GITHUB_REPO = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/?$/
const PROJECT_PATH = /^\/p\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function validateEntry(e: NewEntry): Partial<Record<"url" | "notes", string>> {
  const out: Partial<Record<"url" | "notes", string>> = {}
  const url = e.url.trim()
  if (e.kind === "project" && !PROJECT_PATH.test(url)) out.url = "Pick one of your published projects."
  if (e.kind === "repo" && !GITHUB_REPO.test(url)) out.url = "Use a GitHub repository address, like https://github.com/owner/repo"
  if (e.kind === "paper") {
    let ok = false
    try {
      ok = new URL(url).protocol === "https:" && !/\s/.test(url) && url.length <= 500
    } catch {}
    if (!ok) out.url = "Paste the full https:// link to the paper."
  }
  if (e.notes.length > LIMITS.notes) out.notes = "Keep the notes under 2,000 characters."
  return out
}

/** Submits your entry, or replaces it while the mission is still taking entries. Joins the crew too. */
export async function submitEntry(missionId: string, input: NewEntry): Promise<void> {
  const problem = Object.values(validateEntry(input))[0]
  if (problem) throw new Error(problem)
  const row = {
    kind: input.kind,
    url: input.url.trim(),
    notes: input.notes.trim(),
  }
  const client = db()
  if (!client) {
    const now = new Date().toISOString()
    const all = readEntries()
    const before = all[missionId]
    writeLocal(ENTRIES_KEY, {
      ...all,
      [missionId]: {
        id: before?.id ?? crypto.randomUUID(),
        ...row,
        createdAt: before?.createdAt ?? now,
        updatedAt: now,
      },
    })
    if (!readCrew()[missionId]) writeLocal(CREW_KEY, { ...readCrew(), [missionId]: now })
    return
  }
  const userId = await requireMe()
  const { data: existing, error: readError } = await client.from("mission_entries").select("id").eq("mission_id", missionId).eq("author_id", userId).maybeSingle()
  fail(readError)
  const { error } = existing
    ? await client
        .from("mission_entries")
        .update(row)
        .eq("id", (existing as { id: string }).id)
    : await client.from("mission_entries").insert({ mission_id: missionId, ...row })
  fail(error)
}

export async function withdrawEntry(missionId: string) {
  const client = db()
  if (!client) {
    const all = readEntries()
    delete all[missionId]
    writeLocal(ENTRIES_KEY, all)
    return
  }
  const userId = await requireMe()
  const { error } = await client.from("mission_entries").delete().eq("mission_id", missionId).eq("author_id", userId)
  fail(error)
}

/** The poster picks the winning entry; the winner gets the reward and everyone involved is notified. */
export async function pickWinner(missionId: string, entryId: string) {
  const client = db()
  if (!client) {
    // Only missions you posted in this browser can be decided here, and nobody else can enter those.
    const all = readMissions()
    if (!all.some((m) => m.id === missionId)) throw new Error("Only the member who posted this mission picks its winner.")
    writeLocal(
      MISSIONS_KEY,
      all.map((m) =>
        m.id === missionId
          ? {
              ...m,
              status: "completed" as const,
              winnerEntryId: entryId,
              completedAt: new Date().toISOString(),
            }
          : m,
      ),
    )
    return
  }
  await requireMe()
  const { error } = await client.rpc("pick_mission_winner", {
    mission: missionId,
    entry: entryId,
  })
  fail(error)
}

// ─── Live updates ───────────────────────────────────────────────────────────────────────────────────────────

let channelSeq = 0

/**
 * Calls `onChange` when missions, crews or entries change (all of them, or one mission's). With a database this
 * listens on Realtime; without one it hears this browser's other tabs. Returns a function that stops listening.
 */
export function subscribeMissions(onChange: () => void, missionId?: string): () => void {
  const client = db()
  if (!client) {
    if (typeof window === "undefined") return () => {}
    const onStorage = (e: StorageEvent) => {
      if (e.key && [MISSIONS_KEY, CREW_KEY, ENTRIES_KEY].includes(e.key)) onChange()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener(LOCAL_EVENT, onChange)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(LOCAL_EVENT, onChange)
    }
  }
  const channel = client.channel(`missions:${missionId ?? "all"}:${++channelSeq}`)
  const forMission = (p: { new?: Record<string, unknown>; old?: Record<string, unknown> }) =>
    !missionId || p.new?.mission_id === missionId || p.old?.mission_id === missionId || p.new?.id === missionId || p.old?.id === missionId
  // Deletes cannot be filtered on the server, so every change is checked here.
  for (const table of ["missions", "mission_crew", "mission_entries"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (p) => {
      if (forMission(p as never)) onChange()
    })
  }
  channel.subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

// ─── Timeline ───────────────────────────────────────────────────────────────────────────────────────────────

export type TimelineEvent = {
  id: string
  at: string
  kind: "posted" | "joined" | "entry" | "won" | "deadline" | "expired"
  who?: Who
  text: string
}

/** Everything that happened on a mission, oldest first, with the deadline in its place. */
export function missionTimeline(m: Mission, crew: MissionCrew, now: number): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: "posted",
      at: m.createdAt,
      kind: "posted",
      who: m.poster,
      text: "posted the mission",
    },
  ]
  for (const c of crew.crew)
    events.push({
      id: `joined-${c.who.memberId ?? c.who.handle ?? c.who.name}`,
      at: c.joinedAt,
      kind: "joined",
      who: c.who,
      text: "joined the crew",
    })
  for (const e of crew.entries)
    events.push({
      id: `entry-${e.id}`,
      at: e.createdAt,
      kind: "entry",
      who: e.author,
      text: "submitted an entry",
    })
  const state = missionState(m, now)
  if (m.status === "completed" && m.completedAt) {
    events.push({
      id: "won",
      at: m.completedAt,
      kind: "won",
      who: m.winner ?? undefined,
      text: m.reward ? `won the mission and ${m.reward} points` : "won the mission",
    })
  }
  if (state === "expired") {
    events.push({
      id: "expired",
      at: m.deadline,
      kind: "expired",
      text: m.reward ? `Expired without a winner. ${m.reward} points went back to ${m.poster.name}.` : "Expired without a winner.",
    })
  } else {
    events.push({
      id: "deadline",
      at: m.deadline,
      kind: "deadline",
      text: Date.parse(m.deadline) < now ? "Deadline passed" : "Deadline",
    })
  }
  return events.sort((a, b) => a.at.localeCompare(b.at))
}

// ─── Mission control ────────────────────────────────────────────────────────────────────────────────────────

export type MissionCounts = Record<MissionStatus, number> & {
  pledged: number
  pilots: number
}

/** Counts per status, points riding on running missions, and pilots on crews of running missions. */
export function missionCounts(missions: Mission[], now: number): MissionCounts {
  const c: MissionCounts = {
    open: 0,
    "in-progress": 0,
    review: 0,
    completed: 0,
    expired: 0,
    pledged: 0,
    pilots: 0,
  }
  for (const m of missions) {
    const s = missionState(m, now)
    c[s] += 1
    if (s === "open" || s === "in-progress" || s === "review") {
      c.pledged += m.reward
      c.pilots += m.crewCount
    }
  }
  return c
}

/** Tags used on missions, most used first. */
export function missionTags(missions: Mission[]): string[] {
  const n = new Map<string, number>()
  for (const m of missions) for (const t of m.tags) n.set(t, (n.get(t) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
}

// ─── Badges ─────────────────────────────────────────────────────────────────────────────────────────────────

export type MissionRecord = {
  won: number
  wonCommander: number
  pointsWon: number
  postedCompleted: number
}
export const EMPTY_RECORD: MissionRecord = {
  won: 0,
  wonCommander: 0,
  pointsWon: 0,
  postedCompleted: 0,
}

export type MissionBadge = {
  id: string
  name: string
  description: string
  earned: (r: MissionRecord) => boolean
}

export const MISSION_BADGES: MissionBadge[] = [
  {
    id: "mission-accomplished",
    name: "Mission accomplished",
    description: "Won a mission.",
    earned: (r) => r.won >= 1,
  },
  {
    id: "ace-pilot",
    name: "Ace pilot",
    description: "Won 3 missions.",
    earned: (r) => r.won >= 3,
  },
  {
    id: "commander",
    name: "Commander",
    description: "Won a Commander mission.",
    earned: (r) => r.wonCommander >= 1,
  },
  {
    id: "mission-giver",
    name: "Mission giver",
    description: "Posted a mission that found its winner.",
    earned: (r) => r.postedCompleted >= 1,
  },
]

/** A member's (or a sample person's) mission record. Without a database, "you" means this browser. */
export async function getMissionRecord(who: Who | null): Promise<MissionRecord> {
  const client = db()
  if (who?.handle || !client) {
    const missions = client ? sampleMissions() : await listMissions()
    const r = { ...EMPTY_RECORD }
    for (const m of missions) {
      if (m.status !== "completed") continue
      const winner = who?.handle ? m.winner?.handle === who.handle : false
      const poster = who?.handle ? m.poster.handle === who.handle : m.local
      if (winner) {
        r.won += 1
        r.pointsWon += m.reward
        if (m.difficulty === "commander") r.wonCommander += 1
      }
      if (poster) r.postedCompleted += 1
    }
    return r
  }
  if (!who?.memberId) return EMPTY_RECORD
  const { data, error } = await client.rpc("mission_record", {
    member: who.memberId,
  })
  fail(error)
  const row = (
    (data ?? []) as {
      won: number
      won_commander: number
      points_won: number
      posted_completed: number
    }[]
  )[0]
  return row
    ? {
        won: Number(row.won),
        wonCommander: Number(row.won_commander),
        pointsWon: Number(row.points_won),
        postedCompleted: Number(row.posted_completed),
      }
    : EMPTY_RECORD
}
