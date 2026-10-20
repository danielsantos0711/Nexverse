"use client"

import { useState } from "react"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { MarkdownEditor } from "@/components/studio/markdown-editor"
import { AudiencePicker, CoauthorsInput, CoverPicker, GalleryEditor, LicensePicker, LinksEditor, ScheduleField, type Audience } from "@/components/editor/publish-fields"
import { Cover } from "@/components/hub/bits"
import type { ExtraLink, GalleryItem, ProjectOwner } from "@/lib/projects"

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
  const [lic, setLic] = useState("Apache-2.0")
  const [cover, setCover] = useState("")
  const [gal, setGal] = useState<GalleryItem[]>([])
  const [links, setLinks] = useState<ExtraLink[]>([{ label: "Docs", url: "https://example.com" }])
  const [aud, setAud] = useState<Audience>("public")
  const [at, setAt] = useState<string | null>(null)
  const [co, setCo] = useState<ProjectOwner[]>([])
  return (
    <div className="shell flex flex-col gap-8 py-10">
      <MarkdownEditor id="lab-full" value={a} onChange={setA} maxLength={50000} draftKey={null} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <LicensePicker id="lab-lic" value={lic} onChange={setLic} />
          <CoverPicker id="lab-cover" value={cover} onChange={setCover} fallback={<Cover seed="lab" kind="model" />} />
          <GalleryEditor value={gal} onChange={setGal} />
          <LinksEditor value={links} onChange={setLinks} />
          <CoauthorsInput id="lab-co" value={co} onChange={setCo} />
        </div>
        <div className="glass flex flex-col gap-4 rounded-2xl p-4">
          <AudiencePicker name="lab-aud" value={aud} onChange={setAud} withDraft={false} />
          <ScheduleField id="lab-at" value={at} onChange={setAt} />
        </div>
      </div>
      <MarkdownComposer id="lab-compact" value={b} onChange={setB} label="Reply" placeholder="Write a reply. Type / for commands." draftKey={null} />
    </div>
  )
}
