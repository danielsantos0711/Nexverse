import Link from "next/link"
import { MenuIcon } from "lucide-react"
import { AccountButton } from "@/components/account/account-button"
import { Lockup } from "@/components/brand"
import { LinkButton } from "@/components/link-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/orbits", label: "Orbits" },
  { href: "/signal", label: "Signal" },
]

export function SiteHeader() {
  return (
    <header className="relative z-20 flex h-16 items-center justify-between gap-6 px-gutter">
      <Link href="/" className="pressable -m-2 rounded-md p-2" aria-label="Nexverse home">
        <Lockup />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1">
        <ul className="hidden items-center gap-1 sm:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                className="rounded-full px-3 py-2 text-[15px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <ThemeToggle />
        <AccountButton />
        <LinkButton href="/new" className="hidden sm:inline-flex">
          Ask a question
        </LinkButton>
        <Sheet>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open menu" />}>
            <MenuIcon />
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <ul className="flex flex-col gap-1 px-4 pt-14">
              {[...NAV, { href: "/new", label: "Ask a question" }].map((n) => (
                <li key={n.href}>
                  <SheetClose
                    render={<Link href={n.href} />}
                    nativeButton={false}
                    className="block rounded-md px-3 py-3 text-lg font-medium hover:bg-muted"
                  >
                    {n.label}
                  </SheetClose>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  )
}
