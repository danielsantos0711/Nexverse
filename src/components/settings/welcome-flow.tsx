"use client"

import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PlusIcon } from "lucide-react"
import { CategoryIcon } from "@/components/forum/category-icon"
import { PersonAvatar } from "@/components/hub/bits"
import { InterestPicker } from "@/components/settings/interest-picker"
import { suggestHandle, useHandleCheck, WelcomeProfile, type ProfileDraft } from "@/components/settings/welcome-profile"
import { SignInPrompt } from "@/components/studio/ui"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { categories } from "@/lib/data"
import { listMembers, type PublicMember } from "@/lib/people"
import { completeOnboarding, updateProfile, useProfile, type Profile } from "@/lib/profile"
import { listFollowing, toggleFollow } from "@/lib/social"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const STEPS = ["Profile", "Interests", "Follow", "Done"] as const
const LAST = STEPS.length - 1
const EASE = [0.23, 1, 0.32, 1] as const

/** First-run onboarding: how others see you, your interests, a few categories and people to follow, then For you. */
export function WelcomeFlow() {
  const session = useSession()
  const { ready, profile } = useProfile()
  if (live && session.ready && !session.user) {
    return <SignInPrompt title="Sign in to set up your profile and feed" detail="Sign in, or create a free account, and this page walks you through your name, handle, picture and interests." next="/welcome" />
  }
  if (!ready || !profile) return <WelcomeSkeleton />
  return <Flow key={profile.id} profile={profile} userId={session.user?.id ?? null} />
}

