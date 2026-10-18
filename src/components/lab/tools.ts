import { BracesIcon, CoinsIcon, DatabaseIcon, FileTextIcon, MemoryStickIcon, ScaleIcon, type LucideIcon } from "lucide-react"

export type LabToolSlug = "vram" | "tokens" | "licences" | "model-card" | "dataset-card" | "prompts"

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
}

export const LAB_TOOLS: LabTool[] = [
  {
    slug: "vram",
    name: "VRAM calculator",
    tagline: "Will it fit? Memory for weights, KV cache and training, and which GPUs can hold it.",
    intro:
      "Pick a model size, precision and context, and see where the memory goes: weights, KV cache, activations, and for training the gradients and optimizer. The numbers are planning estimates; real runtimes add their own overhead. Share the exact setup with the link.",
    icon: MemoryStickIcon,
    tint: "143 180 255",
    category: "local",
  },
  {
    slug: "tokens",
    name: "Token cost",
    tagline: "Estimate tokens per script and what a workload costs per month at your prices.",
    intro:
      "Paste text in any language to estimate its token count, broken down by writing system, then enter your own prices and traffic to see the monthly cost. Counts are heuristic estimates: real tokenisers differ, especially outside Latin script.",
    icon: CoinsIcon,
    tint: "216 197 158",
    category: "languages",
  },
  {
    slug: "licences",
    name: "Licence checker",
    tagline: "What can you do with this model or dataset? Can, must and can't, side by side.",
    intro:
      "Choose a licence and what you want to do with the model or data, and get a plain-language answer with the conditions attached. Compare two licences to see where they differ. This is a summary to orient you, not legal advice.",
    icon: ScaleIcon,
    tint: "211 180 255",
    category: "policy",
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
  },
  {
    slug: "prompts",
    name: "Prompt playground",
    tagline: "Build prompt templates with {variables}, fill them in and check the token count.",
    intro:
      "Write a template with {variables} in braces, fill the values and see the rendered prompt with its estimated size. Templates you save live in this browser only. Use {{ and }} for literal braces.",
    icon: BracesIcon,
    tint: "127 224 176",
    category: "agents",
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
