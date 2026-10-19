"use client"

import Link from "next/link"
import { OrbitIcon, PowerOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useRole } from "@/lib/roles"
import { FEATURES, useSiteSettings, type FeatureKey } from "@/lib/site-settings"

/** The polite state a switched-off part of the site shows instead of its page. */
export function FeatureOff({ feature }: { feature: FeatureKey }) {
  const label = FEATURES.find((f) => f.key === feature)?.label ?? "This part"
  return (
    <div className="shell py-16">
      <Empty className="rounded-2xl border border-border bg-card/40 py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <OrbitIcon />
          </EmptyMedia>
          <EmptyTitle>This part of Nexverse is switched off by the admins</EmptyTitle>
          <EmptyDescription>{label} is resting for now. Everything else is open, and anything you posted here is kept safe.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" render={<Link href="/" />} nativeButton={false}>
            Back to the home page
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}

/** A thin line admins see on a switched-off area, so they know visitors get the "switched off" state. */
export function FeatureOffAdminNote({ feature }: { feature: FeatureKey }) {
  const label = FEATURES.find((f) => f.key === feature)?.label ?? feature
  return (
    <div role="note" className="shell pt-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-gold/30 bg-gold/[0.06] px-3 py-2 text-sm text-foreground/90">
        <PowerOffIcon aria-hidden className="size-4 shrink-0 text-gold" />
        {label} is switched off for everyone else. You see it because you are an admin.
        <Link href="/admin/settings/features" className="rounded-sm font-medium text-gold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Feature switches
        </Link>
      </p>
    </div>
  )
}

/**
 * Wraps a part of the site that admins can switch off. Until the settings load, the page shows as usual, so
 * nothing flickers for the common case; admins always get through, with a note.
 */
export function FeatureGate({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
  const { settings, ready } = useSiteSettings()
  const me = useRole()
  if (!ready || settings.features[feature] !== false) return children
  if (!me.ready) return children
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
