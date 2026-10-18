import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ConstellationCard } from "@/components/hub/cards"
import { ConstellationMap } from "@/components/hub/constellation-map"
import { Item, Stagger } from "@/components/hub/motion"
import { constellations } from "@/lib/data"

export const metadata: Metadata = {
  title: "Constellations",
  description: "Stacks that work: the model, data, tools and code someone connected to build a real thing.",
}

export default function ConstellationsPage() {
  const [first, ...rest] = [...constellations].sort((a, b) => b.saves - a.saves)
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <Image src="/space/deep-field.webp" alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-40" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/20 via-background/60 to-background" />
        <div className="shell grid grid-cols-1 gap-8 pt-14 pb-12 lg:grid-cols-[24rem_1fr] lg:items-center">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gold">Only on Nexverse</p>
            <h1 className="text-4xl font-semibold tracking-[-0.035em] md:text-5xl">Constellations</h1>
            <p className="text-muted-foreground">
              A stack someone actually used: the model, the data, the tools and the code, connected in the order they feed each other. Follow one and you skip a week of searching.
            </p>
            <Link href={`/constellations/${first.slug}`} className="text-ion hover:underline">
              Most saved: {first.name} →
            </Link>
          </div>
          <div className="glass rounded-3xl p-2 md:p-4">
            <ConstellationMap c={first} />
          </div>
        </div>
      </section>
      <Stagger className="shell mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[first, ...rest].map((c) => (
          <Item key={c.slug}>
            <ConstellationCard c={c} className="h-full" />
          </Item>
        ))}
      </Stagger>
    </>
  )
}
