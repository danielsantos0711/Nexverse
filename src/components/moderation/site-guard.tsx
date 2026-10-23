"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRightIcon, LockIcon, ShieldIcon } from "lucide-react"
import { NMark } from "@/components/brand"
import { Copy } from "@/components/content/copy"
import { FeatureOff, FeatureOffAdminNote, PageHiddenNote } from "@/components/moderation/feature-gate"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { isVisibility, useBlock, useContentValues, useCopy, visibilityKey } from "@/lib/content"
import { useQuality } from "@/lib/perf"
import { useRole } from "@/lib/roles"
import { featureForPath, useSiteSettings } from "@/lib/site-settings"
import { routeFor } from "@/lib/site-map"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/*
 * Who may open which page. Every page has a visibility the admins choose in the site editor:
 *   everyone  anyone, signed in or not
 *   members   signed-in members; guests get the "join the universe" wall
 *   staff     moderators and admins only
 *   hidden    nobody but staff (staff see it with a note)
 * The interface is only half of it: what guests can read is enforced by the database's row level security
 * (migration 20261019132000_guest_access.sql), so a wall here never hides data a guest could fetch anyway.
 */

export type PageVisibility = "everyone" | "members" | "staff" | "hidden"

/** Sign-in pages are always open, whatever the admins choose: they are the way in. */
const AUTH_ROUTES = /^\/(?:sign-in|join|reset-password|auth|welcome)(?:\/|$)/

// Pages a guest can always open, even when the admins close the whole site to guests: the front door and the way in.
const OPEN_TO_GUESTS = /^\/(?:$|sign-in(?:\/|$)|join(?:\/|$)|reset-password(?:\/|$)|auth(?:\/|$)|welcome(?:\/|$))/

/** Personal or member-to-member areas: members only unless the admins open them. */
const MEMBER_AREAS = new Set(["chat", "messages", "crews", "notifications", "saved", "you", "settings", "studio", "new", "people", "downloads", "for-you", "share"])

/**
 * The visibility a page has until the admins choose another one. Reading is public (home, forum, news,
 * models, datasets, tools, code, the lab's index, events, leaderboard, pages…); talking, personal pages,
 * profiles, downloads and every form that writes are for members; the admin panel is for staff.
 */
export function defaultPageVisibility(path: string): PageVisibility {
  const parts = path.split("/").filter(Boolean)
  const first = parts[0] ?? ""
  if (first === "admin") return "staff"
  if (MEMBER_AREAS.has(first)) return "members"
  // Lab tools run on your account; shared prompts stay public like the index.
  if (first === "lab" && parts.length > 1 && parts[1] !== "prompt") return "members"
  // Writing anything (…/new, …/edit) needs an account.
  if (parts.slice(1).some((p) => p === "new" || p === "edit")) return "members"
  return "everyone"
}

/** Pages that show guests their own, richer wall (chat lists its rooms) instead of the generic one. */
const SELF_GUARDED = /^\/chat(?:\/|$)/

/**
 * The visibility that applies to a page: the admins' saved choice for this address or its route (site editor,
 * "visibility.<path>" in site_content) when there is one, otherwise the default above. Unlike the CMS's own
 * usePageVisibility (which reads "no choice" as everyone), this keeps members-only defaults until an admin
 * explicitly opens a page.
 */
