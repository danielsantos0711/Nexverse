import { Suspense } from "react"
import { ViewTransition } from "react"
import { ContentEditor } from "@/components/content/editor"
import { ContentProvider } from "@/components/content/provider"
import { CompareTray } from "@/components/hub/compare"
import { AnnouncementBar } from "@/components/moderation/announcement-bar"
import { SiteGuard } from "@/components/moderation/site-guard"
import { SiteSettingsApplier } from "@/components/moderation/site-settings-applier"
import { CommandMenu } from "@/components/site/command-menu"
import { SiteFooter } from "@/components/site/footer"
import { HideOnChat } from "@/components/site/hide-on-chat"
import { SiteHeader } from "@/components/site/header"
import { ScrollProgress } from "@/components/site/scroll-progress"

export default function CommunityLayout({ children }: LayoutProps<"/">) {
  return (
    // The admins' settings (accent, motion, announcement, switched-off areas, guest access) apply to every page here.
    <SiteSettingsApplier>
      {/* Editable content: the admins' text and list overrides, and the "Edit this page" switch for page editors. */}
      <ContentProvider>
        <CommandMenu>
          <AnnouncementBar />
          <ViewTransition name="site-header" default="none">
            <SiteHeader />
          </ViewTransition>
          <ScrollProgress />
          <main id="main" className="w-full flex-1 overflow-x-clip">
            {/* No page-wide transition: it replayed every time a streamed section arrived, so one click looked like several reloads. */}
            <SiteGuard>{children}</SiteGuard>
          </main>
          <HideOnChat>
            <SiteFooter />
          </HideOnChat>
          <Suspense fallback={null}>
            <CompareTray />
          </Suspense>
          <ContentEditor />
        </CommandMenu>
      </ContentProvider>
    </SiteSettingsApplier>
  )
}
