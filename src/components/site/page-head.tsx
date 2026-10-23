import { Copy } from "@/components/content/copy"
import { cn } from "@/lib/utils"

/*
 * The one page header (round 12, Daniel: "muita informaçao em tudo"). Every list page starts the same way:
 *   a small line saying where you are (the menu group, or a breadcrumb trail)
 *   a compact title and at most one short line under it, with the page's actions on the right
 *   then whatever the page puts under it (tabs, a search bar), then the content.
 * No shader, no glow, no giant headline: the sky behind the site is enough. PageTitle, ForumHeader and
 * StudioHead all draw through this, so every page lines up the same way.
 */
export function PageHead({
  title,
  lead,
  k,
  crumbs,
  actions,
  children,
  className,
}: {
  title: React.ReactNode
  lead?: React.ReactNode
  /** Content key prefix ("forum.header"): the admins can edit "<k>.title" and "<k>.lead" in the site editor. */
  k?: string
  /** The trail above the title (AreaCrumbs or Breadcrumbs). */
  crumbs?: React.ReactNode
  /** Buttons on the right of the title: the page's primary action first. */
  actions?: React.ReactNode
  /** Under the title row: tabs, a search bar or a view toggle. */
  children?: React.ReactNode
  className?: string
}) {
  const t = k && typeof title === "string" ? <Copy k={`${k}.title`}>{title}</Copy> : title
  const l = k && typeof lead === "string" ? <Copy k={`${k}.lead`} multiline>{lead}</Copy> : lead
  return (
    <header className={cn("flex flex-col gap-4 pt-7 pb-6 md:pt-9", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          {crumbs}
          <h1 className="text-[1.625rem] leading-tight font-semibold tracking-[-0.02em] md:text-[1.875rem]">{t}</h1>
          {lead && <p className="line-clamp-2 max-w-[64ch] text-sm text-muted-foreground md:text-[15px]">{l}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
