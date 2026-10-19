/*
 * Context window budgeting: everything a request carries has to fit in the model's window together with the
 * answer. used = system + tools + documents + history; the output reservation and a safety margin come off
 * the top. The margin covers chat-template tokens and tokenizer differences between estimate and reality.
 */

export type ContextDoc = { id: string; name: string; tokens: number }

export type ContextInput = {
  window: number
  system: number
  tools: number
  docs: ContextDoc[]
  turns: number
  perTurn: number
  output: number
  /** Percent of the window kept free, 0..50. */
  margin: number
}

export const DEFAULT_CONTEXT: ContextInput = {
  window: 128000,
  system: 800,
  tools: 1200,
  docs: [
    { id: "d1", name: "Long document", tokens: 42000 },
    { id: "d2", name: "Retrieved chunks", tokens: 6000 },
  ],
  turns: 12,
  perTurn: 350,
  output: 4000,
  margin: 5,
}

/** Round numbers for the window, plus whatever the site's AI models report. */
export const WINDOW_PRESETS = [8192, 32768, 128000, 200000, 1000000]

export type ContextPart = { id: string; label: string; tokens: number; color: string }

export type ContextResult = {
  parts: ContextPart[]
  used: number
  budget: number
  free: number
  overflow: number
  fits: boolean
  /** How many more turns of history fit with everything else unchanged. */
  turnsLeft: number
}

const DOC_COLORS = ["#8fb4ff", "#a9c2ff", "#b7a6ff", "#d3b4ff", "#9fe3cf", "#7fd6e0"]

export function computeContext(i: ContextInput): ContextResult {
  const marginTokens = Math.round((i.window * Math.max(0, Math.min(50, i.margin))) / 100)
  const parts: ContextPart[] = [
    { id: "system", label: "System prompt", tokens: i.system, color: "#e9c79a" },
    { id: "tools", label: "Tools and schemas", tokens: i.tools, color: "#ffc58a" },
    ...i.docs.map((d, k) => ({ id: `doc-${d.id}`, label: d.name || `Document ${k + 1}`, tokens: d.tokens, color: DOC_COLORS[k % DOC_COLORS.length] })),
    { id: "history", label: `History (${i.turns} turns)`, tokens: i.turns * i.perTurn, color: "#c4e38f" },
    { id: "output", label: "Reserved for the answer", tokens: i.output, color: "#7fe0b0" },
    { id: "margin", label: `Safety margin (${i.margin}%)`, tokens: marginTokens, color: "#5d6577" },
  ].map((p) => ({ ...p, tokens: Math.max(0, Math.round(p.tokens)) }))
  const used = parts.reduce((n, p) => n + p.tokens, 0)
  const free = i.window - used
  return {
    parts,
    used,
    budget: i.window,
    free: Math.max(0, free),
    overflow: Math.max(0, -free),
    fits: free >= 0,
    turnsLeft: i.perTurn > 0 ? Math.max(0, Math.floor(free / i.perTurn)) : 0,
  }
}
