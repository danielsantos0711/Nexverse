"use client"

import Link from "next/link"
import { Suspense } from "react"
import { ArchiveIcon, EyeOffIcon, LockIcon, ShieldIcon } from "lucide-react"
import { CategoryIcon } from "@/components/forum/category-icon"
import { CategoryTopics } from "@/components/forum/category-topics"
import { ForumHeader } from "@/components/forum/forum-header"
import { NewThreadLink } from "@/components/forum/new-thread-link"
import { FollowButton } from "@/components/social/follow-button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { accentChip, findCategory, READ_ROLES, useForumMap } from "@/lib/forum-categories"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const RANK = { guest: 0, member: 1, moderator: 2, admin: 3 } as const

/** One category: its header (with its rules said plainly) and its threads. Reads the live category list. */
export function CategoryView({ slug }: { slug: string }) {
  const map = useForumMap()
  const me = useRole()
  const { user } = useSession()
  const c = findCategory(map, slug)

  if (!c) {
    // The presets answer at once; a category the admins added appears once the database has answered.
    if (!map.ready) return <HeaderSkeleton />
    return (
      <Empty className="mt-10 rounded-2xl border border-border bg-card/40 py-14">
        <EmptyHeader>
          <EmptyTitle>There is no category called “{slug}”</EmptyTitle>
          <EmptyDescription><Copy k="forum.category-view.it-may-have-been-renamed">It may have been renamed or removed. Every category is listed on the forum page.</Copy></EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/forum" className="text-sm text-ion hover:underline">
            <Copy k="forum.category-view.back-to-the-forum">Back to the forum</Copy>
          </Link>
        </EmptyContent>
      </Empty>
    )
  }

  const group = map.groups.find((g) => g.slug === c.group)
  const isMod = Boolean(user && c.moderators.includes(user.id))
  const readable = me.isStaff || isMod || RANK[me.role] >= RANK[c.readMinRole]

  return (
    <>
      <ForumHeader
        title={c.name}
        lead={c.blurb}
        crumbs={[{ label: "Forum", href: "/forum" }, ...(group ? [{ label: group.name, href: `/forum#${group.slug}` }] : []), { label: c.name }]}
        icon={
          <span className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border", accentChip(c.accent))}>
            <CategoryIcon name={c.icon} className="size-5" />
          </span>
        }
      >
        <FollowButton followee={`category:${c.slug}`} showCount={false} name={c.name} />
        <NewThreadLink category={c.slug} />
      </ForumHeader>

      {(c.archived || c.hidden || c.readMinRole !== "guest" || isMod) && (
        <ul aria-label="About this category" className="-mt-2 mb-5 flex flex-wrap gap-2 text-xs">
          {c.archived && <Rule icon={ArchiveIcon} text="Archived: read only" />}
          {c.hidden && <Rule icon={EyeOffIcon} text="Hidden from the forum index" />}
          {c.readMinRole !== "guest" && <Rule icon={LockIcon} text={`Readable by: ${READ_ROLES.find((r) => r.id === c.readMinRole)?.label.toLowerCase()}`} />}
          {isMod && <Rule icon={ShieldIcon} text="You moderate this category" />}
        </ul>
      )}

      {!me.ready && c.readMinRole !== "guest" ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : readable ? (
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <CategoryTopics slug={c.slug} name={c.name} />
        </Suspense>
      ) : (
        <Empty className="rounded-2xl border border-border bg-card/40 py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>{me.role === "guest" ? `Sign in to read ${c.name}` : `${c.name} is for the team`}</EmptyTitle>
            <EmptyDescription>
              {me.role === "guest" ? "This category is open to signed-in members. Joining is free." : "The admins made this category readable by moderators and admins only."}
            </EmptyDescription>
          </EmptyHeader>
          {me.role === "guest" && (
            <EmptyContent>
              <Link href={`/sign-in?next=${encodeURIComponent(`/forum/c/${c.slug}`)}`} className="text-sm text-ion hover:underline">
                Sign in or join
              </Link>
            </EmptyContent>
          )}
        </Empty>
      )}
    </>
  )
}

function Rule({ icon: Icon, text }: { icon: typeof LockIcon; text: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-2.5 py-1 text-muted-foreground">
      <Icon aria-hidden className="size-3.5" /> {text}
    </li>
  )
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 pt-10" aria-busy="true" aria-label="Loading the category">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="h-7 w-56" />
      </div>
      <Skeleton className="mt-4 h-96 w-full rounded-xl" />
    </div>
  )
}
