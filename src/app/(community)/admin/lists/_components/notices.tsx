"use client"

import { Notice } from "@/components/admin/controls"
import type { Availability } from "@/lib/lists/admin"

/** Why lists cannot be saved here, when they cannot. Nothing when saving works (or before the check ends). */
export function AvailabilityNotice({ availability }: { availability: Availability | null }) {
  if (!availability || availability.ok) return null
  // The admin shell already explains a browser-only copy at the top of every page.
  if (availability.reason === "browser") return null
  if (availability.reason === "schema") {
    return (
      <Notice tone="warn" title="The content table is not on this database yet">
        Apply the migrations 20261019130000_site_content.sql and 20261019131000_lists.sql, then reload. Until then the site uses the defaults shown here.
      </Notice>
    )
  }
  return (
    <Notice tone="warn" title="Saved lists could not be read">
      {availability.message ?? "Try again in a moment."}
    </Notice>
  )
}
