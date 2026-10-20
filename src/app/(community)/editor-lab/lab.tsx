"use client"

import { useState } from "react"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { MarkdownEditor } from "@/components/studio/markdown-editor"

const SAMPLE = `# Tiny RAG

A **small** retrieval pipeline with _no_ heavy deps.

> [!TIP]
> Works offline.

- [x] Index
- [ ] Rerank

| Model | Score |
| --- | --- |
| a | 1 |

\`\`\`python
print("hi")
\`\`\`

https://www.youtube.com/watch?v=dQw4w9WgXcQ

https://github.com/vercel/next.js

https://arxiv.org/abs/1706.03762
`

export function EditorLab() {
  const [a, setA] = useState(SAMPLE)
  const [b, setB] = useState("")
  return (
    <div className="shell flex flex-col gap-8 py-10">
      <MarkdownEditor id="lab-full" value={a} onChange={setA} maxLength={50000} draftKey={null} />
      <MarkdownComposer id="lab-compact" value={b} onChange={setB} label="Reply" placeholder="Write a reply. Type / for commands." draftKey={null} />
    </div>
  )
}
