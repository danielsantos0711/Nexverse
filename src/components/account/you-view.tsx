"use client"

import type { Route } from "next"
import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { PlusIcon, Settings2Icon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { PageHead } from "@/components/site/page-head"
import { FollowingList } from "@/components/social/following-list"
import { ReputationCard } from "@/components/reputation/reputation-card"
import { Powers } from "@/components/reputation/powers"
import { MyPoints } from "@/components/reputation/my-points"
import { MyPlanet } from "@/components/planet/my-planet"
import { CosmosLink } from "@/components/cosmos/cosmos-link"
import { MissionBadges } from "@/components/missions/mission-badges"
import { StudioDashboard } from "@/components/studio/studio-dashboard"
import { Button } from "@/components/ui/button"
import { TimeAgo } from "@/components/live/time"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { getCategory } from "@/lib/data"
import { hostOf, sharePath } from "@/lib/hub"
import { deleteSubmission, listQuestions, listSubmissions, useSession, type Question, type Submission } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

/*
 * Your page (round 12: "Your studio" and "You" were two dashboards of the same person; /studio now leads here).
 * One header with the one thing to do (publish) and Settings, then tabs:
 *   Projects   what you published and your drafts, with their numbers (the old studio)
 *   Threads    what you asked and started in the forum
 *   Shares     links you shared, each with its page on Nexverse
 *   Following  people, categories and collections you follow
 *   Progress   your planet, reputation, powers, mission badges and points
 * Saved, For you, Messages, Notifications and Settings are their own pages, one click away in the You menu.
 */
export function YouView() {
  const { ready, user, member } = useSession()
  if (!live) return <Mine title="Your page" lead="This copy of Nexverse has no database, so there are no accounts. What you write stays in this browser." />
  if (!ready) return <PageSkeleton />
  if (!user || !member) {
    return (
      <>
        <PageHead backdrop="phosphor" title="Your page" lead="Your projects, threads, shares and progress, in one place." />
        <Empty className="glass max-w-2xl rounded-2xl py-14">
          <EmptyHeader>
            <EmptyTitle><Copy k="you.you-view.sign-in-to-see-your">Sign in to see your page</Copy></EmptyTitle>
            <EmptyDescription><Copy k="you.you-view.an-account-takes-an-email" multiline>An account takes an email address. Once you are in, everything you write, share, like and save is kept here and follows you to any device.</Copy></EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row flex-wrap justify-center gap-2">
            <Button nativeButton={false} render={<Link href="/sign-in?next=/you" />}><Copy k="you.you-view.sign-in">Sign in</Copy></Button>
            <Button nativeButton={false} variant="secondary" render={<Link href="/saved" />}>
              <Copy k="you.you-view.saved-in-this-browser">Saved in this browser</Copy>
            </Button>
          </EmptyContent>
        </Empty>
      </>
    )
  }
  return <Mine key={member.id} title={member.name} author={member.id} userId={member.id} lead={`Signed in as ${user.email ?? member.name}.`} />
}

const TABS = [
  { id: "projects", label: "Projects" },
  { id: "threads", label: "Threads" },
  { id: "shares", label: "Shares" },
  { id: "following", label: "Following" },
  { id: "progress", label: "Progress" },
] as const
type TabId = (typeof TABS)[number]["id"]

// The open tab follows the URL hash (/you#threads), so other pages can link straight to it.
function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb)
  return () => window.removeEventListener("hashchange", cb)
}
const readHash = () => window.location.hash.slice(1)

