"use client"

import Link from "next/link"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { RotateCcwIcon, SendIcon, WandSparklesIcon } from "lucide-react"
import { Markdown } from "@/components/live/markdown"
import { buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { DATASET_CARD, MODEL_CARD, splitFrontMatter, splitList, type CardConfig, type CardField, type CardKind, type CardValues } from "./cards"
import { ActionButton, AnimatedNumber, CopyAction, DownloadAction, Meter, NativeSelect, Panel, readStored, Segmented, ToolSkeleton, useHydrated, writeStored } from "./ui"

/** Longest /new link we hand over; beyond this the card is too big for a URL and goes by download instead. */
const MAX_URL = 12000

/** Where "Publish on Nexverse" goes, with ?kind, name, summary and readme. */
const PUBLISH_PATH = "/new/project"

const CONFIGS: Record<CardKind, CardConfig> = { model: MODEL_CARD, dataset: DATASET_CARD }

export function CardBuilder({ kind }: { kind: CardKind }) {
  const hydrated = useHydrated()
  if (!hydrated) return <ToolSkeleton />
  return <Builder config={CONFIGS[kind]} />
}

function Builder({ config }: { config: CardConfig }) {
  const [values, setValues] = useState<CardValues>(() => readStored<CardValues>(config.storageKey, {}))
  const [view, setView] = useState<"preview" | "markdown">("preview")
  const deferred = useDeferredValue(values)
  const md = useMemo(() => config.render(deferred), [config, deferred])
  const { meta, body } = useMemo(() => splitFrontMatter(md), [md])

  useEffect(() => {
    const t = setTimeout(() => writeStored(config.storageKey, values), 300)
    return () => clearTimeout(t)
  }, [values, config.storageKey])

  const set = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }))
  const recommended = config.sections.flatMap((s) => s.fields.filter((f) => f.recommended))
  const done = recommended.filter((f) => (values[f.id] ?? "").trim()).length
  const missing = recommended.filter((f) => !(values[f.id] ?? "").trim())
  const isEmpty = Object.values(values).every((v) => !v?.trim())

  const name = (values.name ?? "").trim()
  const summary = (values.summary ?? "").trim()
  const publish = useMemo(() => {
    const base = { kind: config.kind, name, summary }
    const withReadme = `${PUBLISH_PATH}?${new URLSearchParams({ ...base, readme: md })}`
    return withReadme.length <= MAX_URL ? { href: withReadme, full: true } : { href: `${PUBLISH_PATH}?${new URLSearchParams(base)}`, full: false }
  }, [config.kind, name, summary, md])

  const filename = "README.md"

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Panel className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">Completeness</span>{" "}
              <span className="text-muted-foreground tabular">
                <AnimatedNumber value={recommended.length ? (done / recommended.length) * 100 : 0} />%
              </span>
            </div>
            <div className="flex gap-2">
              <ActionButton onClick={() => setValues(config.example)}>
                <WandSparklesIcon aria-hidden className="size-3.5" />
                Fill example
              </ActionButton>
              <ActionButton onClick={() => setValues({})} disabled={isEmpty}>
                <RotateCcwIcon aria-hidden className="size-3.5" />
                Start over
              </ActionButton>
            </div>
          </div>
          <Meter value={recommended.length ? done / recommended.length : 0} label="Card completeness" tone={done === recommended.length ? "ok" : "ion"} />
          {missing.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Still worth adding: {missing.slice(0, 4).map((f) => f.label.toLowerCase()).join(", ")}
              {missing.length > 4 ? ` and ${missing.length - 4} more` : ""}.
            </p>
          )}
        </Panel>

        {config.sections.map((s, i) => (
          <Panel key={s.id} title={`${i + 1}. ${s.title}`} description={s.description}>
            <div className="grid gap-4 sm:grid-cols-2">
              {s.fields.map((f) => (
                <FormField key={f.id} field={f} value={values[f.id] ?? ""} onChange={(v) => set(f.id, v)} prefix={config.kind} />
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Panel className="flex flex-col p-0 sm:p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3 sm:px-4">
            <Segmented<"preview" | "markdown">
              label="Preview mode"
              value={view}
              onChange={setView}
              options={[
                { value: "preview", label: "Preview" },
                { value: "markdown", label: "Markdown" },
              ]}
              className="w-auto"
              itemClassName="px-3.5"
            />
            <div className="flex flex-wrap gap-2">
              <CopyAction text={md} label="Copy" />
              <DownloadAction filename={filename} text={md} label={filename} />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto p-4 sm:p-5" tabIndex={0} aria-label="Card preview" role="region">
            {view === "preview" ? (
              <>
                {meta.length > 0 && (
                  <dl className="mb-5 flex flex-wrap gap-1.5 text-xs">
                    {meta.map(([k, v]) => (
                      <div key={k} className="inline-flex items-center gap-1 rounded-full border border-border bg-white/[0.03] px-2 py-0.5">
                        <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                        <dd className="text-foreground/90">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <Markdown source={body} ctx={{ source: "none" }} className="[&_h1]:text-2xl [&_h2]:text-lg" />
              </>
            ) : (
              <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">{md}</pre>
            )}
          </div>
        </Panel>

        <Panel className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[15px] font-medium tracking-normal">Publish on Nexverse</h2>
            <p className="text-sm text-muted-foreground">
              {publish.full ? "Opens the new-listing form with this card filled in." : "This card is too long to pass along in a link. The form opens with the name and summary; upload the downloaded README.md there."}
            </p>
          </div>
          <Link
            href={publish.href}
            prefetch={false}
            aria-disabled={!name || undefined}
            onClick={(e) => !name && e.preventDefault()}
            className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-fit", !name && "pointer-events-none opacity-50")}
          >
            <SendIcon aria-hidden />
            Publish {config.kind === "model" ? "model" : "dataset"}
          </Link>
          {!name && <p className="text-xs text-muted-foreground">Give it a name first.</p>}
          {name && splitList(values.languages).length === 0 && <p className="text-xs text-muted-foreground">Tip: listing languages helps people find it.</p>}
        </Panel>
      </div>
    </div>
  )
}

function FormField({ field: f, value, onChange, prefix }: { field: CardField; value: string; onChange: (v: string) => void; prefix: string }) {
  const id = `${prefix}-${f.id}`
  const wide = f.kind === "textarea" || f.kind === "code" || f.id === "summary" || f.id === "name"
  const desc = f.help ? `${id}-help` : undefined
  return (
    <Field className={cn(wide && "sm:col-span-2")}>
      <FieldLabel htmlFor={id} className="text-foreground/90">
        {f.label}
        {f.recommended && <span className="text-[11px] font-normal text-ion/80">recommended</span>}
      </FieldLabel>
      {f.kind === "select" ? (
        <NativeSelect id={id} value={value} onChange={onChange}>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ) : f.kind === "textarea" || f.kind === "code" ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
          aria-describedby={desc}
          rows={f.rows ?? 3}
          spellCheck={f.kind !== "code"}
          className={cn("min-h-20 resize-y", f.kind === "code" && "font-mono text-[13px] md:text-[13px]")}
        />
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} aria-describedby={desc} className="h-9" />
      )}
      {f.kind === "tags" && splitList(value).length > 0 && (
        <div className="flex flex-wrap gap-1" aria-hidden>
          {splitList(value).map((x, i) => (
            <span key={`${x}-${i}`} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              {x}
            </span>
          ))}
        </div>
      )}
      {f.help && <FieldDescription id={desc}>{f.help}</FieldDescription>}
    </Field>
  )
}
