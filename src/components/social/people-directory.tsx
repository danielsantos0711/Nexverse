"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { MapPinIcon, SearchIcon, UsersIcon } from "lucide-react"
import { PersonAvatar } from "@/components/hub/bits"
import { TimeAgo } from "@/components/live/time"
import { FollowButton } from "@/components/social/follow-button"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { countMembers, listMembers, memberHref, type MemberSort, type PublicMember } from "@/lib/people"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const PAGE = 48

/** Everyone with an account, newest first or by name, with a search over names and handles. */
export function PeopleDirectory() {
  const { ready, user } = useSession()
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<MemberSort>("new")
  const [loaded, setLoaded] = useState<{ key: string; list: PublicMember[] } | null>(null)
  const [more, setMore] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [loadingMore, setLoadingMore] = useState(false)

  // Search as you type, a beat after the last key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (!live || !ready) return
    let stale = false
    const key = `${query}|${sort}`
    listMembers({ q: query, sort, limit: PAGE + 1 })
      .then((m) => {
        if (stale) return
        setLoaded({ key, list: m.slice(0, PAGE) })
        setMore(m.length > PAGE)
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [query, sort, ready, user?.id])

  useEffect(() => {
    if (!live) return
    countMembers().then(setTotal)
  }, [])

  // A new search or sort shows the skeleton until its own results arrive.
  const list = loaded?.key === `${query}|${sort}` ? loaded.list : null
  const setList = (next: PublicMember[]) => setLoaded({ key: `${query}|${sort}`, list: next })

  async function loadMore() {
    if (!list) return
    setLoadingMore(true)
    try {
      const m = await listMembers({ q: query, sort, limit: PAGE + 1, offset: list.length })
      setList([...list, ...m.slice(0, PAGE)])
      setMore(m.length > PAGE)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  if (!live) {
    return (
      <Empty className="glass rounded-2xl py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle><Copy k="people.people-directory.accounts-are-not-switched-on">Accounts are not switched on in this copy</Copy></EmptyTitle>
          <EmptyDescription><Copy k="people.people-directory.this-copy-of-nexverse-runs" multiline>This copy of Nexverse runs without a database, so there are no member profiles to list. Everything you do here stays in this browser.</Copy></EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="glass flex h-11 flex-1 items-center gap-2.5 rounded-xl px-3.5 focus-within:border-ion/50 focus-within:ring-2 focus-within:ring-ring/40">
          <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="sr-only"><Copy k="people.people-directory.search-members-by-name-or">Search members by name or handle</Copy></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search by name or @handle" className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/80" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as MemberSort)} className="glass h-11 rounded-xl px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <option value="new" className="bg-popover">
              Newest members
            </option>
            <option value="name" className="bg-popover">
              Name
            </option>
          </select>
        </label>
      </div>
      {total !== null && total > 0 && (
        <p className="text-sm text-muted-foreground tabular" aria-live="polite">
          {query ? `${list?.length ?? 0}${more ? "+" : ""} matching “${query}”` : `${total.toLocaleString("en")} ${total === 1 ? "member" : "members"}`}
        </p>
      )}

      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Members could not be loaded: {error}
        </p>
      ) : !list ? (
        <ul aria-busy="true" aria-label="Loading members" className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-28 rounded-xl" />
            </li>
          ))}
        </ul>
      ) : list.length === 0 ? (
        <Empty className="rounded-2xl border border-dashed border-border py-14">
          <EmptyHeader>
            <EmptyTitle>{query ? `Nobody called “${query}” yet` : "No members yet"}</EmptyTitle>
            <EmptyDescription>{query ? <Copy k="people.people-directory.check-the-spelling-or-search">Check the spelling, or search for part of the name.</Copy> : <Copy k="people.people-directory.be-the-first-an-account">Be the first: an account takes an email address and nothing else.</Copy>}</EmptyDescription>
          </EmptyHeader>
          {!query && !user && (
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/sign-in?next=/welcome" />}><Copy k="people.people-directory.join-nexverse">Join Nexverse</Copy></Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <li key={m.id}>
                <MemberCard m={m} you={user?.id === m.id} />
              </li>
            ))}
          </ul>
          {more && (
            <Button variant="secondary" className="self-center" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : <Copy k="people.people-directory.show-more-members">Show more members</Copy>}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function MemberCard({ m, you }: { m: PublicMember; you: boolean }) {
  return (
    <article className={cn("group relative flex h-full flex-col gap-2 rounded-xl border bg-card/60 p-3.5 transition-colors hover:bg-card", you ? "border-ion/40" : "border-border")}>
      <div className="flex items-center gap-3">
        <PersonAvatar handle={m.handle ?? m.id} name={m.name} src={m.avatarUrl} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link data-nav-link href={memberHref(m) as `/people/${string}`} className="truncate font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
            {m.name}
            {you && <span className="ml-1.5 rounded-full bg-ion/15 px-1.5 text-[11px] text-ion"><Copy k="people.people-directory.you">You</Copy></span>}
          </Link>
          <span className="truncate text-xs text-muted-foreground">{m.handle ? `@${m.handle}` : <TimeAgo date={m.joinedAt} prefix="Joined" />}</span>
        </div>
        <div className="relative z-10">
          <FollowButton followee={`member:${m.id}`} showCount={false} name={m.name} className="h-8 px-3" />
        </div>
      </div>
      {m.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{m.bio}</p>}
      {m.location && (
        <p className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon aria-hidden className="size-3.5" /> {m.location}
        </p>
      )}
    </article>
  )
}
