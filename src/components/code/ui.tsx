"use client"

import Link from "next/link"
import type { Route } from "next"
import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangleIcon, CircleCheckIcon, EyeIcon, EyeOffIcon, CircleDotIcon, GitMergeIcon, GitPullRequestClosedIcon, GitPullRequestIcon, LockIcon, ServerOffIcon } from "lucide-react"
import { MemberAvatar } from "@/components/forum/forum-ui"
import { Button } from "@/components/ui/button"
import { CodeUnavailable, moderate, type Label, type Person } from "@/lib/code/api"
import { useRole } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

/* Small pieces shared by every Nexverse Code page. */

export const href = (path: string) => path as Route

/** Loads data in the browser, with a reload function. Errors stay as values, so pages show them honestly. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: Error | null; loading: boolean; reload: () => void; set: (v: T) => void } {
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean }>({ data: undefined, error: null, loading: true })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })
  useEffect(() => {
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the reload as loading; data arrives asynchronously
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error: Error) => live && setState({ data: undefined, error, loading: false }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what the loader depends on
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const set = useCallback((data: T) => setState({ data, error: null, loading: false }), [])
  return { ...state, reload, set }
}

export function Avatar({ person, size = 20, className }: { person: Pick<Person, "name" | "avatarUrl"> | null; size?: number; className?: string }) {
  if (person?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- member avatars from the site's own storage
      <img src={person.avatarUrl} alt="" width={size} height={size} style={{ width: size, height: size }} className={cn("shrink-0 rounded-full object-cover ring-1 ring-white/10", className)} />
    )
  }
  return <MemberAvatar name={person?.name ?? "?"} size={size} className={className} />
}

export const personHref = (p: Pick<Person, "id" | "handle">) => href(`/people/${p.handle ?? p.id}`)

export function PersonName({ person, className, avatar = 18 }: { person: Person | null; className?: string; avatar?: number | false }) {
  if (!person) return <span className={cn("text-muted-foreground", className)}><Copy k="code-repo.ui.a-former-member">A former member</Copy></span>
  return (
    <Link href={personHref(person)} className={cn("inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground/90 hover:text-foreground hover:underline", className)}>
      {avatar !== false && <Avatar person={person} size={avatar} />}
      <span className="truncate">{person.handle ?? person.name}</span>
    </Link>
  )
}

export function ErrorNote({ error, onRetry, className }: { error: Error; onRetry?: () => void; className?: string }) {
  const off = error instanceof CodeUnavailable
  const Icon = off ? ServerOffIcon : AlertTriangleIcon
  return (
    <div role={off ? "status" : "alert"} className={cn("flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card/60 p-4 text-sm", className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", off ? "text-muted-foreground" : "text-destructive")} />
      <p className="min-w-0 flex-1 text-foreground/90">{error.message}</p>
      {onRetry && !off && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <Copy k="code-repo.ui.try-again">Try again</Copy>
        </Button>
      )}
    </div>
  )
}

/** Inline form error. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  )
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-xl border border-border bg-card/40", className)}>{children}</div>
}

export function PanelHead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2 border-b border-border bg-secondary/30 px-4 py-2.5 text-sm", className)}>{children}</div>
}

export function LabelChip({ label, className }: { label: Pick<Label, "name" | "color"> | string; className?: string }) {
  const l = typeof label === "string" ? { name: label, color: "8fb4ff" } : label
  return (
    <span
      className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[11px] leading-none font-medium whitespace-nowrap", className)}
      style={{ color: `#${l.color}`, borderColor: `#${l.color}55`, background: `#${l.color}1a` }}
    >
      {l.name}
    </span>
  )
}

export function VisibilityBadge({ visibility, className }: { visibility: "public" | "private"; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border border-border px-2 text-[11px] font-medium text-muted-foreground", className)}>
      {visibility === "private" && <LockIcon aria-hidden className="size-3" />}
      {visibility === "private" ? "Private" : "Public"}
    </span>
  )
}

const STATE = {
  open: { icon: CircleDotIcon, label: "Open", cls: "bg-ok/15 text-ok border-ok/30" },
  closed: { icon: CircleCheckIcon, label: "Closed", cls: "bg-[#b9a7ff]/15 text-[#b9a7ff] border-[#b9a7ff]/30" },
  merged: { icon: GitMergeIcon, label: "Merged", cls: "bg-[#b9a7ff]/15 text-[#c9b8ff] border-[#b9a7ff]/30" },
  pullOpen: { icon: GitPullRequestIcon, label: "Open", cls: "bg-ok/15 text-ok border-ok/30" },
  pullClosed: { icon: GitPullRequestClosedIcon, label: "Closed", cls: "bg-destructive/10 text-destructive border-destructive/30" },
} as const

export function StateBadge({ state, kind }: { state: "open" | "closed" | "merged"; kind: "issue" | "pull" }) {
  const s = kind === "pull" ? (state === "open" ? STATE.pullOpen : state === "merged" ? STATE.merged : STATE.pullClosed) : STATE[state === "open" ? "open" : "closed"]
  const Icon = s.icon
  return (
    <span key={state} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-sm font-medium motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in", s.cls)}>
      <Icon aria-hidden className="size-4" />
      {s.label}
    </span>
  )
}

export function StateIcon({ state, kind, className }: { state: "open" | "closed" | "merged"; kind: "issue" | "pull"; className?: string }) {
  const s = kind === "pull" ? (state === "open" ? STATE.pullOpen : state === "merged" ? STATE.merged : STATE.pullClosed) : STATE[state === "open" ? "open" : "closed"]
  const Icon = s.icon
  const color = state === "open" ? "text-ok" : state === "merged" || kind === "issue" ? "text-[#b9a7ff]" : "text-destructive"
  return <Icon aria-label={s.label} className={cn("size-4 shrink-0", color, className)} />
}

/** A quiet empty state inside a panel: what this is and the first thing to do. */
export function EmptyState({ icon: Icon, title, children, action }: { icon: typeof CircleDotIcon; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="nx-empty relative isolate flex flex-col items-center gap-3 overflow-hidden px-6 py-14 text-center">
      <span className="nx-empty-icon grid size-11 place-items-center rounded-2xl border border-ion/20 bg-ion/10 text-ion">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  )
}

export const inputCls =
  "h-9 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive"
export const textareaCls =
  "w-full rounded-lg border border-input bg-background/60 p-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`
}

/** Staff only: hide or show one item (logged in the moderation log). Renders nothing for everyone else. */
export function StaffHide({ kind, id, hidden, onDone }: { kind: Parameters<typeof moderate>[0]; id: string; hidden: boolean; onDone: (hidden: boolean) => void }) {
  const me = useRole()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!me.isStaff) return null
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 rounded-full text-muted-foreground"
        disabled={busy}
        onClick={async () => {
          const reason = hidden ? "" : (window.prompt("Why hide it? The reason is logged.") ?? "")
          if (!hidden && !reason.trim()) return
          setBusy(true)
          setError(null)
          try {
            await moderate(kind, id, !hidden, reason)
            onDone(!hidden)
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {hidden ? <EyeIcon aria-hidden /> : <EyeOffIcon aria-hidden />}
        {hidden ? "Unhide" : "Hide"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  )
}
