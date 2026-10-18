import { CommandMenu } from "@/components/site/command-menu"
import { SiteFooter } from "@/components/site/footer"
import { SiteHeader } from "@/components/site/header"

export default function CommunityLayout({ children }: LayoutProps<"/">) {
  return (
    <CommandMenu>
      <SiteHeader />
      <main id="main" className="w-full flex-1">
        {children}
      </main>
      <SiteFooter />
    </CommandMenu>
  )
}
