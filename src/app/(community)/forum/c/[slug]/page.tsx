import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { CategoryView } from "@/components/forum/category-view"
import { categories, categoryOf, categoryPath, getCategory } from "@/lib/data"

const CATEGORY_SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/

// The starting categories are prerendered; categories the admins add later render on first visit.
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
  // Slugs from the first version's communities still find their category.
  if (categoryOf(slug) !== slug) permanentRedirect(categoryPath(slug))
  if (!CATEGORY_SLUG.test(slug)) notFound()
  // The category itself (name, rules, whether it exists at all) is read from the database in the browser.
  return <CategoryView slug={slug} />
}
