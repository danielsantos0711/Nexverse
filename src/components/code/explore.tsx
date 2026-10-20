"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { CompassIcon, FolderGit2Icon, SearchIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { listActivity, listRepos, starredRepos, trendingRepos, type Repo } from "@/lib/code/api"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"
import { ActivityList } from "./activity"
import { RepoCard } from "./repo-card"
import { EmptyState, ErrorNote, href, inputCls, useLoad } from "./ui"
import { Skeleton } from "@/components/ui/skeleton"
import { Copy } from "@/components/content/copy"

/*
 * /code: trending, recently updated, new and most-starred public repositories, your stars, a search and topics.
 * The tab, search and topic live in the URL (?tab=new&q=llm&topic=agents), so every view can be shared.
 */

const TABS = [
  { id: "trending", label: "Trending" },
  { id: "updated", label: "Recently updated" },
  { id: "new", label: "New" },
  { id: "stars", label: "Most starred" },
  { id: "starred", label: "Your stars" },
] as const
type Tab = (typeof TABS)[number]["id"]

export function CodeExplore() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const session = useSession()
  const me = session.user?.id ?? null
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "trending") as Tab
  const topic = params.get("topic") ?? ""
  const q = params.get("q") ?? ""
  const [draft, setDraft] = useState(q)

  const go = (next: Partial<{ tab: Tab; topic: string; q: string }>) => {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v && !(k === "tab" && v === "trending")) sp.set(k, v)
      else sp.delete(k)
    }
    const s = sp.toString()
    router.replace(href(s ? `${pathname}?${s}` : pathname), { scroll: false })
  }

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (draft === q) return
    const t = setTimeout(() => go({ q: draft.trim() }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the draft drives this
  }, [draft])

  const list = useLoad<Repo[]>(async () => {
    if (q || topic) return listRepos({ q, topic: topic || undefined, sort: tab === "new" ? "new" : tab === "stars" ? "stars" : "updated", limit: 60 })
    if (tab === "trending") return trendingRepos(7, 30)
    if (tab === "starred") return me ? starredRepos(me) : []
    return listRepos({ sort: tab === "new" ? "new" : tab === "stars" ? "stars" : "updated", limit: 60 })
  }, [tab, q, topic, me])

  const activity = useLoad(() => listActivity(undefined, 14), [])

  const topics = useMemo(() => {
    const count = new Map<string, number>()
    for (const r of list.data ?? []) for (const t of r.topics) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t)
  }, [list.data])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section aria-label="Repositories" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div role="tablist" aria-label="Sort repositories" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:pb-0">
            {TABS.filter((t) => t.id !== "starred" || me).map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => go({ tab: t.id })}
                className={cn(
                  "relative h-8 shrink-0 rounded-full px-3.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  tab === t.id ? "bg-ion/15 text-foreground ring-1 ring-ion/30" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="relative sm:ml-auto sm:w-64">
            <span className="sr-only"><Copy k="code.explore.search-repositories">Search repositories</Copy></span>
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search repositories" className={cn(inputCls, "rounded-full pl-9")} />
          </label>
        </div>

        {(topic || q) && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Showing
            {q && <span className="text-foreground">“{q}”</span>}
            {topic && (
              <button onClick={() => go({ topic: "" })} className="inline-flex items-center gap-1 rounded-full bg-repo/15 px-2.5 py-0.5 text-xs text-repo hover:bg-repo/25">
                {topic} <XIcon aria-hidden className="size-3" />
                <span className="sr-only"><Copy k="code.explore.remove-topic-filter">Remove topic filter</Copy></span>
              </button>
            )}
            <button
              onClick={() => {
                setDraft("")
                go({ q: "", topic: "" })
              }}
              className="text-ion hover:underline"
            >
              <Copy k="code.explore.clear">Clear</Copy>
            </button>
          </div>
        )}

        {list.error ? (
          <ErrorNote error={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading repositories">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : list.data && list.data.length ? (
          <ul className={cn("grid gap-3 md:grid-cols-2 transition-opacity", list.loading && "opacity-60")}>
            {list.data.map((r, i) => (
              <RepoCard key={r.id} repo={r} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} />
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-border">
            <EmptyState
              icon={tab === "starred" ? CompassIcon : FolderGit2Icon}
              title={q || topic ? "No repositories match" : tab === "starred" ? "You have not starred anything yet" : "No public repositories yet"}
              action={
                !q && !topic && tab !== "starred" ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" nativeButton={false} render={<Link href="/code/new" />}>
                      <Copy k="code.explore.create-the-first-one">Create the first one</Copy>
                    </Button>
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/code/import" />}>
                      <Copy k="code.explore.import-from-github">Import from GitHub</Copy>
                    </Button>
                  </div>
                ) : undefined
              }
            >
              {q || topic
                ? <Copy k="code.explore.try-fewer-words-or-another">Try fewer words, or another topic.</Copy>
                : tab === "starred"
                  ? <Copy k="code.explore.star-repositories-you-want-to">Star repositories you want to come back to. They collect here.</Copy>
                  : <Copy k="code.explore.repositories-that-members-make-public">Repositories that members make public show up here, with the most starred this week first.</Copy>}
            </EmptyState>
          </div>
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-6" aria-label="Topics and activity">
        {topics.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium"><Copy k="code.explore.topics">Topics</Copy></h2>
            <ul className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <li key={t}>
                  <button
                    onClick={() => go({ topic: t === topic ? "" : t })}
                    aria-pressed={t === topic}
                    className={cn("rounded-full px-2.5 py-0.5 text-xs transition-colors", t === topic ? "bg-repo text-[#1a1024]" : "bg-repo/10 text-repo hover:bg-repo/20")}
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium"><Copy k="code.explore.happening-now">Happening now</Copy></h2>
          {activity.error ? (
            <p className="text-sm text-muted-foreground">{activity.error.message}</p>
          ) : activity.data ? (
            activity.data.length ? (
              <ActivityList items={activity.data} compact />
            ) : (
              <p className="text-sm text-muted-foreground"><Copy k="code.explore.commits-releases-and-merged-pull" multiline>Commits, releases and merged pull requests in public repositories appear here as they happen.</Copy></p>
            )
          ) : (
            <Skeleton className="h-40 rounded-xl" />
          )}
        </section>
        <section className="rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          <h2 className="mb-1 font-medium text-foreground"><Copy k="code.explore.about-git">About git</Copy></h2>
          <p>
            <code className="font-mono text-[13px]">git clone</code> and <code className="font-mono text-[13px]">git push</code> over the git protocol are not supported yet. Work in the browser, download any branch as a zip, or{" "}
            <Link href="/code/import" className="text-ion hover:underline">
              <Copy k="code.explore.import-from-github">import from GitHub</Copy>
            </Link>
            .
          </p>
        </section>
      </aside>
    </div>
  )
}
