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
        {/* No page-wide transition: it replayed every time a streamed section arrived, so one click looked like several reloads. */}
        {children}
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
