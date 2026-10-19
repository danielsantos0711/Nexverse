/*
 * Regex testing helpers: safe compilation, match listing with groups, and a small library of patterns that
 * come up when cleaning or extracting AI data. In the browser, matching runs in a worker that is stopped when a
 * pattern takes too long (catastrophic backtracking can stall a single match), so the page never freezes.
 */

export type RegexMatch = { index: number; end: number; text: string; groups: (string | undefined)[]; named: Record<string, string | undefined> }

export type RegexRun = { ok: true; matches: RegexMatch[]; groupNames: string[]; groupCount: number; capped: boolean; ms: number } | { ok: false; error: string }

export const MAX_MATCHES = 5000

export function compile(pattern: string, flags: string): { re: RegExp } | { error: string } {
  try {
    return { re: new RegExp(pattern, flags) }
  } catch (e) {
    return { error: (e as Error).message.replace(/^Invalid regular expression: /, "") }
  }
}

export function run(pattern: string, flags: string, text: string): RegexRun {
  if (!pattern) return { ok: true, matches: [], groupNames: [], groupCount: 0, capped: false, ms: 0 }
  // Always iterate with the global flag; without it the reader expects only the first match.
  const c = compile(pattern, flags.includes("g") ? flags : flags + "g")
  if ("error" in c) return { ok: false, error: c.error }
  const t0 = performance.now()
  const matches: RegexMatch[] = []
  let capped = false
  const names = new Set<string>()
  const groupCount = new RegExp(`${pattern}|`, flags.replace("g", "")).exec("")!.length - 1
  for (const m of text.matchAll(c.re)) {
    if (m.groups) Object.keys(m.groups).forEach((k) => names.add(k))
    matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1), named: { ...(m.groups ?? {}) } })
    if (!flags.includes("g")) break
    if (matches.length >= MAX_MATCHES || performance.now() - t0 > 250) {
      capped = true
      break
    }
  }
  return { ok: true, matches, groupNames: [...names], groupCount, capped, ms: performance.now() - t0 }
}

export function replacePreview(pattern: string, flags: string, text: string, replacement: string): string | null {
  const c = compile(pattern, flags)
  if ("error" in c || !pattern) return null
  return text.replace(c.re, replacement)
}

export type RegexOutcome = { result: RegexRun; replaced: string | null }

/** How long one pattern may run before the worker is stopped and the pattern reported as too slow. */
export const WORKER_TIMEOUT_MS = 1500

// The worker repeats run() and replacePreview() as plain source, since bundled functions cannot be sent to it.
const WORKER_SOURCE = `
const MAX = ${MAX_MATCHES};
const compile = (p, f) => { try { return { re: new RegExp(p, f) } } catch (e) { return { error: String(e.message).replace(/^Invalid regular expression: /, "") } } };
function run(pattern, flags, text) {
  if (!pattern) return { ok: true, matches: [], groupNames: [], groupCount: 0, capped: false, ms: 0 };
  const c = compile(pattern, flags.includes("g") ? flags : flags + "g");
  if (c.error) return { ok: false, error: c.error };
  const t0 = performance.now(); const matches = []; const names = new Set(); let capped = false;
  const groupCount = new RegExp(pattern + "|", flags.replace("g", "")).exec("").length - 1;
  for (const m of text.matchAll(c.re)) {
    if (m.groups) Object.keys(m.groups).forEach((k) => names.add(k));
    matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1), named: { ...(m.groups || {}) } });
    if (!flags.includes("g")) break;
    if (matches.length >= MAX) { capped = true; break }
  }
  return { ok: true, matches, groupNames: [...names], groupCount, capped, ms: performance.now() - t0 };
}
function replacePreview(pattern, flags, text, replacement) {
  const c = compile(pattern, flags);
  if (c.error || !pattern) return null;
  return text.replace(c.re, replacement);
}
self.onmessage = (e) => {
  const { id, pattern, flags, text, replacement, withReplace } = e.data;
  const result = run(pattern, flags, text);
  const replaced = withReplace || result.ok ? replacePreview(pattern, flags, text, replacement) : null;
  self.postMessage({ id, result, replaced });
};
`

const SLOW: RegexOutcome = {
  result: { ok: false, error: `This pattern took longer than ${WORKER_TIMEOUT_MS / 1000}s on this text and was stopped. Nested quantifiers such as (a+)+ often cause this.` },
  replaced: null,
}

/**
 * Runs patterns off the main thread. Each call cancels the previous one; a run that passes the timeout kills the
 * worker (a stuck regex cannot be interrupted any other way) and the next call starts a fresh one.
 */
