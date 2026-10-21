/*
 * The models the router can use, and the default order it tries them in for each job. Plain data with no
 * secrets and no network, so the admin page (client) and the router (server) read the same list.
 *
 * Checked on 21 Oct 2026 against each provider's own catalogue:
 *   Gemini     https://ai.google.dev/gemini-api/docs/pricing (free tier column), /docs/google-search
 *   Groq       https://console.groq.com/docs/models, /docs/rate-limits
 *   Cerebras   https://inference-docs.cerebras.ai/models/overview
 *   OpenRouter https://openrouter.ai/api/v1/models (":free" ids, context, supported_parameters)
 *   Mistral    https://docs.mistral.ai/getting-started/models/models_overview/
 *   Cloudflare https://developers.cloudflare.com/workers-ai/models/
 *   Anthropic  https://platform.claude.com/docs/en/about-claude/models (premium slot only)
 * Free catalogues change often. The router skips a model the live catalogue no longer lists (catalog.ts), moves
 * on when a provider answers 404, and an admin can reorder, switch off or add models in /admin/ai without a deploy.
 *
 * Quality first: each job's chain starts with the strongest free model for that kind of work (reasoning models
 * for research, fact checks and final writing; fast models for triage and short rewrites), and every chain
 * crosses providers so one provider being busy or at its cap never stops a job.
 */

export type AiJob =
  | "news"
  | "summary"
  | "moderation"
  | "rewrite"
  | "translate"
  | "code"
  | "playground"
  // Round 11: the newsroom engine
  | "research"
  | "triage"
  | "factcheck"
  | "editor"
  | "vision"
  // Round 11: member-facing AI moments
  | "answer"
  | "explain"
  | "draft"

export type ProviderId = "gemini" | "groq" | "cerebras" | "openrouter" | "mistral" | "cloudflare" | "anthropic" | "openrouterpaid"

/**
 * How a model returns JSON: "schema" enforces our JSON Schema natively, "object" guarantees valid JSON but
 * not its shape, "prompt" relies on the instructions, a tolerant parser and one repair pass. The router
 * validates every answer either way.
 */
export type JsonMode = "schema" | "object" | "prompt"

/** How a model is told how hard to think. */
export type ReasoningKind = "gemini3" | "gemini25" | "gpt-oss" | "openrouter" | "anthropic"

/** 1: the strongest available (reasoning, long documents). 2: strong all-rounder. 3: fast and light. */
export type Tier = 1 | 2 | 3

export type Effort = "low" | "medium" | "high"

export type ModelInfo = {
  /** "<provider>:<model>", unique across providers. */
  id: string
  provider: ProviderId
  /** The id the provider's API expects. */
  model: string
  label: string
  /** Input context in tokens, from the provider's page. */
  context: number
  notes: string
  json: JsonMode
  /** Offered in the Lab playground. */
  playground: boolean
  tier: Tier
  reasoning?: ReasoningKind
  /** Reads images (the "vision" job). */
  vision?: boolean
  /** Can ground its answer in a live web search run by the provider (Gemini: Google Search grounding). */
  search?: boolean
  /** Paid per token. Only ever used when an admin puts it in a job's premium slot and its key is set. */
  premium?: boolean
  /** US dollars per million tokens, input and output, for premium models. */
  price?: { in: number; out: number }
}

export type JobInfo = {
  id: AiJob
  label: string
  blurb: string
  /** How hard the model should think. High costs time; it is worth it for research, fact checks and writing. */
  effort: Effort
  /** Prefer stronger (best) or faster (fast) models when the admin has not reordered the chain. */
  quality: "best" | "balanced" | "fast"
  /** Who calls it. */
  used: string
}