function Flow({ profile, userId }: { profile: Profile; userId: string | null }) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [interests, setInterests] = useState(profile.interests)
  const [savedDraft, setSavedDraft] = useState<ProfileDraft>(() => ({ name: profile.name, handle: profile.handle ?? "", bio: profile.bio }))
  const [draft, setDraft] = useState<ProfileDraft>(() => ({ ...savedDraft, handle: profile.handle ?? suggestHandle(profile.name) }))
  const handleState = useHandleCheck(draft.handle, profile.handle)
  const name = draft.name.trim() || profile.name
  const [existing, setExisting] = useState<Set<string> | null>(null)
  const [follows, setFollows] = useState<Set<string>>(new Set())
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [moved, setMoved] = useState(false)
  const [members, setMembers] = useState<PublicMember[]>([])

  // Real members to follow: the newest ones who wrote a line about themselves, not you.
  useEffect(() => {
    if (!live) return
    let stale = false
    listMembers({ limit: 24 })
      .then((list) => !stale && setMembers(list.filter((m) => m.id !== userId).sort((a, b) => Number(Boolean(b.bio)) - Number(Boolean(a.bio))).slice(0, 8)))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [userId])

  useEffect(() => {
    let stale = false
    listFollowing(userId)
      .then((list) => {
        if (stale) return
        const set = new Set(list.map((f) => f.followee))
        setExisting(set)
        setFollows((cur) => new Set([...set, ...cur]))
      })
      .catch(() => !stale && setExisting(new Set()))
    return () => {
      stale = true
    }
  }, [userId])

  function go(to: number) {
    setDir(to > step ? 1 : -1)
    setMoved(true)
    setError("")
    // The categories you picked as interests start out followed, until you change them yourself.
    if (to === 2 && !touched) {
      setFollows((cur) => new Set([...cur, ...interests.filter((i) => i.startsWith("category:"))]))
    }
    setStep(to)
  }

  /** Saves the profile step when you continue from it. A taken handle keeps you on the step to change it. */
  async function saveProfile() {
    const changed = JSON.stringify(draft) !== JSON.stringify(savedDraft)
    if (!changed) return go(1)
    if (!draft.name.trim()) return setError("Your name cannot be empty.")
    setBusy(true)
    setError("")
    try {
      await updateProfile({ name: draft.name.trim(), handle: draft.handle || null, bio: draft.bio.trim() })
      setSavedDraft(draft)
      go(1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function toggle(followee: string) {
    setTouched(true)
    setFollows((cur) => {
      const next = new Set(cur)
      if (next.has(followee)) next.delete(followee)
      else next.add(followee)
      return next
    })
  }

  async function finish() {
    setBusy(true)
    setError("")
    try {
      const before = existing ?? new Set<string>()
      const add = [...follows].filter((f) => !before.has(f))
      const drop = [...before].filter((f) => !follows.has(f) && (f.startsWith("category:") || f.startsWith("member:")))
      const results = await Promise.allSettled([...add.map((f) => toggleFollow(f, true)), ...drop.map((f) => toggleFollow(f, false))])
      await completeOnboarding(interests)
      const failed = results.filter((r) => r.status === "rejected").length
      if (failed) {
        setError(`${failed} ${failed === 1 ? "follow" : "follows"} did not go through. You can follow from any category or profile later.`)
        setBusy(false)
        return
      }
      router.push("/for-you")
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const followCategories = categories.map((c) => `category:${c.slug}`).filter((f) => follows.has(f)).length
  const followPeople = [...follows].filter((f) => f.startsWith("member:")).length
  const variants = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * 24 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * -24 }),
  }

  return (
    <div className="flex flex-col gap-6">
      <ol aria-label="Steps" className="flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full border text-xs tabular transition-colors",
                i < step ? "border-ion bg-ion text-ion-foreground" : i === step ? "border-ion text-ion" : "border-border text-muted-foreground"
              )}
            >
              {i < step ? <CheckIcon aria-hidden className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(i === step ? "text-foreground" : "text-muted-foreground", "max-sm:sr-only")}>{s}</span>
            {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-border sm:w-10" />}
          </li>
        ))}
      </ol>

      <div className="glass overflow-hidden rounded-2xl">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25, ease: EASE }} className="flex flex-col gap-6 p-5 md:p-7">
            {step === 0 && (
              <>
                <StepHead focus={moved} title={`Welcome, ${name.split(/\s+/)[0]}. How should people see you?`} lead="All of this is optional and can be changed any time in settings." />
                <WelcomeProfile profile={profile} draft={draft} onChange={setDraft} handleState={handleState} />
              </>
            )}
            {step === 1 && (
              <>
                <StepHead focus={moved} title="What are you into?" lead="Pick a few. They shape your For you page, and you can change them any time in settings." />
                <InterestPicker value={interests} onChange={setInterests} />
              </>
            )}
            {step === 2 && (
              <>
                <StepHead focus={moved} title={members.length ? "Follow a few categories and people" : "Follow a few categories"} lead="New threads, projects and links from what you follow show up in For you." />
                <section aria-labelledby="w-cats" className="flex flex-col gap-3">
                  <h3 id="w-cats" className="text-xs font-medium text-muted-foreground">
                    Forum categories · {followCategories} followed
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => {
                      const id = `category:${c.slug}`
                      const on = follows.has(id)
                      return (
                        <button
                          key={c.slug}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(id)}
                          title={c.blurb}
                          className={cn(
                            "pressable inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                            on ? "border-ion/50 bg-ion/15 text-foreground" : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <CategoryIcon name={c.icon} className="size-4" />
                          {c.name}
                          {on ? <CheckIcon aria-hidden className="size-3.5 text-ion" /> : <PlusIcon aria-hidden className="size-3.5" />}
                        </button>
                      )
                    })}
                  </div>
                </section>
                {members.length > 0 && (
                  <section aria-labelledby="w-people" className="flex flex-col gap-3">
                    <h3 id="w-people" className="text-xs font-medium text-muted-foreground">
                      Members · {followPeople} followed
                    </h3>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {members.map((m) => {
                        const id = `member:${m.id}`
                        const on = follows.has(id)
                        return (
                          <li key={m.id} className="flex items-start gap-3 rounded-xl border border-border bg-card/50 p-3">
                            <PersonAvatar handle={m.handle ?? m.id} name={m.name} src={m.avatarUrl} size={36} />
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-sm font-medium">{m.name}</span>
                              {m.handle && <span className="truncate text-xs text-muted-foreground">@{m.handle}</span>}
                              {m.bio && <span className="line-clamp-2 text-xs text-muted-foreground">{m.bio}</span>}
                            </div>
                            <button
                              type="button"
                              aria-pressed={on}
                              aria-label={`${on ? "Following" : "Follow"} ${m.name}`}
                              onClick={() => toggle(id)}
                              className={cn(
                                "pressable inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                                on ? "border-ion/40 bg-ion/10 text-ion" : "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
                              )}
                            >
                              {on ? <CheckIcon aria-hidden className="size-3.5" /> : <PlusIcon aria-hidden className="size-3.5" />}
                              {on ? "Following" : "Follow"}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )}
              </>
            )}
            {step === LAST && (
              <>
                <StepHead focus={moved} title="You are all set" lead="Here is what your feed starts from. Everything can be changed later in settings." />
                <dl className="grid grid-cols-3 gap-2.5">
                  <Summary label="Interests" value={interests.length} />
                  <Summary label="Categories" value={followCategories} />
                  <Summary label="People" value={followPeople} />
                </dl>
                {!live && <p className="text-sm text-muted-foreground"><Copy k="welcome.welcome-flow.this-copy-of-nexverse-has">This copy of Nexverse has no database, so your choices are kept in this browser.</Copy></p>}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-col-reverse gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between md:px-7">
          <div>
            {step > 0 && (
              <Button variant="ghost" onClick={() => go(step - 1)} disabled={busy}>
                <ArrowLeftIcon aria-hidden /> <Copy k="welcome.welcome-flow.back">Back</Copy>
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {step < LAST && (
              <Button variant="ghost" onClick={() => go(step + 1)} disabled={busy}>
                <Copy k="welcome.welcome-flow.skip">Skip</Copy>
              </Button>
            )}
            {step === 0 ? (
              <Button onClick={saveProfile} disabled={busy || handleState === "taken" || handleState === "invalid" || handleState === "checking"}>
                {busy ? "Saving…" : "Continue"} <ArrowRightIcon aria-hidden />
              </Button>
            ) : step < LAST ? (
              <Button onClick={() => go(step + 1)} disabled={step === 2 && existing === null}>
                Continue <ArrowRightIcon aria-hidden />
              </Button>
            ) : (
              <Button size="lg" onClick={finish} disabled={busy}>
                {busy ? "Setting up…" : "Go to For you"} <ArrowRightIcon aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          {step === LAST && (
            <Button variant="secondary" size="sm" onClick={() => router.push("/for-you")}>
              <Copy k="welcome.welcome-flow.continue-anyway">Continue anyway</Copy>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** A step's heading. After moving between steps it takes focus, so screen readers announce the new step. */
function StepHead({ title, lead, focus }: { title: string; lead: string; focus: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])
  return (
    <div className="flex flex-col gap-1">
      <h2 ref={ref} tabIndex={-1} className="text-lg font-semibold outline-none">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{lead}</p>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card/50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular">{value}</dd>
    </div>
  )
}

function WelcomeSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  )
}
