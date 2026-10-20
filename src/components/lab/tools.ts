import {
  BinaryIcon,
  BracesIcon,
  CoinsIcon,
  CpuIcon,
  DatabaseIcon,
  FileJson2Icon,
  FileTextIcon,
  GaugeIcon,
  HashIcon,
  LayersIcon,
  MemoryStickIcon,
  RegexIcon,
  ScaleIcon,
  ScissorsIcon,
  ShrinkIcon,
  SplitIcon,
  WaypointsIcon,
  type LucideIcon,
} from "lucide-react"

export type LabToolSlug =
  | "prompts"
  | "token-counter"
  | "context"
  | "inference-cost"
  | "vram"
  | "fine-tuning"
  | "quantization"
  | "tokens"
  | "rag-chunks"
  | "embeddings"
  | "json-schema"
  | "regex"
  | "licences"
  | "licence-compare"
  | "model-card"
  | "dataset-card"

export type LabCategory = "prompting" | "compute" | "data" | "docs"

export const CATEGORIES: { id: LabCategory; label: string; blurb: string }[] = [
  { id: "prompting", label: "Prompts and context", blurb: "Write, run and size what you send to a model." },
  { id: "compute", label: "Cost and hardware", blurb: "Money, memory and time, before you commit." },
  { id: "data", label: "Data and retrieval", blurb: "Shape text and outputs for RAG and structured answers." },
  { id: "docs", label: "Licences and docs", blurb: "What you may do with a model, and how to document yours." },
]

export type LabTool = {
  slug: LabToolSlug
  name: string
  /** One line for cards and metadata. */
  tagline: string
  /** The short paragraph above the tool. */
  intro: string
  icon: LucideIcon
  /** rgb triplet used for the card glow and accents. */
  tint: string
  /** Forum category for "Discuss this". */
  category: string
  group: LabCategory
  /** Extra words the index search matches. */
  keywords: string
  /** Added in this release: shows a "New" badge on the index. */
  isNew?: boolean
  /** Needs the site's AI (sign-in to run); everything else runs only in the browser. */
  usesAi?: boolean
  /** Set by admins in /admin/lists: shown first on the index with a star. */
  featured?: boolean
  /** Set by admins in /admin/lists: false hides the tool and its page. Missing means shown. */
  enabled?: boolean
}

/*
 * LAB_TOOLS and CATEGORIES below are the defaults. Admins rename, reorder, feature and switch off tools, and
 * rename the shelves, in /admin/lists (site_content "lists.lab.tools" and "lists.lab.categories"): pages read
 * that live version with useLabTools() / useLabShelves() (lib/lists/hooks.ts) or, on the server,
 * getLabTools() / getLabShelves() (lib/lists/server.ts). Icons, tints and keywords always come from here.
 */

