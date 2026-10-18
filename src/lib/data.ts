/**
 * Sample content for the preview. Every person, organisation, model, dataset, tool, repository, thread and
 * news item here is invented to show the product at full density; none of it is real. Pages only call the
 * lookup functions at the bottom, so a database can replace this file without touching them.
 */

export type LanguageCode = "en" | "pt" | "es" | "ja" | "de" | "fr" | "yo" | "sw" | "hi" | "sv" | "ko" | "ar"

export const LANGUAGES: Record<LanguageCode, { name: string; native: string }> = {
  en: { name: "English", native: "English" },
  pt: { name: "Portuguese", native: "Português" },
  es: { name: "Spanish", native: "Español" },
  ja: { name: "Japanese", native: "日本語" },
  de: { name: "German", native: "Deutsch" },
  fr: { name: "French", native: "Français" },
  yo: { name: "Yoruba", native: "Yorùbá" },
  sw: { name: "Swahili", native: "Kiswahili" },
  hi: { name: "Hindi", native: "हिन्दी" },
  sv: { name: "Swedish", native: "Svenska" },
  ko: { name: "Korean", native: "한국어" },
  ar: { name: "Arabic", native: "العربية" },
}

// People and organisations

export type Person = {
  handle: string
  name: string
  org?: boolean
  place: string
  bio: string
  role: string
  langs: LanguageCode[]
  joined: string
  followers: number
  /** One number per week for the last year, used for the activity field on profiles. */
  activity: number[]
}

