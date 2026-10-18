"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { MessageSquareIcon } from "lucide-react"
import { FollowButton } from "@/components/social/follow-button"
import { categoryIcon } from "@/components/forum/category-icon"
import { LangTag } from "@/components/hub/bits"
import { ThreadRow } from "@/components/hub/cards"
import { Spotlight } from "@/components/hub/motion"
import { ago, categories, categoryOf, getCategory, threads, trending } from "@/lib/data"
import { listQuestions, type Question } from "@/lib/store"
import { cn } from "@/lib/utils"

const VIEWS = [
  ["hot", "Hot"],
  ["new", "New"],
  ["open", "Unanswered"],
  ["solved", "Solved"],
] as const
type View = (typeof VIEWS)[number][0]

export function ForumIndex() {
  const params = useSearchParams()
  const router = useRouter()
  const cat = params.get("c")
  const [view, setView] = useState<View>("hot")
  const [members, setMembers] = useState<Question[]>([])

  useEffect(() => {
    let stale = false
    // Older threads may carry a first-version community slug, so the category is matched here, not in the query.
    listQuestions({ limit: 100 })
      .then((qs) => !stale && setMembers(qs.filter((q) => !cat || categoryOf(q.orbit) === cat)))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [cat])

  const list = useMemo(() => {
    const pool = threads.filter((t) => !cat || t.category === cat)
    if (view === "hot") return [...pool.filter((t) => t.pinned), ...trending(pool.filter((t) => !t.pinned))]
    if (view === "new") return [...pool].sort((a, b) => b.date.localeCompare(a.date))
    if (view === "open") return pool.filter((t) => t.replies.length === 0)
    return pool.filter((t) => t.replies.some((r) => r.accepted))
  }, [cat, view])

  const memberList = members.filter((q) => (view === "open" ? q.answerCount === 0 : view === "solved" ? Boolean(q.acceptedAnswerId) : true))
  const setCat = (c: string | null) => router.replace(c ? `/forum?c=${c}` : "/forum", { scroll: false })

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15rem_1fr]">
      <nav aria-label="Categories" className="lg:sticky lg:top-20 lg:self-start">
        <ul className="flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          <li>
            <CatButton on={!cat} onClick={() => setCat(null)} label="All categories" count={threads.length} icon={MessageSquareIcon} />
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <CatButton on={cat === c.slug} onClick={() => setCat(c.slug)} label={c.name} count={threads.filter((t) => t.category === c.slug).length} icon={categoryIcon(c.icon)} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-col gap-4">
        {cat && getCategory(cat) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{getCategory(cat)!.blurb}</p>
            <FollowButton followee={`category:${getCategory(cat)!.slug}`} showCount={false} name={getCategory(cat)!.name} />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Sort threads" className="glass flex rounded-full p-1">
            {VIEWS.map(([v, label]) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn("relative rounded-full px-3.5 py-1.5 text-sm transition-colors", view === v ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {view === v && <motion.span layoutId="forum-view" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", bounce: 0.18, duration: 0.45 }} />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
          <Link href={cat ? `/forum/new?c=${cat}` : "/forum/new"} className="pressable inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            Start a thread
          </Link>
        </div>

        {memberList.length > 0 && (
          <section aria-labelledby="mem-h" className="flex flex-col gap-1">
            <h2 id="mem-h" className="px-1 pt-2 font-sans text-xs font-medium tracking-normal text-muted-foreground">
              {memberList.every((q) => q.local) ? "Saved in this browser" : "New from members"}
            </h2>
            <ul className="flex flex-col gap-1">
              {memberList.map((q) => (
                <li key={q.id}>
                  <Spotlight className="relative rounded-xl hover:bg-card/80">
                    <div className="flex flex-col gap-1.5 p-4">
                      <Link href={`/forum/${q.id}`} lang={q.lang} className="text-[15px] font-medium after:absolute after:inset-0">
                        {q.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {getCategory(q.orbit) && <span className="text-ion">{getCategory(q.orbit)!.name}</span>}
                        <LangTag lang={q.lang} />
                        <span>{q.local ? "You" : (q.author?.name ?? "A member")}</span>
                        <span>{ago(q.createdAt)}</span>
                        <span className="tabular">
                          {q.answerCount} {q.answerCount === 1 ? "reply" : "replies"}
                        </span>
                      </div>
                    </div>
                  </Spotlight>
                </li>
              ))}
            </ul>
          </section>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.ol
            key={`${cat}-${view}`}
            initial={{ opacity: 0, transform: "translateY(8px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="flex flex-col gap-1"
          >
            {list.map((t) => (
              <li key={t.id}>
                <ThreadRow t={t} />
              </li>
            ))}
            {list.length === 0 && <li className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">Nothing here yet. Be the first to start one.</li>}
          </motion.ol>
        </AnimatePresence>
      </div>
    </div>
  )
}

function CatButton({ on, onClick, label, count, icon: Icon }: { on: boolean; onClick: () => void; label: string; count: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? "true" : undefined}
      className={cn(
        "pressable flex w-full shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors",
        on ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
      )}
    >
      <Icon className={cn("size-4", on && "text-ion")} />
      {label}
      <span className="ml-auto text-xs tabular opacity-70">{count}</span>
    </button>
  )
}
