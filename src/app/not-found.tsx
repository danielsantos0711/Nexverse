import { CommandMenu } from "@/components/site/command-menu"
import { SiteHeader } from "@/components/site/header"
import { LostInSpace } from "@/components/site/lost-in-space"

export default function NotFound() {
  return (
    <CommandMenu>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        <LostInSpace />
      </main>
    </CommandMenu>
  )
}
