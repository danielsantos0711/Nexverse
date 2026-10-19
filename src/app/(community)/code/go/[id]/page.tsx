import type { Metadata } from "next"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { GoTo } from "@/components/code/go-to"

/*
 * Stable links for notifications: /code/go/repo-<uuid>, /code/go/issue-<uuid>, /code/go/pull-<uuid>. They find
 * the repository's current address (owners and names can change) and move there.
 */
export function generateStaticParams() {
  return [{ id: "repo-00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "Code" }

export default function GoPage({ params }: PageProps<"/code/go/[id]">) {
  return (
    <div className="shell max-w-6xl pb-16">
      <Suspense fallback={<PageSkeleton />}>
        <Go params={params} />
      </Suspense>
    </div>
  )
}

async function Go({ params }: { params: PageProps<"/code/go/[id]">["params"] }) {
  const { id } = await params
  return <GoTo id={id} />
}
