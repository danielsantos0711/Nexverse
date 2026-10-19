/*
 * The free models the router can use, and the default order it tries them in for each job. Plain data with no
 * secrets and no network, so the admin page (client) and the router (server) read the same list.
 *
 * Every id, context size and limit here was checked on the provider's official page on 19 Oct 2026:
 *   Gemini     https://ai.google.dev/gemini-api/docs/pricing (free tier column), /docs/models/<id>
 *   Groq       https://console.groq.com/docs/models, /docs/rate-limits (Free Plan tab), /docs/structured-outputs
 *   OpenRouter https://openrouter.ai/api/v1/models (":free" ids), /docs/api/reference/limits
 *   Cloudflare https://developers.cloudflare.com/workers-ai/platform/pricing/, /models/<id>, /features/json-mode/
 *   Mistral    https://docs.mistral.ai/getting-started/models/models_overview/
 * Free catalogues change often. When a model disappears the provider answers 404, the router moves on to the
 * next one, and an admin can reorder or switch models off in /admin/ai without a deploy.
 */

export type AiJob = "news" | "summary" | "moderation" | "rewrite" | "translate" | "code" | "playground"
export type ProviderId = "gemini" | "groq" | "openrouter" | "cloudflare" | "mistral"

/**
 * How a model returns JSON: "schema" enforces our JSON Schema natively, "object" guarantees valid JSON but
 * not its shape, "prompt" relies on the instructions and a tolerant parser. The router validates every
 * answer either way.
 */
export type JsonMode = "schema" | "object" | "prompt"

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
  /** Gemini 3 and gpt-oss think before answering; we ask for the lightest level that still helps. */
  reasoning?: "gemini3" | "gpt-oss"
}

export const JOBS: { id: AiJob; label: string; blurb: string }[] = [
  { id: "news", label: "News drafts", blurb: "Writes news items from sources. Needs the strongest writer." },
  { id: "summary", label: "Summaries", blurb: "Thread and repository summaries, long inputs." },
  { id: "moderation", label: "Moderation hints", blurb: "Triage of reported content for the staff queue." },
  { id: "rewrite", label: "Rewrite and titles", blurb: "Clearer, shorter, friendlier, and title ideas." },
  { id: "translate", label: "Translation", blurb: "Translates posts into the site languages." },
  { id: "code", label: "Code", blurb: "Explains files and helps with code in repositories." },
  { id: "playground", label: "Lab playground", blurb: "The models members can pick from in the Lab." },
]

export const PROVIDERS: {
  id: ProviderId
  label: string
  env: string[]
  /** Where an admin creates the free key. */
  signup: string
  /** What the free tier gives, in plain words, with the page it comes from. */
  free: string
  source: string
  /** Our default daily request cap, kept below the free allowance. */
  cap: number
}[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    env: ["GEMINI_API_KEY"],
    signup: "https://aistudio.google.com/apikey",
    free: "Gemini 3.8 Flash and 3.5 Flash-Lite are free of charge on the free tier. Per-model daily limits are shown in AI Studio, not published. Free-tier prompts may be used by Google to improve its products.",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    cap: 300,
  },
  {
    id: "groq",
    label: "Groq",
    env: ["GROQ_API_KEY"],
    signup: "https://console.groq.com/keys",
    free: "Free plan: 30 requests a minute, 1,000 a day and 200K tokens a day per model (gpt-oss-safeguard: 3 a minute).",
    source: "https://console.groq.com/docs/rate-limits",
    cap: 400,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    env: ["OPENROUTER_API_KEY"],
    signup: "https://openrouter.ai/settings/keys",
    free: "Models ending in :free: 20 requests a minute and 50 a day (1,000 a day once 10 credits were ever bought).",
    source: "https://openrouter.ai/docs/api/reference/limits",
    cap: 45,
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
    id: "mistral",
    label: "Mistral",
    env: ["MISTRAL_API_KEY"],
    signup: "https://console.mistral.ai/api-keys",
    free: "Free Experiment plan for evaluation and prototyping. Limits are shown in the Mistral console, not published; the free plan may use requests for training.",
    source: "https://help.mistral.ai/en/articles/392924-how-do-api-rate-limits-work-and-how-can-i-increase-them",
    cap: 200,
  },
]

