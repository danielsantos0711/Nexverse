"use client"

import { useEffect, useState } from "react"
import { ExternalLinkIcon, FlaskConicalIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Notice, StatusLine, Switch, when } from "@/components/admin/controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  addSource,
  checkSource,
  listSources,
  NEWS_CATEGORIES,
  removeSource,
  setSourceEnabled,
  SOURCE_KINDS,
  sourceAddress,
  testSource,
  type NewsCategory,
  type NewSource,
  type NewsSource,
  type SourceKind,
} from "@/lib/newsroom"
import { useRole } from "@/lib/roles"
import { cn } from "@/lib/utils"

type Test = { ok: boolean; count: number; sample: { title: string; url: string; publishedAt: string | null }[]; error: string | null }

const BLANK: NewSource = { kind: "rss", label: "", publisher: "", url: "", repo: "", query: "", categoryHint: null }

/** What the newsroom reads. Staff add, switch off and remove sources; any editor can test one. */
export function NewsroomSources() {
  const me = useRole()
  const staff = me.isStaff
  const [data, setData] = useState<{ sources: NewsSource[]; error: string | null } | null>(null)
  const [tests, setTests] = useState<Record<string, Test | "busy" | { failed: string }>>({})
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let on = true
    void listSources().then((r) => on && setData(r))
    return () => {
      on = false
    }
  }, [])

  async function test(s: NewsSource) {
    setTests((t) => ({ ...t, [s.id]: "busy" }))
    try {
      const r = await testSource(s.id)
      setTests((t) => ({ ...t, [s.id]: r }))
    } catch (err) {
      setTests((t) => ({ ...t, [s.id]: { failed: (err as Error).message } }))
    }
  }

  async function toggle(s: NewsSource, enabled: boolean) {
    setStatus(null)
    try {
      await setSourceEnabled(s.id, enabled, s.label)
      setData((d) => (d ? { ...d, sources: d.sources.map((x) => (x.id === s.id ? { ...x, enabled } : x)) } : d))
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    }
  }

  async function remove(s: NewsSource) {
    if (!window.confirm(`Remove “${s.label}”? Signals already collected from it stay.`)) return
    setStatus(null)
    try {
      await removeSource(s.id, s.label)
      setData((d) => (d ? { ...d, sources: d.sources.filter((x) => x.id !== s.id) } : d))
      setStatus({ ok: true, text: "Source removed." })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    }
  }

  if (!data) return <Skeleton className="h-96 w-full rounded-2xl" />
  if (data.error) return <Notice tone="warn" title="The sources could not load">{data.error}</Notice>

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-[70ch] text-sm text-muted-foreground">
        Official sources only: vendor blogs and changelogs, releases of the projects people build on, and arXiv as an internal signal (it informs research stories but is never shown on its own). No community sites.
      </p>
      <StatusLine status={status} />
      {SOURCE_KINDS.map((k) => {
        const list = data.sources.filter((s) => s.kind === k.id)
        if (!list.length) return null
        return (
          <section key={k.id} aria-labelledby={`src-${k.id}`} className="flex flex-col gap-2">
            <h3 id={`src-${k.id}`} className="text-sm font-semibold">
              {k.label} <span className="font-normal text-muted-foreground">· {list.length}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {list.map((s) => {
                const t = tests[s.id]
                return (
                  <li key={s.id} className={cn("flex flex-col gap-2 rounded-xl border bg-card/50 px-4 py-3", s.enabled ? "border-border" : "border-dashed border-border opacity-75")}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="font-medium">{s.label}</span>
                      {s.internalOnly && <Badge variant="outline">Internal signal</Badge>}
                      {s.categoryHint && <Badge variant="outline">{NEWS_CATEGORIES.find((c) => c.id === s.categoryHint)?.label}</Badge>}
                      <a href={sourceAddress(s)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-w-0 items-center gap-1 text-xs text-ion hover:underline">
                        <ExternalLinkIcon aria-hidden className="size-3 shrink-0" />
                        <span className="max-w-[22rem] truncate">{s.kind === "github_releases" ? s.repo : s.kind === "arxiv_query" ? s.query : s.url}</span>
                      </a>
                      <span className="ml-auto flex items-center gap-2">
                        <Button size="sm" variant="ghost" disabled={t === "busy"} onClick={() => test(s)}>
                          <FlaskConicalIcon aria-hidden /> {t === "busy" ? "Testing…" : "Test"}
                        </Button>
                        {staff && (
                          <>
                            <Switch checked={s.enabled} onCheckedChange={(on) => toggle(s, on)} aria-label={`${s.label} on`} />
                            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.label}`} onClick={() => remove(s)}>
                              <Trash2Icon aria-hidden />
                            </Button>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.lastChecked
                        ? `Checked ${when(s.lastChecked)}: ${s.lastOk ? `${s.lastCount ?? 0} recent item${s.lastCount === 1 ? "" : "s"}` : `failed (${s.lastError ?? "no reason"})`}`
                        : "Not checked yet."}
                    </p>
                    {t && t !== "busy" && (
                      <div role="status" className="rounded-lg bg-background/50 px-3 py-2 text-xs">
                        {"failed" in t ? (
                          <span className="text-destructive">{t.failed}</span>
                        ) : !t.ok ? (
                          <span className="text-destructive">It did not answer: {t.error}</span>
                        ) : (
                          <>
                            <p className="text-ok">It answered with {t.count} recent item{t.count === 1 ? "" : "s"}.</p>
                            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                              {t.sample.map((i) => (
                                <li key={i.url} className="truncate">
                                  {i.title}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {staff ? (
        <AddSource onAdded={(s) => setData((d) => (d ? { ...d, sources: [...d.sources, s] } : d))} />
      ) : (
        <Notice title="Moderators and admins manage the sources">You can test any source; ask staff to add or switch one off.</Notice>
      )}
    </div>
  )
}

function AddSource({ onAdded }: { onAdded: (s: NewsSource) => void }) {
  const [s, setS] = useState<NewSource>(BLANK)
  const [errors, setErrors] = useState<Partial<Record<keyof NewSource, string>>>({})
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs = checkSource(s)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setStatus(null)
    try {
      onAdded(await addSource(s))
      setS(BLANK)
      setStatus({ ok: true, text: "Added. Test it to see what it gives." })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-border bg-card/40 p-4 md:p-5">
      <h3 className="inline-flex items-center gap-2 font-semibold">
        <PlusIcon aria-hidden className="size-4 text-ion" /> Add a source
      </h3>
      <FieldSet>
        <FieldLegend variant="label">Kind</FieldLegend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SOURCE_KINDS.map((k) => (
            <label key={k.id} className={cn("flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring", s.kind === k.id ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 hover:bg-card")}>
              <input type="radio" name="src-kind" value={k.id} checked={s.kind === k.id} onChange={() => setS({ ...s, kind: k.id as SourceKind })} className="sr-only" />
              <span className="font-medium">{k.label}</span>
              <span className="text-xs text-muted-foreground">{k.blurb}</span>
            </label>
          ))}
        </div>
      </FieldSet>
      <div className="grid gap-3 md:grid-cols-2">
        <Field data-invalid={Boolean(errors.label) || undefined}>
          <FieldLabel htmlFor="src-label">Name</FieldLabel>
          <Input id="src-label" value={s.label} maxLength={80} onChange={(e) => setS({ ...s, label: e.target.value })} placeholder="Example: Google DeepMind blog" className="h-10" />
          {errors.label && <FieldError>{errors.label}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="src-pub">Publisher</FieldLabel>
          <Input id="src-pub" value={s.publisher} maxLength={80} onChange={(e) => setS({ ...s, publisher: e.target.value })} placeholder="Shown next to the source link" className="h-10" />
        </Field>
        {(s.kind === "rss" || s.kind === "site") && (
          <Field data-invalid={Boolean(errors.url) || undefined}>
            <FieldLabel htmlFor="src-url">{s.kind === "rss" ? "Feed address" : "News page address"}</FieldLabel>
            <Input id="src-url" type="url" value={s.url} onChange={(e) => setS({ ...s, url: e.target.value })} placeholder="https://…" className="h-10" />
            {errors.url && <FieldError>{errors.url}</FieldError>}
          </Field>
        )}
        {s.kind === "github_releases" && (
          <Field data-invalid={Boolean(errors.repo) || undefined}>
            <FieldLabel htmlFor="src-repo">Repository</FieldLabel>
            <Input id="src-repo" value={s.repo} onChange={(e) => setS({ ...s, repo: e.target.value })} placeholder="owner/name" className="h-10" />
            {errors.repo && <FieldError>{errors.repo}</FieldError>}
          </Field>
        )}
        {(s.kind === "site" || s.kind === "arxiv_query") && (
          <Field data-invalid={Boolean(errors.query) || undefined}>
            <FieldLabel htmlFor="src-query">{s.kind === "site" ? "Article path" : "Category"}</FieldLabel>
            <Input id="src-query" value={s.query} onChange={(e) => setS({ ...s, query: e.target.value })} placeholder={s.kind === "site" ? "/news/" : "cs.CL"} className="h-10" />
            {errors.query && <FieldError>{errors.query}</FieldError>}
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="src-hint">Usual category</FieldLabel>
          <select
            id="src-hint"
            value={s.categoryHint ?? ""}
            onChange={(e) => setS({ ...s, categoryHint: (e.target.value || null) as NewsCategory | null })}
            className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Let the AI decide</option>
            {NEWS_CATEGORIES.filter((c) => c.id !== "rumor").map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add source"}
        </Button>
        <StatusLine status={status} />
      </div>
    </form>
  )
}