export function createRegexRunner() {
  let worker: Worker | null = null
  let url: string | null = null
  let seq = 0
  let pending: { id: number; done: (o: RegexOutcome) => void; timer: ReturnType<typeof setTimeout> } | null = null

  const stop = () => {
    worker?.terminate()
    worker = null
  }
  const ensure = () => {
    if (worker) return worker
    url ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }))
    worker = new Worker(url)
    worker.onmessage = (e: MessageEvent<RegexOutcome & { id: number }>) => {
      if (!pending || e.data.id !== pending.id) return
      clearTimeout(pending.timer)
      const { done } = pending
      pending = null
      done({ result: e.data.result, replaced: e.data.replaced })
    }
    return worker
  }

  return {
    run(pattern: string, flags: string, text: string, replacement: string): Promise<RegexOutcome> {
      if (typeof Worker === "undefined") {
        const result = run(pattern, flags, text)
        return Promise.resolve({ result, replaced: replacement !== "" || result.ok ? replacePreview(pattern, flags, text, replacement) : null })
      }
      if (pending) {
        // The previous pattern may still be stuck; a fresh worker is cheaper than waiting for it.
        clearTimeout(pending.timer)
        pending = null
        stop()
      }
      const id = ++seq
      return new Promise((done) => {
        const timer = setTimeout(() => {
          pending = null
          stop()
          done(SLOW)
        }, WORKER_TIMEOUT_MS)
        pending = { id, done, timer }
        ensure().postMessage({ id, pattern, flags, text, replacement, withReplace: replacement !== "" })
      })
    },
    dispose() {
      if (pending) clearTimeout(pending.timer)
      pending = null
      stop()
      if (url) URL.revokeObjectURL(url)
      url = null
    },
  }
}

export type LibraryPattern = { id: string; label: string; pattern: string; flags: string; note: string; sample: string }

export const LIBRARY: LibraryPattern[] = [
  {
    id: "json-block",
    label: "JSON in a fenced code block",
    pattern: "```(?:json)?\\s*\\n(?<json>[\\s\\S]*?)\\n```",
    flags: "g",
    note: "Pulls JSON out of a model reply that wrapped it in a Markdown fence.",
    sample: 'Sure, here it is:\n```json\n{"label": "billing", "confidence": 0.92}\n```\nAnything else?',
  },
  {
    id: "think",
    label: "Reasoning tags",
    pattern: "<think>[\\s\\S]*?<\\/think>\\s*",
    flags: "g",
    note: "Matches <think>…</think> blocks so you can strip them before showing an answer.",
    sample: "<think>The user wants a short answer.</think>\nParis is the capital of France.",
  },
  {
    id: "email",
    label: "Email addresses",
    pattern: "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+",
    flags: "g",
    note: "For finding personal data before training or sharing a dataset. Practical, not RFC-complete.",
    sample: "Contact ana.silva+lab@example.org or ops@data.example.co.uk for access.",
  },
  {
    id: "url",
    label: "URLs",
    pattern: "https?:\\/\\/[^\\s<>\"')\\]]+",
    flags: "g",
    note: "Links in scraped text, stopping before closing brackets and quotes.",
    sample: "See https://arxiv.org/abs/2106.09685 (LoRA) and https://github.com/ggml-org/llama.cpp.",
  },
  {
    id: "phone",
    label: "Phone numbers (international)",
    pattern: "\\+?\\d{1,3}[\\s.-]?\\(?\\d{2,4}\\)?(?:[\\s.-]?\\d{2,4}){2,3}",
    flags: "g",
    note: "A loose match for PII scrubbing; expect some false positives on long numbers.",
    sample: "Call +351 912 345 678 or (020) 7946 0958.",
  },
  {
    id: "ipv4",
    label: "IPv4 addresses",
    pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b",
    flags: "g",
    note: "Valid dotted-quad addresses only (each part 0–255).",
    sample: "Requests from 192.168.1.20 and 10.0.0.255, not 999.1.1.1.",
  },
  {
    id: "secret",
    label: "Likely API keys",
    pattern: "\\b(?:sk|pk|rk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{16,}\\b",
    flags: "g",
    note: "Common key prefixes. Use it to catch secrets before a dataset or log is published.",
    sample: "token=ghp_ABCDEFGHIJKLMNOPQRSTUVWX12 and sk-proj-abcdefghijklmnopqrstu",
  },
  {
    id: "md-heading",
    label: "Markdown headings",
    pattern: "^(?<level>#{1,6})\\s+(?<title>.+)$",
    flags: "gm",
    note: "Each heading with its level, for building a document outline or splitting for RAG.",
    sample: "# Guide\nIntro text\n## Install\nSteps\n### On macOS",
  },
  {
    id: "citation",
    label: "Numbered citations",
    pattern: "\\[(?<n>\\d+(?:\\s*[,–-]\\s*\\d+)*)\\]",
    flags: "g",
    note: "Finds [1], [2, 3] and [4–6] markers in generated answers.",
    sample: "Transformers use attention [1]. Later work cut memory use [2, 3] and extended context [4–6].",
  },
  {
    id: "role-turn",
    label: "Chat transcript turns",
    pattern: "^(?<role>User|Assistant|System):\\s*(?<text>.*)$",
    flags: "gm",
    note: "Splits a plain-text transcript into roles and messages.",
    sample: "System: Be brief.\nUser: What is RAG?\nAssistant: Retrieval-augmented generation.",
  },
]
