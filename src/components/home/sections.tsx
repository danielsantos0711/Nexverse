import Link from "next/link"
import { CheckCircle2Icon, MessageSquareIcon, PenLineIcon } from "lucide-react"
import { LangTag, PersonAvatar } from "@/components/hub/bits"
import { CountUp } from "@/components/hub/motion"
import { MemberPlanet } from "@/components/planet/member-planet"
import { sampleStats } from "@/lib/community"
import { ago, categoriesIn, categoryGroups, compact, getCategory, getPerson, resourcesBy, threadsIn, type Thread } from "@/lib/data"
import { cn } from "@/lib/utils"
import { AstralAbyss } from "./fx"
import { Slot } from "./slot"

/** A section heading: title and one plain sentence, an optional way onward on the right. */
export function Head({ id, title, lead, href, action, className }: { id: string; title: string; lead?: string; href?: React.ComponentProps<typeof Link>["href"]; action?: string; className?: string }) {
  return (
    <div className={cn("rise mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3", className)}>
      <div className="flex max-w-[62ch] flex-col gap-2">
        <h2 id={id} className="font-display text-2xl font-semibold tracking-[-0.03em] md:text-[1.9rem]">
          {title}
        </h2>
        {lead && <p className="text-[15px] text-foreground/75">{lead}</p>}
      </div>
      {href && action && (
        <Link href={href} className="pressable inline-flex h-9 items-center rounded-full bg-white/[0.06] px-4 text-sm hover:bg-white/[0.1]">
          {action}
        </Link>
      )}
    </div>
  )
}

