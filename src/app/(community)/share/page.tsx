import type { Metadata } from "next"
import { Suspense } from "react"
import { PageTitle } from "@/components/hub/bits"
import { ShareForm } from "@/components/hub/share-form"
import { Gate } from "@/components/moderation/gate"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Share", description: "Share a model, dataset, tool, repo or a news story with the community." }

export default function SharePage() {
  return (
    <div className="shell max-w-4xl pb-16">
      <PageTitle title="Share something" lead="Link something worth reading, add a line on why it matters, and it gets its own page to discuss." />
      <Gate cap="link.post" action="share links">
        {/* The form reads ?kind= from the address. */}
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
          <ShareForm />
        </Suspense>
      </Gate>
    </div>
  )
}