export const MODELS: ModelInfo[] = [
  // Google Gemini: best free quality and a million-token context, so it leads news and summaries.
  {
    id: "gemini:gemini-3.8-flash",
    provider: "gemini",
    model: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    context: 1_048_576,
    notes: "Google's newest free Flash model. Strong writing, 1M-token context.",
    json: "schema",
    playground: true,
    reasoning: "gemini3",
  },
  {
    id: "gemini:gemini-3.5-flash-lite",
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    context: 1_048_576,
    notes: "Google's fastest free model. Good for short tasks.",
    json: "schema",
    playground: true,
    reasoning: "gemini3",
  },
  // Groq: very fast inference, so it leads rewrites, titles, translation and moderation.
  {
    id: "groq:openai/gpt-oss-120b",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Groq)",
    context: 131_072,
    notes: "OpenAI's open-weight 120B model on Groq. Very fast, strict JSON.",
    json: "schema",
    playground: true,
    reasoning: "gpt-oss",
  },
  {
    id: "groq:qwen/qwen3.8-27b",
    provider: "groq",
    model: "qwen/qwen3.8-27b",
    label: "Qwen 3.8 27B (Groq)",
    context: 131_072,
    notes: "Alibaba's open model on Groq. Fast, good at code and many languages. Preview model.",
    json: "schema",
    playground: true,
  },
  {
    id: "groq:openai/gpt-oss-20b",
    provider: "groq",
    model: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B (Groq)",
    context: 131_072,
    notes: "Smaller open-weight model on Groq. The quickest answers.",
    json: "schema",
    playground: true,
    reasoning: "gpt-oss",
  },
  {
    id: "groq:openai/gpt-oss-safeguard-20b",
    provider: "groq",
    model: "openai/gpt-oss-safeguard-20b",
    label: "GPT-OSS Safeguard 20B (Groq)",
    context: 131_072,
    notes: "A safety model that reads a written policy and classifies content. Moderation only.",
    json: "object",
    playground: false,
    reasoning: "gpt-oss",
  },
  // OpenRouter ":free" models: a reserve with a small daily allowance.
  {
    id: "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    provider: "openrouter",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B (OpenRouter)",
    context: 262_144,
    notes: "NVIDIA's open 120B model, free on OpenRouter. Structured output supported.",
    json: "schema",
    playground: true,
  },
  {
    id: "openrouter:google/gemma-4-31b-it:free",
    provider: "openrouter",
    model: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B (OpenRouter)",
    context: 262_144,
    notes: "Google's open Gemma 4, free on OpenRouter. Good across languages.",
    json: "object",
    playground: true,
  },
  {
    id: "openrouter:cohere/north-mini-code:free",
    provider: "openrouter",
    model: "cohere/north-mini-code:free",
    label: "North Mini Code (OpenRouter)",
    context: 256_000,
    notes: "Cohere's small code model, free on OpenRouter.",
    json: "prompt",
    playground: true,
  },
  // Cloudflare Workers AI: a reserve paid for in daily free Neurons.
  {
    id: "cloudflare:@cf/openai/gpt-oss-120b",
    provider: "cloudflare",
    model: "@cf/openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Cloudflare)",
    context: 128_000,
    notes: "The same open-weight model on Cloudflare's free daily allowance.",
    json: "prompt",
    playground: true,
  },
  {
    id: "cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    provider: "cloudflare",
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B (Cloudflare)",
    context: 24_000,
    notes: "Meta's Llama 3.3 on Cloudflare. Supports JSON mode.",
    json: "prompt",
    playground: true,
  },
  {
    id: "cloudflare:@cf/qwen/qwen2.5-coder-32b-instruct",
    provider: "cloudflare",
    model: "@cf/qwen/qwen2.5-coder-32b-instruct",
    label: "Qwen 2.5 Coder 32B (Cloudflare)",
    context: 32_768,
    notes: "A code-tuned model on Cloudflare.",
    json: "prompt",
    playground: true,
  },
  // Mistral: optional reserve.
  {
    id: "mistral:mistral-small-latest",
    provider: "mistral",
    model: "mistral-small-latest",
    label: "Mistral Small",
    context: 256_000,
    notes: "Mistral's open small model (currently Small 4). Good in European languages.",
    json: "object",
    playground: true,
  },
]

const ALL_PLAYGROUND = MODELS.filter((m) => m.playground).map((m) => m.id)

/** The order the router tries models in, per job, before any admin override. */
export const DEFAULT_CHAINS: Record<AiJob, string[]> = {
  news: [
    "gemini:gemini-3.8-flash",
    "gemini:gemini-3.5-flash-lite",
    "groq:openai/gpt-oss-120b",
    "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    "mistral:mistral-small-latest",
    "cloudflare:@cf/openai/gpt-oss-120b",
  ],
  summary: [
    "gemini:gemini-3.8-flash",
    "gemini:gemini-3.5-flash-lite",
    "groq:openai/gpt-oss-120b",
    "mistral:mistral-small-latest",
    "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    "cloudflare:@cf/openai/gpt-oss-120b",
  ],
  moderation: [
    "groq:openai/gpt-oss-safeguard-20b",
    "groq:openai/gpt-oss-20b",
    "gemini:gemini-3.5-flash-lite",
    "mistral:mistral-small-latest",
    "cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  ],
  rewrite: [
    "groq:openai/gpt-oss-120b",
    "groq:qwen/qwen3.8-27b",
    "gemini:gemini-3.5-flash-lite",
    "gemini:gemini-3.8-flash",
    "mistral:mistral-small-latest",
    "cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  ],
  translate: [
    "groq:openai/gpt-oss-120b",
    "gemini:gemini-3.5-flash-lite",
    "gemini:gemini-3.8-flash",
    "mistral:mistral-small-latest",
    "openrouter:google/gemma-4-31b-it:free",
    "cloudflare:@cf/openai/gpt-oss-120b",
  ],
  code: [
    "gemini:gemini-3.8-flash",
    "groq:openai/gpt-oss-120b",
    "groq:qwen/qwen3.8-27b",
    "openrouter:cohere/north-mini-code:free",
    "cloudflare:@cf/qwen/qwen2.5-coder-32b-instruct",
    "mistral:mistral-small-latest",
  ],
  // For the playground the list is the set members may choose from; the member's pick is the only model tried.
  playground: ALL_PLAYGROUND,
}

/** Requests per member per day, by site role. Roles not listed use "member" (or "moderator" for staff). */
export const DEFAULT_QUOTAS: Record<string, number> = { member: 30, contributor: 60, editor: 150, moderator: 150, admin: 300 }

/** How long a cached answer is reused, per job, in seconds. 0 means never cached. */
export const CACHE_TTL: Record<AiJob, number> = {
  news: 3 * 86_400,
  summary: 7 * 86_400,
  moderation: 7 * 86_400,
  rewrite: 86_400,
  translate: 7 * 86_400,
  code: 7 * 86_400,
  playground: 0,
}

export const modelById = (id: string) => MODELS.find((m) => m.id === id)
export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id)
export const isJob = (v: unknown): v is AiJob => typeof v === "string" && JOBS.some((j) => j.id === v)
