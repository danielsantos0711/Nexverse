"use client"

import type { Route } from "next"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  LoaderCircleIcon,
  LockIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { Notice, StatusLine, Switch, when } from "@/components/admin/controls"
import { Gate } from "@/components/moderation/gate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { resetList, saveList } from "@/lib/lists/admin"
import { checkCell, checkList, countOf, getListDef, LISTS, resolveRows, type Field, type ListDef, type Row } from "@/lib/lists/registry"
import { db, live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { checkGithubRepo, checkGithubTopic, refreshList, type RepoCheck, type TopicCheck } from "../actions"
import { AvailabilityNotice } from "./notices"
import { ListPreview } from "./previews"
import { useSavedLists } from "./use-saved"

type Status = { ok: boolean; text: string } | null
type Check = { state: "busy" } | TopicCheck | RepoCheck

const WIDTH: Record<NonNullable<Field["width"]>, string> = {
  xs: "sm:col-span-2",
  sm: "sm:col-span-3",
  md: "sm:col-span-4",
  lg: "sm:col-span-6",
  full: "sm:col-span-12",
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function token() {
  const c = db()
  const { data } = (await c?.auth.getSession()) ?? { data: { session: null } }
  return data.session?.access_token ?? ""
}

/** A blank item for "Add": empty text, the lowest number, the first option, switches on. */
function blank(def: ListDef): Row {
  const row: Row = {}
  for (const f of def.fields) {
    row[f.name] =
      f.kind === "boolean" ? f.name !== "retired" && f.name !== "featured" && f.name !== "isNew" : f.kind === "number" ? (f.optional ? "" : (f.min ?? 0)) : f.kind === "select" ? (f.options?.[0]?.value ?? "") : ""
  }
  if (def.slug === "levels") row.min = 0
  if (def.slug === "badges") row.min = 1
  return row
}

export function ListEditorPage({ slug }: { slug: string }) {
  const def = getListDef(slug)
  if (!def) return <Notice tone="warn" title="There is no list with that name" />
  const body = <Editor key={def.slug} def={def} />
  return live ? (
    <Gate role="admin" action="edit the site's lists">
      {body}
    </Gate>
  ) : (
    body
  )
}

function Editor({ def }: { def: ListDef }) {
  const { ready, saved, availability, reload } = useSavedLists()
  const entry = saved[def.key]
  const base = useMemo(() => resolveRows(def, entry?.value), [def, entry])
  const [rows, setRows] = useState<Row[]>(base)
  // Rows the admin added in this session (they get a fresh key and, in "grow" lists, may still be removed).
  const [keys, setKeys] = useState<string[]>(() => base.map((_, i) => `r${i}`))
  const seq = useRef(0)
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState<"save" | "reset" | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [checks, setChecks] = useState<Record<string, Check>>({})
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const reduce = useReducedMotion()

  // When the saved version arrives (or changes after a save or reset), start from it, unless the admin is
  // already editing: their draft is never replaced under them.
  const [prevBase, setPrevBase] = useState(base)
  if (!same(prevBase, base)) {
    setPrevBase(base)
    if (same(rows, prevBase)) {
      setRows(base)
      setKeys(base.map((_, i) => `r${i}`))
    }
  }

  const errors = useMemo(() => checkList(def, rows), [def, rows])
  const invalid = errors.list !== null || errors.rows.some((e) => Object.keys(e).length > 0)
  const dirty = !same(rows, base)
  const customised = Boolean(entry)
  const canSave = availability?.ok === true
  const kept = new Set([...def.fallback, ...base].map((r) => String(r[def.idField]).toLowerCase()))
  const removable = (r: Row) => def.mode === "free" || (def.mode === "grow" && !kept.has(String(r[def.idField]).toLowerCase()))
  const collapsible = def.fields.some((f) => f.kind === "textarea") && rows.length > 8
  const textFields = def.fields.filter((f) => f.kind !== "boolean")
  const q = query.trim().toLowerCase()
  const visible = rows.map((r, i) => i).filter((i) => !q || textFields.some((f) => String(rows[i][f.name] ?? "").toLowerCase().includes(q)))

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function update(i: number, name: string, value: Row[string]) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [name]: value } : r)))
    setStatus(null)
  }

  function move(i: number, by: number) {
    const j = i + by
    if (j < 0 || j >= rows.length) return
    const swap = <T,>(xs: T[]) => {
      const out = [...xs]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    }
    setRows(swap)
    setKeys(swap)
    setStatus(null)
  }

  function remove(i: number) {
    setRows((rs) => rs.filter((_, j) => j !== i))
    setKeys((ks) => ks.filter((_, j) => j !== i))
    setStatus(null)
  }

  function add() {
    const key = `n${seq.current++}`
    const row = blank(def)
    // A new orbit starts above the highest one, so it is valid straight away.
    if (def.slug === "levels") row.min = Math.max(0, ...rows.map((r) => Number(r.min) || 0)) + 100
    setRows((rs) => [...rs, row])
    setKeys((ks) => [...ks, key])
    setOpen((o) => new Set(o).add(key))
    setQuery("")
    setStatus(null)
    // Focus the new item's first field once it is on screen.
    requestAnimationFrame(() => document.getElementById(`${key}-${def.fields.find((f) => !f.locked)?.name}`)?.focus())
  }

  async function verify(i: number) {
    const id = String(rows[i][def.idField] ?? "").trim()
    if (!id || !def.verify) return
    setChecks((c) => ({ ...c, [id]: { state: "busy" } }))
    try {
      const t = await token()
      const res = def.verify === "gh-topic" ? await checkGithubTopic(t, id.toLowerCase()) : await checkGithubRepo(t, id)
      setChecks((c) => ({ ...c, [id]: res }))
      // A found topic with no description yet takes GitHub's own.
      if (res.status === "found" && "description" in res && def.slug === "github-topics") {
        setRows((rs) => rs.map((r, j) => (j === i ? { ...r, label: r.label || ("name" in res ? res.name : id), blurb: r.blurb || res.description } : r)))
      }
    } catch {
      setChecks((c) => ({ ...c, [id]: { status: "unknown", reason: "The check did not finish. Try again." } }))
    }
  }

  async function save() {
    if (invalid || !dirty) return
    setBusy("save")
    setStatus(null)
    try {
      await saveList(def, rows)
      await reload()
      void token().then((t) => refreshList(t, def.key))
      setStatus({ ok: true, text: "Saved. The site uses this list now." })
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "That did not save. Try again." })
    } finally {
      setBusy(null)
    }
  }

  async function reset() {
    setBusy("reset")
    setStatus(null)
    try {
      await resetList(def)
      await reload()
      void token().then((t) => refreshList(t, def.key))
      setRows(def.fallback)
      setKeys(def.fallback.map((_, i) => `d${i}`))
      setConfirmReset(false)
      setStatus({ ok: true, text: "Back to the defaults. The earlier version is kept in the history." })
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "That did not reset. Try again." })
    } finally {
      setBusy(null)
    }
  }

  const changes = useMemo(() => {
    if (!dirty) return 0
    const before = new Map(base.map((r) => [String(r[def.idField]), r]))
    let n = 0
    rows.forEach((r, i) => {
      const b = before.get(String(r[def.idField]))
      if (!b || !same(b, r) || String(base[i]?.[def.idField]) !== String(r[def.idField])) n++
    })
    return n + Math.max(0, base.length - rows.length)
  }, [dirty, rows, base, def.idField])

  return (
    <section aria-labelledby="list-title" className="flex flex-col gap-5 pb-24">
      <nav aria-label="Lists" className="flex flex-col gap-3">
        <Link href="/admin/lists" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <ArrowLeftIcon aria-hidden className="size-3.5" /> All lists
        </Link>
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {LISTS.map((l) => (
            <li key={l.slug} className="shrink-0">
              <Link
                href={`/admin/lists/${l.slug}` as Route}
                aria-current={l.slug === def.slug ? "page" : undefined}
                className="liquid-glass-pill inline-flex h-7 items-center rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:text-foreground"
              >
                {l.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="list-title" className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-[-0.02em]">
            {def.title}
            {ready && (customised ? <Badge variant="outline" className="border-ion/40 text-ion">Customised</Badge> : <Badge variant="outline">Defaults</Badge>)}
          </h2>
          <p className="max-w-[68ch] text-sm text-muted-foreground">{def.blurb}</p>
          {entry?.updatedAt && (
            <p className="text-xs text-muted-foreground">
              Saved {when(entry.updatedAt)}
              {entry.editor ? ` by ${entry.editor}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {confirmReset ? (
            <span role="group" aria-label="Confirm reset" className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Go back to the defaults?</span>
              <Button size="sm" variant="destructive" onClick={reset} disabled={busy !== null}>
                {busy === "reset" && <LoaderCircleIcon aria-hidden className="animate-spin" />}
                Reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirmReset(true)} disabled={!customised || !canSave || busy !== null}>
              <RotateCcwIcon aria-hidden /> Reset to defaults
            </Button>
          )}
        </div>
      </header>

      <AvailabilityNotice availability={availability} />
      <Notice title="Where it shows">
        {def.where}
        {def.note && <span className="mt-1 block">{def.note}</span>}
        {def.link && (
          <Link href={def.link.href as Route} className="mt-1 inline-block text-ion hover:underline">
            {def.link.label} →
          </Link>
        )}
      </Notice>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {rows.length > 10 && (
              <label className="relative min-w-48 flex-1">
                <span className="sr-only">Filter the {def.nouns ?? `${def.noun}s`}</span>
                <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Filter ${countOf(def, rows.length)}`} className="pl-8" />
              </label>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              {rows.length} of {countOf(def, def.max)}
            </span>
            {def.mode !== "fixed" && (
              <Button size="sm" variant="secondary" className="ml-auto" onClick={add} disabled={rows.length >= def.max}>
                <PlusIcon aria-hidden /> Add a {def.noun}
              </Button>
            )}
          </div>

          {!ready ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : (
            <ol className="flex flex-col gap-2">
              {visible.map((i) => {
                const r = rows[i]
                const k = keys[i] ?? `x${i}`
                const e = errors.rows[i] ?? {}
                const id = String(r[def.idField] ?? "")
                const check = checks[id.trim()]
                const isOpen = !collapsible || open.has(k)
                const bad = Object.keys(e).length > 0
                return (
                  <motion.li
                    key={k}
                    layout={reduce ? false : "position"}
                    transition={{ type: "spring", stiffness: 520, damping: 42 }}
                    className={cn("rounded-xl border bg-card/50 p-3", bad ? "border-destructive/40" : "border-border", r.enabled === false || r.retired === true ? "opacity-75" : "")}
                  >
                    <div className="flex items-start gap-2">
                      <span className="w-5 shrink-0 pt-1 text-right text-[11px] text-muted-foreground tabular-nums" aria-hidden>
                        {i + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                        {collapsible && (
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={`${k}-body`}
                            onClick={() => setOpen((o) => (o.has(k) ? new Set([...o].filter((x) => x !== k)) : new Set(o).add(k)))}
                            className="flex items-center gap-2 rounded-md text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <ChevronDownIcon aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                            <span className="truncate">{String(r.name ?? r.label ?? id) || `New ${def.noun}`}</span>
                            {r.enabled === false && <Badge variant="outline">Off</Badge>}
                            {r.featured === true && <Badge variant="outline" className="border-ion/40 text-ion">Featured</Badge>}
                            {r.retired === true && <Badge variant="outline">Retired</Badge>}
                            {bad && <span className="text-xs font-normal text-destructive">Needs a fix</span>}
                          </button>
                        )}
                        <div id={`${k}-body`} hidden={!isOpen} className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                          {def.fields.map((f) => (
                            <FieldInput
                              key={f.name}
                              id={`${k}-${f.name}`}
                              field={f}
                              value={r[f.name]}
                              error={e[f.name]}
                              locked={Boolean(f.locked) || (def.mode === "grow" && f.name === def.idField && kept.has(id.toLowerCase()))}
                              onChange={(v) => update(i, f.name, v)}
                            />
                          ))}
                        </div>
                        {def.verify && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="xs" variant="secondary" onClick={() => verify(i)} disabled={!id.trim() || checkCell(def.fields.find((f) => f.name === def.idField)!, id).error !== null || (check !== undefined && "state" in check)}>
                              {check !== undefined && "state" in check ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <SearchIcon aria-hidden />}
                              Check on GitHub
                            </Button>
                            <CheckResult check={check} />
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button size="icon-xs" variant="ghost" aria-label={`Move ${id || def.noun} up`} disabled={i === 0 || Boolean(q)} onClick={() => move(i, -1)}>
                          <ArrowUpIcon aria-hidden />
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label={`Move ${id || def.noun} down`} disabled={i === rows.length - 1 || Boolean(q)} onClick={() => move(i, 1)}>
                          <ArrowDownIcon aria-hidden />
                        </Button>
                        {removable(r) ? (
                          <Button size="icon-xs" variant="ghost" aria-label={`Remove ${id || `this ${def.noun}`}`} onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
                            <Trash2Icon aria-hidden />
                          </Button>
                        ) : (
                          <span className="grid size-6 place-items-center text-muted-foreground/60" title={def.mode === "grow" ? "Members' content points at it: retire it instead" : "Part of the site: edit or switch off"}>
                            <LockIcon aria-hidden className="size-3" />
                            <span className="sr-only">{def.mode === "grow" ? "Cannot be removed; retire it instead" : "Cannot be removed"}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.li>
                )
              })}
              {q && !visible.length && <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing matches “{query}”.</li>}
              {!rows.length && (
                <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  The list is empty, so this part of the site will not show. Add a {def.noun} to light it up.
                </li>
              )}
            </ol>
          )}
          {errors.list && (
            <p role="alert" className="text-sm text-destructive">
              {errors.list}
            </p>
          )}
        </div>

        <aside aria-label="Preview" className="xl:sticky xl:top-20 xl:self-start">
          <div className="liquid-glass flex flex-col gap-3 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Preview</h3>
              <span className="text-xs text-muted-foreground">{dirty ? "Your draft" : "Live now"}</span>
            </div>
            <ListPreview def={def} rows={rows} />
          </div>
        </aside>
      </div>

      <div className="sticky bottom-3 z-20">
        <div className="liquid-glass-strong flex flex-wrap items-center gap-3 rounded-2xl px-4 py-2.5">
          <p className="text-sm" aria-live="polite">
            {dirty ? (
              <>
                <span className="font-medium">{changes === 1 ? "1 change" : `${changes} changes`}</span> <span className="text-muted-foreground">not saved yet</span>
              </>
            ) : (
              <span className="text-muted-foreground">No unsaved changes</span>
            )}
          </p>
          <StatusLine status={status} className="min-w-0" />
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={!dirty || busy !== null}
              onClick={() => {
                setRows(base)
                setKeys(base.map((_, i) => `r${i}`))
                setStatus(null)
              }}
            >
              Discard
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || invalid || !canSave || busy !== null} title={invalid ? "Fix the marked fields first" : undefined}>
              {busy === "save" && <LoaderCircleIcon aria-hidden className="animate-spin" />}
              Save {def.noun === "rule" ? "points" : "list"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function FieldInput({ id, field, value, error, locked, onChange }: { id: string; field: Field; value: Row[string] | undefined; error?: string; locked: boolean; onChange: (v: Row[string]) => void }) {
  const width = WIDTH[field.width ?? (field.kind === "textarea" ? "full" : "sm")]
  const describedBy = [error ? `${id}-err` : "", field.hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined

  if (field.kind === "boolean") {
    return (
      <div className={cn("flex items-center gap-2 sm:pt-5", width)}>
        <Switch id={id} checked={value === true} onCheckedChange={(on) => onChange(on)} aria-labelledby={`${id}-label`} />
        <label id={`${id}-label`} htmlFor={id} className="cursor-pointer text-xs text-muted-foreground">
          {field.label}
        </label>
      </div>
    )
  }

  const label = (
    <label htmlFor={id} className="text-xs text-muted-foreground">
      {field.label}
      {field.optional && <span className="opacity-70"> (optional)</span>}
    </label>
  )
  const foot = (
    <>
      {field.hint && !error && (
        <p id={`${id}-hint`} className="text-[11px] text-muted-foreground/80">
          {field.hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </>
  )

  if (locked) {
    return (
      <div className={cn("flex flex-col gap-1", width)}>
        <span className="text-xs text-muted-foreground">{field.label}</span>
        <span className="flex h-8 items-center gap-1.5 truncate rounded-lg border border-dashed border-border px-2.5 text-sm text-muted-foreground">
          <LockIcon aria-hidden className="size-3 shrink-0" />
          {String(value ?? "")}
        </span>
      </div>
    )
  }

  if (field.kind === "select") {
    return (
      <div className={cn("flex flex-col gap-1", width)}>
        {label}
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className="h-8 w-full rounded-lg border border-input bg-input/30 px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {foot}
      </div>
    )
  }

  if (field.kind === "textarea") {
    const text = String(value ?? "")
    return (
      <div className={cn("flex flex-col gap-1", width)}>
        <div className="flex items-baseline justify-between gap-2">
          {label}
          {field.max && <span className={cn("text-[11px] tabular-nums", text.length > field.max ? "text-destructive" : "text-muted-foreground/70")}>{field.max - text.length}</span>}
        </div>
        <Textarea id={id} value={text} onChange={(e) => onChange(e.target.value)} rows={field.max && field.max > 300 ? 4 : 2} placeholder={field.placeholder} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy} className="min-h-0 resize-y" />
        {foot}
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-1", width)}>
      {label}
      <Input
        id={id}
        type={field.kind === "number" ? "number" : "text"}
        inputMode={field.kind === "number" ? "decimal" : undefined}
        step={field.step}
        min={field.min}
        max={field.kind === "number" ? field.max : undefined}
        value={value === undefined ? "" : String(value)}
        placeholder={field.placeholder}
        spellCheck={field.kind === "id" ? false : undefined}
        autoCapitalize={field.kind === "id" ? "none" : undefined}
        onChange={(e) => {
          const v = e.target.value
          onChange(field.kind === "number" ? (v === "" ? "" : Number(v)) : field.kind === "id" && field.name !== "repo" ? v.toLowerCase() : v)
        }}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        className={cn(field.kind === "number" && "tabular-nums", field.kind === "id" && "font-mono text-[13px]")}
      />
      {foot}
    </div>
  )
}

function CheckResult({ check }: { check: Check | undefined }) {
  if (!check || ("state" in check && check.state === "busy")) return null
  if (!("status" in check)) return null
  if (check.status === "found") {
    const detail = "repos" in check ? `${check.repos.toLocaleString("en")} public repositories use it` : `${check.stars.toLocaleString("en")} stars${check.archived ? ", archived" : ""}`
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", "archived" in check && check.archived ? "text-gold" : "text-ok")}>
        <CircleCheckIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">On GitHub: {detail}</span>
      </span>
    )
  }
  if (check.status === "missing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
        <CircleXIcon aria-hidden className="size-3.5" /> Not found on GitHub
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <CircleHelpIcon aria-hidden className="size-3.5" /> {check.reason}
    </span>
  )
}
