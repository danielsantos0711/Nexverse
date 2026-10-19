import type { Metadata } from "next"
import { Suspense } from "react"
import { PageEditor } from "@/components/admin/pages-editor"
import { Skeleton } from "@/components/ui/skeleton"

// Pages live in the database; "new" opens an empty editor, any other id loads that page in the browser.
export function generateStaticParams() {
  return [{ id: "new" }]
}

export const metadata: Metadata = { title: "Edit page" }

export default function AdminPageEditorPage({ params }: PageProps<"/admin/pages/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Editor params={params} />
    </Suspense>
  )
}

async function Editor({ params }: { params: PageProps<"/admin/pages/[id]">["params"] }) {
  const { id } = await params
  return <PageEditor id={id} />
}
