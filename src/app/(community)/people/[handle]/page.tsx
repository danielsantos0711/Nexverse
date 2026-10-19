import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { MemberProfile } from "@/components/social/member-profile"
import { isMemberRef } from "@/lib/refs"

// Members are addressed by handle or id, both unknown at build time. One placeholder id lets the route be checked
// during the build and renders the "no member here" state; real profiles load in the browser.
export function generateStaticParams() {
  return [{ handle: "00000000-0000-4000-8000-000000000000" }]
}

export const metadata: Metadata = { title: "Member" }

export default function Page({ params }: PageProps<"/people/[handle]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile params={params} />
    </Suspense>
  )
}

async function Profile({ params }: { params: PageProps<"/people/[handle]">["params"] }) {
  const { handle } = await params
  if (!isMemberRef(handle)) notFound()
  return <MemberProfile memberRef={handle} />
}
