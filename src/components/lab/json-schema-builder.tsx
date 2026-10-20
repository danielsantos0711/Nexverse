"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, FileInputIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { example, field, fromSchema, toSchema, validate, type Field, type FieldType, type JsonSchema } from "@/lib/lab/schema"
import { cn } from "@/lib/utils"
import { ActionButton, CopyAction, downloadText, NativeSelect, Panel, readStored, SwitchRow, ToolSkeleton, useHydrated, writeStored } from "./ui"
import { Copy } from "@/components/content/copy"

const KEY = "nexverse:lab:json-schema"

const START: Field[] = [
  field("label", "enum", { values: ["billing", "outage", "account", "other"], description: "The ticket's category" }),
  field("confidence", "number", { minimum: 0, maximum: 1, description: "How sure the model is, 0 to 1" }),
  field("summary", "string", { maxLength: 280 }),
  field("entities", "array", { items: field("item", "object", { children: [field("type", "enum", { values: ["person", "product", "date"] }), field("text", "string")] }), maxItems: 10 }),
]

const TYPES: { value: FieldType; label: string }[] = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "boolean", label: "True / false" },
  { value: "enum", label: "One of a list" },
  { value: "array", label: "List" },
  { value: "object", label: "Object" },
]

type Saved = { fields: Field[]; title: string; strict: boolean }

export function JsonSchemaBuilder() {
  const hydrated = useHydrated()
  if (!hydrated) return <ToolSkeleton />
  return <Inner />
}

/** Optional numeric constraint input: empty means "not set". */
function Opt({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="h-8 w-full rounded-lg border border-input bg-input/30 px-2 text-base text-foreground tabular outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
      />
    </label>
  )
}

function FieldEditor({ f, onChange, onRemove, onMove, depth, isItem }: { f: Field; onChange: (f: Field) => void; onRemove?: () => void; onMove?: (d: -1 | 1) => void; depth: number; isItem?: boolean }) {
  const set = (patch: Partial<Field>) => onChange({ ...f, ...patch })
  const changeType = (type: FieldType) => {
    const patch: Partial<Field> = { type }
    if (type === "array" && !f.items) patch.items = field("item", "string")
    if (type === "enum" && !f.values.length) patch.values = ["a", "b"]
    set(patch)
  }
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-xl border border-border p-3", depth % 2 ? "bg-white/[0.025]" : "bg-black/20")}>
      <div className="flex flex-wrap items-end gap-2">
        {!isItem && (
          <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Name
            <Input value={f.name} onChange={(e) => set({ name: e.target.value.replace(/\s+/g, "_") })} className="h-8 font-mono text-[13px] md:text-[13px]" placeholder="field_name" />
          </label>
        )}
        <label className="flex w-36 flex-col gap-1 text-xs text-muted-foreground">
          {isItem ? "Each item is" : "Type"}
          <NativeSelect value={f.type} onChange={(v) => changeType(v as FieldType)} aria-label={`Type of ${f.name || "field"}`}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        {!isItem && (
          <label className="flex h-8 items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={f.required} onChange={(e) => set({ required: e.target.checked })} className="size-4 accent-[var(--ion)]" />
            <Copy k="lab-tool.json-schema-builder.required">Required</Copy>
          </label>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {onMove && (
            <>
              <button type="button" aria-label={`Move ${f.name} up`} onClick={() => onMove(-1)} className="flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                <ArrowUpIcon aria-hidden className="size-3.5" />
              </button>
              <button type="button" aria-label={`Move ${f.name} down`} onClick={() => onMove(1)} className="flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                <ArrowDownIcon aria-hidden className="size-3.5" />
              </button>
            </>
          )}
          {onRemove && (
            <button type="button" aria-label={`Remove ${f.name || "field"}`} onClick={onRemove} className="flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50">
              <Trash2Icon aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Description for the model
        <Input value={f.description} onChange={(e) => set({ description: e.target.value })} className="h-8 text-[13px] md:text-[13px]" placeholder="Optional: what goes here" />
      </label>
      {f.type === "string" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Opt label="Min length" value={f.minLength} onChange={(v) => set({ minLength: v })} />
          <Opt label="Max length" value={f.maxLength} onChange={(v) => set({ maxLength: v })} />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Format
            <NativeSelect value={f.format ?? ""} onChange={(v) => set({ format: v as Field["format"] })} aria-label="Format">
              <option value="">Any text</option>
              <option value="date">Date</option>
              <option value="date-time">Date and time</option>
              <option value="email">Email</option>
              <option value="uri">URL</option>
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Pattern
            <Input value={f.pattern ?? ""} onChange={(e) => set({ pattern: e.target.value || undefined })} className="h-8 font-mono text-[13px] md:text-[13px]" placeholder="^[A-Z]+$" />
          </label>
        </div>
      )}
      {(f.type === "number" || f.type === "integer") && (
        <div className="grid grid-cols-2 gap-2 sm:w-1/2">
          <Opt label="Minimum" value={f.minimum} onChange={(v) => set({ minimum: v })} />
          <Opt label="Maximum" value={f.maximum} onChange={(v) => set({ maximum: v })} />
        </div>
      )}
      {f.type === "enum" && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Allowed values, comma separated
          <Input value={f.values.join(", ")} onChange={(e) => set({ values: e.target.value.split(",").map((s) => s.trim()) })} className="h-8 font-mono text-[13px] md:text-[13px]" />
        </label>
      )}
      {f.type === "array" && f.items && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 sm:w-1/2">
            <Opt label="Min items" value={f.minItems} onChange={(v) => set({ minItems: v })} />
            <Opt label="Max items" value={f.maxItems} onChange={(v) => set({ maxItems: v })} />
          </div>
          <FieldEditor f={f.items} onChange={(items) => set({ items })} depth={depth + 1} isItem />
        </div>
      )}
      {f.type === "object" && <FieldList fields={f.children} onChange={(children) => set({ children })} depth={depth + 1} />}
    </div>
  )
}

