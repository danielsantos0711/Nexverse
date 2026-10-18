/*
 * Model and dataset cards: the questions to ask, and how the answers become a README.md with
 * Hub-style YAML front matter. Empty answers are left out, so a half-finished card still reads well.
 */

export type FieldKind = "text" | "textarea" | "tags" | "select" | "code"

export type CardField = {
  id: string
  label: string
  kind: FieldKind
  placeholder?: string
  help?: string
  options?: { value: string; label: string }[]
  /** Counts towards the completeness meter. */
  recommended?: boolean
  rows?: number
}

export type CardSection = { id: string; title: string; description?: string; fields: CardField[] }

export type CardValues = Record<string, string>

export type CardKind = "model" | "dataset"

export type CardConfig = {
  kind: CardKind
  storageKey: string
  sections: CardSection[]
  example: CardValues
  render: (v: CardValues) => string
}

export const LICENCE_OPTIONS = [
  { value: "", label: "Choose a licence" },
  { value: "apache-2.0", label: "Apache 2.0" },
  { value: "mit", label: "MIT" },
  { value: "bsd-3-clause", label: "BSD 3-Clause" },
  { value: "gpl-3.0", label: "GPL 3.0" },
  { value: "agpl-3.0", label: "AGPL 3.0" },
  { value: "cc-by-4.0", label: "CC BY 4.0" },
  { value: "cc-by-nc-4.0", label: "CC BY-NC 4.0" },
  { value: "cc-by-sa-4.0", label: "CC BY-SA 4.0" },
  { value: "openrail", label: "OpenRAIL" },
  { value: "cc0-1.0", label: "CC0 1.0" },
  { value: "other", label: "Other / custom" },
]

const licenceLabel = (v: string) => LICENCE_OPTIONS.find((o) => o.value === v)?.label ?? v

/* ---------------------------------------------------------------- helpers */

export const splitList = (s: string | undefined) =>
  (s ?? "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)

function yamlScalar(s: string) {
  return /^[\w.\-/ ]+$/.test(s) && !/^\s|\s$/.test(s) && !/^(true|false|null|yes|no|~|\d[\d.]*)$/i.test(s) ? s : JSON.stringify(s)
}

function frontMatter(entries: [string, string | string[] | undefined][]) {
  const lines: string[] = []
  for (const [k, v] of entries) {
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue
    if (Array.isArray(v)) {
      lines.push(`${k}:`)
      for (const x of v) lines.push(`- ${yamlScalar(x)}`)
    } else lines.push(`${k}: ${yamlScalar(v)}`)
  }
  return lines.length ? `---\n${lines.join("\n")}\n---\n\n` : ""
}

const t = (s: string | undefined) => (s ?? "").trim()

function section(title: string, body: string | undefined, level = 2) {
  const b = t(body)
  return b ? `${"#".repeat(level)} ${title}\n\n${b}\n\n` : ""
}

function facts(rows: [string, string | undefined][]) {
  const r = rows.filter(([, v]) => t(v))
  return r.length ? r.map(([k, v]) => `- **${k}:** ${t(v)}`).join("\n") + "\n\n" : ""
}

function fence(lang: string, code: string | undefined) {
  const c = t(code)
  if (!c) return ""
  const ticks = c.includes("```") ? "````" : "```"
  return `${ticks}${lang}\n${c}\n${ticks}\n\n`
}

/** Splits a rendered card into its YAML metadata and the Markdown body. */
export function splitFrontMatter(md: string): { meta: [string, string][]; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n+/)
  if (!m) return { meta: [], body: md }
  const meta: [string, string][] = []
  let key = ""
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (kv) {
      key = kv[1]
      meta.push([key, kv[2]])
    } else if (line.startsWith("- ") && key) {
      const last = meta[meta.length - 1]
      last[1] = last[1] ? `${last[1]}, ${line.slice(2)}` : line.slice(2)
    }
  }
  return { meta: meta.map(([k, v]) => [k, v.replace(/^"|"$/g, "")]), body: md.slice(m[0].length) }
}

/* ------------------------------------------------------------- model card */

