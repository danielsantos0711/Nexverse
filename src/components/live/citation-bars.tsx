"use client"

import { motion, useReducedMotion } from "motion/react"

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
const compact = (n: number) => COMPACT.format(n)

/** Citations per year as small bars that rise in once; a plain list for screen readers. */
export function CitationBars({ data }: { data: { year: number; count: number }[] }) {
  const reduce = useReducedMotion()
  // At most the last twelve years, so bars stay readable on a phone.
  const rows = data.slice(-12)
  const max = Math.max(1, ...rows.map((d) => d.count))
  if (rows.length < 2) return null
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">Citations per year</figcaption>
      <div aria-hidden className="flex h-32 items-end gap-1.5 rounded-xl border border-border bg-card/40 px-3 pt-3 pb-0">
        {rows.map((d, i) => (
          <div key={d.year} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.year}: ${d.count.toLocaleString("en")} citations`}>
            <span className="text-[10px] text-muted-foreground tabular">{d.count ? compact(d.count) : ""}</span>
            <motion.span
              className="block w-full max-w-8 origin-bottom rounded-t-sm bg-gold/70"
              style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={reduce ? { duration: 0 } : { duration: 0.5, delay: i * 0.03, ease: [0.23, 1, 0.32, 1] }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="flex gap-1.5 px-3">
        {rows.map((d) => (
          <span key={d.year} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground tabular">
            {rows.length > 8 ? `’${String(d.year).slice(2)}` : d.year}
          </span>
        ))}
      </div>
      <ul className="sr-only">
        {rows.map((d) => (
          <li key={d.year}>
            {d.year}: {d.count} citations
          </li>
        ))}
      </ul>
    </figure>
  )
}
