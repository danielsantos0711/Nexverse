import type { Metadata } from "next"
import { PageTitle } from "@/components/hub/bits"
import { ShareForm } from "@/components/hub/share-form"

export const metadata: Metadata = { title: "Share", description: "Share a model, dataset, tool, repo or a news story with the community." }

export default function SharePage() {
  return (
    <div className="shell max-w-4xl">
      <PageTitle title="Share something" lead="A model, a dataset, a tool, a repo or a story worth reading. Link it here and the community will find it." />
      <ShareForm />
    </div>
  )
}
