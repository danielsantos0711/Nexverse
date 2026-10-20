"use client"

import { EyeOffIcon, HashIcon, SparkleIcon, StarIcon } from "lucide-react"
import { BADGE_STATS } from "@/lib/community"
import type { ListDef, Row } from "@/lib/lists/registry"
import { cn } from "@/lib/utils"

/*
 * How a list will look on the site, drawn from the draft as it is typed. Close to the real components, but
 * self-contained, so a preview never fetches anything or changes the page it previews.
 */

const str = (v: Row[string] | undefined) => (v === undefined ? "" : String(v))

export function ListPreview({ def, rows }: { def: ListDef; rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Empty: this part of the site will not show.</p>
  switch (def.preview) {
    case "chips":
      return <Chips def={def} rows={rows} />
    case "cards":
      return <Cards rows={rows} />
    case "ladder":
      return <Ladder rows={rows} />
    case "badges":
      return <Badges rows={rows} />
    case "tools":
      return <Tools rows={rows} />
    default:
      return <Table def={def} rows={rows} />
  }
}

function Chips({ def, rows }: { def: ListDef; rows: Row[] }) {
  const featured = def.slug === "github-topics"
  if (featured) {
    return (
      <ul className="grid gap-2">
        {rows.map((r, i) => (
          <li key={`${str(r.id)}-${i}`} className="rounded-xl border border-border bg-card/60 p-3">
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <HashIcon aria-hidden className="size-3.5 text-repo" />
              {str(r.label) || str(r.id) || "Untitled"}
            </span>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{str(r.blurb) || "No description yet."}</p>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rows.map((r, i) => {
        const label = def.slug === "languages" ? `${str(r.native) || str(r.name)}` : str(r[def.idField])
        return (
          <li key={`${label}-${i}`} className="liquid-glass-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground">
            {def.slug !== "languages" && def.slug !== "release-repos" && <HashIcon aria-hidden className="size-3 text-repo" />}
            <span lang={def.slug === "languages" ? str(r.code) : undefined}>{label || "…"}</span>
            {def.slug === "languages" && <span className="text-[10px] uppercase opacity-70">{str(r.code)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function Cards({ rows }: { rows: Row[] }) {
  return (
    <ul className="grid gap-2">
      {rows.map((r, i) => {
        const off = r.enabled === false
        return (
          <li key={`${str(r.id)}-${i}`} className={cn("rounded-xl border border-border bg-card/60 px-3 py-2.5", off && "opacity-50")}>
            <span className="flex items-center gap-2 text-sm font-medium">
              {str(r.label) || "Untitled"}
              {r.plural !== undefined && <span className="text-xs font-normal text-muted-foreground">· {str(r.plural)}</span>}
              {off && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <EyeOffIcon aria-hidden className="size-3" /> Not offered
                </span>
              )}
            </span>
            {str(r.blurb) && <p className="mt-0.5 text-xs text-muted-foreground">{str(r.blurb)}</p>}
          </li>
        )
      })}
    </ul>
  )
}

/** Levels as orbits: each one a ring further out, with the points it starts at. */
function Ladder({ rows }: { rows: Row[] }) {
  const sorted = [...rows].sort((a, b) => Number(a.min) - Number(b.min))
  return (
    <ol className="relative flex flex-col gap-3 pl-1">
      {sorted.map((r, i) => {
        const size = 14 + i * 4
        return (
          <li key={`${str(r.name)}-${i}`} className="flex items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center">
              <span className="relative grid place-items-center rounded-full border border-ion/40" style={{ width: size + 12, height: size + 12 }}>
                <span className="rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,rgb(143_180_255)_45%,rgb(60_80_160)_100%)]" style={{ width: Math.max(6, size / 2), height: Math.max(6, size / 2) }} />
              </span>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">
                {str(r.name) || "Untitled"} <span className="text-xs font-normal text-muted-foreground tabular-nums">from {Number(r.min).toLocaleString("en")} points</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">{str(r.blurb)}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Badges as small constellations: lit stars once earned. */
function Badges({ rows }: { rows: Row[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {rows.map((r, i) => (
        <li key={`${str(r.id)}-${i}`} className="flex items-start gap-2.5 rounded-xl border border-border bg-card/60 p-2.5">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
            <StarIcon className="size-4 fill-current" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{str(r.name) || "Untitled"}</span>
            <span className="text-xs text-muted-foreground">
              {Number(r.min).toLocaleString("en")} × {(BADGE_STATS.find((s) => s.id === r.stat)?.label ?? "").toLowerCase()}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function Tools({ rows }: { rows: Row[] }) {
  const shown = rows.filter((r) => r.enabled !== false)
  const ordered = [...shown.filter((r) => r.featured === true), ...shown.filter((r) => r.featured !== true)]
  const hidden = rows.length - shown.length
  return (
    <div className="flex flex-col gap-2">
      <ul className="grid gap-2">
        {ordered.map((r) => (
          <li key={str(r.slug)} className={cn("rounded-xl border bg-card/60 px-3 py-2.5", r.featured === true ? "border-ion/40" : "border-border")}>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {r.featured === true && <SparkleIcon aria-hidden className="size-3.5 text-ion" />}
              {str(r.name)}
              {r.isNew === true && <span className="rounded-full bg-ion/15 px-1.5 text-[10px] font-medium text-ion">New</span>}
            </span>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{str(r.tagline)}</p>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {hidden} switched off: hidden from the Lab, and {hidden === 1 ? "its page answers" : "their pages answer"} “not found”.
        </p>
      )}
    </div>
  )
}

function Table({ def, rows }: { def: ListDef; rows: Row[] }) {
  const cols = def.fields.filter((f) => f.kind !== "textarea" && !f.locked && f.name !== "sourceUrl" && f.name !== "url").slice(0, 4)
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-white/[0.03] text-muted-foreground">
          <tr>
            {cols.map((c) => (
              <th key={c.name} scope="col" className="px-2.5 py-2 font-medium whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cn("border-t border-border", r.retired === true && "opacity-50")}>
              {cols.map((c) => {
                const v = r[c.name]
                const label = c.kind === "boolean" ? (v === true ? "Yes" : "No") : c.kind === "select" ? (c.options?.find((o) => o.value === v)?.label ?? str(v)) : str(v)
                return (
                  <td key={c.name} className={cn("max-w-48 truncate px-2.5 py-1.5", c.kind === "number" && "tabular-nums")}>
                    {label || "—"}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
