import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

export default function CommunityLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="w-full flex-1 px-gutter pb-32">
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
