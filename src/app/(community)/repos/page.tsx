import type { Metadata } from "next"
import { HostedBand } from "@/components/code/hosted-band"
import { ResourceListPage } from "@/components/hub/resource-pages"
import { KINDS } from "@/lib/data"

export const metadata: Metadata = { title: KINDS.repo.plural, description: KINDS.repo.blurb }

export default function Page() {
  return (
    <>
      <HostedBand />
      <ResourceListPage kind="repo" />
    </>
  )
}
