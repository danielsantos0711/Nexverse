"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { InfoIcon, SwordsIcon } from "lucide-react"
import { Sparkline } from "@/components/arena/arena-bits"
import { primaryButton } from "@/components/forum/forum-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { confidence, ELO, getRatings, type DuelTask, type Rating, type RatingSource } from "@/lib/arena"
import { type LanguageCode } from "@/lib/data"
import { useDuelTasks, useLanguages } from "@/lib/lists/hooks"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

type State = { rows: Rating[]; source: RatingSource; anyMemberVotes: boolean; key: string }

/** The arena leaderboard: Elo per model, filterable by task and language, with how many votes each rests on. */
export function RatingsView() {
  const DUEL_TASKS = useDuelTasks()
  const LANGUAGES = useLanguages()
  const reduce = useReducedMotion()
  const { ready } = useSession()
  const [task, setTask] = useState<DuelTask | null>(null)
  const [lang, setLang] = useState<LanguageCode | null>(null)
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState("")
  const key = `${task ?? ""}|${lang ?? ""}`
  // While a new filter loads, the previous table stays in place, dimmed.
  const loading = state?.key !== key && !error

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getRatings({ task, lang })
      .then((s) => {
        if (stale) return
        setState({ ...s, key: `${task ?? ""}|${lang ?? ""}` })
        setError("")
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [task, lang, ready])

  const rows = state?.rows ?? []
  const filtered = Boolean(task || lang)

  return (
    <div className="flex flex-col gap-5">
      {/* Filters: one row above everything they scope. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Task">
          {([null, ...Object.keys(DUEL_TASKS)] as (DuelTask | null)[]).map((t) => (
            <button
              key={t ?? "all"}
              type="button"
              aria-pressed={task === t}
              onClick={() => setTask(t)}
              className={cn(
                "pressable h-8 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                task === t ? "border-ion/50 bg-ion/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {t ? DUEL_TASKS[t].label : <Copy k="arena-ratings.ratings-view.all-tasks">All tasks</Copy>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="rating-lang" className="text-sm text-muted-foreground">
            <Copy k="arena-ratings.ratings-view.language">Language</Copy>
          </label>
          <select
            id="rating-lang"
            value={lang ?? ""}
            onChange={(e) => setLang((e.target.value || null) as LanguageCode | null)}
            className="nx-select"
          >
            <option value="" className="bg-popover">
              All languages
            </option>
            {(Object.keys(LANGUAGES) as LanguageCode[]).map((l) => (
              <option key={l} value={l} className="bg-popover">
                {LANGUAGES[l].name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Ratings could not be loaded ({error}).
        </p>
      )}

      <div aria-busy={loading} className={cn("transition-opacity", loading && state && "opacity-60")}>
        {!state && !error ? (
          <div className="flex flex-col gap-2" aria-label="Loading ratings">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card/40">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Elo ratings{task ? ` for ${DUEL_TASKS[task].label.toLowerCase()} duels` : ""}
                {lang ? ` in ${LANGUAGES[lang].name}` : ""}
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="w-10 py-2.5 pr-2 pl-4 font-medium">
                    #
                  </th>
                  <th scope="col" className="py-2.5 pr-3 font-medium">
                    <Copy k="arena-ratings.ratings-view.model">Model</Copy>
                  </th>
                  <th scope="col" className="py-2.5 pr-3 text-right font-medium">
                    <Copy k="arena-ratings.ratings-view.rating">Rating</Copy>
                  </th>
                  <th scope="col" className="hidden py-2.5 pr-3 pl-5 font-medium sm:table-cell">
                    <Copy k="arena-ratings.ratings-view.confidence">Confidence</Copy>
                  </th>
                  <th scope="col" className="hidden py-2.5 pr-3 font-medium md:table-cell">
                    <Copy k="arena-ratings.ratings-view.won-lost-tied">Won · lost · tied</Copy>
                  </th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">
                    <span className="sr-only sm:not-sr-only"><Copy k="arena-ratings.ratings-view.trend">Trend</Copy></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = confidence(r.votes)
                  return (
                    <motion.tr
                      key={r.model}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(i, 10) * 0.03, ease: [0.23, 1, 0.32, 1] }}
                      className="border-b border-border last:border-0 hover:bg-white/[0.02]"
                    >
                      <td className="py-3 pr-2 pl-4 text-muted-foreground tabular">{i + 1}</td>
                      <td className="w-full max-w-0 py-3 pr-3">
                        <div className="flex min-w-0 flex-col">
                          {r.slug ? (
                            <Link href={`/models/${r.slug}`} className="truncate font-medium hover:text-ion focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                              {r.model}
                            </Link>
                          ) : (
                            <span className="truncate font-medium">{r.model}</span>
                          )}
                          <span className="text-xs text-muted-foreground tabular sm:hidden">
                            {r.votes} votes · {c.label.toLowerCase()} confidence
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right text-base font-semibold tabular">{r.rating}</td>
                      <td className="hidden py-3 pr-3 pl-5 sm:table-cell">
                        <span className="inline-flex items-center gap-2" title={`${r.votes} votes`}>
                          <span aria-hidden className="flex items-end gap-0.5">
                            {[1, 2, 3].map((n) => (
                              <span key={n} className={cn("w-1 rounded-sm", n <= c.level ? "bg-ion" : "bg-white/10")} style={{ height: 4 + n * 3 }} />
                            ))}
                          </span>
                          <span className="text-xs text-muted-foreground tabular">
                            {c.label} · {r.votes} {r.votes === 1 ? "vote" : "votes"}
                          </span>
                        </span>
                      </td>
                      <td className="hidden py-3 pr-3 text-xs text-muted-foreground tabular md:table-cell">
                        {r.wins} · {r.losses} · {r.ties}
                      </td>
                      <td className="py-3 pr-4">
                        <Sparkline values={r.history} width={88} height={26} className="max-sm:hidden" />
                        <Sparkline values={r.history} width={52} height={22} className="sm:hidden" />
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="nx-empty nx-empty-panel flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="nx-empty-icon nx-medallion mb-1">
              <SwordsIcon aria-hidden className="size-5" />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">
              {filtered && state?.anyMemberVotes
                ? <Copy k="arena-ratings.ratings-view.no-votes-on-duels-like">No votes on duels like these yet. Try another task or language, or post a duel for it.</Copy>
                : <Copy k="arena-ratings.ratings-view.no-votes-yet-ratings-appear" multiline>No votes yet. Ratings appear here as soon as members vote on duels: every model starts at 1000.</Copy>}
            </p>
            <Link href="/arena/new" className={primaryButton}>
              <Copy k="arena-ratings.ratings-view.post-a-duel">Post a duel</Copy>
            </Link>
          </div>
        )}
      </div>

      <details className="group rounded-xl border border-border bg-card/30 px-4 py-3 text-sm">
        <summary className="cursor-pointer list-none font-medium marker:hidden focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2 rounded-sm group-focus-within:text-foreground">
            <InfoIcon aria-hidden className="size-4 text-muted-foreground" /> <Copy k="arena-ratings.ratings-view.how-ratings-work">How ratings work</Copy>
          </span>
        </summary>
        <div className="mt-2 flex max-w-[70ch] flex-col gap-2 text-muted-foreground">
          <p>
            Every model starts at {ELO.start}. Each vote is a game between the two models in a duel: the preferred model takes points from the other, more when it beats a higher-rated model.
            A tie or “both are bad” counts as a draw. Votes are replayed oldest first with K = {ELO.k}, the same way for every filter.
          </p>
          <p>
            Models are matched by name, so “Orbit 8B” in two duels is one model. Confidence is low under 20 votes and high from 60. The trend line shows the rating after each of a
            model’s last {ELO.history} games.
          </p>
          <p><Copy k="arena-ratings.ratings-view.ballots-are-secret-nobody-including">Ballots are secret: nobody, including the duel’s author, can see who voted for what.</Copy></p>
        </div>
      </details>
    </div>
  )
}