export function usePageAccess(path: string): PageVisibility {
  const values = useContentValues()
  if (AUTH_ROUTES.test(path)) return "everyone"
  const clean = path.split(/[?#]/)[0].replace(/(.)\/+$/, "$1") || "/"
  const exact = values[visibilityKey(clean)]
  if (isVisibility(exact)) return exact
  const route = routeFor(clean)
  const byRoute = route ? values[visibilityKey(route.path)] : undefined
  return isVisibility(byRoute) ? byRoute : defaultPageVisibility(clean)
}

/** A short name for the area a path belongs to, for the wall's label. */
function areaName(path: string): string {
  const [first = "", second] = path.split("/").filter(Boolean)
  const names: Record<string, string> = {
    chat: "Chat rooms",
    messages: "Messages",
    crews: "Crews",
    notifications: "Notifications",
    saved: "Saved items",
    you: "Your page",
    settings: "Settings",
    studio: "Studio",
    new: "Publishing",
    people: "Member profiles",
    downloads: "Downloads",
    "for-you": "Your feed",
    share: "Sharing",
    admin: "The admin panel",
    lab: "Lab tools",
  }
  if (second === "new" || second === "edit") return "Publishing"
  return names[first] ?? "This page"
}

/**
 * Applies the site-wide rules to every page, so pages do not each have to:
 * - a page for members shows guests the join wall, and nothing of the page first (a skeleton until the
 *   session is known, so content never flashes);
 * - staff-only and hidden pages show members a calm notice, and staff a note;
 * - when the admins close the site to guests, every page but the way in shows the wall;
 * - a part of the site the admins switched off shows a polite notice (admins still see it).
 */
export function SiteGuard({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { settings, ready } = useSiteSettings()
  const session = useSession()
  const me = useRole()
  const visibility = usePageAccess(path)

  // Without a database there are no accounts, so there is nothing to guard.
  if (!live || AUTH_ROUTES.test(path)) return children

  if (ready && !settings.access.guestsCanBrowse && session.ready && !session.user && !OPEN_TO_GUESTS.test(path)) {
    return <MemberWall path={path} siteClosed />
  }

  if (visibility !== "everyone") {
    const selfGuarded = visibility === "members" && SELF_GUARDED.test(path)
    if (!selfGuarded) {
      if (!session.ready) return <Held>{children}</Held>
      if (!session.user) return <MemberWall path={path} />
      if (visibility === "staff" || visibility === "hidden") {
        if (!me.ready) return <Held>{children}</Held>
        // "staff" opens to moderators and admins; "hidden" means nobody but admins
        if (visibility === "hidden" ? !me.isAdmin : !me.isStaff) return <TeamOnly hidden={visibility === "hidden"} />
        if (visibility === "hidden") {
          return (
            <>
              <PageHiddenNote />
              {children}
            </>
          )
        }
      }
    }
  }

  // The admin panel is never switched off: it is where things get switched back on.
  if (!ready || path.startsWith("/admin")) return children

  const feature = featureForPath(path)
  if (feature && settings.features[feature] === false && me.ready) {
    if (me.isAdmin) {
      return (
        <>
          <FeatureOffAdminNote feature={feature} />
          {children}
        </>
      )
    }
    return <FeatureOff feature={feature} />
  }
  return children
}

/**
 * A protected page while the session loads (a fraction of a second, read from this browser): its outline
 * shows and the page itself stays rendered but hidden and inert, so nothing flashes, the router keeps its
 * segment (Next's instant-navigation check needs the page rendered), and the wall replaces it for a guest.
 */
function Held({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GuardSkeleton />
      <div hidden inert>
        {children}
      </div>
    </>
  )
}

/** The outline of a page, never its content. */
function GuardSkeleton() {
  return (
    <div className="shell flex flex-col gap-4 py-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

type WallLink = { label: string; href: string }

const EXPLORE: WallLink[] = [
  { label: "Forum", href: "/forum" },
  { label: "News", href: "/news" },
  { label: "Models", href: "/models" },
  { label: "Code", href: "/code" },
]

/**
 * The wall a guest meets on a members-only page: a small orbit around the N, what this place is, and the
 * two ways in. `compact` fits it inside another layout (the chat's middle column).
 */
export function MemberWall({ path, siteClosed = false, compact = false, className }: { path: string; siteClosed?: boolean; compact?: boolean; className?: string }) {
  const { settings } = useSiteSettings()
  const quality = useQuality()
  const still = quality === "off" || quality === "low"
  const signupOpen = settings.access.signupOpen
  const area = areaName(path)
  const next = encodeURIComponent(path)
  const explore = useBlock<WallLink[]>("auth.wall.explore", EXPLORE)
  const label = useCopy("auth.wall.membersOnly", "members only")
  const body = useCopy(
    siteClosed ? "auth.wall.closedBody" : "auth.wall.body",
    siteClosed
      ? `Right now ${settings.brand.name} is open to members only. Sign in to explore the whole universe.`
      : "Members talk, share and build here. Your account is free and needs only an email address."
  )
  const Heading = compact ? "h2" : "h1"
  const closedJoin = useCopy("auth.wall.signupClosed", "Joining is closed for now. Members can sign in as usual.")

  return (
    <div className={cn(compact ? "flex w-full flex-1 items-center justify-center p-4 md:p-8" : "shell flex justify-center py-12 md:py-20", className)}>
      <section aria-labelledby="member-wall-title" className="liquid-glass-strong glass relative flex w-full max-w-lg flex-col items-center gap-6 overflow-hidden rounded-3xl px-6 py-10 text-center md:px-10">
        <Orbit still={still} />
        <div className="relative flex flex-col items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-3 py-1 text-xs text-muted-foreground">
            <LockIcon aria-hidden className="size-3.5 text-gold" />
            {siteClosed ? settings.brand.name : area} · {label}
          </span>
          <Heading id="member-wall-title" className="text-2xl font-semibold tracking-[-0.02em] text-balance">
            <Copy k="auth.wall.title">Join the universe to see this</Copy>
          </Heading>
          <p id="member-wall-body" className="max-w-[44ch] text-sm text-pretty text-muted-foreground md:text-base">
            {body}
          </p>
          {!signupOpen && <p className="max-w-[44ch] text-xs text-muted-foreground">{closedJoin}</p>}
        </div>
        <div className="relative flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {signupOpen && (
            <Button size="lg" className="h-11 px-6" render={<Link href={`/join?next=${next}`} />} nativeButton={false}>
              <Copy k="auth.wall.join">Join free</Copy>
            </Button>
          )}
          <Button size="lg" variant={signupOpen ? "outline" : "default"} className="h-11 px-6" render={<Link href={`/sign-in?next=${next}`} />} nativeButton={false}>
            <Copy k="auth.wall.signIn">Sign in</Copy>
          </Button>
        </div>
        {!siteClosed && explore.length > 0 && (
          <nav aria-label="Open to everyone" className="relative flex flex-col items-center gap-2">
            <Copy k="auth.wall.exploreLabel" as="p" className="text-xs text-muted-foreground">
              Open to everyone
            </Copy>
            <ul className="flex flex-wrap justify-center gap-1.5">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href as never}
                    className="pressable inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background/30 px-3 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {l.label}
                    <ArrowRightIcon aria-hidden className="size-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </section>
    </div>
  )
}

/** The N inside two slow orbits, each carrying a small planet. Still when motion is reduced or quality is low. */
function Orbit({ still }: { still: boolean }) {
  const spin = still ? "" : "motion-safe:animate-[spin_26s_linear_infinite]"
  const spinBack = still ? "" : "motion-safe:animate-[spin_40s_linear_infinite_reverse]"
  return (
    <div aria-hidden className="relative grid size-32 place-items-center">
      <span className={cn("absolute inset-0 rounded-full border border-ion/20", spin)}>
        <span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full bg-ion shadow-[0_0_10px_var(--ion)]" />
      </span>
      <span className={cn("absolute inset-5 rounded-full border border-gold/20", spinBack)}>
        <span className="absolute -top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-gold shadow-[0_0_8px_var(--gold)]" />
      </span>
      <NMark material="chrome" small sizes="48px" className="size-12 rounded-xl" />
    </div>
  )
}

/** What a signed-in member sees on a page for the team only. */
function TeamOnly({ hidden }: { hidden: boolean }) {
  const title = useCopy(hidden ? "auth.teamOnly.hiddenTitle" : "auth.teamOnly.title", hidden ? "This page is not open right now" : "This part is for the Nexverse team")
  const body = useCopy(
    hidden ? "auth.teamOnly.hiddenBody" : "auth.teamOnly.body",
    hidden ? "The admins have closed it for now. Everything else is open to you." : "Only moderators and admins can open it. Everything else is open to you."
  )
  return (
    <div className="shell flex justify-center py-16">
      <section className="liquid-glass glass flex w-full max-w-lg flex-col items-center gap-4 rounded-3xl px-6 py-10 text-center">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-gold/15 text-gold">
          <ShieldIcon aria-hidden className="size-5" />
        </span>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="max-w-[44ch] text-sm text-muted-foreground">{body}</p>
        <Button variant="outline" render={<Link href="/" />} nativeButton={false}>
          Home page
        </Button>
      </section>
    </div>
  )
}