/** One hot thread: votes set large, the title in its own language, the latest reply opening under it. */
function HotThread({ t, i }: { t: Thread; i: number }) {
  const cat = getCategory(t.category)
  const solved = t.replies.some((r) => r.accepted)
  const last = t.replies.at(-1)
  return (
    <li className="rise" style={{ "--i": i } as React.CSSProperties}>
      <div className="press group relative -mx-3 flex gap-5 rounded-2xl px-3 py-4 hover:bg-white/[0.03] md:gap-7">
        <span className="w-14 shrink-0 pt-0.5 text-right font-display text-[1.75rem] leading-none font-semibold tracking-[-0.04em] text-foreground/90 tabular md:w-16 md:text-[2rem]">
          <CountUp value={t.votes} />
          <span className="mt-1 block text-[11px] font-normal tracking-normal text-muted-foreground">votes</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Link href={`/forum/${t.id}`} lang={t.lang} className="text-[17px] leading-snug font-medium text-balance after:absolute after:inset-0 md:text-lg">
            {t.title}
          </Link>
          {t.en?.title && <p className="text-sm text-muted-foreground">{t.en.title}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {cat && <span className="text-ion">{cat.name}</span>}
            <LangTag lang={t.lang} />
            <span className="inline-flex items-center gap-1.5">
              <PersonAvatar handle={t.author} size={16} />
              {getPerson(t.author)?.name ?? t.author}
            </span>
            <span>{ago(t.date)}</span>
            <span className="inline-flex items-center gap-1 tabular">
              <MessageSquareIcon aria-hidden className="size-3.5" />
              {t.replies.length}
              <span className="sr-only"> replies</span>
            </span>
            {solved && (
              <span className="inline-flex items-center gap-1 text-ok">
                <CheckCircle2Icon aria-hidden className="size-3.5" /> Solved
              </span>
            )}
          </div>
          {last && (
            <div className="reveal-reply">
              <div>
                <p lang={last.lang} className="mt-2 line-clamp-2 border-l border-ion/40 pl-3 text-sm text-foreground/75">
                  <span className="font-medium text-foreground/90">{getPerson(last.author)?.name ?? last.author}: </span>
                  {last.en ?? last.body}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** The forum's hottest threads, with who is online and the ways in on the side. */
export function HotInForum({ threads, online }: { threads: Thread[]; online?: React.ReactNode }) {
  return (
    <section aria-labelledby="forum-h" className="shell grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0">
        <Head id="forum-h" title="Hottest in the forum" lead="Ask in any language. Every thread has a translation one click away." href="/forum" action="Open the forum" />
        <ol className="flex flex-col">
          {threads.map((t, i) => (
            <HotThread key={t.id} t={t} i={i} />
          ))}
        </ol>
      </div>
      <aside aria-label="In the community now" className="flex flex-col gap-8 lg:pt-[4.6rem]">
        <Slot name="Online now" className="min-h-56">
          {online}
        </Slot>
        <div className="rise flex flex-col gap-3">
          <h3 className="font-sans text-sm font-medium tracking-normal text-muted-foreground">Rooms of the forum</h3>
          <ul className="flex flex-col">
            {categoryGroups.map((g) => {
              const cats = categoriesIn(g.slug)
              const n = cats.reduce((sum, c) => sum + threadsIn(c.slug).length, 0)
              return (
                <li key={g.slug}>
                  <Link href={`/forum#${g.slug}`} className="press -mx-2 flex flex-col rounded-lg px-2 py-2 hover:bg-white/[0.035]">
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{g.name}</span>
                      <span className="text-xs text-muted-foreground tabular">{n} threads</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{cats.map((c) => c.name).join(" · ")}</span>
                  </Link>
                </li>
              )
            })}
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
        <div className="rise relative flex min-w-0 flex-col overflow-hidden rounded-3xl bg-card p-5 md:p-7" style={{ "--i": 1 } as React.CSSProperties}>
          <Slot name="Missions">{missions}</Slot>
        </div>
        <div className="rise relative flex min-w-0 flex-col overflow-hidden rounded-3xl bg-card p-5 md:p-7" style={{ "--i": 2 } as React.CSSProperties}>
          <Slot name="Arena">{arena}</Slot>
        </div>
      </div>
    </section>
  )
}

/** Builders as worlds: each one's planet, sized by reputation, with their name under it. */
export function BuilderWorlds({ handles }: { handles: string[] }) {
  return (
    <section aria-labelledby="people-h" className="shell">
      <Head id="people-h" title="Builders to follow" lead="Every member is a planet. It grows with reputation; rings are what they wrote, moons what they made." href="/people" action="Everyone" />
      <ul className="-mx-[var(--gutter)] flex snap-x snap-mandatory gap-2 overflow-x-auto px-[var(--gutter)] pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-8">
        {handles.map((h, i) => {
          const p = getPerson(h)
          if (!p) return null
          const s = sampleStats(h)
          return (
            <li key={h} className="rise w-[9.5rem] shrink-0 snap-start md:w-auto" style={{ "--i": i } as React.CSSProperties}>
              <Link href={`/people/${h}`} className="press group flex flex-col items-center gap-1 rounded-2xl px-1 pt-1 pb-3 text-center hover:bg-white/[0.03]">
                <MemberPlanet
                  handle={h}
                  size={150}
                  label={`${p.name}'s planet`}
                  stats={{ points: s.points, threads: s.threads, replies: s.answers, accepted: s.accepted, projects: resourcesBy(h).length, collections: s.collections, events: s.eventsHosted }}
                  className="transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                />
                <span className="w-full truncate text-sm font-medium">{p.name}</span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {compact(s.points)} reputation · {p.place}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The close: a basin of silver filaments and a tiny explorer on its lip, and one thing to do. */
export function Close() {
  return (
    <section aria-labelledby="join-h" className="shell">
      <div className="relative isolate overflow-hidden rounded-3xl bg-[#05060a]">
        <div aria-hidden className="absolute inset-0 -z-10">
          <AstralAbyss className="size-full" />
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(5_6_10/0.92),rgb(5_6_10/0.6)_45%,transparent_75%)] max-md:bg-[linear-gradient(0deg,rgb(5_6_10/0.95),rgb(5_6_10/0.55)_60%,transparent)]" />
        <div className="flex min-h-[26rem] max-w-2xl flex-col justify-end gap-5 px-6 py-12 md:min-h-[30rem] md:justify-center md:px-14">
          <h2 id="join-h" className="rise text-balance font-display text-3xl font-semibold tracking-[-0.035em] md:text-[2.6rem] md:leading-[1.05]">
            Put your work in the sky.
          </h2>
          <p className="rise text-foreground/80 md:text-lg" style={{ "--i": 1 } as React.CSSProperties}>
            Share a model, a dataset, a tool or a repo in under a minute. Others will find it, use it and connect it to theirs.
          </p>
          <div className="rise flex flex-wrap items-center gap-4" style={{ "--i": 2 } as React.CSSProperties}>
            <Link href="/share" className="pressable inline-flex h-12 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
              Share what you built
            </Link>
            <Link href="/sign-in" className="pressable inline-flex h-12 items-center rounded-full px-2 text-sm text-foreground/75 hover:text-foreground">
              Or sign in with your email
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
