import type { Metadata } from "next"
import Link from "next/link"
import { NMark } from "@/components/brand"
import { PageHead } from "@/components/app/bits"
import { artifactsIn, orbits, peopleIn, threadsIn } from "@/lib/data"

export const metadata: Metadata = { title: "Orbits" }

export default function OrbitsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHead
        title="Orbits"
        lead="Communities around one subject each. Join the ones you know something about, and the ones you want to."
      />
      <ul className="flex flex-col">
        {orbits.map((o) => {
          const open = threadsIn(o.slug).filter((t) => t.stage === "asked").length
          return (
            <li key={o.slug}>
              <Link
                href={`/orbits/${o.slug}`}
                className="group/o -mx-3 grid grid-cols-[4rem_1fr] items-center gap-5 rounded-md px-3 py-6 transition-colors duration-150 hover:bg-card md:grid-cols-[5.5rem_1fr_16rem]"
              >
                <NMark material={o.material} small sizes="88px" className="size-16 rounded-[6px] md:size-22" />
                <span className="flex flex-col gap-1.5">
                  <span className="font-wide text-[clamp(1.5rem,1rem+1.6vw,2.4rem)] leading-none font-semibold tracking-[-0.03em]">
                    {o.name}
                  </span>
                  <span className="max-w-[56ch] text-muted-foreground">{o.blurb}</span>
                </span>
                <span className="col-start-2 flex gap-5 text-small text-muted-foreground tabular md:col-start-3 md:justify-end">
                  <span>{plural(threadsIn(o.slug).length, "thread")}</span>
                  <span>{artifactsIn(o.slug).length} built</span>
                  <span>{plural(peopleIn(o.slug).length, "person", "people")}</span>
                  {open > 0 && <span className="text-foreground">{open} open</span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}
