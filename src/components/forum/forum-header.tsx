import { Breadcrumbs, type Crumb } from "@/components/forum/forum-ui"
import { AreaCrumbs } from "@/components/site/area-crumbs"
import type { Backdrop } from "@/components/glass/page-backdrop"
import { PageHead } from "@/components/site/page-head"

/**
 * A quiet page header: a breadcrumb (given, or worked out from the menus), a compact title, one line of context and
 * the page's actions on the right (see PageHead). With `k` (a content key prefix such as "events.header") the title
 * and lead are editable by the admins: "<k>.title", "<k>.lead". `icon` is ignored since round 12 (one look for
 * every header); `below` goes under the title row (tabs, a search bar).
 */
export function ForumHeader({
  title,
  lead,
  crumbs,
  children,
  k,
  below,
  backdrop = "topo",
}: {
  title: string
  lead?: string
  crumbs?: Crumb[]
  icon?: React.ReactNode
  children?: React.ReactNode
  k?: string
  below?: React.ReactNode
  /** The shader behind the title: contour lines by default; each area picks its own (see PageBackdrop). */
  backdrop?: Backdrop | "stars"
}) {
  return (
    <PageHead backdrop={backdrop} k={k} title={title} lead={lead} crumbs={crumbs ? <Breadcrumbs items={crumbs} /> : <AreaCrumbs />} actions={children}>
      {below}
    </PageHead>
  )
}
