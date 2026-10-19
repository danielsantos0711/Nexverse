import type { Metadata } from "next"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { OwnerRepos } from "@/components/code/owner-repos"

// Repositories live in the database. One sample owner lets the route be checked at build time.
export function generateStaticParams() {
  return [{ owner: "nexverse" }]
}

export async function generateMetadata({ params }: PageProps<"/code/[owner]">): Promise<Metadata> {
  const { owner } = await params
  return { title: `${decodeURIComponent(owner)} · Code` }
}

export default function OwnerPage({ params }: PageProps<"/code/[owner]">) {
  return (
    <div className="shell max-w-6xl pb-16">
      <Suspense fallback={<PageSkeleton />}>
        <Owner params={params} />
      </Suspense>
    </div>
  )
}

async function Owner({ params }: { params: PageProps<"/code/[owner]">["params"] }) {
  const { owner } = await params
  return <OwnerRepos owner={decodeURIComponent(owner)} />
}
