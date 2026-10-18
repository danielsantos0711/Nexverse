import { Breadcrumbs, type Crumb } from "@/components/forum/forum-ui"

/** A quiet page header for the forum: optional breadcrumb, a normal-sized title and one line of context. */
export function ForumHeader({ title, lead, crumbs, icon, children }: { title: string; lead?: string; crumbs?: Crumb[]; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="relative isolate flex flex-col gap-3 pt-8 pb-6 md:pt-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-56 w-screen -translate-x-1/2 bg-[radial-gradient(50%_70%_at_20%_0%,rgb(143_180_255/0.12),transparent_70%),radial-gradient(35%_60%_at_75%_10%,rgb(216_197_158/0.06),transparent_70%)]"
      />
      {crumbs && <Breadcrumbs items={crumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
            {lead && <p className="max-w-[68ch] text-sm text-muted-foreground md:text-[15px]">{lead}</p>}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  )
}
