import Image from "next/image"
import Link from "next/link"
import { NMark } from "@/components/brand"
import { CommandMenu } from "@/components/site/command-menu"
import { SiteHeader } from "@/components/site/header"

export default function NotFound() {
  return (
    <CommandMenu>
      <SiteHeader />
      <main id="main" className="relative isolate flex flex-1 flex-col items-center justify-center gap-6 px-gutter py-24 text-center">
        <Image src="/space/eagle.webp" alt="" fill sizes="100vw" className="-z-10 object-cover opacity-30" />
        <div className="absolute inset-0 -z-10 bg-radial from-transparent to-background" />
        <NMark material="titanium" sizes="160px" small className="size-28 rounded-3xl" />
        <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Lost in space</h1>
        <p className="max-w-[44ch] text-muted-foreground">This page drifted out of orbit, or it was never here. Everything else is one search away.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className="pressable inline-flex h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
            Back home
          </Link>
          <Link href="/explore" className="pressable inline-flex h-11 items-center rounded-full bg-secondary px-6 font-medium">
            Explore
          </Link>
        </div>
      </main>
    </CommandMenu>
  )
}
