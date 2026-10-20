"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react"
import { CalendarIcon, CheckIcon, LockIcon, LogOutIcon, MailPlusIcon, ShareIcon, UsersIcon } from "lucide-react"
import { ActivityStrip } from "@/components/crews/activity-strip"
import { CrewChat } from "@/components/crews/crew-chat"
import { CrewCollections } from "@/components/crews/crew-collections"
import { CrewMembers, RoleBadge } from "@/components/crews/crew-members"
import { CrewSettings } from "@/components/crews/crew-settings"
import { CrewWall } from "@/components/crews/crew-wall"
import { CrewBanner } from "@/components/crews/crew-banner"
import { CrewHome } from "@/components/crews/crew-home"
import { CrewBadges, CrewEmblem, WhoAvatar } from "@/components/crews/emblem"
import { Breadcrumbs } from "@/components/forum/forum-ui"
import { PageVisitors } from "@/components/presence/page-visitors"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { localMember } from "@/lib/chat"
import {
  acceptInvite,
  canManage,
  CREW_LIMITS,
  crewTint,
  getCrew,
  getStanding,
  INVITE_TOKEN,
  joinCrew,
  leaveCrew,
  listMembers,
  requestToJoin,
  ROLE_LABEL,
  subscribeCrew,
  withdrawRequest,
  type Crew,
  type CrewMember,
  type Standing,
} from "@/lib/crews"
import { useSession, type Member } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

type Tab = "home" | "wall" | "chat" | "collections" | "members" | "settings"
const created = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
const noop = () => () => {}

/**
 * One crew: its banner, sigil and motto, a join button that fits (join, ask to join, accept an invite, leave), and
 * tabs for its home (galaxy, launches, project board, top crew, mission log), the wall, the crew chat, shared
 * collections, members and, for its captain and officers, settings.
 */
