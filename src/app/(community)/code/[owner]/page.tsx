import type { Metadata } from "next"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { OwnerRepos } from "@/components/code/owner-repos"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Repositories live in the database. One sample owner lets the route be checked at build time.
export function generateStaticParams() {
  return [{ owner: "nexverse" }]
}

export async function generateMetadata({ params }: PageProps<"/code/[owner]">): Promise<Metadata> {
  const { owner } = await params
  const who = decodeURIComponent(owner)
  // an owner without a handle is addressed by id; the title never shows the raw id
  return { title: UUID.test(who) ? "Repositories · Code" : `${who} · Code` }
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
