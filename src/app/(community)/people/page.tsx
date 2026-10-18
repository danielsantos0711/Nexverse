import type { Metadata } from "next"
import { PageTitle } from "@/components/hub/bits"
import { PersonCard } from "@/components/hub/cards"
import { Item, Stagger } from "@/components/hub/motion"
import { people } from "@/lib/data"

export const metadata: Metadata = { title: "People", description: "The builders, researchers and labs sharing on Nexverse." }

export default function PeoplePage() {
  const orgs = people.filter((p) => p.org).sort((a, b) => b.followers - a.followers)
  const humans = people.filter((p) => !p.org).sort((a, b) => b.followers - a.followers)
  const places = new Set(people.map((p) => p.place)).size
  return (
    <div className="shell">
      <PageTitle eyebrow={`${people.length} profiles from ${places} places`} title="People" lead="Builders, researchers and labs. Follow the ones whose work you use, and see what they are making next." />
      <section aria-labelledby="builders-h">
        <h2 id="builders-h" className="mb-3 text-lg font-semibold">
          Builders
        </h2>
        <Stagger className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {humans.map((p) => (
            <Item key={p.handle}>
              <PersonCard handle={p.handle} />
            </Item>
          ))}
        </Stagger>
      </section>
      <section aria-labelledby="orgs-h" className="mt-12">
        <h2 id="orgs-h" className="mb-3 text-lg font-semibold">
          Labs and organisations
        </h2>
        <Stagger className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((p) => (
            <Item key={p.handle}>
              <PersonCard handle={p.handle} />
            </Item>
          ))}
        </Stagger>
      </section>
    </div>
  )
}