export function CrewPage({ slug }: { slug: string }) {
  const session = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const reduce = useReducedMotion()
  const uid = useId()
  const invite = params.get("invite")
  const localMe = useSyncExternalStore(
    noop,
    () => (live ? null : localMember()),
    () => null
  )
  const meId = live ? (session.user?.id ?? null) : (localMe?.id ?? null)
  const meName = live ? session.member?.name : localMe?.name
  const me = useMemo<Member | null>(() => (meId ? { id: meId, name: meName ?? "Member" } : null), [meId, meName])
  const ready = live ? session.ready : localMe !== null

  const [crew, setCrew] = useState<Crew | null | undefined>(undefined)
  const [standing, setStanding] = useState<Standing>({ role: null, requested: false })
  const [members, setMembers] = useState<CrewMember[] | null>(null)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<Tab>("home")
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState("")
  const [activityKey, setActivityKey] = useState(0)
  const [copied, setCopied] = useState(false)

  // The crew itself, loaded in the browser.
  useEffect(() => {
    if (live && !session.ready) return
    let stale = false
    getCrew(slug)
      .then((c) => !stale && setCrew(c))
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setCrew((x) => x ?? null)
      })
    return () => {
      stale = true
    }
  }, [slug, session.ready, session.user?.id])

  const loadStanding = useCallback(() => {
    if (!crew) return
    getStanding(crew)
      .then(setStanding)
      .catch(() => {})
  }, [crew])

  const loadMembers = useCallback(() => {
    if (!crew) return
    listMembers(crew)
      .then(setMembers)
      .catch(() => setMembers((m) => m ?? []))
  }, [crew])

  useEffect(() => {
    if (!ready || !crew) return
    loadStanding()
  }, [ready, crew, loadStanding, session.user?.id])

  const readable = Boolean(crew && (crew.visibility === "public" || standing.role))

  useEffect(() => {
    if (!crew || !readable) return
    loadMembers()
  }, [crew, readable, loadMembers])

  useEffect(() => {
    if (!crew) return
    return subscribeCrew(crew, {
      onMembers: () => {
        loadMembers()
        loadStanding()
      },
      onChange: () => {
        getCrew(slug)
          .then((c) => c && setCrew(c))
          .catch(() => {})
        loadMembers()
        loadStanding()
      },
    })
  }, [crew, slug, loadMembers, loadStanding])

  // Settings are for the owner and admins; anything else falls back to the wall.
  const tabs = useMemo(() => {
    const t: { id: Tab; label: string; count?: number; locked?: boolean }[] = [
      { id: "home", label: "Home", locked: !readable },
      { id: "wall", label: "Wall", locked: !readable },
      { id: "chat", label: "Chat", locked: !standing.role },
      { id: "collections", label: "Collections", locked: !readable },
      { id: "members", label: "Members", count: crew?.memberCount, locked: !readable },
    ]
    if (canManage(standing.role)) t.push({ id: "settings", label: "Settings" })
    return t
  }, [readable, standing.role, crew?.memberCount])
  const current = tabs.some((t) => t.id === tab) ? tab : "home"

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await fn()
      loadStanding()
      loadMembers()
      setActivityKey((k) => k + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const signIn = `/sign-in?next=${encodeURIComponent(`/crews/${slug}${invite ? `?invite=${invite}` : ""}`)}`

  async function share() {
    const url = `${location.origin}/crews/${slug}`
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: crew?.name, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {}
  }

  if (crew === null) {
    return (
      <div className="shell flex max-w-3xl flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-xl font-semibold"><Copy k="crew.crew-page.there-is-no-crew-at">There is no crew at this address</Copy></h1>
        <p className="max-w-sm text-sm text-muted-foreground">{error || "It may have been deleted, or the link has a typo."}</p>
        <Link href="/crews" className="pressable inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
          <Copy k="crew.crew-page.see-all-crews">See all crews</Copy>
        </Link>
      </div>
    )
  }

  if (crew === undefined) {
    return (
      <div className="shell max-w-6xl pt-10" aria-busy="true" aria-label="Loading crew">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-2xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <Skeleton className="mt-8 h-64 w-full rounded-xl" />
      </div>
    )
  }

  const tint = crewTint(crew)
  const validInvite = invite && INVITE_TOKEN.test(invite) ? invite : null
  const showInvite = validInvite && !standing.role && ready

  const action = !ready ? (
    <Skeleton className="h-9 w-28 rounded-full" />
  ) : standing.role === "owner" ? (
    <RoleBadge role="owner" className="h-7 px-3 text-xs" />
  ) : standing.role ? (
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => confirm(`Leave ${crew.name}?`) && run(() => leaveCrew(crew))}>
      <LogOutIcon aria-hidden /> <Copy k="crew.crew-page.leave">Leave</Copy>
    </Button>
  ) : live && !session.user ? (
    <Link href={signIn} className="pressable inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
      <Copy k="crew.crew-page.sign-in-to-join">Sign in to join</Copy>
    </Link>
  ) : crew.visibility === "public" ? (
    <Button disabled={busy} onClick={() => run(() => joinCrew(crew))}>
      <UsersIcon aria-hidden /> {busy ? "Joining…" : "Join crew"}
    </Button>
  ) : standing.requested ? (
    <Button variant="secondary" disabled={busy} onClick={() => run(() => withdrawRequest(crew))} title="Withdraw your request">
      <CheckIcon aria-hidden /> <Copy k="crew.crew-page.request-sent">Request sent</Copy>
    </Button>
  ) : (
    <Button disabled={busy} onClick={() => setAsking(true)}>
      <MailPlusIcon aria-hidden /> <Copy k="crew.crew-page.ask-to-join">Ask to join</Copy>
    </Button>
  )

  const fullWidth = current === "chat" || current === "settings" || current === "home"
  const officer = canManage(standing.role)

  return (
    <div className="shell max-w-6xl pb-16">
      <header className="relative isolate flex flex-col gap-4 pt-6 pb-6 md:pt-8">
        <Breadcrumbs items={[{ label: "Crews", href: "/crews" }, { label: crew.name }]} />
        <CrewBanner banner={crew.banner} tint={tint} seed={crew.slug} className="h-36 rounded-2xl border border-border sm:h-48 md:h-56" />
        <div className="-mt-14 flex flex-col gap-4 px-2 sm:-mt-16 md:flex-row md:items-end md:justify-between md:px-4">
          <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-end">
            <motion.span
              initial={reduce ? false : { rotate: -18, scale: 0.85, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.7, bounce: 0.35 }}
              className="relative z-[1] rounded-[1.25rem] bg-background p-1"
              style={{ boxShadow: `0 10px 40px -10px ${tint}` }}
            >
              {crew.sigil ? (
                <span aria-hidden className="grid size-20 place-items-center rounded-2xl text-4xl" style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${tint} 45%, transparent), color-mix(in oklab, ${tint} 12%, var(--card)) 75%)` }}>
                  {crew.sigil}
                </span>
              ) : (
                <CrewEmblem icon={crew.icon} color={crew.color} size={80} />
              )}
            </motion.span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">{crew.name}</h1>
                <CrewBadges crew={crew} />
              </div>
              {crew.motto && (
                <p className="text-sm italic" style={{ color: `color-mix(in oklab, ${tint} 75%, white)` }}>
                  {crew.motto}
                </p>
              )}
              {crew.blurb && <p className="max-w-[64ch] text-sm text-muted-foreground md:text-[15px]">{crew.blurb}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 tabular">
                  <UsersIcon aria-hidden className="size-3.5" /> {crew.memberCount} aboard
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon aria-hidden className="size-3.5" /> Since {created.format(new Date(crew.createdAt))}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <WhoAvatar who={crew.owner} size={16} /> Captained by {crew.owner.name}
                </span>
                <PageVisitors />
              </div>
              {crew.tags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Topics">
                  {crew.tags.map((t) => (
                    <li key={t} className="rounded-md bg-secondary/70 px-1.5 py-0.5 text-xs text-muted-foreground">
                      #{t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {standing.role && standing.role !== "owner" && <RoleBadge role={standing.role} />}
            <Button variant="outline" size="sm" onClick={share} aria-label={copied ? "Link copied" : "Share this crew"}>
              {copied ? <CheckIcon aria-hidden className="text-ok" /> : <ShareIcon aria-hidden />} {copied ? "Copied" : "Share"}
            </Button>
            {action}
          </div>
        </div>

        {showInvite && (
          <div className="flex flex-col gap-3 rounded-xl border border-ion/30 bg-ion/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              You were invited to join <span className="font-medium">{crew.name}</span>.
            </p>
            {live && !session.user ? (
              <Link href={signIn} className="pressable inline-flex h-9 items-center self-start rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
                <Copy k="crew.crew-page.sign-in-to-accept">Sign in to accept</Copy>
              </Link>
            ) : (
              <Button
                disabled={busy}
                className="self-start"
                onClick={() =>
                  run(async () => {
                    // The link may belong to another crew than the page it was opened on: go where it led.
                    const joined = await acceptInvite(crew, validInvite)
                    router.replace(`/crews/${joined}`, { scroll: false })
                  })
                }
              >
                <Copy k="crew.crew-page.accept-invite">Accept invite</Copy>
              </Button>
            )}
          </div>
        )}

        {asking && (
          <form
            className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                await requestToJoin(crew, note)
                setAsking(false)
                setNote("")
              })
            }}
          >
            <label htmlFor={`${uid}-note`} className="text-sm font-medium">
              Ask to join {crew.name}
            </label>
            <Textarea
              id={`${uid}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={CREW_LIMITS.request}
              placeholder="A line about you and why you would like to join (optional)."
              className="min-h-16 bg-background/60"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                <Copy k="crew.crew-page.send-request">Send request</Copy>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
                <Copy k="crew.crew-page.cancel">Cancel</Copy>
              </Button>
            </div>
            {!live && <p className="text-xs text-muted-foreground"><Copy k="crew.crew-page.local-preview-the-request-is">Local preview: the request is saved in this browser, and nobody will answer it.</Copy></p>}
          </form>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </header>

      <div role="tablist" aria-label="Crew sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const on = t.id === current
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.locked && <LockIcon aria-hidden className="size-3" />}
              {t.label}
              {t.count !== undefined && <span className="rounded-full bg-secondary px-1.5 text-xs tabular">{t.count}</span>}
              {on && (
                <motion.span
                  layoutId={`${uid}-bar`}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                  style={{ background: tint }}
                  transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.45 }}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className={cn("grid gap-8 pt-6", !fullWidth && "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
        <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${current}`} className="min-w-0">
          {tabs.find((t) => t.id === current)?.locked ? (
            <Locked crew={crew} chat={current === "chat"} readable={readable} />
          ) : current === "home" ? (
            <CrewHome crew={crew} role={standing.role} meId={meId} members={members ?? []} onTab={setTab} />
          ) : current === "wall" ? (
            <CrewWall crew={crew} role={standing.role} meId={meId} members={members ?? []} onActivity={() => setActivityKey((k) => k + 1)} />
          ) : current === "chat" ? (
            <CrewChat crew={crew} me={me} canWrite={Boolean(me && standing.role && (!live || session.user))} ready={ready} officer={officer} />
          ) : current === "collections" ? (
            <CrewCollections crew={crew} role={standing.role} />
          ) : current === "members" ? (
            <CrewMembers crew={crew} members={members} role={standing.role} meId={meId} onChanged={loadMembers} />
          ) : standing.role && canManage(standing.role) ? (
            <CrewSettings
              crew={crew}
              role={standing.role}
              onSaved={(c) => {
                setCrew(c)
                setTab("home")
              }}
              onMembersChanged={loadMembers}
            />
          ) : null}
        </div>

        {!fullWidth && (
          <aside className="flex flex-col gap-6" aria-label="About this crew">
            {readable && (
              <section aria-labelledby={`${uid}-week`} className="glass rounded-2xl p-4">
                <h2 id={`${uid}-week`} className="mb-3 font-sans text-sm font-medium tracking-normal">
                  This week
                </h2>
                <ActivityStrip crew={crew} refreshKey={activityKey} />
              </section>
            )}
            {readable && members && members.length > 0 && (
              <section aria-labelledby={`${uid}-crew`} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <h2 id={`${uid}-crew`} className="font-sans text-sm font-medium tracking-normal">
                    The crew
                  </h2>
                  <button type="button" onClick={() => setTab("members")} className="text-xs text-ion hover:underline">
                    <Copy k="crew.crew-page.see-all">See all</Copy>
                  </button>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {members.slice(0, 12).map((m) => (
                    <li key={m.key} title={`${m.name}${m.role !== "member" ? ` · ${ROLE_LABEL[m.role]}` : ""}`} className="relative">
                      <WhoAvatar who={m} size={32} />
                      {m.role !== "member" && <span aria-hidden className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-background", m.role === "owner" ? "bg-gold" : "bg-ion")} />}
                      <span className="sr-only">
                        {m.name}
                        {m.role !== "member" ? `, ${ROLE_LABEL[m.role]}` : ""}
                      </span>
                    </li>
                  ))}
                  {members.length > 12 && <li className="grid size-8 place-items-center rounded-full bg-secondary text-[11px] text-muted-foreground tabular">+{members.length - 12}</li>}
                </ul>
              </section>
            )}
            {!readable && (
              <p className="rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
                <Copy k="crew.crew-page.this-crew-is-invite-only">This crew is invite only. Its wall, members and collections are visible to members.</Copy>
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

function Locked({ crew, chat, readable }: { crew: Crew; chat: boolean; readable: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-gold/10 text-gold">
        <LockIcon aria-hidden className="size-5" />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">
        {chat && readable
          ? `The crew chat is for members. Join ${crew.name} to talk with them live.`
          : `${crew.name} is invite only. Ask to join, or open an invite link from a member.`}
      </p>
    </div>
  )
}

