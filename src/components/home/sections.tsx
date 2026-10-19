"use client"

import Image from "next/image"
import Link from "next/link"
import type { Route } from "next"
import { ArrowRightIcon, CheckCircle2Icon, LibraryIcon, MessageSquareIcon, PenLineIcon, SparklesIcon, UserPlusIcon } from "lucide-react"
import { MemberAvatar } from "@/components/forum/forum-ui"
import { MemberPlanet } from "@/components/planet/member-planet"
import { Skeleton } from "@/components/ui/skeleton"
import { categoriesIn, categoryGroups, compact, getCategory, LANGUAGES, type LanguageCode } from "@/lib/data"
import { useSiteSettings } from "@/lib/site-settings"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { AstralAbyss } from "./fx"
import { loadBuilders, loadCollections, loadHotThreads, since, useLoad, type HotThread } from "./hub-data"
import { Slot } from "./slot"

/** A section heading: title and one plain sentence, an optional way onward on the right. */
export function Head({ id, title, lead, href, action, className }: { id: string; title: string; lead?: string; href?: Route; action?: string; className?: string }) {
  return (
    <div className={cn("rise mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3", className)}>
      <div className="flex max-w-[62ch] flex-col gap-2">
        <h2 id={id} className="font-display text-2xl font-semibold tracking-[-0.03em] md:text-[1.75rem]">
          {title}
        </h2>
        {lead && <p className="text-[15px] text-foreground/70">{lead}</p>}
      </div>
      {href && action && (
        <Link href={href} className="pressable group inline-flex h-9 items-center gap-1.5 rounded-full bg-white/[0.06] px-4 text-sm hover:bg-white/[0.1]">
          {action}
          <ArrowRightIcon aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}

/**
 * The honest "nothing here yet": a small drawn orbit with an empty seat, one sentence, and the one thing that
 * would fill it. Used wherever the community has not made something yet.
 */
export function FirstLight({ title, body, href, action, icon: Icon = SparklesIcon, className }: { title: string; body: string; href: Route; action: string; icon?: React.ComponentType<{ className?: string }>; className?: string }) {
  return (
    <div className={cn("rise relative isolate flex flex-col items-start gap-4 overflow-hidden rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.015] p-6 sm:flex-row sm:items-center md:p-7", className)}>
      <span aria-hidden className="relative grid size-16 shrink-0 place-items-center">
        <span className="absolute inset-0 rounded-full border border-ion/25" />
        <span className="absolute inset-2.5 rounded-full border border-dashed border-white/15" />
        <span className="absolute top-0 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_10px_var(--gold)]" />
        <Icon className="size-5 text-ion" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-[60ch] text-sm text-muted-foreground">{body}</p>
      </div>
      <Link href={href} className="pressable inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
        {action}
        <ArrowRightIcon aria-hidden className="size-3.5" />
      </Link>
    </div>
  )
}

/** One lively thread: its replies set large, the title in its own language, where and who. */
function ThreadRow({ t, i }: { t: HotThread; i: number }) {
  const cat = getCategory(t.orbit)
  const lang = LANGUAGES[t.lang as LanguageCode]
  return (
    <li className="rise" style={{ "--i": i } as React.CSSProperties}>
      <div className="press group relative -mx-3 flex gap-5 rounded-2xl px-3 py-4 hover:bg-white/[0.03] md:gap-6">
        <span className="w-12 shrink-0 pt-0.5 text-right font-display text-2xl leading-none font-semibold tracking-[-0.04em] text-foreground/90 tabular">
          {compact(t.replies)}
          <span className="mt-1 block text-[11px] font-normal tracking-normal text-muted-foreground">{t.replies === 1 ? "reply" : "replies"}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Link href={`/forum/${t.id}` as Route} lang={t.lang} className="text-base leading-snug font-medium text-balance after:absolute after:inset-0 group-hover:text-ion md:text-[17px]">
            {t.title}
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {cat && <span className="text-ion">{cat.name}</span>}
            {lang && <span>{lang.name}</span>}
            <span className="inline-flex items-center gap-1.5">
              <MemberAvatar name={t.by} size={16} />
              {t.by}
            </span>
            <span>{since(t.at)}</span>
            {t.solved && (
              <span className="inline-flex items-center gap-1 text-ok">
                <CheckCircle2Icon aria-hidden className="size-3.5" /> Solved
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

/** The forum's liveliest threads, with who is online and the forum's rooms on the side. */
export function HotInForum({ online }: { online?: React.ReactNode }) {
  const threads = useLoad(() => loadHotThreads(6), [])
  return (
    <section aria-labelledby="forum-h" className="shell grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0">
        <Head id="forum-h" title="Lively in the forum" lead="Ask in any language. The threads with the most replies this week rise to the top." href="/forum" action="Open the forum" />
        {threads === undefined ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : threads.length ? (
          <ol className="flex flex-col">
            {threads.map((t, i) => (
              <ThreadRow key={t.id} t={t} i={i} />
            ))}
          </ol>
        ) : (
          <FirstLight
            icon={MessageSquareIcon}
            title="The forum is waiting for its first thread"
            body={live ? "Ask what you are stuck on, share what you built, or start a debate. The first threads set the tone for everyone after." : "Connect the database and members' threads appear here."}
            href="/forum/new"
            action="Start the first thread"
          />
        )}
      </div>
      <aside aria-label="In the community now" className="flex flex-col gap-8 lg:pt-[4.4rem]">
        <Slot name="Online now" className="min-h-40">
          {online}
        </Slot>
        <div className="rise flex flex-col gap-3">
          <h3 className="font-sans text-sm font-medium tracking-normal text-muted-foreground">Rooms of the forum</h3>
          <ul className="flex flex-col">
            {categoryGroups.map((g) => (
              <li key={g.slug}>
                <Link href={`/forum#${g.slug}` as Route} className="press -mx-2 flex flex-col rounded-lg px-2 py-2 hover:bg-white/[0.035]">
                  <span className="text-sm font-medium">{g.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {categoriesIn(g.slug)
                      .map((c) => c.name)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/forum/new" className="pressable mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground">
            <PenLineIcon aria-hidden className="size-4" /> Start a thread
          </Link>
        </div>
      </aside>
    </section>
  )
}

/**
 * Two things to do today, side by side: open missions to take on, and duels to vote in. Each half is the
 * component its feature provides; the frame gives both the same footing.
 */
export function DoToday({ missions, arena }: { missions?: React.ReactNode; arena?: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && !missions && !arena) return null
  return (
    <section aria-labelledby="today-h" className="shell">
      <Head id="today-h" title="Take part today" lead="Take on a mission someone posted, or judge a duel between two models without knowing which is which." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rise relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-white/[0.06] bg-card p-5 md:p-7" style={{ "--i": 1 } as React.CSSProperties}>
          <Slot name="Missions">{missions}</Slot>
        </div>
        <div className="rise relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-white/[0.06] bg-card p-5 md:p-7" style={{ "--i": 2 } as React.CSSProperties}>
          <Slot name="Arena">{arena}</Slot>
        </div>
      </div>
    </section>
  )
}

/** Where a collection item points, as a short label: "model:orbit-8b" reads "orbit-8b". */
const itemLabel = (target: string) => target.split(":").slice(1).join(":") || target

/** Constellations: the public collections members curate, each drawn as a small star map of its items. */
export function Constellations() {
  const list = useLoad(() => loadCollections(4), [])
  return (
    <section aria-labelledby="const-h" className="relative isolate overflow-hidden">
      <Image src="/space/deep-field.webp" alt="" fill sizes="100vw" className="fade-band -z-10 object-cover opacity-20" />
      <div className="shell py-14">
        <Head
          id="const-h"
          title="Constellations"
          lead="A model alone is a star. Members connect the models, data, tools and code that make something work, and save it as a collection anyone can follow."
          href="/collections"
          action="All collections"
        />
        {list === undefined ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : list.length ? (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {list.map((c, i) => (
              <li key={c.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
                <Link href={`/collections/${c.id}` as Route} className="press group flex h-full flex-col gap-3 rounded-2xl border border-white/[0.06] bg-card/70 p-4 hover:border-white/15 hover:bg-card">
                  <StarMap seed={c.id} count={Math.min(c.items, 7)} />
                  <span className="font-medium group-hover:text-ion">{c.title}</span>
                  {c.description && <span className="line-clamp-2 text-sm text-muted-foreground">{c.description}</span>}
                  {c.targets.length > 0 && <span className="truncate text-xs text-foreground/60">{c.targets.slice(0, 3).map(itemLabel).join(" · ")}</span>}
                  <span className="mt-auto text-xs text-muted-foreground">
                    {c.items} {c.items === 1 ? "star" : "stars"} · by {c.by} · {since(c.at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <FirstLight
            icon={LibraryIcon}
            title="No constellation has been drawn yet"
            body="Gather the models, datasets, tools and threads that belong together into a public collection. It becomes the first constellation in this sky."
            href="/collections"
            action="Draw a constellation"
          />
        )}
      </div>
    </section>
  )
}

/** A repeatable sequence of numbers in [0, 1) from a string. */
function sequence(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return () => {
    h = (h * 1103515245 + 12345) >>> 0
    return h / 4294967296
  }
}

/** A tiny star map for a collection: its items as stars joined in order, laid out from its id. */
function StarMap({ seed, count }: { seed: string; count: number }) {
  const rand = sequence(seed)
  const n = Math.max(2, count)
  const stars = Array.from({ length: n }, (_, i) => ({ x: 10 + ((i + rand() * 0.8) / n) * 80, y: 18 + rand() * 64, r: 1.2 + rand() * 1.6 }))
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full rounded-xl bg-[radial-gradient(ellipse_at_30%_20%,rgb(143_180_255/0.12),transparent_60%)]">
      <polyline points={stars.map((s) => `${s.x},${s.y}`).join(" ")} fill="none" stroke="rgb(143 180 255 / 0.35)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={i === 0 ? "#d8c59e" : "#e9ebf1"} />
      ))}
    </svg>
  )
}

/** Builders as worlds: real members, each one's planet grown from their reputation. */
export function BuilderWorlds() {
  const builders = useLoad(() => loadBuilders(8), [])
  const { member } = useSession()
  return (
    <section aria-labelledby="people-h" className="shell">
      <Head id="people-h" title="Builders" lead="Every member is a planet. It grows with reputation; rings are what they wrote, moons what they made." href="/leaderboard" action="Leaderboard" />
      {builders === undefined ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-full" />
          ))}
        </div>
      ) : builders.length ? (
        <ul className="-mx-[var(--gutter)] flex snap-x snap-mandatory gap-2 overflow-x-auto px-[var(--gutter)] pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-8">
          {builders.map((b, i) => {
            const body = (
              <>
                <MemberPlanet
                  handle={b.handle ?? b.id}
                  size={140}
                  label={`${b.name}'s planet`}
                  stats={{ points: b.points, threads: b.threads, replies: b.replies, accepted: b.accepted }}
                  className="transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                />
                <span className="w-full truncate text-sm font-medium">{b.name}</span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {b.points > 0 ? `${compact(b.points)} reputation` : "New member"}
                  {b.place ? ` · ${b.place}` : ""}
                </span>
              </>
            )
            const cls = "press group flex flex-col items-center gap-1 rounded-2xl px-1 pt-1 pb-3 text-center hover:bg-white/[0.03]"
            return (
              <li key={b.id} className="rise w-[9rem] shrink-0 snap-start md:w-auto" style={{ "--i": i } as React.CSSProperties}>
                {b.handle ? (
                  <Link href={`/people/${b.handle}` as Route} className={cls}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            )
          })}
          {builders.length < 8 && !builders.some((b) => b.id === member?.id) && (
            <li className="rise w-[9rem] shrink-0 snap-start md:w-auto" style={{ "--i": builders.length } as React.CSSProperties}>
              <Link href={member ? "/you" : "/sign-in"} className="press group flex flex-col items-center gap-1 rounded-2xl px-1 pt-1 pb-3 text-center hover:bg-white/[0.03]">
                <span aria-hidden className="grid size-[140px] place-items-center">
                  <span className="grid size-20 place-items-center rounded-full border border-dashed border-white/20 text-muted-foreground transition-colors group-hover:border-ion/60 group-hover:text-ion">
                    <UserPlusIcon className="size-5" />
                  </span>
                </span>
                <span className="w-full truncate text-sm font-medium">{member ? "Your planet" : "Your planet here"}</span>
                <span className="w-full truncate text-xs text-muted-foreground">{member ? "Start a thread to grow it" : "Join to claim it"}</span>
              </Link>
            </li>
          )}
        </ul>
      ) : (
        <FirstLight
          icon={UserPlusIcon}
          title="This sky has no planets yet"
          body={live ? "Join, and your planet appears here. It grows as you start threads, answer questions and publish what you build." : "Connect the database and members appear here as planets."}
          href="/sign-in"
          action="Join and claim a planet"
        />
      )}
    </section>
  )
}

/** The close: a basin of silver filaments and a tiny explorer on its lip, and one thing to do. */
export function Close() {
  const { settings } = useSiteSettings()
  const motionOff = settings.theme.motion === "off"
  return (
    <section aria-labelledby="join-h" className="shell">
      <div className="relative isolate overflow-hidden rounded-3xl border border-white/[0.06] bg-[#05060a]">
        <div aria-hidden className="absolute inset-0 -z-10">
          {motionOff ? <Image src="/space/horizon.webp" alt="" fill sizes="100vw" className="object-cover opacity-40" /> : <AstralAbyss className="size-full" />}
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(5_6_10/0.92),rgb(5_6_10/0.6)_45%,transparent_75%)] max-md:bg-[linear-gradient(0deg,rgb(5_6_10/0.95),rgb(5_6_10/0.55)_60%,transparent)]" />
        <div className="flex min-h-[22rem] max-w-2xl flex-col justify-end gap-5 px-6 py-12 md:min-h-[26rem] md:justify-center md:px-14">
          <h2 id="join-h" className="rise font-display text-2xl font-semibold tracking-[-0.03em] text-balance md:text-[2.1rem] md:leading-[1.1]">
            Put your work in the sky.
          </h2>
          <p className="rise text-foreground/80 md:text-[17px]" style={{ "--i": 1 } as React.CSSProperties}>
            Share a model, a dataset, a tool or a repo in under a minute. Others will find it, use it and connect it to theirs.
          </p>
          <div className="rise flex flex-wrap items-center gap-4" style={{ "--i": 2 } as React.CSSProperties}>
            <Link href="/share" className="pressable inline-flex h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
              Share what you built
            </Link>
            <Link href="/new/project" className="pressable inline-flex h-11 items-center rounded-full px-2 text-sm text-foreground/75 hover:text-foreground">
              Or publish a full project page
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
