"use client"

import { useState } from "react"
import { CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { EMBED_LABEL, parseEmbed } from "@/lib/editor/embeds"

export type InsertMode = "link" | "embed" | "table" | "code"

export type InsertResult =
  | { mode: "link"; text: string; url: string }
  | { mode: "embed"; url: string }
  | { mode: "table"; cols: number; rows: number }
  | { mode: "code"; lang: string }

export const CODE_LANGS = [
  ["", "Plain text"], ["python", "Python"], ["ts", "TypeScript"], ["js", "JavaScript"], ["tsx", "TSX / JSX"], ["bash", "Shell"], ["json", "JSON"], ["yaml", "YAML"],
  ["toml", "TOML"], ["sql", "SQL"], ["rust", "Rust"], ["go", "Go"], ["c", "C"], ["cpp", "C++"], ["java", "Java"], ["kotlin", "Kotlin"], ["swift", "Swift"],
  ["ruby", "Ruby"], ["php", "PHP"], ["html", "HTML"], ["css", "CSS"], ["diff", "Diff"], ["dockerfile", "Dockerfile"], ["markdown", "Markdown"],
] as const

const TITLES: Record<InsertMode, { title: string; lead: string; action: string }> = {
  link: { title: "Add a link", lead: "Links open in a new tab for readers.", action: "Add link" },
  embed: {
    title: "Embed",
    lead: "Paste a YouTube or Vimeo video, a GitHub repository or gist, an arXiv paper or a post on X. Videos play only when someone presses play; the rest show as cards.",
    action: "Embed",
  },
  table: { title: "Add a table", lead: "You can add rows later by copying a line that starts with |.", action: "Add table" },
  code: { title: "Add a code block", lead: "The language turns on colouring in the post.", action: "Add code block" },
}

const httpsOk = (s: string) => {
  try {
    const u = new URL(s.trim())
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:"
  } catch {
    return false
  }
}

/** The small forms behind the toolbar's link, embed, table and code buttons. */
export function InsertDialog({ mode, initialText, onClose, onInsert }: { mode: InsertMode | null; initialText: string; onClose: () => void; onInsert: (r: InsertResult) => void }) {
  return (
    <Dialog open={mode !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">{mode && <Body key={mode} mode={mode} initialText={initialText} onClose={onClose} onInsert={onInsert} />}</DialogContent>
    </Dialog>
  )
}

function Body({ mode, initialText, onClose, onInsert }: { mode: InsertMode; initialText: string; onClose: () => void; onInsert: (r: InsertResult) => void }) {
  const isUrl = /^https?:\/\/\S+$/.test(initialText.trim())
  const [text, setText] = useState(isUrl ? "" : initialText.split("\n")[0].slice(0, 200))
  const [url, setUrl] = useState(isUrl ? initialText.trim() : "")
  const [cols, setCols] = useState(3)
  const [rows, setRows] = useState(2)
  const [lang, setLang] = useState("")
  const [error, setError] = useState("")
  const t = TITLES[mode]
  const embed = mode === "embed" && url ? parseEmbed(url) : null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // The dialog sits in a portal, but React events still bubble to a form around the editor.
    e.stopPropagation()
    if (mode === "link") {
      if (!httpsOk(url)) return setError("Use a full address that starts with https://")
      onInsert({ mode, text: text.trim(), url: url.trim() })
    } else if (mode === "embed") {
      if (!httpsOk(url)) return setError("Use a full address that starts with https://")
      onInsert({ mode, url: url.trim() })
    } else if (mode === "table") onInsert({ mode, cols, rows })
    else onInsert({ mode, lang })
    onClose()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t.title}</DialogTitle>
        <DialogDescription>{t.lead}</DialogDescription>
      </DialogHeader>
      {(mode === "link" || mode === "embed") && (
        <>
          {mode === "link" && (
            <Field>
              <FieldLabel htmlFor="ins-text">Text</FieldLabel>
              <Input id="ins-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="What readers click" maxLength={200} />
            </Field>
          )}
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="ins-url">Address</FieldLabel>
            <Input
              id="ins-url"
              type="url"
              inputMode="url"
              autoFocus
              value={url}
              onChange={(e) => (setUrl(e.target.value), setError(""))}
              placeholder="https://"
              maxLength={2000}
              aria-invalid={error ? true : undefined}
              aria-describedby="ins-url-hint"
            />
            {error ? (
              <FieldError id="ins-url-hint">{error}</FieldError>
            ) : mode === "embed" ? (
              <FieldDescription id="ins-url-hint" aria-live="polite">
                {embed ? (
                  <span className="inline-flex items-center gap-1.5 text-ok">
                    <CheckIcon aria-hidden className="size-3.5" /> {EMBED_LABEL[embed.type]}
                  </span>
                ) : url ? (
                  "Not one of the embeddable sites. It will be added as a plain link."
                ) : (
                  "The embed shows in the preview."
                )}
              </FieldDescription>
            ) : (
              <FieldDescription id="ins-url-hint">Paste a URL over selected text to make a link without this box.</FieldDescription>
            )}
          </Field>
        </>
      )}
      {mode === "table" && (
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="ins-cols">Columns</FieldLabel>
            <Input id="ins-cols" type="number" min={1} max={8} value={cols} onChange={(e) => setCols(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ins-rows">Rows</FieldLabel>
            <Input id="ins-rows" type="number" min={1} max={20} value={rows} onChange={(e) => setRows(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
          </Field>
        </div>
      )}
      {mode === "code" && (
        <Field>
          <FieldLabel htmlFor="ins-lang">Language</FieldLabel>
          <select
            id="ins-lang"
            autoFocus
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {CODE_LANGS.map(([id, label]) => (
              <option key={id} value={id} className="bg-popover">
                {label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{t.action}</Button>
      </DialogFooter>
    </form>
  )
}
