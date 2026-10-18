import {
  ARTIFACT_KINDS,
  artifacts,
  orbits,
  threads,
  type Artifact,
  type Orbit,
  type Thread,
} from "@/lib/data"

const STOP = new Set(
  "a an and are as at be but by can do does for from how i in is it my of on or should the this to what when where which who why with you your".split(
    " "
  )
)

function words(text: string) {
  return (text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length > 1 && !STOP.has(w)
  )
}

/** Scores how well a query matches a text; shared prefixes count so "tune" finds "tuning". */
function score(queryWords: string[], text: string) {
  const hay = words(text)
  let total = 0
  for (const q of queryWords) {
    let best = 0
    for (const h of hay) {
      if (h === q) best = Math.max(best, 3)
      else if (q.length >= 4 && h.length >= 4 && (h.startsWith(q.slice(0, 4)) || q.startsWith(h.slice(0, 4))))
        best = Math.max(best, 1.5)
    }
    total += best
  }
  return total
}

const threadText = (t: Thread) =>
  [t.title, t.en?.title, t.body, t.en?.body, t.tags.join(" "), t.orbit.replace("-", " ")].join(" ")
const artifactText = (a: Artifact) => {
  const origin = a.fromThread ? threads.find((t) => t.id === a.fromThread) : undefined
  return [a.name.replace(/-/g, " "), a.summary, a.description, ARTIFACT_KINDS[a.kind].label, origin?.en?.title ?? origin?.title].join(" ")
}
const orbitText = (o: Orbit) => [o.name, o.blurb, o.about].join(" ")

export type Routed = {
  orbit?: { item: Orbit; score: number }
  thread?: { item: Thread; score: number }
  artifact?: { item: Artifact; score: number }
}

function top<T>(items: T[], text: (x: T) => string, q: string[]) {
  let best: { item: T; score: number } | undefined
  for (const item of items) {
    const s = score(q, text(item))
    if (s > 0 && (!best || s > best.score)) best = { item, score: s }
  }
  return best
}

/** Finds the orbit, thread and artifact that best fit a question. */
export function route(query: string): Routed {
  const q = words(query)
  if (q.length === 0) return {}
  return {
    orbit: top(orbits, orbitText, q),
    thread: top(threads, threadText, q),
    artifact: top(artifacts, artifactText, q),
  }
}

export function searchThreads(query: string) {
  const q = words(query)
  if (q.length === 0) return threads
  return threads
    .map((t) => ({ t, s: score(q, threadText(t)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t)
}

export function searchArtifacts(query: string) {
  const q = words(query)
  if (q.length === 0) return artifacts
  return artifacts
    .map((a) => ({ a, s: score(q, artifactText(a)) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a)
}
