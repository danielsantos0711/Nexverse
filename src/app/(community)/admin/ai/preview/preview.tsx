"use client"

import { AiAnswerCard, type useAiStream } from "@/components/ai/ai-answer"

// TEMPORARY screenshot harness (deleted before hand-off).
const text = `**Nexverse has two open models for code**, both published this month: Atlas Coder 7B [1] and the Orion fine-tune [2].

### Good for
- Local completion on a single 24 GB GPU [1]
- Refactoring Python with \`ruff\` style fixes [2]

More generally, 4-bit quantisation halves memory with a small quality cost.`

const base = { busy: false, error: null, run: async () => {}, stop: () => {} }

export function Preview() {
  const done = { ...base, phase: "done" as const, text, done: { model: "gemini:gemini-3.8-flash", label: "Gemini 3.8 Flash", sources: [{ url: "/p/1", title: "Atlas Coder 7B", kind: "Model" }, { url: "/p/2", title: "Orion code fine-tune", kind: "Model" }, { url: "https://ai.google.dev/x", title: "Quantization guide" }], extra: { cite: { "1": { url: "/p/1", title: "Atlas Coder 7B" }, "2": { url: "/p/2", title: "Orion" } } } } } as unknown as ReturnType<typeof useAiStream>
  const thinking = { ...base, busy: true, phase: "thinking" as const, text: "", done: null } as unknown as ReturnType<typeof useAiStream>
  const writing = { ...base, busy: true, phase: "writing" as const, text: text.slice(0, 140), done: null } as unknown as ReturnType<typeof useAiStream>
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <AiAnswerCard label="What open models are good for coding?" stream={thinking} onRegenerate={() => {}} onClose={() => {}} feature="x" target="x" />
      <AiAnswerCard label="What open models are good for coding?" stream={writing} onRegenerate={() => {}} onClose={() => {}} feature="x" target="x" />
      <AiAnswerCard label="What open models are good for coding?" stream={done} onRegenerate={() => {}} onClose={() => {}} feature="x" target="x" />
    </div>
  )
}
