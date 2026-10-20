"use client"

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useId } from "react"
import { Switch } from "@/components/admin/controls"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { emptyOf } from "@/lib/content"
import { cn } from "@/lib/utils"

/*
 * A form generated from a value's shape: the default the code ships with is the schema. Text, numbers, links
 * and switches become fields; lists of items become cards that can be added, removed and reordered; lists of
 * plain words become one-per-line text. Used by the on-page editor panel and the admin site editor.
 */

const isPlain = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v)

/** "primaryHref" → "Primary href", "github_topics" → "Github topics". */
export function humanize(key: string) {
  const s = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
  return s ? s[0].toUpperCase() + s.slice(1) : key
}

const LINKISH = /(href|url|link|image|src|avatar|logo|icon)$/i

/** A problem with a value, or null. Links must be site paths or https addresses. */
export function blockProblem(shape: unknown, value: unknown, label = "This"): string | null {
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) return `${label} must be a list.`
    if (value.length > 200) return `${label} can have at most 200 items.`
    const t = shape[0]
    for (let i = 0; i < value.length; i++) {
      const p = blockProblem(t ?? value[i], value[i], `Item ${i + 1}`)
      if (p) return p
    }
    return null
  }
  if (isPlain(shape)) {
    if (!isPlain(value)) return `${label} is not complete.`
    for (const [k, v] of Object.entries(shape)) {
      if (LINKISH.test(k) && typeof value[k] === "string" && value[k] && !safeLink(value[k] as string)) return `${label}: "${humanize(k)}" must be a page on this site (/forum) or an https:// address.`
      const p = blockProblem(v, value[k], `${label}: ${humanize(k)}`)
      if (p) return p
    }
    return null
  }
  if (typeof shape === "number" && (typeof value !== "number" || !Number.isFinite(value))) return `${label} must be a number.`
  if (typeof shape === "string" && typeof value === "string" && value.length > 5000) return `${label} is too long.`
  return null
}

function safeLink(h: string) {
  const s = h.trim()
  if (/^\/(?![/\\])[A-Za-z0-9/_.~%?=&#+:@-]*$/.test(s)) return true
  if (/^#[A-Za-z0-9_-]*$/.test(s)) return true
  try {
    const u = new URL(s)
    return (u.protocol === "https:" || u.protocol === "mailto:") && !u.username && !u.password
  } catch {
    return false
  }
}

/** The editor for any value, shaped by `shape` (the code's default). */
export function ValueEditor({ shape, value, onChange, label, depth = 0 }: { shape: unknown; value: unknown; onChange: (v: unknown) => void; label: string; depth?: number }) {
  const id = useId()

  if (Array.isArray(shape)) {
    const list = Array.isArray(value) ? value : []
    const template = shape[0]
    if (template !== undefined && !isPlain(template) && !Array.isArray(template)) {
      // A list of words or numbers: one per line.
      const numeric = typeof template === "number"
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          <Textarea
            id={id}
            rows={Math.min(10, Math.max(3, list.length + 1))}
            value={list.join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n")
              onChange(numeric ? lines.filter((l) => l.trim() !== "").map((l) => Number(l.trim())).filter((n) => Number.isFinite(n)) : lines.map((l) => l.replace(/\s+$/, "")))
            }}
            onBlur={(e) => !numeric && onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))}
            className="bg-background/60 font-mono text-[13px]"
            aria-describedby={`${id}-help`}
          />
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            One per line · {list.filter((x) => x !== "").length} {list.length === 1 ? "item" : "items"}
          </p>
        </div>
      )
    }
    return <ItemList label={label} template={template} list={list} onChange={onChange} depth={depth} />
  }

  if (isPlain(shape)) {
    const obj = isPlain(value) ? value : (emptyOf(shape) as Record<string, unknown>)
    const fields = Object.entries(shape)
    return (
      <fieldset className={cn("flex min-w-0 flex-col gap-3", depth > 0 && "rounded-xl border border-border p-3")}>
        {depth > 0 && <legend className="px-1 text-sm font-medium">{label}</legend>}
        {fields.map(([k, s]) => (
          <ValueEditor key={k} shape={s} value={obj[k]} label={humanize(k)} depth={depth + 1} onChange={(v) => onChange({ ...obj, [k]: v })} />
        ))}
      </fieldset>
    )
  }

  if (typeof shape === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2">
        <label htmlFor={id} id={`${id}-l`} className="text-sm">
          {label}
        </label>
        <Switch id={id} aria-labelledby={`${id}-l`} checked={value === true} onCheckedChange={(on) => onChange(on)} />
      </div>
    )
  }

  if (typeof shape === "number") {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={typeof value === "number" && Number.isFinite(value) ? String(value) : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="h-9 bg-background/60"
        />
      </div>
    )
  }

  // Text (and anything unknown, edited as text).
  const text = typeof value === "string" ? value : value == null ? "" : String(value)
  const long = typeof shape === "string" && (shape.length > 90 || shape.includes("\n"))
  const linkish = LINKISH.test(label.replace(/\s+/g, ""))
  const bad = linkish && text.trim() !== "" && !safeLink(text)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {long ? (
        <Textarea id={id} rows={3} value={text} onChange={(e) => onChange(e.target.value)} className="bg-background/60" />
      ) : (
        <Input
          id={id}
          value={text}
          inputMode={linkish ? "url" : undefined}
          placeholder={linkish ? "/page or https://…" : typeof shape === "string" ? shape.slice(0, 60) : undefined}
          aria-invalid={bad || undefined}
          aria-describedby={bad ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 bg-background/60"
        />
      )}
      {bad && (
        <p id={`${id}-err`} className="text-xs text-destructive">
          Use a page on this site (/forum) or a full https:// address.
        </p>
      )}
    </div>
  )
}

function itemTitle(item: unknown, i: number) {
  if (isPlain(item)) {
    const v = item.label ?? item.title ?? item.name ?? item.topic ?? item.slug ?? item.id
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return `Item ${i + 1}`
}

function ItemList({ label, template, list, onChange, depth }: { label: string; template: unknown; list: unknown[]; onChange: (v: unknown) => void; depth: number }) {
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const blank = template === undefined ? "" : emptyOf(template)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {label} <span className="font-normal text-muted-foreground">· {list.length}</span>
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...list, structuredClone(blank)])}>
          <PlusIcon aria-hidden /> Add
        </Button>
      </div>
      {list.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">Empty list. Add the first item, or reset to the default.</p>}
      <ol className="flex flex-col gap-2">
        {list.map((item, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>
                {itemTitle(item, i)}
              </span>
              <Button type="button" size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${itemTitle(item, i)} up`}>
                <ArrowUpIcon aria-hidden />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${itemTitle(item, i)} down`}>
                <ArrowDownIcon aria-hidden />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => onChange(list.filter((_, n) => n !== i))} aria-label={`Remove ${itemTitle(item, i)}`}>
                <Trash2Icon aria-hidden className="text-destructive" />
              </Button>
            </div>
            <ValueEditor
              shape={template ?? item}
              value={item}
              label={itemTitle(item, i)}
              depth={isPlain(template) ? 0 : depth + 1}
              onChange={(v) => onChange(list.map((x, n) => (n === i ? v : x)))}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
