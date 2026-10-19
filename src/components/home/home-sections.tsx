"use client"

import { Fragment } from "react"
import { HOME_SECTIONS, useSiteSettings, type FeatureKey, type HomeSectionId } from "@/lib/site-settings"

/** Sections that belong to an area of the site: switched off with it. */
const NEEDS: Partial<Record<HomeSectionId, FeatureKey[]>> = { forum: ["forum"], today: ["missions", "arena"] }

/**
 * Lays out the home page's sections in the order the admins chose, leaving out the ones they hid and the ones
 * whose area is switched off. Sections the saved order does not know yet (added later) keep their place at the end.
 */
export function HomeSections({ slots }: { slots: Record<HomeSectionId, React.ReactNode> }) {
  const { settings } = useSiteSettings()
  const saved = settings.home.sections.filter((s) => HOME_SECTIONS.some((h) => h.id === s.id))
  const order = [...saved, ...HOME_SECTIONS.filter((h) => !saved.some((s) => s.id === h.id)).map((h) => ({ id: h.id, visible: true }))]
  const on = (id: HomeSectionId) => {
    const needs = NEEDS[id]
    return !needs || needs.some((k) => settings.features[k] !== false)
  }
  const seen = new Set<HomeSectionId>()
  return (
    <>
      {order.map((s) => {
        if (!s.visible || seen.has(s.id) || !on(s.id)) return null
        seen.add(s.id)
        return <Fragment key={s.id}>{slots[s.id]}</Fragment>
      })}
    </>
  )
}
