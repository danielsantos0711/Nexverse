import { useEffect, useState } from "react"
import type { ResourceKind } from "@/lib/data"
import { describeNow, resolveTargets, type ItemGroup, type Resolved } from "@/lib/hub"

export type ItemInfo = {
  /** What kind of thing it is, for the small label above the name. */
  type: string
  label: string
  summary?: string
  href: string | null
  group: ItemGroup
  /** For hub projects and links, so cards can show the kind's icon and colour. */
  kind?: ResourceKind
  /** Who made or shared it, when known. */
  by?: string
  /** False when the item is gone (deleted, private, or old sample content). */
  found: boolean
}

const PENDING = (target: string): ItemInfo => ({ ...describeNow(target), label: "Loading…", type: "", found: true })

/**
 * What can be said about a collection item at once: live items, Lab tools and forum categories resolve without a
 * request; members' projects, links, threads and collections come from useItemInfo().
 */
export function describeItem(target: string): ItemInfo {
  return describeNow(target)
}

/**
 * Labels, summaries and links for a list of item keys, loaded in one round of queries and kept while the list
 * changes. Until a key resolves it reads "Loading…".
 */
export function useItemInfo(targets: string[]) {
  const key = [...new Set(targets)].sort().join("|")
  const [info, setInfo] = useState<{ key: string; map: Record<string, Resolved> } | null>(null)

  useEffect(() => {
    if (!key) return
    let stale = false
    resolveTargets(key.split("|"))
      .then((map) => !stale && setInfo({ key, map }))
      .catch(() => {
        if (stale) return
        const map: Record<string, Resolved> = {}
        for (const t of key.split("|")) map[t] = describeNow(t)
        setInfo({ key, map })
      })
    return () => {
      stale = true
    }
  }, [key])

  const ready = !key || info?.key === key
  // Keys resolved for an earlier version of the list stay usable while the new one loads.
  const get = (target: string): ItemInfo => info?.map[target] ?? (ready ? describeNow(target) : PENDING(target))
  return { get, ready }
}
