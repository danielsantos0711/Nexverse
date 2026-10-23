"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"
import { iconFor } from "@/components/site/icons"
import { useMenus } from "@/lib/menus"
import { cn } from "@/lib/utils"

/*
 * "Discover › News": where a page sits in the header's map, worked out from the admins' menus, so every page
 * header names its place the same way and the header group is one click away. Extra crumbs (a category, an
 * item) go after it. Renders the extra crumbs alone for pages no menu lists.
 */

export type AreaCrumb = { label: string; href?: string }

export function AreaCrumbs({ extra = [], className }: { extra?: AreaCrumb[]; className?: string }) {
  const pathname = usePathname()
  const { header } = useMenus()
  // The longest menu link that is this page or a parent of it.
  let best: { group: string; groupId: string; label: string; href: string; icon: string } | null = null
  for (const g of header) {
    for (const l of g.links) {
      const h = l.href.split(/[?#]/)[0]
      if (!(pathname === h || (h !== "/" && pathname.startsWith(h + "/")))) continue
      if (!best || h.length > best.href.length) best = { group: g.label, groupId: g.id, label: l.label, href: h, icon: l.icon }
    }
  }
  // On the place itself only the group is named ("Community" over the Forum's title): the title already says
  // "Forum", so a trail of "Community › Forum" above it would say it twice. Deeper pages get the whole trail.
  const exact = best !== null && pathname === best.href && !extra.length
  const items: AreaCrumb[] = best ? (exact ? [{ label: best.group }] : [{ label: best.group }, { label: best.label, href: best.href }, ...extra]) : extra
  if (!items.length) return null
  if (exact) return <p className={cn("text-sm text-muted-foreground", className)}>{best?.group}</p>
  const Icon = best ? iconFor(best.icon) : null
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0 text-sm text-muted-foreground", className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 opacity-60" />}
              {i === 1 && Icon && <Icon aria-hidden className="size-3.5 text-ion" />}
              {c.href && !last ? (
                <Link href={c.href as Route} className="rounded-sm whitespace-nowrap transition-colors duration-(--dur-fast) hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last && "text-foreground/85")}>
                  {c.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