export const JOBS: JobInfo[] = [
  { id: "answer", label: "Search answers", blurb: "Answers questions in the command menu from Nexverse content, with sources.", effort: "low", quality: "balanced", used: "Command menu" },
  { id: "summary", label: "Summaries", blurb: "Thread, room and repository summaries, long inputs.", effort: "low", quality: "best", used: "Forum, chat, code" },
  { id: "explain", label: "Explanations", blurb: "Explains Lab results and model or dataset pages in plain words.", effort: "medium", quality: "best", used: "Lab, projects" },
  { id: "draft", label: "Drafting", blurb: "Outlines, continues and expands drafts in the editors.", effort: "low", quality: "best", used: "Editors" },
  { id: "rewrite", label: "Rewrite and titles", blurb: "Clearer, shorter, friendlier, titles and tags.", effort: "low", quality: "fast", used: "Composers" },
  { id: "translate", label: "Translation", blurb: "Translates posts and chat messages into the site languages.", effort: "low", quality: "balanced", used: "Forum, chat" },
  { id: "code", label: "Code", blurb: "Explains files and summarises repositories.", effort: "medium", quality: "best", used: "Code" },
  { id: "moderation", label: "Moderation hints", blurb: "Triage of reported content for the staff queue.", effort: "low", quality: "fast", used: "Reports" },
  { id: "news", label: "News drafts", blurb: "Writes news items from sources.", effort: "medium", quality: "best", used: "Newsroom, share form" },
  { id: "research", label: "Research", blurb: "Newsroom: investigates leads, reads sources, can search the web live.", effort: "high", quality: "best", used: "Newsroom engine" },
  { id: "triage", label: "Triage", blurb: "Newsroom: fast first pass over many signals, scores and classifies.", effort: "low", quality: "fast", used: "Newsroom engine" },
  { id: "factcheck", label: "Fact checks", blurb: "Newsroom: checks claims against sources, labels evidence strength.", effort: "high", quality: "best", used: "Newsroom engine" },
  { id: "editor", label: "Editor", blurb: "Newsroom: editorial decisions and the final article. The strongest writer.", effort: "high", quality: "best", used: "Newsroom engine" },
  { id: "vision", label: "Vision", blurb: "Reads images: picks covers, checks screenshots and charts.", effort: "low", quality: "best", used: "Newsroom engine" },
  { id: "playground", label: "Lab playground", blurb: "The models members can pick from in the Lab.", effort: "low", quality: "balanced", used: "Lab" },
]

export const PROVIDERS: {
  id: ProviderId
  label: string
  env: string[]
  /** Where an admin creates the key. */
  signup: string
  /** What the free tier gives (or what premium costs), in plain words, with the page it comes from. */
  free: string
  source: string
  /** Our default daily request cap, kept below the free allowance. */
  cap: number
  /** Paid per token; off unless its key is set and an admin picks one of its models for a job. */
  premium?: boolean
}[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    env: ["GEMINI_API_KEY"],
    signup: "https://aistudio.google.com/apikey",
    free: "Gemini 3.8 Flash, 3.6 Flash, 2.5 Pro and the Flash-Lite models are free on the free tier, with Google Search grounding (5,000 searches a month on Gemini 3). Daily limits per model are shown in AI Studio. Free-tier prompts may be used by Google to improve its products.",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    cap: 300,
  },
  {
    id: "groq",
    label: "Groq",
    env: ["GROQ_API_KEY"],
    signup: "https://console.groq.com/keys",
    free: "Free plan: 30 requests a minute and 1,000 a day per model, very fast answers.",
    source: "https://console.groq.com/docs/rate-limits",
    cap: 400,
  },
  {
    id: "cerebras",
    label: "Cerebras",
    env: ["CEREBRAS_API_KEY"],
    signup: "https://cloud.cerebras.ai/",
    free: "Free tier with GPT-OSS 120B and Qwen 3.8 27B (64K context on the free tier), among the fastest answers anywhere. Limits are shown in the Cerebras console.",
    source: "https://inference-docs.cerebras.ai/models/overview",
    cap: 600,
  },
  {
    id: "openrouter",
    label: "OpenRouter (free models)",
    env: ["OPENROUTER_API_KEY"],
    signup: "https://openrouter.ai/settings/keys",
    free: "Models ending in :free, including NVIDIA Nemotron 3 Ultra and Thinking Machines Inkling: 20 requests a minute and 50 a day (1,000 a day once 10 credits were ever bought).",
    source: "https://openrouter.ai/docs/api/reference/limits",
    cap: 45,
  },
  {
    id: "mistral",
    label: "Mistral",
    env: ["MISTRAL_API_KEY"],
    signup: "https://console.mistral.ai/api-keys",
    free: "Free Experiment plan for evaluation and prototyping, with Mistral Large 4, Medium and Small 4. Limits are shown in the Mistral console; the free plan may use requests for training.",
    source: "https://help.mistral.ai/en/articles/392924-how-do-api-rate-limits-work-and-how-can-i-increase-them",
    cap: 200,
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    env: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    signup: "https://dash.cloudflare.com/profile/api-tokens",
    free: "10,000 Neurons a day free, reset at 00:00 UTC. About 70 to 400 short answers a day depending on the model.",
    source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
    cap: 80,
  },
  {
    id: "anthropic",
    label: "Anthropic (premium, paid)",
    env: ["ANTHROPIC_API_KEY"],
    signup: "https://platform.claude.com/settings/keys",
    free: "Paid per token, never used by default. Claude Opus 5.5 costs $4 in and $20 out per million tokens, Sonnet 5.5 $2 and $10, Haiku 5.5 $0.10 and $0.50. Stops at the monthly budget set below.",
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
    cap: 2000,
    premium: true,
  },
  {
    id: "openrouterpaid",
    label: "OpenRouter (premium, paid)",
    env: ["OPENROUTER_PREMIUM_API_KEY"],
    signup: "https://openrouter.ai/settings/keys",
    free: "Paid OpenRouter models, never used by default. A separate variable from the free key on purpose, so paid models are a deliberate choice. Prices come from OpenRouter's public catalogue.",
    source: "https://openrouter.ai/api/v1/models",
    cap: 2000,
    premium: true,
  },
]

