import Link from "next/link"
import type { Route } from "next"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type LinkTab = { href: string; label: string; icon?: LucideIcon; count?: number }

/*
 * Tabs that are links (?from=github, ?show=map): the server renders the chosen one, the address can be shared and
 * the back button works. One strip, the same on every page that splits its content (Code, the hub's lists,
 * Explore, Collections). Works in server and client components.
 */
export function LinkTabs({ tabs, current, label, className, size = "md" }: { tabs: LinkTab[]; current: string; label: string; className?: string; size?: "sm" | "md" }) {
  return (
    <nav aria-label={label} className={cn("-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] sm:mx-0 sm:px-0", className)}>
      <ul className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
        {tabs.map((t) => {
          const on = t.href === current
          return (
            <li key={t.href}>
              <Link
                href={t.href as Route}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full whitespace-nowrap transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-ring",
                  size === "sm" ? "h-7 px-3 text-[13px]" : "h-8 px-3.5 text-sm",
                  on ? "bg-white/[0.1] text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.icon && <t.icon aria-hidden className="size-3.5" />}
                {t.label}
                {t.count !== undefined && <span className="tabular text-xs opacity-60">{t.count}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
