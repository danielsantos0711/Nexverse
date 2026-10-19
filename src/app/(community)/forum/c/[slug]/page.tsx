import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { CategoryIcon } from "@/components/forum/category-icon"
import { CategoryTopics } from "@/components/forum/category-topics"
import { ForumHeader } from "@/components/forum/forum-header"
import { NewThreadLink } from "@/components/forum/new-thread-link"
import { FollowButton } from "@/components/social/follow-button"
import { Skeleton } from "@/components/ui/skeleton"
import { categories, categoryPath, getCategory, getCategoryGroup } from "@/lib/data"

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: PageProps<"/forum/c/[slug]">): Promise<Metadata> {
  const c = getCategory((await params).slug)
  return c ? { title: `${c.name} · Forum`, description: c.blurb } : { title: "Forum" }
}

export default function CategoryPage({ params }: PageProps<"/forum/c/[slug]">) {
  return (
    <div className="shell pb-16">
      <Suspense fallback={<PageSkeleton />}>
        <Category params={params} />
      </Suspense>
    </div>
  )
}

async function Category({ params }: { params: PageProps<"/forum/c/[slug]">["params"] }) {
  const { slug } = await params
  const c = categories.find((x) => x.slug === slug)
  if (!c) {
    // Slugs from the first version's communities still find their category.
    const moved = getCategory(slug)
    if (moved) permanentRedirect(categoryPath(moved.slug))
    notFound()
  }
  const group = getCategoryGroup(c.group)

  return (
    <>
      <ForumHeader
        title={c.name}
        lead={c.blurb}
        crumbs={[{ label: "Forum", href: "/forum" }, ...(group ? [{ label: group.name, href: `/forum#${group.slug}` }] : []), { label: c.name }]}
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <CategoryIcon name={c.icon} className="size-5" />
          </span>
        }
      >
        <FollowButton followee={`category:${c.slug}`} showCount={false} name={c.name} />
        <NewThreadLink category={c.slug} />
      </ForumHeader>
      <Suspense fallback={<ListSkeleton />}>
        <CategoryTopics slug={c.slug} name={c.name} />
      </Suspense>
    </>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading threads">
      <Skeleton className="h-10 w-80 max-w-full rounded-full" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )
}
