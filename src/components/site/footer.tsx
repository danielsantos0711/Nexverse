import Link from "next/link"
import { Lockup } from "@/components/brand"

const COLUMNS = [
  { title: "Hub", links: [["Models", "/models"], ["Datasets", "/datasets"], ["Tools", "/tools"], ["Repos", "/repos"], ["Trending now", "/trending"], ["Papers", "/papers"], ["GitHub topics", "/gh/topics"]] },
  { title: "Community", links: [["Forum", "/forum"], ["Chat", "/chat"], ["News", "/news"], ["Constellations", "/constellations"], ["People", "/people"]] },
  { title: "Create", links: [["Publish a project", "/new/project"], ["Your studio", "/studio"], ["Lab", "/lab"], ["Share a link", "/share"], ["Start a thread", "/forum/new"]] },
  { title: "You", links: [["Settings", "/settings"], ["Your page", "/you"], ["For you", "/for-you"], ["Saved", "/saved"], ["Notifications", "/notifications"]] },
] as const

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-border">
      <div className="shell grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-4">
          <Lockup />
          <p className="max-w-[38ch] text-sm text-muted-foreground">
            The open universe for AI builders. Share models, datasets, tools and code, and help each other in any language.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="flex flex-col gap-2.5 text-sm">
            <h2 className="font-sans text-xs font-medium tracking-normal text-muted-foreground">{c.title}</h2>
            {c.links.map(([label, href]) => (
              <Link key={href} href={href} className="text-foreground/85 hover:text-foreground">
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="shell flex flex-col gap-2 border-t border-border py-6 text-xs text-muted-foreground md:flex-row md:justify-between">
        <p>
          Preview: the people, organisations, models and posts shown are samples. What members post is real.
        </p>
        <p>
          Space imagery: NASA, ESA, CSA, STScI and NASA/JPL-Caltech (public domain), graded for this site.
        </p>
      </div>
    </footer>
  )
}
