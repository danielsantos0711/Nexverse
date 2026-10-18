import type { Metadata } from "next"
import { PageTitle } from "@/components/hub/bits"
import { NewsCard } from "@/components/hub/cards"
import { Item, Stagger } from "@/components/hub/motion"
import { news, NEWS_KINDS } from "@/lib/data"

export const metadata: Metadata = { title: "News", description: "What changed in AI this week, shared by builders, with why it matters." }

export default function NewsPage() {
  const sorted = [...news].sort((a, b) => b.date.localeCompare(a.date))
  const [lead, second, ...rest] = sorted
  return (
    <div className="shell">
      <PageTitle
        eyebrow={Object.values(NEWS_KINDS).join(" · ")}
        title="News"
        lead="Releases, papers, policy and tutorials, shared by builders. Every story says why it matters, so you can skip the hype."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <NewsCard n={lead} big />
        <NewsCard n={second} big />
      </div>
      <Stagger as="ul" className="mt-4 grid gap-3 md:grid-cols-2">
        {rest.map((n) => (
          <Item as="li" key={n.id}>
            <NewsCard n={n} />
          </Item>
        ))}
      </Stagger>
    </div>
  )
}
