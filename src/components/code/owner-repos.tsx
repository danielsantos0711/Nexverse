"use client"

import Link from "next/link"
import { FolderGit2Icon } from "lucide-react"
import { Breadcrumbs } from "@/components/forum/forum-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { getPerson, listRepos } from "@/lib/code/api"
import { useSession } from "@/lib/store"
import { RepoCard } from "./repo-card"
import { Avatar, EmptyState, ErrorNote, personHref, useLoad } from "./ui"

/** /code/<owner>: a member's repositories (their private ones too, when it is you). */
export function OwnerRepos({ owner }: { owner: string }) {
  const session = useSession()
  const data = useLoad(async () => {
    const p = await getPerson(owner)
    if (!p) return null
    return { person: p, repos: await listRepos({ ownerId: p.id, sort: "updated", limit: 100 }) }
  }, [owner, session.user?.id])

  if (data.error) return <ErrorNote error={data.error} onRetry={data.reload} className="mt-10" />
  if (!data.data && data.loading)
    return (
      <div className="flex flex-col gap-4 pt-10" aria-busy="true">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  if (!data.data)
    return (
      <div className="pt-10">
        <EmptyState icon={FolderGit2Icon} title="No member has that name" action={<Button size="sm" variant="outline" nativeButton={false} render={<Link href="/code" />}>Explore repositories</Button>}>
          Check the address; members are found by their handle.
        </EmptyState>
      </div>
    )
  const { person, repos } = data.data
  const mine = session.user?.id === person.id
  return (
    <>
      <header className="flex flex-col gap-3 pt-8 pb-6">
        <Breadcrumbs items={[{ label: "Code", href: "/code" }, { label: person.handle ?? person.name }]} />
        <div className="flex flex-wrap items-center gap-3">
          <Avatar person={person} size={44} />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{person.name}</h1>
            <Link href={personHref(person)} className="text-sm text-muted-foreground hover:text-foreground">
              {person.handle ? `@${person.handle}` : "Profile"}
            </Link>
          </div>
          {mine && (
            <Button className="ml-auto" nativeButton={false} render={<Link href="/code/new" />}>
              New repository
            </Button>
          )}
        </div>
      </header>
      {repos.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {repos.map((r, i) => (
            <RepoCard key={r.id} repo={r} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState icon={FolderGit2Icon} title={mine ? "You have no repositories yet" : `${person.name} has no public repositories yet`}>
            {mine ? "Create one, or import a public repository from GitHub." : "Repositories they make public will show up here."}
          </EmptyState>
        </div>
      )}
    </>
  )
}
