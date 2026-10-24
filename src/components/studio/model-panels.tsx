"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"
import { CheckIcon, CopyIcon, GaugeIcon, ServerIcon } from "lucide-react"
import { ModelScores } from "@/components/benchmarks/model-scores"
import { Tokens } from "@/components/code/code-view"
import { Copy } from "@/components/content/copy"
import { highlightLines } from "@/lib/code/highlight"
import { langOf } from "@/lib/code/lang"
import { compact } from "@/lib/data"
import type { HostedFile } from "@/lib/publish/files"
import type { ModelSpecs, Pricing, Project } from "@/lib/projects"
import { cn } from "@/lib/utils"

/*
 * The parts of a model page that read its specs: the facts in the header, the parameters table, the providers
 * (endpoints) table, benchmarks and quick-start code. Everything shown comes from the project's specs, its
 * files or its benchmark results; a missing value is left out, not guessed.
 */

export const tokens = (n?: number) => (n ? `${compact(n)} tokens` : null)

/** "$0.15" per million tokens, "$0.0004" for tiny prices, "Free" when both sides are zero. */
export function price(n?: number) {
  if (n === undefined) return "–"
  if (n === 0) return "Free"
  return `$${n >= 1 ? n.toFixed(2).replace(/\.00$/, "") : n >= 0.01 ? n.toFixed(3).replace(/0+$/, "") : n.toPrecision(2)}`
}

export function pricingLine(p?: Pricing): string | null {
  if (!p) return null
  if (p.free || (p.prompt === 0 && p.completion === 0)) return "Free"
  if (p.prompt === undefined && p.completion === undefined) return null
  return `${price(p.prompt)} in · ${price(p.completion)} out`
}

export const modalities = (m?: ModelSpecs) => (m?.inputModalities?.length || m?.outputModalities?.length ? `${(m.inputModalities ?? ["?"]).join(" + ")} → ${(m.outputModalities ?? ["?"]).join(" + ")}` : null)

