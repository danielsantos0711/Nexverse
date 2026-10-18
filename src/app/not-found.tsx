import { NMark } from "@/components/brand"
import { LinkButton } from "@/components/link-button"
import { SiteHeader } from "@/components/site-header"

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col items-start justify-center gap-8 px-gutter py-24">
        <NMark material="titanium" sizes="200px" small className="size-40 rounded-[6px]" />
        <h1 className="font-wide text-head max-w-[16ch] font-semibold">This page left the loop</h1>
        <p className="text-lead max-w-[44ch] text-muted-foreground">
          It may have moved, or it was never here. The question you came with is still worth asking.
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/explore" size="lg">
            Explore
          </LinkButton>
          <LinkButton href="/new" size="lg" variant="secondary">
            Ask a question
          </LinkButton>
        </div>
      </main>
    </>
  )
}