export const MODEL_CARD: CardConfig = {
  kind: "model",
  storageKey: "nexverse:lab:model-card",
  sections: [
    {
      id: "basics",
      title: "The basics",
      description: "What it is, in a sentence or two.",
      fields: [
        { id: "name", label: "Model name", kind: "text", placeholder: "orbit-8b-instruct", recommended: true },
        { id: "summary", label: "One-line summary", kind: "text", placeholder: "An 8B instruction-tuned model for Portuguese and Spanish customer support.", recommended: true },
        { id: "description", label: "Description", kind: "textarea", placeholder: "What the model does, how it differs from its base, what it is good at.", recommended: true, rows: 4 },
        { id: "developers", label: "Developed by", kind: "text", placeholder: "Your name, team or organisation" },
        { id: "license", label: "Licence", kind: "select", options: LICENCE_OPTIONS, recommended: true },
        { id: "baseModel", label: "Fine-tuned from", kind: "text", placeholder: "owner/base-model", help: "Leave empty if trained from scratch." },
        { id: "task", label: "Task", kind: "text", placeholder: "text-generation" },
        { id: "params", label: "Parameters", kind: "text", placeholder: "8B" },
        { id: "languages", label: "Languages", kind: "tags", placeholder: "pt, es, en", help: "ISO codes, separated by commas.", recommended: true },
        { id: "tags", label: "Tags", kind: "tags", placeholder: "instruct, customer-support, gguf" },
      ],
    },
    {
      id: "uses",
      title: "Uses",
      description: "Who should use it, for what, and what it should not be used for.",
      fields: [
        { id: "intended", label: "Intended uses", kind: "textarea", placeholder: "Drafting replies for support agents to review…", recommended: true },
        { id: "outOfScope", label: "Out-of-scope uses", kind: "textarea", placeholder: "Medical, legal or financial advice without human review…", recommended: true },
        { id: "howTo", label: "How to use", kind: "code", placeholder: 'from transformers import pipeline\n\npipe = pipeline("text-generation", model="you/orbit-8b-instruct")\nprint(pipe("Olá!")[0]["generated_text"])', rows: 5 },
      ],
    },
    {
      id: "training",
      title: "Training",
      fields: [
        { id: "datasets", label: "Training datasets", kind: "tags", placeholder: "owner/dataset-a, owner/dataset-b" },
        { id: "trainingData", label: "Training data", kind: "textarea", placeholder: "What the data is, where it came from, how it was filtered.", recommended: true },
        { id: "procedure", label: "Training procedure", kind: "textarea", placeholder: "LoRA r=16 on all linear layers, 3 epochs, lr 2e-4, bf16, sequence length 4096…" },
        { id: "hardware", label: "Hardware and time", kind: "text", placeholder: "1× 80 GB GPU, 14 hours" },
      ],
    },
    {
      id: "eval",
      title: "Evaluation",
      fields: [
        { id: "evaluation", label: "Results", kind: "textarea", placeholder: "| Benchmark | Score |\n|---|---|\n| Support-QA (pt) | 71.2 |", help: "Markdown tables work.", recommended: true, rows: 4 },
      ],
    },
    {
      id: "risks",
      title: "Risks and limitations",
      fields: [
        { id: "limitations", label: "Bias, risks and limitations", kind: "textarea", placeholder: "Known failure modes, languages or groups it serves less well…", recommended: true },
        { id: "recommendations", label: "Recommendations", kind: "textarea", placeholder: "Keep a human in the loop for…" },
      ],
    },
    {
      id: "extras",
      title: "Citation and contact",
      fields: [
        { id: "citation", label: "Citation (BibTeX)", kind: "code", placeholder: "@misc{orbit2026, …}" },
        { id: "contact", label: "Contact", kind: "text", placeholder: "Where to report issues" },
      ],
    },
  ],
  example: {
    name: "orbit-8b-instruct-pt",
    summary: "An 8B model fine-tuned to draft customer-support replies in European and Brazilian Portuguese.",
    description: "A LoRA fine-tune of an 8B base model on 40k anonymised support conversations. It follows instructions in Portuguese, keeps a polite register and cites the knowledge-base article it relied on.",
    developers: "Nexverse community",
    license: "apache-2.0",
    baseModel: "nexverse/orbit-8b",
    task: "text-generation",
    params: "8B",
    languages: "pt, en",
    tags: "instruct, customer-support, portuguese",
    intended: "Drafting first replies that a human agent reviews before sending.",
    outOfScope: "Sending replies without review; legal, medical or financial advice.",
    howTo: 'from transformers import pipeline\n\npipe = pipeline("text-generation", model="nexverse/orbit-8b-instruct-pt")\nprint(pipe("Olá! Como posso alterar a minha morada?")[0]["generated_text"])',
    datasets: "nexverse/support-pt-40k",
    trainingData: "40k support conversations, anonymised and filtered for personal data, split 90/10.",
    procedure: "LoRA r=16 on all linear layers, 3 epochs, learning rate 2e-4, bf16, sequence length 4096.",
    hardware: "1× 80 GB GPU, 14 hours",
    evaluation: "| Benchmark | Base | This model |\n|---|---|---|\n| Support-QA (pt) | 58.1 | 71.2 |",
    limitations: "Weaker on African Portuguese varieties. May invent policy details when the knowledge base is silent.",
    recommendations: "Ground replies with retrieval and keep a human in the loop.",
    contact: "Open a discussion on the model page.",
  },
  render(v) {
    const fm = frontMatter([
      ["license", t(v.license)],
      ["language", splitList(v.languages)],
      ["base_model", t(v.baseModel)],
      ["pipeline_tag", t(v.task)],
      ["datasets", splitList(v.datasets)],
      ["tags", splitList(v.tags)],
    ])
    let md = `# ${t(v.name) || "Model name"}\n\n`
    if (t(v.summary)) md += `${t(v.summary)}\n\n`
    const details =
      facts([
        ["Developed by", v.developers],
        ["Model type", v.task],
        ["Parameters", v.params],
        ["Languages", splitList(v.languages).join(", ")],
        ["Licence", v.license ? licenceLabel(v.license) : ""],
        ["Fine-tuned from", v.baseModel],
      ]) + (t(v.description) ? `${t(v.description)}\n\n` : "")
    md += details.trim() ? `## Model details\n\n${details}` : ""
    const uses = section("Intended uses", v.intended, 3) + section("Out-of-scope uses", v.outOfScope, 3)
    md += uses ? `## Uses\n\n${uses}` : ""
    md += t(v.howTo) ? `## How to use\n\n${fence("python", v.howTo)}` : ""
    const training =
      section("Training data", v.trainingData, 3) +
      (splitList(v.datasets).length ? `Datasets: ${splitList(v.datasets).join(", ")}\n\n` : "") +
      section("Training procedure", v.procedure, 3) +
      (t(v.hardware) ? `**Hardware and time:** ${t(v.hardware)}\n\n` : "")
    md += training ? `## Training\n\n${training}` : ""
    md += section("Evaluation", v.evaluation)
    const risks = (t(v.limitations) ? `${t(v.limitations)}\n\n` : "") + section("Recommendations", v.recommendations, 3)
    md += risks ? `## Bias, risks and limitations\n\n${risks}` : ""
    md += t(v.citation) ? `## Citation\n\n${fence("bibtex", v.citation)}` : ""
    md += section("Contact", v.contact)
    return (fm + md).trimEnd() + "\n"
  },
}