/** A small seeded generator, so sample activity looks organic but renders the same on server and client. */
function seeded(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

function weeks(seed: string, intensity: number) {
  const r = seeded(seed)
  return Array.from({ length: 52 }, (_, i) => {
    const wave = 0.55 + 0.45 * Math.sin(i / 6 + r() * 2)
    return Math.max(0, Math.round(r() * intensity * wave - intensity * 0.18))
  })
}

const person = (p: Omit<Person, "activity"> & { intensity?: number }): Person => ({
  ...p,
  activity: weeks(p.handle, p.intensity ?? 9),
})

export const people: Person[] = [
  person({ handle: "ines", name: "Inês Carvalho", place: "Lisbon", role: "NLP engineer", bio: "Fine-tunes small models for European Portuguese. Keeps the PT eval set honest.", langs: ["pt", "en", "es"], joined: "2024-03-02", followers: 4210, intensity: 12 }),
  person({ handle: "tunde", name: "Túndé Adébáyọ̀", place: "Lagos", role: "Speech researcher", bio: "Builds speech data for Yoruba and other tonal languages. Ask me about diacritics.", langs: ["yo", "en"], joined: "2024-01-19", followers: 3880, intensity: 11 }),
  person({ handle: "mei", name: "Mei Tanaka", place: "Osaka", role: "Evaluation lead", bio: "Writes evals that catch what leaderboards miss. Kansai dialect enthusiast.", langs: ["ja", "en"], joined: "2023-11-08", followers: 6120, intensity: 10 }),
  person({ handle: "rafa", name: "Rafael Ortega", place: "Bogotá", role: "Agent builder", bio: "Agents that stop when they should. Maintains loop-guard.", langs: ["es", "en"], joined: "2024-05-27", followers: 2950, intensity: 13 }),
  person({ handle: "priya", name: "Priya Raman", place: "Bengaluru", role: "On-device ML", bio: "Quantisation, phones, and models that fit in 2 GB.", langs: ["hi", "en"], joined: "2024-02-14", followers: 5340, intensity: 9 }),
  person({ handle: "jonas", name: "Jonas Lindqvist", place: "Gothenburg", role: "Policy & open source", bio: "Reads regulation so you do not have to. Summaries in plain Swedish and English.", langs: ["sv", "en", "de"], joined: "2023-09-30", followers: 1870, intensity: 6 }),
  person({ handle: "amara", name: "Amara Njoroge", place: "Nairobi", role: "Data curator", bio: "Swahili corpora, consent-first. Datasets with datasheets or not at all.", langs: ["sw", "en"], joined: "2024-04-11", followers: 2410, intensity: 8 }),
  person({ handle: "leo", name: "Léo Martin", place: "Lyon", role: "Audio & image", bio: "Diffusion for sound. Cleans audio so models do not learn the hum.", langs: ["fr", "en"], joined: "2024-06-03", followers: 3120, intensity: 10 }),
  person({ handle: "sofia", name: "Sofia Weber", place: "Berlin", role: "MLOps", bio: "Serving, caching, and the unglamorous parts that make demos survive traffic.", langs: ["de", "en"], joined: "2023-12-12", followers: 2760, intensity: 7 }),
  person({ handle: "kai", name: "Kai Moon", place: "Seoul", role: "Indie hacker", bio: "Ships one tiny AI tool a month. Currently: token-tax.", langs: ["ko", "en"], joined: "2024-07-21", followers: 4480, intensity: 14 }),
  person({ handle: "layla", name: "Layla Haddad", place: "Amman", role: "Arabic NLP", bio: "Dialect-aware tokenisers and right-to-left everything.", langs: ["ar", "en", "fr"], joined: "2024-08-09", followers: 1990, intensity: 9 }),
  person({ handle: "noah", name: "Noah Becker", place: "Toronto", role: "Research engineer", bio: "Retrieval, long context, and reading every RAG paper so the forum gets the short version.", langs: ["en", "fr"], joined: "2023-10-17", followers: 5810, intensity: 11 }),

  person({ handle: "tagus-lab", name: "Tagus Lab", org: true, place: "Lisbon", role: "Open research lab", bio: "Small, open models for Iberian languages.", langs: ["pt", "es", "en"], joined: "2024-02-01", followers: 9120, intensity: 15 }),
  person({ handle: "orbitalai", name: "Orbital AI", org: true, place: "Remote", role: "Open-weights collective", bio: "A volunteer collective training general models in the open, logs included.", langs: ["en"], joined: "2023-08-15", followers: 28400, intensity: 18 }),
  person({ handle: "savanna", name: "Savanna Speech", org: true, place: "Nairobi & Lagos", role: "Speech nonprofit", bio: "Voice technology for African languages, built with the people who speak them.", langs: ["sw", "yo", "en"], joined: "2024-01-05", followers: 7350, intensity: 12 }),
  person({ handle: "kitsune", name: "Kitsune Labs", org: true, place: "Tokyo", role: "Applied lab", bio: "Japanese language models and the evals to keep them honest.", langs: ["ja", "en"], joined: "2023-11-20", followers: 11800, intensity: 13 }),
  person({ handle: "fieldnotes", name: "Fieldnotes", org: true, place: "Berlin", role: "Developer tools", bio: "Tools for watching what your models actually do in production.", langs: ["de", "en"], joined: "2024-03-18", followers: 6240, intensity: 11 }),
  person({ handle: "lumen", name: "Lumen Studio", org: true, place: "Lyon", role: "Creative AI studio", bio: "Image and audio models for people who make things.", langs: ["fr", "en"], joined: "2024-05-02", followers: 8930, intensity: 12 }),
]

// Resources: models, datasets, tools and repositories

export type ResourceKind = "model" | "dataset" | "tool" | "repo"

export const KINDS: Record<ResourceKind, { label: string; plural: string; path: string; blurb: string }> = {
  model: { label: "Model", plural: "Models", path: "/models", blurb: "Open weights you can download, fine-tune and run." },
  dataset: { label: "Dataset", plural: "Datasets", path: "/datasets", blurb: "Data with datasheets: where it came from and what it is for." },
  tool: { label: "Tool", plural: "Tools", path: "/tools", blurb: "Apps and utilities you can use right now, most of them free." },
  repo: { label: "Repo", plural: "Repos", path: "/repos", blurb: "Code: libraries, recipes, agents and everything in between." },
}

export type Resource = {
  kind: ResourceKind
  slug: string
  name: string
  owner: string
  summary: string
  about: string[]
  task: string
  tags: string[]
  license: string
  langs: LanguageCode[]
  /** Parameters for a model, rows for a dataset, platform for a tool, main language for a repo. */
  spec: string
  likes: number
  /** Downloads for models and datasets, monthly users for tools, forks for repos. */
  reach: number
  updated: string
  featured?: boolean
  quickstart?: string
  files?: { name: string; size: string }[]
}

export const TASKS = [
  "Text generation",
  "Translation",
  "Speech recognition",
  "Text to speech",
  "Image generation",
  "Audio generation",
  "Embeddings",
  "Agents",
  "Evaluation",
  "Retrieval",
  "On-device",
  "Data tooling",
  "Observability",
] as const

export const resources: Resource[] = [
  // Models
  {
    kind: "model", slug: "tagus-3b-pt", name: "tagus-3b-pt", owner: "tagus-lab", featured: true,
    summary: "A 3B model fine-tuned for European Portuguese, not Brazilian by accident.",
    about: [
      "Tagus is a 3-billion-parameter model fine-tuned on 1.4M European Portuguese instructions written and reviewed by native speakers.",
      "It keeps the European forms (tu, estás a fazer, autocarro) where general models drift to Brazilian Portuguese, and it scores within a point of 8B models on the PT-PT eval set.",
    ],
    task: "Text generation", tags: ["portuguese", "instruct", "lora", "gguf"], license: "Apache-2.0", langs: ["pt", "en"], spec: "3B",
    likes: 2140, reach: 184000, updated: "2026-10-14",
    quickstart: `from transformers import pipeline\n\npt = pipeline("text-generation", model="tagus-lab/tagus-3b-pt")\nprint(pt("Explica-me o que é um modelo de linguagem.")[0]["generated_text"])`,
    files: [{ name: "model.safetensors", size: "6.1 GB" }, { name: "tagus-3b-pt.Q4_K_M.gguf", size: "1.9 GB" }, { name: "tokenizer.json", size: "3.4 MB" }, { name: "README.md", size: "8 KB" }],
  },
  {
    kind: "model", slug: "orbit-8b", name: "Orbit 8B", owner: "orbitalai", featured: true,
    summary: "A general 8B model trained fully in the open, with every training log published.",
    about: [
      "Orbit 8B is trained on 9T tokens of openly licensed text and code. Data mixture, checkpoints every 250B tokens and the full loss curves are public.",
      "It is a good default for chat, tool calling and summarisation when you need weights you can audit end to end.",
    ],
    task: "Text generation", tags: ["general", "tool-calling", "open-data", "long-context"], license: "Apache-2.0", langs: ["en", "es", "fr", "de", "pt"], spec: "8B",
    likes: 9870, reach: 2410000, updated: "2026-10-16",
    quickstart: `ollama run orbitalai/orbit-8b\n\n# or\nfrom transformers import AutoModelForCausalLM\nmodel = AutoModelForCausalLM.from_pretrained("orbitalai/orbit-8b")`,
    files: [{ name: "model-00001-of-00004.safetensors", size: "4.9 GB" }, { name: "model-00002-of-00004.safetensors", size: "4.9 GB" }, { name: "config.json", size: "1 KB" }, { name: "training-logs.parquet", size: "212 MB" }],
  },
  {
    kind: "model", slug: "orbit-1b-mobile", name: "Orbit 1B Mobile", owner: "orbitalai",
    summary: "The Orbit recipe at 1B, quantised to run on a mid-range phone at 20 tokens a second.",
    about: ["A distilled Orbit for phones and browsers. Ships with 4-bit and 8-bit builds and a WebGPU demo."],
    task: "On-device", tags: ["mobile", "webgpu", "4-bit"], license: "Apache-2.0", langs: ["en"], spec: "1.1B",
    likes: 3410, reach: 690000, updated: "2026-10-09",
  },
  {
    kind: "model", slug: "yoruba-asr-small", name: "yoruba-asr-small", owner: "savanna",
    summary: "Speech recognition for Yoruba that keeps the tone marks.",
    about: ["Trained on yoruba-voices with tone-aware tokenisation. Word error rate drops from 41% to 17% against general multilingual models on read speech."],
    task: "Speech recognition", tags: ["yoruba", "asr", "tonal"], license: "CC-BY-4.0", langs: ["yo"], spec: "240M",
    likes: 1290, reach: 58000, updated: "2026-10-02",
  },
  {
    kind: "model", slug: "kiswahili-tts", name: "Sauti TTS", owner: "savanna", featured: true,
    summary: "Natural Swahili text to speech with 12 consented voices.",
    about: ["Every voice was recorded with paid, written consent and can be withdrawn. Runs in real time on CPU."],
    task: "Text to speech", tags: ["swahili", "tts", "consented-voices"], license: "CC-BY-NC-4.0", langs: ["sw"], spec: "86M",
    likes: 1880, reach: 74000, updated: "2026-09-28",
  },
  {
    kind: "model", slug: "kansai-7b", name: "Kansai 7B", owner: "kitsune",
    summary: "A Japanese model that understands Kansai dialect instead of correcting it.",
    about: ["Continued pre-training on dialect transcripts from radio and theatre, with speakers' permission."],
    task: "Text generation", tags: ["japanese", "dialect", "chat"], license: "Llama-style community", langs: ["ja"], spec: "7B",
    likes: 2760, reach: 211000, updated: "2026-10-11",
  },
  {
    kind: "model", slug: "lumen-xl", name: "Lumen XL", owner: "lumen", featured: true,
    summary: "Image generation tuned for print: real CMYK previews and clean typography.",
    about: ["A diffusion model trained with designers. Renders legible text in 14 scripts and exports print-safe colour."],
    task: "Image generation", tags: ["diffusion", "typography", "print"], license: "OpenRAIL-M", langs: ["en", "fr", "ja"], spec: "3.5B",
    likes: 7420, reach: 1320000, updated: "2026-10-15",
  },
  {
    kind: "model", slug: "lumen-foley", name: "Lumen Foley", owner: "lumen",
    summary: "Sound effects from a sentence: footsteps on gravel, rain on a tin roof.",
    about: ["Trained only on cleanroom-audio and licensed foley libraries. Outputs 48 kHz stems."],
    task: "Audio generation", tags: ["audio", "foley", "48khz"], license: "OpenRAIL-M", langs: ["en"], spec: "900M",
    likes: 2310, reach: 96000, updated: "2026-10-06",
  },
  {
    kind: "model", slug: "babel-embed", name: "babel-embed", owner: "noah",
    summary: "Multilingual embeddings for retrieval across 40 languages, 384 dimensions.",
    about: ["Small enough for a laptop, strong on cross-lingual search: ask in Swahili, find the answer in Portuguese."],
    task: "Embeddings", tags: ["embeddings", "multilingual", "retrieval"], license: "MIT", langs: ["en", "pt", "sw", "ja", "ar", "hi"], spec: "120M",
    likes: 4060, reach: 1870000, updated: "2026-10-13",
  },
  {
    kind: "model", slug: "darija-mt", name: "darija-mt", owner: "layla",
    summary: "Translation between Moroccan Darija, Arabic, French and English.",
    about: ["Handles Arabizi (Darija in Latin letters) as input, which most systems refuse."],
    task: "Translation", tags: ["darija", "arabic", "mt"], license: "Apache-2.0", langs: ["ar", "fr", "en"], spec: "600M",
    likes: 980, reach: 31000, updated: "2026-09-30",
  },
  {
    kind: "model", slug: "guard-1b", name: "Guard 1B", owner: "orbitalai",
    summary: "A small classifier that flags unsafe prompts and outputs in 20 languages.",
    about: ["Built to sit in front of any model. Policies are plain YAML you can read and change."],
    task: "Evaluation", tags: ["safety", "classifier", "multilingual"], license: "Apache-2.0", langs: ["en", "es", "pt", "de", "fr", "ja"], spec: "1B",
    likes: 1720, reach: 402000, updated: "2026-10-08",
  },
  {
    kind: "model", slug: "hindi-coder-3b", name: "hindi-coder-3b", owner: "priya",
    summary: "A coding assistant that explains in Hindi and writes code in anything.",
    about: ["Fine-tuned on bilingual programming Q&A. Runs on a laptop with 8 GB of RAM."],
    task: "Text generation", tags: ["code", "hindi", "gguf"], license: "Apache-2.0", langs: ["hi", "en"], spec: "3B",
    likes: 1560, reach: 88000, updated: "2026-10-12",
  },

  // Datasets
  {
    kind: "dataset", slug: "pt-pt-instruct", name: "pt-pt-instruct", owner: "ines", featured: true,
    summary: "1.4M instructions in European Portuguese, written and reviewed by native speakers.",
    about: ["The data behind tagus-3b-pt. Each row has the writer's region and a second reviewer's sign-off."],
    task: "Text generation", tags: ["portuguese", "instructions", "human-written"], license: "CC-BY-4.0", langs: ["pt"], spec: "1.4M rows",
    likes: 1310, reach: 42000, updated: "2026-10-01",
    files: [{ name: "train.parquet", size: "1.1 GB" }, { name: "test.parquet", size: "48 MB" }, { name: "DATASHEET.md", size: "14 KB" }],
  },
  {
    kind: "dataset", slug: "yoruba-voices", name: "yoruba-voices", owner: "tunde",
    summary: "212 hours of read and spontaneous Yoruba speech with tone-marked transcripts.",
    about: ["Recorded with 640 speakers across Oyo, Lagos and Ekiti. Every speaker consented and was paid."],
    task: "Speech recognition", tags: ["yoruba", "speech", "consented"], license: "CC-BY-4.0", langs: ["yo"], spec: "212 h",
    likes: 890, reach: 12000, updated: "2026-09-14",
  },
  {
    kind: "dataset", slug: "kiswahili-commons", name: "Kiswahili Commons", owner: "amara",
    summary: "A clean Swahili text corpus from news, books and radio transcripts, with sources listed.",
    about: ["Deduplicated, language-ID checked and filtered for personal data. 3.2B tokens."],
    task: "Text generation", tags: ["swahili", "corpus", "pretraining"], license: "CC-BY-SA-4.0", langs: ["sw"], spec: "3.2B tokens",
    likes: 760, reach: 19000, updated: "2026-10-04",
  },
  {
    kind: "dataset", slug: "kansai-reading-eval", name: "kansai-reading-eval", owner: "mei",
    summary: "2,400 reading-comprehension questions written in Kansai dialect.",
    about: ["An eval set, not training data: a canary string is included so contamination is detectable."],
    task: "Evaluation", tags: ["japanese", "eval", "dialect"], license: "CC-BY-4.0", langs: ["ja"], spec: "2.4K rows",
    likes: 540, reach: 8700, updated: "2026-09-21",
  },
  {
    kind: "dataset", slug: "cleanroom-audio", name: "cleanroom-audio", owner: "leo",
    summary: "38,000 sound effects recorded in treated rooms, every file licensed for training.",
    about: ["No scraped audio. Each clip has a microphone, room and licence field."],
    task: "Audio generation", tags: ["audio", "foley", "licensed"], license: "CC-BY-4.0", langs: ["en"], spec: "38K clips",
    likes: 1120, reach: 26000, updated: "2026-09-26",
  },
  {
    kind: "dataset", slug: "agent-traces", name: "agent-traces", owner: "rafa",
    summary: "12,000 real agent runs with every tool call, including the ones that looped.",
    about: ["Labelled for loops, stalls and recoveries, so you can test guards against real failures."],
    task: "Agents", tags: ["agents", "traces", "failures"], license: "MIT", langs: ["en", "es"], spec: "12K runs",
    likes: 1480, reach: 21000, updated: "2026-10-10",
  },
  {
    kind: "dataset", slug: "arabic-dialects-qa", name: "arabic-dialects-qa", owner: "layla",
    summary: "Question answering in six Arabic dialects, with Modern Standard Arabic pairs.",
    about: ["Built with native speakers in Amman, Cairo, Casablanca, Beirut, Riyadh and Tunis."],
    task: "Evaluation", tags: ["arabic", "dialects", "qa"], license: "CC-BY-4.0", langs: ["ar"], spec: "18K rows",
    likes: 610, reach: 9400, updated: "2026-10-03",
  },

  // Tools
  {
    kind: "tool", slug: "token-tax", name: "token-tax", owner: "kai", featured: true,
    summary: "Paste text in any language and see what it costs in tokens across popular tokenisers.",
    about: ["Shows why the same sentence costs three times more in Hindi than in English, and which tokeniser is fairest for your language."],
    task: "Data tooling", tags: ["tokenizers", "cost", "multilingual"], license: "MIT", langs: ["en", "ko", "hi", "ar"], spec: "Web app",
    likes: 5230, reach: 140000, updated: "2026-10-17",
  },
  {
    kind: "tool", slug: "promptboard", name: "Promptboard", owner: "kai",
    summary: "A shared whiteboard for prompts: version them, compare outputs side by side, vote.",
    about: ["Made for teams who keep prompts in chat history. Exports to plain files."],
    task: "Evaluation", tags: ["prompts", "collaboration", "compare"], license: "Free", langs: ["en", "ko"], spec: "Web app",
    likes: 3020, reach: 61000, updated: "2026-10-12",
  },
  {
    kind: "tool", slug: "tracewatch", name: "Tracewatch", owner: "fieldnotes", featured: true,
    summary: "See every call your agent makes as a timeline, and replay any step with a different model.",
    about: ["Drop-in tracing for agents and RAG pipelines. Self-host it or use the free cloud tier."],
    task: "Observability", tags: ["tracing", "agents", "self-host"], license: "AGPL-3.0", langs: ["en", "de"], spec: "Web + CLI",
    likes: 4410, reach: 87000, updated: "2026-10-15",
  },
  {
    kind: "tool", slug: "pocket-run", name: "Pocket Run", owner: "priya",
    summary: "Run open models on your phone, offline, with one tap.",
    about: ["Android and iOS. Downloads GGUF builds straight from Nexverse model pages."],
    task: "On-device", tags: ["mobile", "offline", "gguf"], license: "Free", langs: ["en", "hi"], spec: "iOS · Android",
    likes: 6870, reach: 320000, updated: "2026-10-16",
  },
  {
    kind: "tool", slug: "subtitle-forge", name: "Subtitle Forge", owner: "leo",
    summary: "Subtitles for any video in 40 languages, with speaker labels and a timing editor.",
    about: ["Runs in the browser with WebGPU, so the video never leaves your computer."],
    task: "Speech recognition", tags: ["subtitles", "webgpu", "privacy"], license: "Free", langs: ["fr", "en", "es"], spec: "Web app",
    likes: 3790, reach: 158000, updated: "2026-10-07",
  },
  {
    kind: "tool", slug: "datasheet-studio", name: "Datasheet Studio", owner: "amara",
    summary: "Answer 30 questions about your dataset and get a datasheet people will actually read.",
    about: ["Turns the Datasheets for Datasets template into a guided form, with exports to Markdown."],
    task: "Data tooling", tags: ["datasheets", "documentation", "responsible-ai"], license: "MIT", langs: ["en", "sw"], spec: "Web app",
    likes: 1340, reach: 18000, updated: "2026-09-29",
  },
  {
    kind: "tool", slug: "act-checker", name: "Act Checker", owner: "jonas",
    summary: "Five questions that tell you which parts of the EU AI Act apply to your open model.",
    about: ["Not legal advice: a map of the articles to read, with plain-language summaries in 8 languages."],
    task: "Evaluation", tags: ["policy", "eu-ai-act", "compliance"], license: "Free", langs: ["sv", "en", "de", "fr"], spec: "Web app",
    likes: 2180, reach: 44000, updated: "2026-10-05",
  },

  // Repositories
  {
    kind: "repo", slug: "loop-guard", name: "loop-guard", owner: "rafa", featured: true,
    summary: "Stops agents that call the same tool with the same arguments again and again.",
    about: ["A 200-line wrapper for any agent framework. Detects repeats, stalls and ping-pong between two tools, then asks the model to change plan."],
    task: "Agents", tags: ["agents", "python", "safety"], license: "MIT", langs: ["en", "es"], spec: "Python",
    likes: 3960, reach: 512, updated: "2026-10-16",
    quickstart: `pip install loop-guard\n\nfrom loop_guard import guard\nagent = guard(agent, max_repeats=2)`,
  },
  {
    kind: "repo", slug: "leakcheck", name: "leakcheck", owner: "mei",
    summary: "Finds out whether an eval set leaked into a model's training data.",
    about: ["Uses canary strings and completion probes. Works with any model you can sample from."],
    task: "Evaluation", tags: ["contamination", "evals", "python"], license: "Apache-2.0", langs: ["en", "ja"], spec: "Python",
    likes: 2240, reach: 310, updated: "2026-10-09",
  },
  {
    kind: "repo", slug: "tiny-rag", name: "tiny-rag", owner: "noah", featured: true,
    summary: "Retrieval-augmented generation in 300 lines you can read in one sitting.",
    about: ["No framework. SQLite for vectors, babel-embed for embeddings, any model for answers. A teaching repo that people run in production anyway."],
    task: "Retrieval", tags: ["rag", "sqlite", "teaching"], license: "MIT", langs: ["en"], spec: "Python",
    likes: 6120, reach: 1240, updated: "2026-10-14",
  },
  {
    kind: "repo", slug: "quant-cookbook", name: "quant-cookbook", owner: "priya",
    summary: "Recipes for quantising any model to 4 bits without losing what matters.",
    about: ["Before-and-after evals for every recipe, so you can see what each method costs."],
    task: "On-device", tags: ["quantization", "gguf", "recipes"], license: "Apache-2.0", langs: ["en", "hi"], spec: "Python",
    likes: 3380, reach: 640, updated: "2026-10-11",
  },
  {
    kind: "repo", slug: "serve-small", name: "serve-small", owner: "sofia",
    summary: "Serve a small model behind an API with batching, caching and a cost dashboard.",
    about: ["One Docker image. Handles 2,000 requests a second on a single GPU for 3B models."],
    task: "Observability", tags: ["serving", "docker", "caching"], license: "Apache-2.0", langs: ["en", "de"], spec: "Go",
    likes: 2710, reach: 420, updated: "2026-10-13",
  },
  {
    kind: "repo", slug: "tone-tokenizer", name: "tone-tokenizer", owner: "tunde",
    summary: "A tokeniser that keeps tone marks together with their vowels.",
    about: ["Drop-in for Yoruba, Igbo, Vietnamese and other tonal scripts. Cuts token counts by 30%."],
    task: "Data tooling", tags: ["tokenizers", "tonal", "rust"], license: "MIT", langs: ["yo", "en"], spec: "Rust",
    likes: 1460, reach: 180, updated: "2026-10-01",
  },
  {
    kind: "repo", slug: "nexverse-sdk", name: "nexverse-sdk", owner: "orbitalai",
    summary: "Download, cache and load anything on Nexverse from Python or JavaScript.",
    about: ["One client for models, datasets and tools, with resumable downloads and checksums."],
    task: "Data tooling", tags: ["sdk", "python", "typescript"], license: "Apache-2.0", langs: ["en"], spec: "TypeScript",
    likes: 2890, reach: 730, updated: "2026-10-17",
  },
]

// Forum

export type Category = { slug: string; name: string; blurb: string; icon: string }

export const categories: Category[] = [
  { slug: "help", name: "Help", blurb: "Stuck? Ask. Someone has done it before.", icon: "life-buoy" },
  { slug: "show", name: "Show & tell", blurb: "Share what you built and get honest feedback.", icon: "sparkles" },
  { slug: "models", name: "Models", blurb: "Training, fine-tuning, quantising, comparing.", icon: "box" },
  { slug: "agents", name: "Agents", blurb: "Tools, loops, memory and agents that behave.", icon: "bot" },
  { slug: "languages", name: "Every language", blurb: "AI beyond English, in your language.", icon: "languages" },
  { slug: "local", name: "Local & on-device", blurb: "Phones, laptops, offline, private.", icon: "cpu" },
  { slug: "research", name: "Research", blurb: "Papers explained by people who read them.", icon: "flask-conical" },
  { slug: "policy", name: "Policy & safety", blurb: "Regulation, licences and doing it responsibly.", icon: "scale" },
]

export type Translation = { title?: string; body: string }

export type Reply = {
  id: string
  author: string
  date: string
  lang: LanguageCode
  body: string
  en?: string
  votes: number
  accepted?: boolean
}

export type Thread = {
  id: string
  category: string
  title: string
  body: string
  lang: LanguageCode
  en?: Translation
  author: string
  date: string
  tags: string[]
  votes: number
  views: number
  pinned?: boolean
  /** Resources this thread talks about or led to. */
  links: string[]
  replies: Reply[]
}

export const threads: Thread[] = [
  {
    id: "fine-tune-3b-european-portuguese", category: "languages", lang: "pt", author: "ines", date: "2026-10-12", votes: 412, views: 18200,
    title: "Como fazer fine-tune de um modelo 3B em português europeu (e não brasileiro)?",
    body: "Tenho 40 mil exemplos escritos por falantes de Portugal, mas o modelo continua a responder com «você» e «ônibus». Já tentei LoRA com rank 16. O que estou a fazer mal?",
    en: { title: "How do I fine-tune a 3B model in European Portuguese (not Brazilian)?", body: "I have 40,000 examples written by speakers from Portugal, but the model keeps answering with «você» and «ônibus». I tried LoRA at rank 16. What am I doing wrong?" },
    tags: ["portuguese", "lora", "fine-tuning"], links: ["tagus-3b-pt", "pt-pt-instruct"],
    replies: [
      { id: "r1", author: "noah", date: "2026-10-12", lang: "en", votes: 96, body: "Check your tokenizer's chat template first. If the system prompt is in Brazilian Portuguese, rank won't save you." },
      { id: "r2", author: "ines", date: "2026-10-13", lang: "pt", votes: 241, accepted: true, body: "Resolvi: rank 64, incluir 15% de exemplos com contraste explícito PT-PT/PT-BR e um prompt de sistema em português europeu. Publiquei o resultado como tagus-3b-pt.", en: "Solved: rank 64, include 15% examples with explicit PT-PT/PT-BR contrast, and a system prompt in European Portuguese. I published the result as tagus-3b-pt." },
      { id: "r3", author: "layla", date: "2026-10-14", lang: "en", votes: 38, body: "Same trick works for Darija vs MSA. Contrast pairs are underrated." },
    ],
  },
  {
    id: "agent-repeats-same-tool", category: "agents", lang: "es", author: "rafa", date: "2026-10-09", votes: 388, views: 22400, pinned: true,
    title: "Mi agente llama a la misma herramienta 40 veces seguidas",
    body: "Con cualquier modelo, a veces el agente entra en un bucle: busca, lee, vuelve a buscar lo mismo. ¿Cómo lo detectáis sin matar los casos legítimos?",
    en: { title: "My agent calls the same tool 40 times in a row", body: "With any model, sometimes the agent gets into a loop: search, read, search the same thing again. How do you detect it without killing the legitimate cases?" },
    tags: ["agents", "loops", "tool-calling"], links: ["loop-guard", "agent-traces", "tracewatch"],
    replies: [
      { id: "r1", author: "sofia", date: "2026-10-09", lang: "en", votes: 74, body: "Hash (tool, normalised args). Two identical hashes in a window of 5 is almost always a loop." },
      { id: "r2", author: "rafa", date: "2026-10-10", lang: "es", votes: 203, accepted: true, body: "Hice loop-guard con la idea de Sofia más detección de ping-pong entre dos herramientas. Bajó los bucles un 92% en nuestras trazas.", en: "I made loop-guard with Sofia's idea plus ping-pong detection between two tools. It cut loops by 92% in our traces." },
      { id: "r3", author: "kai", date: "2026-10-11", lang: "en", votes: 21, body: "Tracewatch shows these beautifully as a repeating stripe on the timeline." },
    ],
  },
  {
    id: "run-7b-offline-laptop", category: "local", lang: "en", author: "priya", date: "2026-10-15", votes: 296, views: 15100,
    title: "What is the best 7B setup for a laptop with 16 GB and no GPU?",
    body: "I want something that answers in under 2 seconds and does not melt the battery. Quantisation suggestions welcome, with numbers please.",
    tags: ["quantization", "cpu", "laptop"], links: ["quant-cookbook", "orbit-8b", "pocket-run"],
    replies: [
      { id: "r1", author: "sofia", date: "2026-10-15", lang: "en", votes: 88, accepted: true, body: "Q4_K_M of Orbit 8B with 4 threads: 11 tokens/s on an M2 Air, first token in 0.9s. The quant-cookbook has the evals for each quant level." },
      { id: "r2", author: "kai", date: "2026-10-16", lang: "en", votes: 30, body: "If you can live with 1B, Orbit 1B Mobile is instant and surprisingly good at summaries." },
    ],
  },
  {
    id: "yoruba-tone-marks-asr", category: "languages", lang: "yo", author: "tunde", date: "2026-10-01", votes: 254, views: 9800,
    title: "Ṣé ẹnikẹ́ni ti rí ASR tí kò pa àmì ohùn rẹ́?",
    body: "Gbogbo àwọn àwòṣe tí mo ti gbìyànjú máa ń yọ àmì ohùn kúrò. Ọ̀rọ̀ di ìtumọ̀ míràn.",
    en: { title: "Has anyone seen ASR that doesn't erase tone marks?", body: "Every model I have tried strips the tone marks. Words turn into different meanings." },
    tags: ["yoruba", "asr", "tonal"], links: ["yoruba-asr-small", "yoruba-voices", "tone-tokenizer"],
    replies: [
      { id: "r1", author: "amara", date: "2026-10-02", lang: "en", votes: 52, body: "Same problem in Swahili names. The tokenizer splits the diacritic from the vowel." },
      { id: "r2", author: "tunde", date: "2026-10-04", lang: "yo", votes: 168, accepted: true, body: "Mo kọ tone-tokenizer, mo sì kọ́ yoruba-asr-small lórí rẹ̀. Àṣìṣe ọ̀rọ̀ dínkù láti 41% sí 17%.", en: "I wrote tone-tokenizer and trained yoruba-asr-small on it. Word error went from 41% to 17%." },
    ],
  },
  {
    id: "show-token-tax", category: "show", lang: "en", author: "kai", date: "2026-10-17", votes: 341, views: 12600,
    title: "I built token-tax: see what your language pays per sentence",
    body: "Paste text, see token counts across 12 tokenisers. Hindi pays 3.1x English on most of them. Feedback welcome, especially on scripts I got wrong.",
    tags: ["tokenizers", "show", "multilingual"], links: ["token-tax"],
    replies: [
      { id: "r1", author: "layla", date: "2026-10-17", lang: "en", votes: 61, body: "Arabic with diacritics is a fun stress test. Could you add a toggle for that?" },
      { id: "r2", author: "priya", date: "2026-10-17", lang: "en", votes: 44, body: "Love it. A 'cost per 1,000 words' view would make this slide-ready." },
    ],
  },
  {
    id: "ai-act-open-source-model", category: "policy", lang: "sv", author: "jonas", date: "2026-10-05", votes: 198, views: 8700,
    title: "Gäller AI-förordningen min öppna modell om jag bara laddar upp vikterna?",
    body: "Jag släpper en 3B-modell under Apache-2.0 utan API. Vilka skyldigheter har jag egentligen?",
    en: { title: "Does the AI Act apply to my open model if I only upload the weights?", body: "I am releasing a 3B model under Apache-2.0 with no API. What obligations do I actually have?" },
    tags: ["eu-ai-act", "licences", "open-weights"], links: ["act-checker"],
    replies: [
      { id: "r1", author: "jonas", date: "2026-10-06", lang: "en", votes: 97, accepted: true, body: "Short version: open-source exemptions cover most of it unless the model is general-purpose with systemic risk. You still need a training-data summary and a copyright policy. I turned this into Act Checker." },
    ],
  },
  {
    id: "rag-long-context-vs-retrieval", category: "research", lang: "en", author: "noah", date: "2026-10-13", votes: 276, views: 14300,
    title: "Long context vs retrieval in 2026: a summary of the six papers everyone cites",
    body: "I read them so you do not have to. TL;DR: long context wins on reasoning across a document, retrieval wins on cost and freshness. Details and a decision table inside.",
    tags: ["rag", "long-context", "papers"], links: ["tiny-rag", "babel-embed"],
    replies: [
      { id: "r1", author: "mei", date: "2026-10-13", lang: "en", votes: 58, body: "The 'needle' benchmarks in two of those papers leak. Worth flagging." },
      { id: "r2", author: "noah", date: "2026-10-14", lang: "en", votes: 40, body: "Good catch, added a note and a leakcheck run." },
    ],
  },
  {
    id: "kansai-dialect-eval", category: "models", lang: "ja", author: "mei", date: "2026-09-21", votes: 167, views: 6400,
    title: "関西弁を「間違い」と判定しない評価セットを作りました",
    body: "既存のベンチマークでは関西弁の回答が減点されます。方言のまま正しく理解できるかを測る2,400問を公開しました。",
    en: { title: "I made an eval set that does not mark Kansai dialect as 'wrong'", body: "Existing benchmarks penalise answers in Kansai dialect. I released 2,400 questions that measure whether a model understands the dialect as it is." },
    tags: ["japanese", "evals", "dialect"], links: ["kansai-reading-eval", "kansai-7b", "leakcheck"],
    replies: [
      { id: "r1", author: "noah", date: "2026-09-22", lang: "en", votes: 33, body: "The canary string is a great touch. More eval sets should ship with one." },
    ],
  },
  {
    id: "swahili-tts-consent", category: "policy", lang: "sw", author: "amara", date: "2026-09-28", votes: 143, views: 5200,
    title: "Tulirekodi sauti 12 kwa idhini ya maandishi. Hivi ndivyo tulivyofanya.",
    body: "Mkataba wetu, malipo, na jinsi msemaji anaweza kuondoa sauti yake wakati wowote.",
    en: { title: "We recorded 12 voices with written consent. Here is how we did it.", body: "Our contract, the payments, and how a speaker can withdraw their voice at any time." },
    tags: ["consent", "tts", "swahili"], links: ["kiswahili-tts", "datasheet-studio"],
    replies: [
      { id: "r1", author: "leo", date: "2026-09-29", lang: "en", votes: 27, body: "Could you share the contract template? We want the same for foley artists." },
    ],
  },
  {
    id: "lumen-xl-typography", category: "show", lang: "fr", author: "leo", date: "2026-10-15", votes: 302, views: 16900,
    title: "Lumen XL écrit enfin du texte lisible dans 14 écritures",
    body: "On a entraîné avec des graphistes. Les affiches sortent avec un vrai aperçu CMJN. Vos retours sur le japonais et l'arabe nous aideraient.",
    en: { title: "Lumen XL finally writes legible text in 14 scripts", body: "We trained with designers. Posters come out with a real CMYK preview. Your feedback on Japanese and Arabic would help." },
    tags: ["diffusion", "typography", "show"], links: ["lumen-xl"],
    replies: [
      { id: "r1", author: "layla", date: "2026-10-15", lang: "en", votes: 49, body: "Arabic ligatures are right 9 times out of 10. Kashida stretching still looks off." },
      { id: "r2", author: "mei", date: "2026-10-16", lang: "ja", votes: 22, body: "縦書きも試しました。かなり良いです。", en: "I tried vertical writing too. It's quite good." },
    ],
  },
  {
    id: "serve-3b-cheap", category: "local", lang: "de", author: "sofia", date: "2026-10-13", votes: 121, views: 4300,
    title: "Ein 3B-Modell für 40 € im Monat ausliefern: unser Setup",
    body: "Batching, Prompt-Caching und eine einzige L4-GPU. Alle Zahlen und die Docker-Datei im Thread.",
    en: { title: "Serving a 3B model for €40 a month: our setup", body: "Batching, prompt caching and a single L4 GPU. All numbers and the Dockerfile in the thread." },
    tags: ["serving", "cost", "docker"], links: ["serve-small"],
    replies: [],
  },
  {
    id: "darija-arabizi-input", category: "help", lang: "en", author: "layla", date: "2026-10-16", votes: 64, views: 1900,
    title: "How do you evaluate translation when the input is Arabizi?",
    body: "Users type Darija in Latin letters with numbers (3 for ع, 7 for ح). BLEU is meaningless here. What are people using?",
    tags: ["translation", "arabic", "evals"], links: ["darija-mt", "arabic-dialects-qa"],
    replies: [],
  },
  {
    id: "orbit-8b-release-notes", category: "models", lang: "en", author: "orbitalai", date: "2026-10-16", votes: 520, views: 31800, pinned: true,
    title: "Orbit 8B is out, with every log, checkpoint and data mixture",
    body: "AMA in this thread. We will answer questions about the data, the training run and what we would do differently.",
    tags: ["release", "open-data", "ama"], links: ["orbit-8b", "orbit-1b-mobile", "guard-1b"],
    replies: [
      { id: "r1", author: "noah", date: "2026-10-16", lang: "en", votes: 112, body: "How did you decide the code ratio in the mixture? The ablation table suggests 18% but you shipped 22%." },
      { id: "r2", author: "orbitalai", date: "2026-10-16", lang: "en", votes: 140, body: "Tool-calling evals improved up to 22% and general chat did not drop. The ablations stopped at 18%; the final run went further." },
      { id: "r3", author: "priya", date: "2026-10-17", lang: "en", votes: 47, body: "Any plans for an official 4-bit build?" },
    ],
  },
  {
    id: "first-dataset-datasheet", category: "help", lang: "en", author: "amara", date: "2026-10-11", votes: 88, views: 3300,
    title: "Publishing your first dataset? Answer these 10 questions first",
    body: "A checklist from curating Kiswahili Commons: provenance, consent, personal data, licence compatibility and more.",
    tags: ["datasets", "datasheets", "guide"], links: ["datasheet-studio", "kiswahili-commons"],
    replies: [
      { id: "r1", author: "tunde", date: "2026-10-12", lang: "en", votes: 19, body: "Number 7 (who can withdraw data and how) is the one people skip." },
    ],
  },
  {
    id: "hindi-coding-assistant", category: "show", lang: "hi", author: "priya", date: "2026-10-12", votes: 133, views: 4700,
    title: "हिंदी में समझाने वाला कोडिंग असिस्टेंट, 8 GB लैपटॉप पर",
    body: "कोड किसी भी भाषा में, समझाना हिंदी में। फीडबैक दीजिए।",
    en: { title: "A coding assistant that explains in Hindi, on an 8 GB laptop", body: "Code in any language, explanations in Hindi. Feedback welcome." },
    tags: ["code", "hindi", "show"], links: ["hindi-coder-3b"],
    replies: [],
  },
]

// News

export type NewsKind = "release" | "paper" | "policy" | "tutorial" | "community"

export const NEWS_KINDS: Record<NewsKind, string> = {
  release: "Release",
  paper: "Paper",
  policy: "Policy",
  tutorial: "Tutorial",
  community: "Community",
}

export type NewsItem = {
  id: string
  kind: NewsKind
  title: string
  source: string
  date: string
  summary: string
  why: string
  by: string
  votes: number
  comments: number
  links: string[]
  image?: string
}

export const news: NewsItem[] = [
  { id: "orbit-8b-open-logs", kind: "release", title: "Orbit 8B ships with every training log in the open", source: "orbital.ai (sample)", date: "2026-10-16", summary: "Weights, data mixture, 36 checkpoints and full loss curves under Apache-2.0.", why: "Most 'open' models are open weights only. Logs let anyone check what the model saw and when.", by: "noah", votes: 1240, comments: 86, links: ["orbit-8b"], image: "/space/deep-field.webp" },
  { id: "tokenizer-fairness-study", kind: "paper", title: "Same sentence, triple the price: a study of tokeniser fairness", source: "arxiv (sample)", date: "2026-10-15", summary: "Across 120 languages, speakers of low-resource languages pay up to 5x more tokens for the same meaning.", why: "Token pricing is a language tax. This is the data you need to argue for better tokenisers.", by: "kai", votes: 860, comments: 54, links: ["token-tax", "tone-tokenizer"], image: "/space/ring.webp" },
  { id: "eu-code-of-practice", kind: "policy", title: "EU publishes the final code of practice for general-purpose models", source: "europa.eu (sample)", date: "2026-10-14", summary: "Clarifies the training-data summary template and the open-source exemptions.", why: "If you release open weights in Europe, the template is now fixed. Act Checker is updated.", by: "jonas", votes: 540, comments: 41, links: ["act-checker"], image: "/space/eagle.webp" },
  { id: "webgpu-everywhere", kind: "release", title: "WebGPU is now on by default in every major browser", source: "web.dev (sample)", date: "2026-10-12", summary: "Firefox on Linux was the last holdout. In-browser models now work for everyone.", why: "Tools like Subtitle Forge can now promise 'nothing leaves your computer' to every visitor.", by: "leo", votes: 980, comments: 62, links: ["subtitle-forge", "orbit-1b-mobile"], image: "/space/horizon.webp" },
  { id: "consented-voice-registry", kind: "community", title: "A shared registry for consented voice data launches", source: "savanna.org (sample)", date: "2026-10-10", summary: "Speakers can see where their voice is used and withdraw it from every listed dataset at once.", why: "Consent that can be withdrawn is the bar. This makes it practical.", by: "amara", votes: 410, comments: 23, links: ["kiswahili-tts", "yoruba-voices"], image: "/space/cliffs.webp" },
  { id: "quant-without-tears", kind: "tutorial", title: "Quantisation without tears: what 4 bits really costs", source: "nexverse forum", date: "2026-10-09", summary: "Twelve models, five methods, one table. Spoiler: the eval you pick decides the winner.", why: "The most practical read of the month for anyone running models locally.", by: "priya", votes: 720, comments: 38, links: ["quant-cookbook"], image: "/space/earth.webp" },
  { id: "agent-loop-benchmark", kind: "paper", title: "LoopBench: measuring when agents get stuck", source: "arxiv (sample)", date: "2026-10-07", summary: "A benchmark built on 12,000 real traces. The best agents still loop in 6% of long tasks.", why: "Finally a number for the thing everyone complains about. Built on agent-traces from this community.", by: "rafa", votes: 630, comments: 47, links: ["agent-traces", "loop-guard"], image: "/space/deep-field.webp" },
  { id: "japanese-dialect-gap", kind: "paper", title: "Language models understand dialects worse than they admit", source: "acl (sample)", date: "2026-10-04", summary: "Models are confident and wrong on Kansai, Tohoku and Okinawan Japanese.", why: "Evals in standard language overstate quality for millions of speakers. Same story everywhere.", by: "mei", votes: 390, comments: 19, links: ["kansai-reading-eval", "kansai-7b"], image: "/space/ring.webp" },
]

// Constellations: hand-made stacks that connect resources into a working whole

export type Constellation = {
  slug: string
  name: string
  goal: string
  curator: string
  saves: number
  /** Resource slugs, in reading order. */
  stars: string[]
  /** Pairs of indexes into stars: what feeds what. */
  links: [number, number][]
  threads: string[]
  image: string
}

export const constellations: Constellation[] = [
  { slug: "offline-voice-assistant", name: "Offline voice assistant", goal: "Speak to a model on your laptop with nothing leaving the room.", curator: "priya", saves: 3120, stars: ["subtitle-forge", "orbit-8b", "quant-cookbook", "kiswahili-tts", "pocket-run"], links: [[0, 1], [2, 1], [1, 3], [1, 4]], threads: ["run-7b-offline-laptop"], image: "/space/earth.webp" },
  { slug: "portuguese-from-scratch", name: "A model that speaks like Lisbon", goal: "Data, recipe and eval to fine-tune a small model for European Portuguese.", curator: "ines", saves: 1870, stars: ["pt-pt-instruct", "tagus-3b-pt", "leakcheck", "serve-small"], links: [[0, 1], [1, 2], [1, 3]], threads: ["fine-tune-3b-european-portuguese"], image: "/space/cliffs.webp" },
  { slug: "agents-that-stop", name: "Agents that know when to stop", goal: "Trace, guard and benchmark an agent so it never loops forty times again.", curator: "rafa", saves: 2640, stars: ["agent-traces", "loop-guard", "tracewatch", "orbit-8b", "guard-1b"], links: [[0, 1], [1, 2], [3, 1], [4, 3]], threads: ["agent-repeats-same-tool"], image: "/space/deep-field.webp" },
  { slug: "tonal-speech", name: "Speech for tonal languages", goal: "Recognise and speak Yoruba and Swahili without erasing what makes them themselves.", curator: "tunde", saves: 1290, stars: ["yoruba-voices", "tone-tokenizer", "yoruba-asr-small", "kiswahili-commons", "kiswahili-tts"], links: [[0, 2], [1, 2], [3, 4]], threads: ["yoruba-tone-marks-asr", "swahili-tts-consent"], image: "/space/horizon.webp" },
  { slug: "rag-you-can-read", name: "Search your own documents", goal: "A retrieval stack small enough to understand, strong enough to ship.", curator: "noah", saves: 2980, stars: ["babel-embed", "tiny-rag", "orbit-8b", "tracewatch"], links: [[0, 1], [2, 1], [1, 3]], threads: ["rag-long-context-vs-retrieval"], image: "/space/ring.webp" },
]

// Lookups

export const getPerson = (handle: string) => people.find((p) => p.handle === handle)
export const getResource = (slug: string) => resources.find((r) => r.slug === slug)
export const getThread = (id: string) => threads.find((t) => t.id === id)
export const getCategory = (slug: string) => categories.find((c) => c.slug === slug)
export const getNews = (id: string) => news.find((n) => n.id === id)
export const getConstellation = (slug: string) => constellations.find((c) => c.slug === slug)

export const byDateDesc = <T extends { date?: string; updated?: string }>(a: T, b: T) =>
  (b.date ?? b.updated ?? "").localeCompare(a.date ?? a.updated ?? "")

export const resourcesOf = (kind?: ResourceKind) => resources.filter((r) => !kind || r.kind === kind)
export const resourcesBy = (handle: string) => resources.filter((r) => r.owner === handle)
export const threadsBy = (handle: string) => threads.filter((t) => t.author === handle)
export const threadsIn = (category: string) => threads.filter((t) => t.category === category)
export const threadsAbout = (slug: string) => threads.filter((t) => t.links.includes(slug))
export const constellationsWith = (slug: string) => constellations.filter((c) => c.stars.includes(slug))
export const newsAbout = (slug: string) => news.filter((n) => n.links.includes(slug))
export const threadTitle = (t: Thread) => t.en?.title ?? t.title
export const resourcePath = (r: Pick<Resource, "kind" | "slug">) => `${KINDS[r.kind].path}/${r.slug}`

/** A trending score: likes weighted by how recently the thing was updated. */
export function trending<T extends { likes?: number; votes?: number; updated?: string; date?: string }>(items: T[]) {
  const now = Date.parse("2026-10-18")
  const score = (x: T) => {
    const days = (now - Date.parse(x.updated ?? x.date ?? "2026-01-01")) / 86400000
    return (x.likes ?? x.votes ?? 0) / Math.pow(days + 2, 1.2)
  }
  return [...items].sort((a, b) => score(b) - score(a))
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "3 days ago" against the preview's fixed today, so server and client agree. */
export function ago(iso: string) {
  const days = Math.round((Date.parse("2026-10-18") - Date.parse(iso.slice(0, 10))) / 86400000)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days} days ago`
  return formatDate(iso)
}

export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`
  return String(n)
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${compact(n)} ${n === 1 ? one : many}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Members' posts have database ids; sample threads have readable slugs. */
export const isQuestionId = (id: string) => UUID.test(id)