/** The header facts: provider, context, pricing, modalities and size. */
export function ModelFacts({ specs, className }: { specs: ModelSpecs; className?: string }) {
  const facts = [
    specs.provider && { k: "Provider", v: specs.provider },
    specs.contextLength && { k: "Context", v: tokens(specs.contextLength)! },
    pricingLine(specs.pricing) && { k: "Pricing", v: pricingLine(specs.pricing)!, note: specs.pricing?.free ? undefined : "per 1M tokens" },
    modalities(specs) && { k: "Modalities", v: modalities(specs)! },
    specs.parameters && { k: "Parameters", v: specs.parameters },
  ].filter(Boolean) as { k: string; v: string; note?: string }[]
  if (!facts.length) return null
  return (
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5", className)}>
      {facts.map((f) => (
        <div key={f.k} className="flex min-w-0 flex-col gap-0.5 bg-card px-3.5 py-2.5">
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{f.k}</dt>
          <dd className={cn("truncate text-sm font-medium", f.v === "Free" && "text-ok")} title={f.v}>
            {f.v}
            {f.note && <span className="ml-1 text-xs font-normal text-muted-foreground">{f.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Every spec as a table, for the overview's side and for comparing. */
export function SpecsTable({ specs, title = "Parameters" }: { specs: ModelSpecs; title?: string }) {
  const rows: [string, React.ReactNode][] = (
    [
      ["Provider", specs.provider],
      ["Parameters", specs.parameters],
      ["Architecture", specs.architecture],
      ["Context length", tokens(specs.contextLength)],
      ["Max output", tokens(specs.maxOutput)],
      ["Input price", specs.pricing?.prompt !== undefined ? `${price(specs.pricing.prompt)} / 1M tokens` : null],
      ["Output price", specs.pricing?.completion !== undefined ? `${price(specs.pricing.completion)} / 1M tokens` : null],
      ["Per request", specs.pricing?.request ? price(specs.pricing.request) : null],
      ["Input", specs.inputModalities?.join(", ")],
      ["Output", specs.outputModalities?.join(", ")],
      ["Tokenizer", specs.tokenizer],
      ["Library", specs.library],
      ["Task", specs.pipeline?.replace(/-/g, " ")],
      ["Base model", specs.baseModel],
      ["Weights", specs.quantizations?.join(", ")],
      ["Knowledge cutoff", specs.knowledgeCutoff],
    ] as [string, React.ReactNode][]
  ).filter(([, v]) => v !== undefined && v !== null && v !== "")
  if (!rows.length && !specs.supportedParameters?.length) return null
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length > 0 && (
        <dl className="flex flex-col divide-y divide-border text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 text-right break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {specs.supportedParameters?.length ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Supported request parameters</span>
          <div className="flex flex-wrap gap-1">
            {specs.supportedParameters.map((p) => (
              <code key={p} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px]">
                {p}
              </code>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** Who serves the model and on what terms. Sortable by price or context; the cheapest input price is marked. */
export function ProvidersPanel({ p }: { p: Project }) {
  const m = p.specs?.model ?? {}
  const [sort, setSort] = useState<"price" | "context">("price")
  const reduce = useReducedMotion()
  const list = useMemo(
    () =>
      [...(m.endpoints ?? [])].sort((a, b) =>
        sort === "price" ? (a.pricing?.prompt ?? Infinity) - (b.pricing?.prompt ?? Infinity) : (b.contextLength ?? 0) - (a.contextLength ?? 0)
      ),
    [m.endpoints, sort]
  )
  const cheapest = Math.min(...list.map((e) => e.pricing?.prompt ?? Infinity))
  if (!list.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <ServerIcon aria-hidden className="size-6 text-ion" />
        <p className="font-medium">
          <Copy k="project.providers.empty.title">No endpoints listed</Copy>
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          <Copy k="project.providers.empty.body">Nobody has listed an API that serves this model. If it has weights, they are under Files and versions. Its authors can add endpoints in the settings.</Copy>
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {list.length} {list.length === 1 ? "endpoint serves" : "endpoints serve"} this model. Prices are US dollars per million tokens.
        </p>
        <div className="flex rounded-full border border-border p-0.5 text-xs" role="group" aria-label="Sort endpoints">
          {(["price", "context"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)} className={cn("rounded-full px-3 py-1 transition-colors", sort === s ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {s === "price" ? "Cheapest first" : "Longest context"}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 font-normal">Provider</th>
              <th className="px-4 py-2.5 text-right font-normal">Context</th>
              <th className="px-4 py-2.5 text-right font-normal">Max output</th>
              <th className="px-4 py-2.5 text-right font-normal">Input</th>
              <th className="px-4 py-2.5 text-right font-normal">Output</th>
              <th className="px-4 py-2.5 font-normal">Precision</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {list.map((e) => (
                <motion.tr key={e.provider + (e.quantization ?? "")} layout={!reduce} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }} className="border-b border-border last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 font-medium">
                      <span aria-hidden className={cn("size-1.5 rounded-full", e.status === "up" ? "bg-ok" : "bg-muted-foreground/50")} />
                      {e.provider}
                      {e.pricing?.prompt === cheapest && list.length > 1 && <span className="rounded-full bg-ok/15 px-1.5 text-[10px] text-ok">Lowest price</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{e.contextLength ? compact(e.contextLength) : "–"}</td>
                  <td className="px-4 py-2.5 text-right tabular">{e.maxOutput ? compact(e.maxOutput) : "–"}</td>
                  <td className="px-4 py-2.5 text-right tabular">{price(e.pricing?.prompt)}</td>
                  <td className="px-4 py-2.5 text-right tabular">{price(e.pricing?.completion)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{e.quantization ?? "–"}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function BenchmarksPanel({ p }: { p: Project }) {
  return (
    <div className="flex flex-col gap-4">
      <ModelScores slug={p.slug} />
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <GaugeIcon aria-hidden className="size-4 text-ion" />
        <Copy k="project.benchmarks.lead">Scores are submitted and reproduced by members, matched by the model&apos;s address.</Copy>
        <Link href="/benchmarks" className="text-ion hover:underline">
          Submit a result
        </Link>
      </p>
    </div>
  )
}

// ─── Quick start ────────────────────────────────────────────────────────────────────────────────────────────

export type Snippet = { id: string; label: string; file: string; code: string }

export function Snippets({ snippets, lead }: { snippets: Snippet[]; lead?: React.ReactNode }) {
  const [current, setCurrent] = useState(snippets[0]?.id)
  const [copied, setCopied] = useState(false)
  const s = snippets.find((x) => x.id === current) ?? snippets[0]
  const lines = useMemo(() => (s ? highlightLines(s.code, langOf(s.file)) : []), [s])
  if (!s) return null
  return (
    <div className="flex flex-col gap-3">
      {lead && <div className="text-sm text-muted-foreground">{lead}</div>}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2">
          {snippets.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={x.id === s.id}
              onClick={() => setCurrent(x.id)}
              className={cn("relative shrink-0 px-3 py-2.5 text-sm transition-colors", x.id === s.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {x.label}
              {x.id === s.id && <motion.span layoutId="snippet-bar" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--project-accent,#8fb4ff)]" transition={{ type: "spring", duration: 0.4, bounce: 0.2 }} />}
            </button>
          ))}
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(s.code)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {}
            }}
            className="pressable ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {copied ? <CheckIcon aria-hidden className="size-3.5 text-ok" /> : <CopyIcon aria-hidden className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre tabIndex={0} className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed focus-visible:outline-2 focus-visible:outline-ring">
          <code>
            {lines.map((l, i) => (
              <div key={i}>
                <Tokens tokens={l} />
                {l.length === 0 && "\n"}
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}

/** Quick start for a model: an OpenAI-style request when an API serves it, local loading when it has weights. */
export function modelSnippets(p: Project, files: HostedFile[]): Snippet[] {
  const m = p.specs?.model ?? {}
  const id = p.source?.site === "openrouter" ? p.source.ref : m.baseModel ?? p.source?.ref ?? p.slug
  const out: Snippet[] = []
  if (m.endpoints?.length || m.pricing) {
    out.push(
      {
        id: "curl",
        label: "cURL",
        file: "request.sh",
        code: `# Any OpenAI-compatible provider that serves ${p.name}\ncurl "$BASE_URL/chat/completions" \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${id}",\n    "messages": [{ "role": "user", "content": "Hello from Nexverse" }]\n  }'`,
      },
      {
        id: "python",
        label: "Python",
        file: "chat.py",
        code: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url=os.environ["BASE_URL"], api_key=os.environ["API_KEY"])\n\nreply = client.chat.completions.create(\n    model="${id}",\n    messages=[{"role": "user", "content": "Hello from Nexverse"}],\n)\nprint(reply.choices[0].message.content)`,
      },
      {
        id: "ts",
        label: "TypeScript",
        file: "chat.ts",
        code: `import OpenAI from "openai"\n\nconst client = new OpenAI({ baseURL: process.env.BASE_URL, apiKey: process.env.API_KEY })\n\nconst reply = await client.chat.completions.create({\n  model: "${id}",\n  messages: [{ role: "user", content: "Hello from Nexverse" }],\n})\nconsole.log(reply.choices[0].message.content)`,
      }
    )
  }
  const weights = files.some((f) => /\.(safetensors|bin|gguf|pt|onnx)$/i.test(f.name)) || files.some((f) => f.name === "config.json")
  if (weights || m.library === "transformers" || !out.length) {
    const gguf = files.find((f) => /\.gguf$/i.test(f.name))
    out.push(
      gguf
        ? { id: "local", label: "Run locally", file: "run.sh", code: `# Download ${gguf.name} from Files and versions, then:\nllama-cli -m ./${gguf.name} -p "Hello from Nexverse" -n 128` }
        : {
            id: "local",
            label: "Load the weights",
            file: "load.py",
            code: `# Download the files from Files and versions into ./${p.slug}, then:\nfrom transformers import AutoModelForCausalLM, AutoTokenizer\n\ntokenizer = AutoTokenizer.from_pretrained("./${p.slug}")\nmodel = AutoModelForCausalLM.from_pretrained("./${p.slug}")\n\ninputs = tokenizer("Hello from Nexverse", return_tensors="pt")\nprint(tokenizer.decode(model.generate(**inputs, max_new_tokens=40)[0]))`,
          }
    )
  }
  return out
}

/** "Use this dataset": loading its files with pandas, the datasets library or plain Python. */
export function datasetSnippets(p: Project, files: HostedFile[]): Snippet[] {
  const data = files.filter((f) => /\.(csv|tsv|jsonl?|parquet)$/i.test(f.name))
  const first = data[0]?.name ?? `${p.slug}.csv`
  const kind = /\.parquet$/i.test(first) ? "parquet" : /\.jsonl?$/i.test(first) ? "json" : "csv"
  const pandas = kind === "parquet" ? `pd.read_parquet("${first}")` : kind === "json" ? `pd.read_json("${first}", lines=${/\.jsonl$/i.test(first) ? "True" : "False"})` : `pd.read_csv("${first}"${/\.tsv$/i.test(first) ? ', sep="\\t"' : ""})`
  const byFile = data.slice(0, 6).map((f) => `"${f.name}"`)
  return [
    { id: "pandas", label: "pandas", file: "load.py", code: `# Download ${first} from Files and versions, then:\nimport pandas as pd\n\ndf = ${pandas}\nprint(df.shape)\nprint(df.head())` },
    {
      id: "datasets",
      label: "datasets",
      file: "load.py",
      code: `# With the files from Files and versions in this folder:\nfrom datasets import load_dataset\n\nds = load_dataset("${kind}", data_files=[${byFile.join(", ") || `"${first}"`}])\nprint(ds)`,
    },
    {
      id: "python",
      label: "Plain Python",
      file: "read.py",
      code:
        kind === "csv"
          ? `import csv\n\nwith open("${first}", newline="") as f:\n    for i, row in enumerate(csv.DictReader(f)):\n        print(row)\n        if i == 4:\n            break`
          : `import json\n\nwith open("${first}") as f:\n    for i, line in enumerate(f):\n        print(json.loads(line))\n        if i == 4:\n            break`,
    },
  ]
}
