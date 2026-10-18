import { Suspense } from "react"
import { ViewTransition } from "react"
import { CompareTray } from "@/components/hub/compare"
import { CommandMenu } from "@/components/site/command-menu"
import { SiteFooter } from "@/components/site/footer"
import { HideOnChat } from "@/components/site/hide-on-chat"
import { SiteHeader } from "@/components/site/header"
import { ScrollProgress } from "@/components/site/scroll-progress"

export default function CommunityLayout({ children }: LayoutProps<"/">) {
  return (
    <CommandMenu>
      <ViewTransition name="site-header" default="none">
        <SiteHeader />
      </ViewTransition>
      <ScrollProgress />
      <main id="main" className="w-full flex-1 overflow-x-clip">
        {/* Moving between pages, the old page sinks away and the new one rises in (see .page in globals.css). */}
        <ViewTransition default="page">{children}</ViewTransition>
      </main>
      <HideOnChat>
        <SiteFooter />
      </HideOnChat>
      <Suspense fallback={null}>
        <CompareTray />
      </Suspense>
    </CommandMenu>
  )
}
