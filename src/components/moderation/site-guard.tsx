"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LockIcon } from "lucide-react"
import { FeatureOff, FeatureOffAdminNote } from "@/components/moderation/feature-gate"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useRole } from "@/lib/roles"
import { featureForPath, useSiteSettings } from "@/lib/site-settings"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

// Pages a guest can always open, even when the admins close the site to guests: the front door and the way in.
const OPEN_TO_GUESTS = /^\/(?:$|sign-in(?:\/|$)|auth(?:\/|$)|welcome(?:\/|$))/

/**
 * Applies two site-wide switches to every page, so pages do not each have to: a part of the site the admins
 * switched off shows a polite notice instead (admins still see it), and when guests may not browse, guests get
 * a sign-in wall. This is the interface; the database's own rules still decide what anyone can read or write.
 */
export function SiteGuard({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { settings, ready } = useSiteSettings()
  const session = useSession()
  const me = useRole()

  // The admin panel is never switched off: it is where things get switched back on.
  if (!ready || path.startsWith("/admin")) return children

  if (live && !settings.access.guestsCanBrowse && session.ready && !session.user && !OPEN_TO_GUESTS.test(path)) {
    return <GuestWall path={path} name={settings.brand.name} />
  }

  const feature = featureForPath(path)
  if (feature && settings.features[feature] === false && me.ready) {
    if (me.isAdmin) {
      return (
        <>
          <FeatureOffAdminNote feature={feature} />
          {children}
        </>
      )
    }
    return <FeatureOff feature={feature} />
  }
  return children
}

function GuestWall({ path, name }: { path: string; name: string }) {
  return (
    <div className="shell py-16">
      <Empty className="rounded-2xl border border-border bg-card/40 py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>Sign in to explore {name}</EmptyTitle>
          <EmptyDescription>Right now {name} is open to members only. Signing in takes an email address and nothing else.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          <Button render={<Link href={`/sign-in?next=${encodeURIComponent(path)}`} />} nativeButton={false}>
            Sign in or join
          </Button>
          <Button variant="outline" render={<Link href="/" />} nativeButton={false}>
            Home page
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