function Mine({ lead, author, title, userId }: { lead: string; author?: string; title: string; userId?: string }) {
  const [threads, setThreads] = useState<Question[] | null>(null)
  const [shared, setShared] = useState<Submission[] | null>(null)
  const [following, setFollowing] = useState<number | undefined>(undefined)
  const [error, setError] = useState("")
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "")
  const [picked, setPicked] = useState<TabId | null>(null)
  const reduce = useReducedMotion()
  const uid = useId()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const tabs = TABS
  // old links to the removed tabs (#saved, #settings) open the first one; the pages themselves are in the You menu
  const fromHash = tabs.find((t) => t.id === hash)?.id
  const tab: TabId = picked ?? fromHash ?? "projects"
  const counts: Partial<Record<TabId, number | undefined>> = {
    threads: threads?.length,
    shares: shared?.length,
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
      <PageHead
        backdrop="phosphor"
        title={title}
        lead={lead}
        actions={
          <>
            <Button nativeButton={false} render={<Link href="/new/project" />}>
              <PlusIcon aria-hidden /> New project
            </Button>
            {userId && (
              <Button variant="outline" nativeButton={false} render={<Link href="/settings" />}>
                <Settings2Icon aria-hidden /> Settings
              </Button>
            )}
          </>
        }
      >
        <div role="tablist" aria-label="Your page" onKeyDown={onKey} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.06] [scrollbar-width:none]">
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
                  "relative h-8 shrink-0 rounded-full px-3.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && (
                  <motion.span
                    layoutId={`${uid}-pill`}
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-white/[0.1]"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative">
                  {t.label}
                  {n !== undefined && <span className="ml-1.5 tabular opacity-60">{n}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </PageHead>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <motion.div
        key={tab}
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${tab}`}
        tabIndex={0}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        className="pb-16 outline-none"
      >
        {tab === "projects" && <StudioDashboard embedded />}
        {tab === "threads" && (
          <section aria-label="Your threads" className="flex flex-col gap-2">
            {threads?.length === 0 && (
              <p className="text-muted-foreground">
                Nothing yet. <Link href="/forum/new" className="text-ion hover:underline"><Copy k="you.you-view.start-a-thread">Start a thread</Copy></Link>
              </p>
            )}
            <ul className="flex flex-col gap-1.5">
              {threads?.map((q) => (
                <li key={q.id}>
                  <Link href={`/forum/${q.id}`} className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-4 hover:bg-card">
                    <span lang={q.lang} className="font-medium">
                      {q.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getCategory(q.orbit)?.name ?? q.orbit} · <TimeAgo date={q.createdAt} /> · {q.answerCount} {q.answerCount === 1 ? "reply" : "replies"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tab === "shares" && (
          <section aria-label="What you shared" className="flex flex-col gap-2">
            {shared?.length === 0 && (
              <p className="text-muted-foreground">
                Nothing yet. <Link href="/share" className="text-ion hover:underline"><Copy k="you.you-view.share-something">Share something</Copy></Link>
              </p>
            )}
            <ul className="flex flex-col gap-1.5">
              {shared?.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {/* each shared link has its own page on Nexverse; that page shows the address */}
                    {s.local ? (
                      <span className="font-medium">{s.title}</span>
                    ) : (
                      <Link href={sharePath(s) as Route} className="font-medium hover:underline">
                        {s.title}
                      </Link>
                    )}
                    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <span className="capitalize">{s.kind}</span> · <TimeAgo date={s.createdAt} /> · <span className="truncate">{hostOf(s.url) || "link"}</span>
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => unshare(s.id)}>
                    <Copy k="you.you-view.remove">Remove</Copy>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tab === "following" && (
          <section aria-label="Following" className="flex flex-col gap-4">
            <FollowingList userId={userId} onCount={countFollowing} />
          </section>
        )}
        {tab === "progress" && (
          <section aria-label="Your progress" className="flex flex-col gap-8">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
              <MyPlanet seed={userId ?? "this-browser"} projects={shared?.length} />
              <div className="flex w-full max-w-md flex-col gap-3">
                <ReputationCard className="w-full" />
                <MissionBadges who={userId ? { name: "You", memberId: userId } : null} />
                <CosmosLink target="you" label="Find yourself on the star map" className="self-start" />
              </div>
            </div>
            {userId && <Powers />}
            <MyPoints />
          </section>
        )}
      </motion.div>
    </>
  )
}
