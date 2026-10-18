"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { ExternalLinkIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { MemberAvatar } from "@/components/forum/discussion"
import { PageTitle } from "@/components/hub/bits"
import { FollowingList } from "@/components/social/following-list"
import { SavedView } from "@/components/social/saved-view"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ago, getCategory } from "@/lib/data"
import { deleteSubmission, listQuestions, listSubmissions, renameMember, signOut, useSession, type Question, type Submission } from "@/lib/store"
import { useBookmarks } from "@/lib/social"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

export function YouView() {
  const { ready, user, member } = useSession()
  if (!live) return <Mine lead="This copy of Nexverse has no database, so there are no accounts. What you write stays in this browser." />
  if (!ready) return <PageSkeleton />
  if (!user || !member) {
    return (
      <>
        <PageTitle title="You" lead="Sign in to share, start threads and keep track of what you have written." />
        <Link href="/sign-in?next=/you" className="pressable inline-flex h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
          Sign in
        </Link>
      </>
    )
  }
  return <Signed key={member.id} id={member.id} name={member.name} email={user.email ?? ""} />
}

const TABS = [
  { id: "threads", label: "Threads" },
  { id: "shares", label: "Shares" },
  { id: "saved", label: "Saved" },
  { id: "following", label: "Following" },
  { id: "settings", label: "Settings" },
] as const
type TabId = (typeof TABS)[number]["id"]

// The open tab follows the URL hash (/you#saved), so other pages can link straight to it.
function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb)
  return () => window.removeEventListener("hashchange", cb)
}
const readHash = () => window.location.hash.slice(1)

function Mine({
  lead,
  author,
  settings,
  title = "You",
  userId,
}: {
  lead: string
  author?: string
  settings?: React.ReactNode
  title?: string
  userId?: string
}) {
  const [threads, setThreads] = useState<Question[] | null>(null)
  const [shared, setShared] = useState<Submission[] | null>(null)
  const [following, setFollowing] = useState<number | undefined>(undefined)
  const [error, setError] = useState("")
  const { list: saved, ready: savedReady } = useBookmarks()
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "")
  const [picked, setPicked] = useState<TabId | null>(null)
  const reduce = useReducedMotion()
  const uid = useId()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const tabs = TABS.filter((t) => t.id !== "settings" || settings)
  const fromHash = tabs.find((t) => t.id === hash)?.id
  const tab: TabId = picked ?? fromHash ?? "threads"
  const counts: Partial<Record<TabId, number | undefined>> = {
    threads: threads?.length,
    shares: shared?.length,
    saved: savedReady ? saved.length : undefined,
    following,
  }
  const countFollowing = useCallback((n: number) => setFollowing(n), [])

  useEffect(() => {
    listQuestions({ author, limit: 50 }).then(setThreads).catch((e: Error) => setError(e.message))
    listSubmissions({ author, limit: 50 }).then(setShared).catch((e: Error) => setError(e.message))
  }, [author])

  async function unshare(id: string) {
    try {
      await deleteSubmission(id)
      setShared((s) => s?.filter((x) => x.id !== id) ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function select(id: TabId, focus = false) {
    setPicked(id)
    try {
      history.replaceState(history.state, "", `#${id}`)
    } catch {}
    if (focus) tabRefs.current[id]?.focus()
  }

  function onKey(e: React.KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === tab)
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null
    if (to === null) return
    e.preventDefault()
    select(tabs[(to + tabs.length) % tabs.length].id, true)
  }

  return (
    <>
      <PageTitle title={title} lead={lead} />
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <div role="tablist" aria-label="Your space" onKeyDown={onKey} className="glass -mx-1 mb-8 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full p-1">
        {tabs.map((t) => {
          const on = t.id === tab
          const n = counts[t.id]
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id)}
              className={cn(
                "relative shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                on ? "text-ion-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {on && (
                <motion.span
                  layoutId={`${uid}-pill`}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-ion"
                  transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <span className="relative">
                {t.label}
                {n !== undefined && <span className="ml-1.5 tabular opacity-70">{n}</span>}
              </span>
            </button>
          )
        })}
      </div>

      <motion.div
        key={tab}
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${tab}`}
        tabIndex={0}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        className="outline-none"
      >
        {tab === "threads" && (
          <section aria-labelledby="mine-h" className="flex flex-col gap-2">
            <h2 id="mine-h" className="text-lg font-semibold">
              Your threads
            </h2>
            {threads?.length === 0 && (
              <p className="text-muted-foreground">
                Nothing yet. <Link href="/forum/new" className="text-ion hover:underline">Start a thread</Link>
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {threads?.map((q) => (
                <li key={q.id}>
                  <Link href={`/forum/${q.id}`} className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-4 hover:bg-card">
                    <span lang={q.lang} className="font-medium">
                      {q.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getCategory(q.orbit)?.name} · {ago(q.createdAt)} · {q.answerCount} {q.answerCount === 1 ? "reply" : "replies"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tab === "shares" && (
          <section aria-labelledby="shared-h" className="flex flex-col gap-2">
            <h2 id="shared-h" className="text-lg font-semibold">
              What you shared
            </h2>
            {shared?.length === 0 && (
              <p className="text-muted-foreground">
                Nothing yet. <Link href="/share" className="text-ion hover:underline">Share something</Link>
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {shared?.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4">
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      {s.title} <ExternalLinkIcon aria-hidden className="size-3.5 text-muted-foreground" />
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {s.kind} · {ago(s.createdAt)} · {new URL(s.url).hostname}
                    </span>
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => unshare(s.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tab === "saved" && (
          <section aria-labelledby="saved-h" className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="saved-h" className="text-lg font-semibold">
                Saved
              </h2>
              <Link href="/saved" className="text-sm text-ion hover:underline">
                Open full page
              </Link>
            </div>
            <SavedView />
          </section>
        )}
        {tab === "following" && (
          <section aria-labelledby="following-h" className="flex flex-col gap-4">
            <h2 id="following-h" className="text-lg font-semibold">
              Following
            </h2>
            <FollowingList userId={userId} onCount={countFollowing} />
          </section>
        )}
        {tab === "settings" && settings}
      </motion.div>
    </>
  )
}

function Signed({ id, name, email }: { id: string; name: string; email: string }) {
  const [draft, setDraft] = useState(name)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const next = draft.trim()
    if (!next || next.length > 60) return setError("Use between 1 and 60 characters.")
    setError("")
    try {
      await renameMember(id, next)
      setStatus("Saved.")
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Mine
      title={name}
      author={id}
      userId={id}
      lead={`Signed in as ${email}.`}
      settings={
        <div className="flex max-w-md flex-col gap-4">
          <form onSubmit={save} className="glass rounded-2xl p-5">
            <FieldGroup>
              <div className="flex items-center gap-3">
                <MemberAvatar name={draft || name} size={44} />
                <span className="text-sm text-muted-foreground">How others see you</span>
              </div>
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor="name">Your name</FieldLabel>
                <Input
                  id="name"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    setStatus("")
                  }}
                  aria-invalid={error ? true : undefined}
                  className="bg-background/60"
                />
                {error ? <FieldError>{error}</FieldError> : <FieldDescription role="status">{status || "Shown next to what you write."}</FieldDescription>}
              </Field>
              <Button type="submit" className="self-start" disabled={draft.trim() === name}>
                Save name
              </Button>
            </FieldGroup>
          </form>
          <Button variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      }
    />
  )
}