export const LAB_TOOLS: LabTool[] = [
  {
    slug: "prompts",
    name: "Prompt playground",
    tagline: "Run a prompt on the site's free models, compare up to three side by side, save and share it.",
    intro:
      "Write a system and user prompt with {{variables}}, fill them in, and run it on one to three of the free models this site can reach. Answers come back side by side with their latency and an estimated token count. Runs stay in this browser's history; save a prompt to your account to share it with a link.",
    icon: BracesIcon,
    tint: "127 224 176",
    category: "agents",
    group: "prompting",
    keywords: "llm compare models system prompt template variables run share",
    isNew: true,
    usesAi: true,
  },
  {
    slug: "token-counter",
    name: "Token counter",
    tagline: "Estimated tokens for the same text across seven tokenizer families, with the pieces shown.",
    intro:
      "Paste text and see roughly how each tokenizer family cuts it. The pieces use the real pre-tokenizer pattern; how many tokens each piece becomes is estimated from per-family rates, because shipping every vocabulary would make this page tens of megabytes. Expect about ten percent error on English and more on other scripts.",
    icon: HashIcon,
    tint: "143 180 255",
    category: "languages",
    group: "prompting",
    keywords: "tokenizer tiktoken bpe sentencepiece count o200k cl100k llama gemma qwen mistral claude",
    isNew: true,
  },
  {
    slug: "context",
    name: "Context window calculator",
    tagline: "Fit a system prompt, documents, chat history and the answer into one window.",
    intro:
      "Add what a request carries and see it laid out against the model's context window, with room for the answer and a safety margin. Paste text to measure a document, or type a token count you already know.",
    icon: LayersIcon,
    tint: "169 194 255",
    category: "agents",
    group: "prompting",
    keywords: "context length window fit history rag budget tokens",
    isNew: true,
  },
  {
    slug: "inference-cost",
    name: "Inference cost and speed",
    tagline: "Monthly cost, latency and concurrency for your traffic, across the models you price.",
    intro:
      "Enter your traffic and the prices you pay, and compare models on cost per request, per month, time to answer and how many requests run at once. Some list prices are filled in from the vendors' pricing pages, with the date they were checked; edit any value.",
    icon: CoinsIcon,
    tint: "216 197 158",
    category: "local",
    group: "compute",
    keywords: "price pricing api cost per million tokens latency throughput tokens per second budget",
    isNew: true,
  },
  {
    slug: "vram",
    name: "VRAM calculator",
    tagline: "Will it fit? Memory for weights, KV cache and training, and which GPUs can hold it.",
    intro:
      "Pick a model size, precision and context, and see where the memory goes: weights, KV cache, activations, and for training the gradients and optimizer. The numbers are planning estimates; real runtimes add their own overhead. Share the exact setup with the link.",
    icon: MemoryStickIcon,
    tint: "143 180 255",
    category: "local",
    group: "compute",
    keywords: "gpu memory kv cache inference local fit",
  },
  {
    slug: "fine-tuning",
    name: "Fine-tuning calculator",
    tagline: "Memory and training time for full fine-tuning, LoRA and QLoRA, with the formulas cited.",
    intro:
      "Set the model size, method, batch, sequence length and optimizer to see the memory per GPU, then the dataset and hardware to estimate how long training takes. Every formula is shown with its source, so you can check the reasoning.",
    icon: CpuIcon,
    tint: "211 180 255",
    category: "local",
    group: "compute",
    keywords: "lora qlora training finetune memory time flops gpu hours adam optimizer",
    isNew: true,
  },
  {
    slug: "quantization",
    name: "Quantization sizes",
    tagline: "File size of a model at every common precision, from FP32 to 2-bit GGUF.",
    intro:
      "Enter a parameter count and see how big the weights are at each precision, how much smaller than 16-bit, and whether they fit a memory budget you set. Sizes cover weights only; the VRAM calculator adds the KV cache and runtime.",
    icon: ShrinkIcon,
    tint: "159 227 207",
    category: "local",
    group: "compute",
    keywords: "gguf q4 q8 int4 awq gptq bits size download",
    isNew: true,
  },
  {
    slug: "tokens",
    name: "Token cost by script",
    tagline: "Tokens per writing system and what a workload costs per month at your prices.",
    intro:
      "Paste text in any language to estimate its token count, broken down by writing system, then enter your own prices and traffic to see the monthly cost. Counts are heuristic estimates: real tokenisers differ, especially outside Latin script.",
    icon: GaugeIcon,
    tint: "216 197 158",
    category: "languages",
    group: "compute",
    keywords: "languages multilingual script cost",
  },
  {
    slug: "rag-chunks",
    name: "RAG chunk planner",
    tagline: "Split a document four ways, see every chunk in place, and price the embeddings.",
    intro:
      "Paste a document and choose how to split it: fixed characters, about N tokens, whole sentences, or Markdown sections. Chunks are coloured in place with their overlaps, with counts and the cost to embed them at the price you enter.",
    icon: ScissorsIcon,
    tint: "255 197 138",
    category: "data",
    group: "data",
    keywords: "retrieval chunking split overlap embeddings vector markdown sentences",
    isNew: true,
  },
  {
    slug: "embeddings",
    name: "Embedding similarity",
    tagline: "Paste vectors and see cosine similarity, dot product and distance for every pair.",
    intro:
      "Paste embedding vectors from any model, as JSON or one per line, and compare them pairwise. Useful to check that similar texts really land close together before you build retrieval on top.",
    icon: WaypointsIcon,
    tint: "127 214 224",
    category: "data",
    group: "data",
    keywords: "vectors cosine similarity dot product euclidean distance heatmap",
    isNew: true,
  },
  {
    slug: "json-schema",
    name: "JSON Schema builder",
    tagline: "Build a schema for structured outputs field by field, and validate what a model returns.",
    intro:
      "Add fields, nest objects and arrays, set limits and allowed values, and get the JSON Schema with a matching example. Paste a model's reply to check it against the schema. The validator covers the keywords this builder writes and tells you about any it skips.",
    icon: FileJson2Icon,
    tint: "143 180 255",
    category: "agents",
    group: "data",
    keywords: "structured output json schema validator function calling tools response format",
    isNew: true,
  },
  {
    slug: "regex",
    name: "Regex tester",
    tagline: "Live matches, capture groups and replace preview, with patterns for cleaning AI data.",
    intro:
      "Type a pattern and see every match highlighted as you go, the capture groups in a table, and what a replacement would produce. Start from the library of patterns for model replies, personal data and documents.",
    icon: RegexIcon,
    tint: "255 159 138",
    category: "data",
    group: "data",
    keywords: "regular expression extract replace pii clean scrub groups",
    isNew: true,
  },
  {
    slug: "licences",
    name: "Licence checker",
    tagline: "What can you do with this model or dataset? Can, must and can't, for each use.",
    intro:
      "Choose a licence and what you want to do with the model or data, and get a plain-language answer with the conditions attached. This is a summary to orient you, not legal advice.",
    icon: ScaleIcon,
    tint: "211 180 255",
    category: "policy",
    group: "docs",
    keywords: "license licence legal commercial use apache mit gpl creative commons",
  },
  {
    slug: "licence-compare",
    name: "Licence comparator",
    tagline: "Two or three licences side by side: copyleft, patents, attribution and every use.",
    intro:
      "Pick up to three model, data or code licences and compare the facts that decide most questions, with links to the official licence texts. Differences are highlighted. Not legal advice.",
    icon: SplitIcon,
    tint: "233 199 154",
    category: "policy",
    group: "docs",
    keywords: "license compare side by side copyleft patent attribution spdx",
    isNew: true,
  },
  {
    slug: "model-card",
    name: "Model card builder",
    tagline: "A guided form that writes a complete model card in Markdown as you type.",
    intro:
      "Fill in what you know, skip what you don't. The card is written live in Markdown with metadata front matter, ready to copy, download as README.md, or publish on Nexverse. Your draft stays in this browser.",
    icon: FileTextIcon,
    tint: "169 194 255",
    category: "models",
    group: "docs",
    keywords: "readme documentation model card",
  },
  {
    slug: "dataset-card",
    name: "Dataset card builder",
    tagline: "Document where data came from, what is in it and how it should be used.",
    intro:
      "Answer the questions a reader will have about your dataset: sources, structure, consent and personal information, intended uses and known gaps. The Markdown card updates as you type. Your draft stays in this browser.",
    icon: DatabaseIcon,
    tint: "159 227 207",
    category: "data",
    group: "docs",
    keywords: "readme documentation datasheet dataset card",
  },
]

export const getLabTool = (slug: string) => LAB_TOOLS.find((t) => t.slug === slug)

export const labPath = (slug: LabToolSlug) => `/lab/${slug}`

/** For the saved page: turns a "lab:<slug>" bookmark into something to show. */
export function describeLabTarget(target: string): { label: string; href: string } | null {
  if (!target.startsWith("lab:")) return null
  const t = getLabTool(target.slice(4))
  return t ? { label: t.name, href: labPath(t.slug) } : null
}

/** Icons used in the index for categories. */
export const CATEGORY_ICON: Record<LabCategory, LucideIcon> = { prompting: BracesIcon, compute: CpuIcon, data: BinaryIcon, docs: FileTextIcon }