function FieldList({ fields, onChange, depth }: { fields: Field[]; onChange: (f: Field[]) => void; depth: number }) {
  const move = (k: number, d: -1 | 1) => {
    const j = k + d
    if (j < 0 || j >= fields.length) return
    const next = [...fields]
    ;[next[k], next[j]] = [next[j], next[k]]
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-2">
      {fields.map((f, k) => (
        <FieldEditor key={f.id} f={f} depth={depth} onChange={(nf) => onChange(fields.map((x) => (x.id === f.id ? nf : x)))} onRemove={() => onChange(fields.filter((x) => x.id !== f.id))} onMove={(d) => move(k, d)} />
      ))}
      <ActionButton onClick={() => onChange([...fields, field(`field_${fields.length + 1}`, "string")])} className="self-start">
        <PlusIcon aria-hidden className="size-3.5" />
        Add field
      </ActionButton>
    </div>
  )
}

function Inner() {
  const [s, setS] = useState<Saved>(() => {
    const v = readStored<Partial<Saved>>(KEY, {})
    return { fields: Array.isArray(v.fields) ? v.fields : START, title: v.title ?? "ticket_triage", strict: v.strict ?? true }
  })
  const [pasted, setPasted] = useState("")
  const [importText, setImportText] = useState("")
  const [importError, setImportError] = useState("")
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => writeStored(KEY, s), 300)
    return () => clearTimeout(t)
  }, [s])

  const schema = useMemo(() => toSchema(s.fields, { title: s.title, strict: s.strict }), [s])
  const schemaText = JSON.stringify(schema, null, 2)
  const exampleText = useMemo(() => JSON.stringify(example(schema), null, 2), [schema])

  const check = useMemo(() => {
    if (!pasted.trim()) return null
    // Model replies often wrap JSON in a fence; accept that.
    const body = pasted.trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "")
    try {
      return { ok: true as const, ...validate(schema, JSON.parse(body)) }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  }, [pasted, schema])

  function doImport() {
    try {
      const j = JSON.parse(importText) as JsonSchema
      // Accept a bare schema or an OpenAI-style { name, schema } wrapper.
      const inner = (j.schema && typeof j.schema === "object" ? j.schema : j) as JsonSchema
      if (inner.type !== "object" || !inner.properties) throw new Error("The root must be an object schema with properties.")
      setS((p) => ({ ...p, fields: fromSchema(inner), title: typeof inner.title === "string" ? inner.title : typeof j.name === "string" ? j.name : p.title }))
      setShowImport(false)
      setImportError("")
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] [&>*]:min-w-0">
      <Panel
        title="Fields"
        description="The root is an object, which is what structured-output APIs expect."
        actions={
          <>
            <ActionButton onClick={() => setShowImport((v) => !v)} aria-expanded={showImport}>
              <FileInputIcon aria-hidden className="size-3.5" />
              Import schema
            </ActionButton>
            <ActionButton onClick={() => setS((p) => ({ ...p, fields: [] }))} disabled={!s.fields.length}>
              Clear
            </ActionButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {showImport && (
            <div className="flex flex-col gap-2 rounded-xl border border-ion/30 bg-ion/5 p-3">
              <label htmlFor="js-import" className="text-sm font-medium">
                <Copy k="lab-tool.json-schema-builder.paste-a-json-schema">Paste a JSON Schema</Copy>
              </label>
              <Textarea id="js-import" value={importText} onChange={(e) => setImportText(e.target.value)} className="min-h-28 font-mono text-[12px] md:text-[12px]" placeholder='{"type": "object", "properties": { … }}' />
              {importError && (
                <p role="alert" className="text-xs text-destructive">
                  {importError}
                </p>
              )}
              <ActionButton onClick={doImport} disabled={!importText.trim()} className="self-start">
                Load fields
              </ActionButton>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/90">
              Schema name
              <Input value={s.title} onChange={(e) => setS((p) => ({ ...p, title: e.target.value }))} className="h-9 font-mono" />
            </label>
            <div className="flex items-end">
              <SwitchRow label="Strict" description="All fields required, no extra keys" checked={s.strict} onChange={(v) => setS((p) => ({ ...p, strict: v }))} />
            </div>
          </div>
          <FieldList fields={s.fields} onChange={(fields) => setS((p) => ({ ...p, fields }))} depth={0} />
        </div>
      </Panel>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Panel
          title="JSON Schema"
          actions={
            <>
              <CopyAction text={schemaText} />
              <ActionButton onClick={() => downloadText(`${s.title || "schema"}.schema.json`, schemaText, "application/json")}>Download</ActionButton>
            </>
          }
        >
          <pre className="max-h-[40vh] overflow-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[12px] leading-relaxed text-foreground/90" tabIndex={0} aria-label="Generated JSON Schema">
            {schemaText}
          </pre>
        </Panel>
        <Panel title="Example that passes" actions={<CopyAction text={exampleText} />}>
          <pre className="max-h-[28vh] overflow-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[12px] leading-relaxed text-foreground/90" tabIndex={0} aria-label="Example JSON">
            {exampleText}
          </pre>
          <ActionButton onClick={() => setPasted(exampleText)} className="mt-2">
            Validate this example
          </ActionButton>
        </Panel>
        <Panel title="Validate a reply" description="Paste what the model returned. Code fences are fine.">
          <label htmlFor="js-check" className="sr-only">
            <Copy k="lab-tool.json-schema-builder.json-to-validate">JSON to validate</Copy>
          </label>
          <Textarea id="js-check" value={pasted} onChange={(e) => setPasted(e.target.value)} className="min-h-32 font-mono text-[12px] md:text-[12px]" placeholder='{"label": "billing", …}' />
          <div aria-live="polite" className="mt-3">
            {check && !check.ok && (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                Not valid JSON: {check.error}
              </p>
            )}
            {check?.ok && check.issues.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-ok">
                <CheckIcon aria-hidden className="size-4" />
                <Copy k="lab-tool.json-schema-builder.valid-against-the-schema">Valid against the schema.</Copy>
              </p>
            )}
            {check?.ok && check.issues.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-destructive">
                  {check.issues.length} problem{check.issues.length > 1 ? "s" : ""}:
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {check.issues.slice(0, 50).map((x, k) => (
                    <li key={k} className="flex gap-2">
                      <code className="shrink-0 font-mono text-[12px] text-gold">{x.path}</code>
                      <span className="text-muted-foreground">{x.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {check?.ok && check.ignored.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Not checked (outside the supported subset): {check.ignored.join(", ")}.</p>}
          </div>
        </Panel>
      </div>
    </div>
  )
}