/* ----------------------------------------------------------- dataset card */

const SIZE_OPTIONS = [
  { value: "", label: "Choose a size" },
  { value: "n<1K", label: "Fewer than 1K rows" },
  { value: "1K<n<10K", label: "1K–10K" },
  { value: "10K<n<100K", label: "10K–100K" },
  { value: "100K<n<1M", label: "100K–1M" },
  { value: "1M<n<10M", label: "1M–10M" },
  { value: "10M<n<100M", label: "10M–100M" },
  { value: "n>100M", label: "More than 100M" },
]

export const DATASET_CARD: CardConfig = {
  kind: "dataset",
  storageKey: "nexverse:lab:dataset-card",
  sections: [
    {
      id: "basics",
      title: "The basics",
      fields: [
        { id: "name", label: "Dataset name", kind: "text", placeholder: "support-pt-40k", recommended: true },
        { id: "summary", label: "One-line summary", kind: "text", placeholder: "40k anonymised customer-support conversations in Portuguese.", recommended: true },
        { id: "description", label: "Description", kind: "textarea", placeholder: "What is in it, why it was made, what makes it useful.", recommended: true, rows: 4 },
        { id: "curators", label: "Curated by", kind: "text", placeholder: "Your name, team or organisation" },
        { id: "license", label: "Licence", kind: "select", options: LICENCE_OPTIONS, recommended: true },
        { id: "languages", label: "Languages", kind: "tags", placeholder: "pt, en", recommended: true },
        { id: "size", label: "Size", kind: "select", options: SIZE_OPTIONS },
        { id: "tasks", label: "Tasks", kind: "tags", placeholder: "text-generation, question-answering" },
        { id: "tags", label: "Tags", kind: "tags", placeholder: "conversations, support, anonymised" },
      ],
    },
    {
      id: "structure",
      title: "Structure",
      fields: [
        { id: "structure", label: "Fields and format", kind: "textarea", placeholder: "| Field | Type | Description |\n|---|---|---|\n| messages | list | The conversation turns |", help: "Markdown tables work.", recommended: true, rows: 4 },
        { id: "splits", label: "Splits", kind: "text", placeholder: "train 36,000 · test 4,000" },
        { id: "example", label: "Example record", kind: "code", placeholder: '{"messages": [{"role": "user", "content": "…"}]}' },
      ],
    },
    {
      id: "source",
      title: "Where it came from",
      fields: [
        { id: "sources", label: "Source data", kind: "textarea", placeholder: "Who produced the original data, and how it was collected.", recommended: true },
        { id: "processing", label: "Processing and filtering", kind: "textarea", placeholder: "Deduplication, language filtering, quality thresholds…" },
        { id: "annotation", label: "Annotations", kind: "textarea", placeholder: "Who labelled it, with what guidelines, how they were paid, agreement scores." },
        { id: "personal", label: "Personal and sensitive information", kind: "textarea", placeholder: "Was consent given? What was removed or anonymised, and how?", recommended: true },
      ],
    },
    {
      id: "uses",
      title: "Uses and limits",
      fields: [
        { id: "uses", label: "Intended uses", kind: "textarea", placeholder: "Fine-tuning and evaluating support assistants…", recommended: true },
        { id: "outOfScope", label: "Out-of-scope uses", kind: "textarea", placeholder: "Re-identifying customers; profiling…" },
        { id: "biases", label: "Bias, risks and limitations", kind: "textarea", placeholder: "Who is over- or under-represented, known gaps.", recommended: true },
      ],
    },
    {
      id: "extras",
      title: "Maintenance and citation",
      fields: [
        { id: "maintenance", label: "Maintenance", kind: "text", placeholder: "Updated quarterly; report issues in discussions." },
        { id: "citation", label: "Citation (BibTeX)", kind: "code", placeholder: "@misc{supportpt2026, …}" },
      ],
    },
  ],
  example: {
    name: "support-pt-40k",
    summary: "40k anonymised customer-support conversations in European and Brazilian Portuguese.",
    description: "Real support conversations from three telecom and utility companies, donated with consent and anonymised. Useful for training and evaluating assistants that draft support replies.",
    curators: "Nexverse community",
    license: "cc-by-4.0",
    languages: "pt",
    size: "10K<n<100K",
    tasks: "text-generation, conversational",
    tags: "conversations, support, anonymised",
    structure: "| Field | Type | Description |\n|---|---|---|\n| messages | list | Conversation turns with role and content |\n| variety | string | pt-PT or pt-BR |\n| topic | string | Billing, outage, moving, other |",
    splits: "train 36,000 · test 4,000",
    example: '{"messages": [{"role": "user", "content": "Olá, a minha fatura veio duplicada."}], "variety": "pt-PT", "topic": "billing"}',
    sources: "Chat logs donated by three companies under a data-sharing agreement; customers opted in.",
    processing: "Exact and near-duplicate removal, conversations under three turns dropped, language ID filter at 0.9.",
    personal: "Names, addresses, phone and account numbers replaced with placeholders by a NER model and a manual pass on 5% of records.",
    uses: "Fine-tuning and evaluating support assistants.",
    outOfScope: "Any attempt to re-identify customers.",
    biases: "Mostly urban customers; few conversations from Portugal's islands or African Portuguese speakers.",
    maintenance: "Updated twice a year. Report issues in the dataset discussions.",
  },
  render(v) {
    const fm = frontMatter([
      ["license", t(v.license)],
      ["language", splitList(v.languages)],
      ["size_categories", t(v.size) ? [t(v.size)] : undefined],
      ["task_categories", splitList(v.tasks)],
      ["tags", splitList(v.tags)],
      ["pretty_name", t(v.name)],
    ])
    let md = `# ${t(v.name) || "Dataset name"}\n\n`
    if (t(v.summary)) md += `${t(v.summary)}\n\n`
    const details =
      facts([
        ["Curated by", v.curators],
        ["Languages", splitList(v.languages).join(", ")],
        ["Licence", v.license ? licenceLabel(v.license) : ""],
        ["Size", SIZE_OPTIONS.find((o) => o.value === v.size && o.value)?.label],
        ["Tasks", splitList(v.tasks).join(", ")],
      ]) + (t(v.description) ? `${t(v.description)}\n\n` : "")
    md += details.trim() ? `## Dataset details\n\n${details}` : ""
    const structure = (t(v.structure) ? `${t(v.structure)}\n\n` : "") + (t(v.splits) ? `**Splits:** ${t(v.splits)}\n\n` : "") + (t(v.example) ? `### Example\n\n${fence("json", v.example)}` : "")
    md += structure ? `## Dataset structure\n\n${structure}` : ""
    const creation = section("Source data", v.sources, 3) + section("Processing", v.processing, 3) + section("Annotations", v.annotation, 3) + section("Personal and sensitive information", v.personal, 3)
    md += creation ? `## How it was made\n\n${creation}` : ""
    const uses = section("Intended uses", v.uses, 3) + section("Out-of-scope uses", v.outOfScope, 3)
    md += uses ? `## Uses\n\n${uses}` : ""
    md += section("Bias, risks and limitations", v.biases)
    md += section("Maintenance", v.maintenance)
    md += t(v.citation) ? `## Citation\n\n${fence("bibtex", v.citation)}` : ""
    return (fm + md).trimEnd() + "\n"
  },
}