const m = (x: Omit<ModelInfo, "id">): ModelInfo => ({ ...x, id: `${x.provider}:${x.model}` })

export const MODELS: ModelInfo[] = [
  // Google Gemini: the best free quality, a million-token context, images and live Google Search grounding.
  m({ provider: "gemini", model: "gemini-3.8-flash", label: "Gemini 3.8 Flash", context: 1_048_576, notes: "Google's newest free model. Strong reasoning and writing, reads images, can search the web live.", json: "schema", playground: true, tier: 1, reasoning: "gemini3", vision: true, search: true }),
  m({ provider: "gemini", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", context: 1_048_576, notes: "Google's free Pro model. Deliberate, careful reasoning; good for fact checks.", json: "schema", playground: true, tier: 1, reasoning: "gemini25", vision: true, search: true }),
  m({ provider: "gemini", model: "gemini-3.6-flash", label: "Gemini 3.6 Flash", context: 1_048_576, notes: "The previous free Flash. A strong fallback with the same features.", json: "schema", playground: true, tier: 2, reasoning: "gemini3", vision: true, search: true }),
  m({ provider: "gemini", model: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", context: 1_048_576, notes: "Google's fastest free model. Good for short tasks and triage.", json: "schema", playground: true, tier: 3, reasoning: "gemini3", vision: true, search: true }),
  m({ provider: "gemini", model: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", context: 1_048_576, notes: "An older light model with its own free allowance.", json: "schema", playground: false, tier: 3, reasoning: "gemini3", vision: true }),
  // Groq: open models at very high speed.
  m({ provider: "groq", model: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Groq)", context: 131_072, notes: "OpenAI's open-weight 120B reasoning model on Groq. Very fast, strict JSON.", json: "schema", playground: true, tier: 1, reasoning: "gpt-oss" }),
  m({ provider: "groq", model: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B (Groq)", context: 131_072, notes: "Alibaba's open model on Groq. Good at code and many languages. Preview model.", json: "schema", playground: true, tier: 2 }),
  m({ provider: "groq", model: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", context: 131_072, notes: "Meta's 70B model on Groq. Dependable all-rounder.", json: "object", playground: true, tier: 2 }),
  m({ provider: "groq", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B (Groq)", context: 131_072, notes: "Smaller open-weight reasoning model. The quickest answers.", json: "schema", playground: true, tier: 3, reasoning: "gpt-oss" }),
  m({ provider: "groq", model: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Groq)", context: 131_072, notes: "Tiny and instant. Classification and triage only.", json: "object", playground: false, tier: 3 }),
  m({ provider: "groq", model: "openai/gpt-oss-safeguard-20b", label: "GPT-OSS Safeguard 20B (Groq)", context: 131_072, notes: "A safety model that reads a written policy and classifies content. Moderation only.", json: "object", playground: false, tier: 2, reasoning: "gpt-oss" }),
  // Cerebras: the same open models, faster still, with its own free allowance.
  m({ provider: "cerebras", model: "gpt-oss-120b", label: "GPT-OSS 120B (Cerebras)", context: 65_536, notes: "OpenAI's open-weight reasoning model on Cerebras hardware. Extremely fast.", json: "schema", playground: true, tier: 1, reasoning: "gpt-oss" }),
  m({ provider: "cerebras", model: "qwen-3.8-27b", label: "Qwen 3.8 27B (Cerebras)", context: 65_536, notes: "Qwen on Cerebras. Fast, multilingual.", json: "schema", playground: true, tier: 2 }),
  // OpenRouter ":free": frontier open models with a small daily allowance, kept for the hardest work.
  m({ provider: "openrouter", model: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra (OpenRouter)", context: 1_000_000, notes: "NVIDIA's open 550B frontier reasoning model, free on OpenRouter.", json: "prompt", playground: true, tier: 1, reasoning: "openrouter" }),
  m({ provider: "openrouter", model: "thinkingmachines/inkling:free", label: "Inkling (OpenRouter)", context: 1_048_576, notes: "Thinking Machines' open 975B multimodal model, free on OpenRouter. Reads images.", json: "prompt", playground: true, tier: 1, reasoning: "openrouter", vision: true }),
  m({ provider: "openrouter", model: "minimax/minimax-m3.1-flash:free", label: "MiniMax M3.1 Flash (OpenRouter)", context: 1_000_000, notes: "MiniMax's multimodal model, free on OpenRouter. Reads images.", json: "object", playground: true, tier: 2, reasoning: "openrouter", vision: true }),
  m({ provider: "openrouter", model: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 Super VL (OpenRouter)", context: 1_000_000, notes: "NVIDIA's open vision-language model with structured output, free on OpenRouter.", json: "schema", playground: true, tier: 2, reasoning: "openrouter", vision: true }),
  m({ provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B (OpenRouter)", context: 262_144, notes: "NVIDIA's open 120B model, free on OpenRouter. Structured output supported.", json: "schema", playground: true, tier: 2 }),
  m({ provider: "openrouter", model: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (OpenRouter)", context: 262_144, notes: "Google's open Gemma 4, free on OpenRouter. Good across languages, reads images.", json: "object", playground: true, tier: 2, vision: true }),
  m({ provider: "openrouter", model: "poolside/laguna-s-2.1:free", label: "Laguna S 2.1 (OpenRouter)", context: 262_144, notes: "Poolside's coding model, free on OpenRouter.", json: "prompt", playground: true, tier: 2 }),
  m({ provider: "openrouter", model: "cohere/north-mini-code:free", label: "North Mini Code (OpenRouter)", context: 256_000, notes: "Cohere's small code model, free on OpenRouter.", json: "prompt", playground: true, tier: 3 }),
  m({ provider: "openrouter", model: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning (OpenRouter)", context: 1_000_000, notes: "NVIDIA's fast 30B model for high-volume work, free on OpenRouter.", json: "prompt", playground: false, tier: 3 }),
  m({ provider: "openrouter", model: "nvidia/nemotron-3.5-content-safety:free", label: "Nemotron 3.5 Content Safety (OpenRouter)", context: 128_000, notes: "A guardrail model for text and images. Moderation only.", json: "prompt", playground: false, tier: 3 }),
  // Mistral: a European reserve.
  m({ provider: "mistral", model: "mistral-large-latest", label: "Mistral Large", context: 256_000, notes: "Mistral's open flagship (currently Large 4). Strong writing, especially in European languages.", json: "object", playground: true, tier: 1 }),
  m({ provider: "mistral", model: "mistral-medium-latest", label: "Mistral Medium", context: 256_000, notes: "Mistral's mid-size model.", json: "object", playground: true, tier: 2 }),
  m({ provider: "mistral", model: "mistral-small-latest", label: "Mistral Small", context: 256_000, notes: "Mistral's open small model (currently Small 4).", json: "object", playground: true, tier: 3 }),
  // Cloudflare Workers AI: a reserve paid for in daily free Neurons.
  m({ provider: "cloudflare", model: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B (Cloudflare)", context: 128_000, notes: "The open-weight model on Cloudflare's free daily allowance.", json: "prompt", playground: true, tier: 2, reasoning: "gpt-oss" }),
  m({ provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B (Cloudflare)", context: 24_000, notes: "Meta's Llama 3.3 on Cloudflare.", json: "prompt", playground: true, tier: 3 }),
  m({ provider: "cloudflare", model: "@cf/qwen/qwen2.5-coder-32b-instruct", label: "Qwen 2.5 Coder 32B (Cloudflare)", context: 32_768, notes: "A code-tuned model on Cloudflare.", json: "prompt", playground: true, tier: 3 }),
  // Premium (paid, opt-in per job, bounded by the monthly budget).
  m({ provider: "anthropic", model: "claude-opus-5-5", label: "Claude Opus 5.5", context: 1_000_000, notes: "Anthropic's flagship. The strongest research, reasoning and writing here.", json: "schema", playground: false, tier: 1, reasoning: "anthropic", vision: true, premium: true, price: { in: 4, out: 20 } }),
  m({ provider: "anthropic", model: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", context: 1_000_000, notes: "Fast and very capable, half the price of Opus.", json: "schema", playground: false, tier: 1, reasoning: "anthropic", vision: true, premium: true, price: { in: 2, out: 10 } }),
  m({ provider: "anthropic", model: "claude-haiku-5-5", label: "Claude Haiku 5.5", context: 1_000_000, notes: "Anthropic's small model. Cheap, good for triage at scale.", json: "schema", playground: false, tier: 2, reasoning: "anthropic", vision: true, premium: true, price: { in: 0.1, out: 0.5 } }),
  m({ provider: "openrouterpaid", model: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5 (OpenRouter)", context: 1_000_000, notes: "Claude Opus 5.5 billed through OpenRouter.", json: "schema", playground: false, tier: 1, reasoning: "openrouter", vision: true, premium: true, price: { in: 4, out: 20 } }),
  m({ provider: "openrouterpaid", model: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol (OpenRouter)", context: 1_050_000, notes: "OpenAI's current flagship through OpenRouter.", json: "schema", playground: false, tier: 1, reasoning: "openrouter", vision: true, premium: true, price: { in: 2, out: 10 } }),
  m({ provider: "openrouterpaid", model: "google/gemini-4-argon", label: "Gemini 4 Argon (OpenRouter)", context: 1_048_576, notes: "Google's paid flagship through OpenRouter.", json: "schema", playground: false, tier: 1, reasoning: "openrouter", vision: true, premium: true, price: { in: 2, out: 10 } }),
  m({ provider: "openrouterpaid", model: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (OpenRouter)", context: 1_048_576, notes: "Very cheap and capable. Good for triage at scale.", json: "object", playground: false, tier: 2, reasoning: "openrouter", premium: true, price: { in: 0.06, out: 0.12 } }),
]

const FREE_PLAYGROUND = MODELS.filter((x) => x.playground && !x.premium).map((x) => x.id)

const G38 = "gemini:gemini-3.8-flash"
const G25P = "gemini:gemini-2.5-pro"
const G36 = "gemini:gemini-3.6-flash"
const GLITE = "gemini:gemini-3.5-flash-lite"
const GLITE31 = "gemini:gemini-3.1-flash-lite"
const OSS120 = "groq:openai/gpt-oss-120b"
const OSS20 = "groq:openai/gpt-oss-20b"
const QWEN = "groq:qwen/qwen3.8-27b"
const LLAMA70 = "groq:llama-3.3-70b-versatile"
const LLAMA8 = "groq:llama-3.1-8b-instant"
const CB120 = "cerebras:gpt-oss-120b"
const CBQWEN = "cerebras:qwen-3.8-27b"
const ULTRA = "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free"
const INKLING = "openrouter:thinkingmachines/inkling:free"
const MINIMAX = "openrouter:minimax/minimax-m3.1-flash:free"
const SUPERVL = "openrouter:nvidia/nemotron-3.5-super-vl:free"
const SUPER = "openrouter:nvidia/nemotron-3-super-120b-a12b:free"
const GEMMA = "openrouter:google/gemma-4-31b-it:free"
const LAGUNA = "openrouter:poolside/laguna-s-2.1:free"
const NORTH = "openrouter:cohere/north-mini-code:free"
const LIGHTNING = "openrouter:nvidia/nemotron-3.5-lightning:free"
const SAFETY = "openrouter:nvidia/nemotron-3.5-content-safety:free"
const MLARGE = "mistral:mistral-large-latest"
const MMED = "mistral:mistral-medium-latest"
const MSMALL = "mistral:mistral-small-latest"
const CFOSS = "cloudflare:@cf/openai/gpt-oss-120b"
const CFLLAMA = "cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast"
const CFCODER = "cloudflare:@cf/qwen/qwen2.5-coder-32b-instruct"

/** The order the router tries free models in, per job, before any admin override. */
export const DEFAULT_CHAINS: Record<AiJob, string[]> = {
  answer: [OSS120, CB120, G38, G36, MMED, LLAMA70, GLITE, CFOSS],
  summary: [G38, OSS120, CB120, G36, MLARGE, SUPER, GLITE, CFOSS],
  explain: [G38, OSS120, CB120, G36, MLARGE, SUPER, GLITE, CFOSS],
  draft: [G38, OSS120, MLARGE, G36, CB120, SUPER, MMED, CFOSS],
  rewrite: [OSS120, CB120, G38, QWEN, G36, MMED, CFLLAMA],
  translate: [G38, OSS120, MLARGE, G36, GEMMA, CBQWEN, MSMALL, CFOSS],
  code: [G38, OSS120, CB120, LAGUNA, QWEN, ULTRA, NORTH, CFCODER],
  moderation: ["groq:openai/gpt-oss-safeguard-20b", GLITE, SAFETY, OSS20, MSMALL, CFLLAMA],
  news: [G38, G25P, ULTRA, OSS120, CB120, MLARGE, G36, SUPER, CFOSS],
  research: [G38, G25P, G36, ULTRA, OSS120, CB120, MINIMAX, MLARGE],
  triage: [OSS20, CBQWEN, GLITE, LLAMA8, GLITE31, LIGHTNING, MSMALL],
  factcheck: [G25P, G38, ULTRA, OSS120, CB120, MLARGE, G36],
  editor: [G38, G25P, ULTRA, INKLING, MLARGE, OSS120, G36, CB120],
  vision: [G38, G36, SUPERVL, INKLING, MINIMAX, GEMMA, GLITE],
  // For the playground the list is the set members may choose from; the member's pick is the only model tried.
  playground: FREE_PLAYGROUND,
}

/** Requests per member per day, by site role. Roles not listed use "member" (or "moderator" for staff). */
export const DEFAULT_QUOTAS: Record<string, number> = { member: 40, contributor: 80, editor: 200, moderator: 200, admin: 400 }

/** How long a cached answer is reused, per job, in seconds. 0 means never cached. */
export const CACHE_TTL: Record<AiJob, number> = {
  news: 3 * 86_400,
  summary: 7 * 86_400,
  moderation: 7 * 86_400,
  rewrite: 86_400,
  translate: 7 * 86_400,
  code: 7 * 86_400,
  playground: 0,
  research: 6 * 3_600,
  triage: 86_400,
  factcheck: 86_400,
  editor: 86_400,
  vision: 7 * 86_400,
  answer: 3_600,
  explain: 7 * 86_400,
  draft: 0,
}

/** Extra output tokens a thinking model gets on top of the answer budget, by effort. */
export const THINKING_HEADROOM: Record<Effort, number> = { low: 2_048, medium: 4_096, high: 8_192 }

const BY_ID = new Map(MODELS.map((x) => [x.id, x]))
export const modelById = (id: string) => BY_ID.get(id)
export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id)
export const jobById = (id: string) => JOBS.find((j) => j.id === id)
export const isJob = (v: unknown): v is AiJob => typeof v === "string" && JOBS.some((j) => j.id === v)
export const isPremiumProvider = (p: ProviderId) => p === "anthropic" || p === "openrouterpaid"

/** What a call would cost on a premium model, in US dollars. 0 for free models. */
export function estimateCost(model: Pick<ModelInfo, "price"> | undefined, tokensIn: number, tokensOut: number): number {
  if (!model?.price) return 0
  return (tokensIn * model.price.in + tokensOut * model.price.out) / 1_000_000
}
