import { Copy } from "@/components/content/copy"
import { Breadcrumbs, type Crumb } from "@/components/forum/forum-ui"
import { AreaCrumbs } from "@/components/site/area-crumbs"

/**
 * A quiet page header: a breadcrumb (given, or worked out from the menus), a normal-sized title and one line of context. With `k` (a content
 * key prefix such as "events.header") the title and lead are editable by the admins: "<k>.title", "<k>.lead".
 */
export function ForumHeader({ title, lead, crumbs, icon, children, k }: { title: string; lead?: string; crumbs?: Crumb[]; icon?: React.ReactNode; children?: React.ReactNode; k?: string }) {
  return (
    <header className="relative isolate flex flex-col gap-3 pt-8 pb-6 md:pt-10">
      {/* every quiet header names its place: the page's own trail, or where the menus put it ("Community › Events") */}
      {crumbs ? <Breadcrumbs items={crumbs} /> : <AreaCrumbs />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{k ? <Copy k={`${k}.title`}>{title}</Copy> : title}</h1>
            {lead && (
              <p className="max-w-[68ch] text-sm text-muted-foreground md:text-[15px]">
                {k ? (
                  <Copy k={`${k}.lead`} multiline>
                    {lead}
                  </Copy>
                ) : (
                  lead
                )}
              </p>
            )}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  )
}
