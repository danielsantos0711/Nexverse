import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { PageView } from "@/components/pages/page-view"

// Pages are built in the admin panel and live in the database. The build needs one param; it is a sample
// address that renders the "not here" state until someone publishes a page called "about".
export function generateStaticParams() {
  return [{ slug: "about" }]
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/

// The page's own title and description replace these once it loads (see PageView).
export const metadata: Metadata = { title: "Page" }

export default function CustomPage({ params }: PageProps<"/pages/[slug]">) {
  return (
    <div className="shell pb-16">
      <Suspense fallback={<PageSkeleton />}>
        <Page params={params} />
      </Suspense>
    </div>
  )
}

async function Page({ params }: { params: PageProps<"/pages/[slug]">["params"] }) {
  const { slug } = await params
  if (!SLUG.test(slug)) notFound()
  return <PageView slug={slug} />
}
