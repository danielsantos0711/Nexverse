"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  EyeOffIcon,
  GlobeIcon,
  ImagePlusIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { searchMembers, type MentionCandidate } from "@/lib/community"
import { useCopy } from "@/lib/content"
import { uploadImage } from "@/lib/editor/media"
import { LICENSE_GROUPS, LICENSE_ID, LICENSE_LIST, findLicense } from "@/lib/publish/licenses"
import type { ExtraLink, GalleryItem, ProjectOwner, ProjectVisibility } from "@/lib/projects"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/*
 * The publishing options of the project editor: licence (any SPDX id), cover, gallery, extra links, co-authors,
 * and who can see it and when. Each is a small controlled field; the editor owns the state.
 */

// ─── Licence ────────────────────────────────────────────────────────────────────────────────────────────────

/** A searchable licence list grouped by kind, with a way to type any SPDX id that is not listed. */
export function LicensePicker({ id, value, onChange, invalid, describedBy }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean; describedBy?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const box = useRef<HTMLDivElement>(null)
  const current = findLicense(value)
  const f = q.trim().toLowerCase()
  const list = f ? LICENSE_LIST.filter((l) => l.id.toLowerCase().includes(f) || l.name.toLowerCase().includes(f) || l.group.toLowerCase().includes(f)) : LICENSE_LIST
  const custom = f && LICENSE_ID.test(q.trim()) && !LICENSE_LIST.some((l) => l.id.toLowerCase() === f) ? q.trim() : null

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener("pointerdown", down)
    return () => document.removeEventListener("pointerdown", down)
  }, [open])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQ("")
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  return (
    <div ref={box} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={cn("flex h-11 w-full items-center gap-2 rounded-lg border border-input bg-background/60 px-3 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50", invalid && "border-destructive")}
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? current.name : value}
          {value !== "unspecified" && <span className="ml-2 font-mono text-xs text-muted-foreground">{value}</span>}
        </span>
        <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {current && current.id !== "unspecified" && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {current.short}{" "}
          {current.url && (
            <a href={current.url} target="_blank" rel="noopener noreferrer" className="text-ion hover:underline">
              Read the licence<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </p>
      )}
      {open && (
        <div
          className="liquid-glass-strong absolute inset-x-0 top-12 z-40 flex flex-col gap-1 rounded-xl border border-border bg-popover/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              setOpen(false)
              document.getElementById(id)?.focus()
            }
          }}
        >
          <label className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background/60 px-2.5">
            <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
            <span className="sr-only">Search licences</span>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (custom) pick(custom); else if (list[0]) pick(list[0].id) } }} placeholder="Search, or type an SPDX id" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <ul role="listbox" aria-label="Licences" className="max-h-72 overflow-y-auto">
            {custom && (
              <li>
                <button type="button" role="option" aria-selected={false} onClick={() => pick(custom)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/[0.07]">
                  <PlusIcon aria-hidden className="size-4" /> Use <span className="font-mono">{custom}</span>
                </button>
              </li>
            )}
            {LICENSE_GROUPS.map((g) => {
              const items = list.filter((l) => l.group === g)
              if (!items.length) return null
              return (
                <li key={g}>
                  <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">{g}</p>
                  <ul>
                    {items.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={l.id === value}
                          onClick={() => pick(l.id)}
                          className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none", l.id === value && "text-ion")}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{l.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{l.short}</span>
                          </span>
                          {l.id === value && <CheckIcon aria-hidden className="size-4 shrink-0" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
            {!list.length && !custom && <li className="px-2 py-3 text-sm text-muted-foreground">No licence by that name. Type its SPDX id, like MIT or Apache-2.0.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Pictures ───────────────────────────────────────────────────────────────────────────────────────────────

function useUpload() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function run(file: File | undefined, done: (url: string) => void) {
    if (!file) return
    setBusy(true)
    setError("")
    try {
      done(await uploadImage(file))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}

/** The cover shown on cards and at the top of the page: upload a picture or paste an address. */
export function CoverPicker({ id, value, onChange, fallback }: { id: string; value: string; onChange: (v: string) => void; fallback: React.ReactNode }) {
  const up = useUpload()
  const input = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState("")
  function applyUrl() {
    if (!/^https:\/\/\S+$/.test(url.trim())) return up.setError("Use a full picture address that starts with https://")
    up.setError("")
    onChange(url.trim())
    setUrl("")
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[16/7] max-h-60 w-full overflow-hidden rounded-xl border border-border bg-card">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- member picture from storage or an https address
          <img src={value} alt="Cover preview" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          fallback
        )}
        {up.busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/50">
            <Loader2Icon aria-label="Uploading" className="size-6 text-white motion-safe:animate-spin" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {live && (
          <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={up.busy}>
            <ImagePlusIcon aria-hidden /> {value ? "Change picture" : "Upload a picture"}
          </Button>
        )}
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            <XIcon aria-hidden /> Use the drawn cover
          </Button>
        )}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden onChange={(e) => void up.run(e.target.files?.[0], onChange)} />
      </div>
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Cover picture address
        </label>
        <Input
          id={id}
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              applyUrl()
            }
          }}
          placeholder="…or paste a picture address (https://)"
          className="h-9 bg-background/60"
        />
        <Button type="button" variant="secondary" size="sm" className="h-9" onClick={applyUrl}>
          Use
        </Button>
      </div>
      {up.error && (
        <p role="alert" className="text-sm text-destructive">
          {up.error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Wide pictures work best (about 1600 × 700). Without one, Nexverse draws a cover from the project&apos;s address.</p>
    </div>
  )
}

/** Up to 12 screenshots or charts with captions, in order. */
export function GalleryEditor({ value, onChange, max = 12 }: { value: GalleryItem[]; onChange: (v: GalleryItem[]) => void; max?: number }) {
  const up = useUpload()
  const input = useRef<HTMLInputElement>(null)
  const reduce = useReducedMotion()
  const uid = useId()
  const move = (i: number, d: -1 | 1) => {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ol className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {value.map((g, i) => (
              <motion.li
                key={g.url}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card/50 p-2"
              >
                <div className="relative aspect-video overflow-hidden rounded-lg bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- member picture */}
                  <img src={g.url} alt={g.caption || `Picture ${i + 1}`} referrerPolicy="no-referrer" className="size-full object-cover" />
                </div>
                <label htmlFor={`${uid}-${i}`} className="sr-only">
                  Caption for picture {i + 1}
                </label>
                <Input
                  id={`${uid}-${i}`}
                  value={g.caption}
                  onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, caption: e.target.value.slice(0, 120) } : x)))}
                  placeholder="Caption, also read aloud by screen readers"
                  className="h-9 bg-background/60"
                />
                <div className="flex items-center justify-end gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move picture ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move picture ${i + 1} down`} disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove picture ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                    <XIcon aria-hidden />
                  </Button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
      {live ? (
        <Button type="button" variant="secondary" className="self-start" disabled={up.busy || value.length >= max} onClick={() => input.current?.click()}>
          {up.busy ? <Loader2Icon aria-hidden className="motion-safe:animate-spin" /> : <ImagePlusIcon aria-hidden />} Add pictures
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Picture uploads need the site&apos;s database. This copy has none.</p>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []).slice(0, max - value.length)
          e.target.value = ""
          let next = value
          for (const f of files) await up.run(f, (url) => (next = [...next, { url, caption: "" }]))
          onChange(next)
        }}
      />
      {up.error && (
        <p role="alert" className="text-sm text-destructive">
          {up.error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {value.length} / {max}. Screenshots, charts and examples of output. Pictures over 2560 px are scaled down.
      </p>
    </div>
  )
}

// ─── Links ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Extra named links beyond the repository, paper and demo: docs, a weights mirror, a blog post. */
export function LinksEditor({ value, onChange, max = 10, invalid }: { value: ExtraLink[]; onChange: (v: ExtraLink[]) => void; max?: number; invalid?: boolean }) {
  const uid = useId()
  const set = (i: number, p: Partial<ExtraLink>) => onChange(value.map((l, j) => (j === i ? { ...l, ...p } : l)))
  return (
    <div className="flex flex-col gap-2">
      {value.map((l, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2">
          <label htmlFor={`${uid}-l${i}`} className="sr-only">
            Link {i + 1} name
          </label>
          <Input id={`${uid}-l${i}`} value={l.label} onChange={(e) => set(i, { label: e.target.value.slice(0, 120) })} placeholder="Docs" aria-invalid={invalid && !l.label.trim() ? true : undefined} className="h-10 bg-background/60" />
          <label htmlFor={`${uid}-u${i}`} className="sr-only">
            Link {i + 1} address
          </label>
          <Input
            id={`${uid}-u${i}`}
            type="url"
            inputMode="url"
            value={l.url}
            onChange={(e) => set(i, { url: e.target.value.slice(0, 500) })}
            placeholder="https://"
            aria-invalid={invalid && !/^https:\/\/\S+$/.test(l.url) ? true : undefined}
            className="h-10 bg-background/60"
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove link ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <XIcon aria-hidden />
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" className="self-start" disabled={value.length >= max} onClick={() => onChange([...value, { label: "", url: "" }])}>
        <LinkIcon aria-hidden /> Add a link
      </Button>
    </div>
  )
}

// ─── Co-authors ─────────────────────────────────────────────────────────────────────────────────────────────

/** Members who can edit the project with you and are credited on its page. */
export function CoauthorsInput({ id, value, onChange, ownerId, disabled, max = 10 }: { id: string; value: ProjectOwner[]; onChange: (v: ProjectOwner[]) => void; ownerId?: string | null; disabled?: boolean; max?: number }) {
  const [q, setQ] = useState("")
  const [found, setFound] = useState<{ q: string; list: MentionCandidate[] }>({ q: "", list: [] })
  const [active, setActive] = useState(0)
  const listId = `${id}-list`
  const query = q.trim()

  useEffect(() => {
    if (query.length < 2) return
    let stale = false
    const t = setTimeout(() => {
      searchMembers(query, 6)
        .then((list) => !stale && setFound({ q: query, list }))
        .catch(() => {})
    }, 200)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [query])

  const options = useMemo(
    () => (found.q === query && query.length >= 2 ? found.list.filter((c) => c.memberId && c.memberId !== ownerId && !value.some((v) => v.id === c.memberId)) : []),
    [found, query, ownerId, value]
  )
  const open = options.length > 0
  const add = (c: MentionCandidate) => {
    if (!c.memberId || value.length >= max) return
    onChange([...value, { id: c.memberId, name: c.name, handle: c.handle ?? null, avatarUrl: null }])
    setQ("")
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Co-authors">
          {value.map((c) => (
            <li key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 py-0.5 pr-1 pl-0.5 text-sm">
              <PosterAvatar poster={{ name: c.name, handle: c.handle ?? undefined }} size={22} />
              {c.name}
              {!disabled && (
                <button type="button" aria-label={`Remove ${c.name}`} onClick={() => onChange(value.filter((x) => x.id !== c.id))} className="grid size-5 place-items-center rounded-full hover:bg-white/10">
                  <XIcon aria-hidden className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="relative">
          <div className="flex h-10 items-center gap-2 rounded-lg border border-input bg-background/60 px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <UsersIcon aria-hidden className="size-4 text-muted-foreground" />
            <input
              id={id}
              value={q}
              onChange={(e) => (setQ(e.target.value), setActive(0))}
              disabled={value.length >= max || !live}
              placeholder={live ? (value.length >= max ? "Up to 10 co-authors" : "Find a member by name") : "Co-authors need the site's database"}
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-activedescendant={open ? `${listId}-${Math.min(active, options.length - 1)}` : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault()
                if (!open) return
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault()
                  setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length)
                } else if (e.key === "Enter") {
                  e.preventDefault()
                  add(options[Math.min(active, options.length - 1)])
                } else if (e.key === "Escape") setQ("")
              }}
              className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm"
            />
          </div>
          {open && (
            <ul id={listId} role="listbox" aria-label="Members" className="liquid-glass-strong absolute inset-x-0 top-11 z-40 rounded-xl border border-border bg-popover/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl">
              {options.map((c, i) => (
                <li
                  key={c.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    add(c)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm", i === active && "bg-white/[0.08]")}
                >
                  <PosterAvatar poster={{ name: c.name, handle: c.handle }} size={22} /> {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Visibility and schedule ────────────────────────────────────────────────────────────────────────────────

export type Audience = ProjectVisibility | "draft"

const AUDIENCES: { id: Audience; label: string; detail: string; icon: typeof GlobeIcon }[] = [
  { id: "public", label: "Public", detail: "Anyone can find it in the hub, search and your profile.", icon: GlobeIcon },
  { id: "members", label: "Members only", detail: "Signed-in members can open it. Hidden from visitors.", icon: UsersIcon },
  { id: "unlisted", label: "Unlisted", detail: "Anyone with the link. Not in lists or search.", icon: LinkIcon },
  { id: "draft", label: "Draft", detail: "Only you and your co-authors.", icon: EyeOffIcon },
]

/** Who sees it: one choice that covers draft, public, members-only and unlisted. */
export function AudiencePicker({ value, onChange, name, withDraft = true, legend: legendText }: { value: Audience; onChange: (v: Audience) => void; name: string; withDraft?: boolean; legend?: string }) {
  const legend = useCopy("project.audience.legend", legendText ?? "Who can see it")
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      {AUDIENCES.filter((a) => withDraft || a.id !== "draft").map((a) => {
        const on = value === a.id
        return (
          <label
            key={a.id}
            className={cn(
              "pressable flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
              on ? "border-ion/50 bg-ion/10" : "border-border bg-background/30 hover:bg-card"
            )}
          >
            <input type="radio" name={name} value={a.id} checked={on} onChange={() => onChange(a.id)} className="sr-only" />
            <a.icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", on ? "text-ion" : "text-muted-foreground")} />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{a.label}</span>
              <span className="text-xs text-muted-foreground">{a.detail}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

/** "datetime-local" wants local time without a zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Publish now, or at a time you pick (in your own time zone). */
export function ScheduleField({ id, value, onChange, error }: { id: string; value: string | null; onChange: (v: string | null) => void; error?: string }) {
  const on = value !== null
  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <CalendarClockIcon aria-hidden className="size-4 text-muted-foreground" /> Publish later
        </span>
        <Switch checked={on} onChange={(v) => onChange(v ? new Date(Date.now() + 24 * 3600_000).toISOString() : null)} label="Publish later" />
      </label>
      {on && (
        <>
          <label htmlFor={id} className="sr-only">
            Publish on
          </label>
          <Input
            id={id}
            type="datetime-local"
            // The earliest time offered, five minutes from now, set when the field is used (not during render).
            onFocus={(e) => (e.currentTarget.min = toLocalInput(new Date(Date.now() + 5 * 60_000).toISOString()))}
            value={toLocalInput(value)}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
            aria-invalid={error ? true : undefined}
            className="h-10 bg-background/60"
          />
          <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
            {error ?? `Goes live on ${new Date(value!).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, your time. Until then only you and co-authors see it.`}
          </p>
        </>
      )}
    </div>
  )
}

/** An accessible on/off switch. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
        checked ? "border-ion/60 bg-ion/70" : "border-border bg-white/[0.08]"
      )}
    >
      <span aria-hidden className={cn("size-4.5 rounded-full bg-white shadow transition-transform duration-200 ease-out", checked ? "translate-x-[1.15rem]" : "translate-x-0.5")} />
    </button>
  )
}
