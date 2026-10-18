"use client"

import { useEffect, useState } from "react"
import { ExternalLinkIcon } from "lucide-react"
import { Chip } from "@/components/hub/bits"
import { ago } from "@/lib/data"
import { listSubmissions, type Submission } from "@/lib/store"

/** Stories members shared through /share, newest first. Renders nothing until there is one. */
export function MemberNews() {
  const [items, setItems] = useState<Submission[]>([])
  const [limit, setLimit] = useState(20)

  useEffect(() => {
    let stale = false
    listSubmissions({ kind: "news", limit: limit + 1 })
      .then((s) => !stale && setItems(s))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [limit])

  if (items.length === 0) return null
  return (
    <section aria-labelledby="member-news-h" className="mb-10 flex flex-col gap-3">
      <h2 id="member-news-h" className="text-lg font-semibold">
        {items.every((s) => s.local) ? "Shared from this browser" : "Just shared by members"}
      </h2>
      <ul className="grid gap-2.5 md:grid-cols-2">
        {items.slice(0, limit).map((s) => (
          <li key={s.id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex h-full flex-col gap-1.5 rounded-xl border border-border bg-card/70 p-4 hover:bg-card">
              <span className="flex items-center gap-2 font-medium">
                {s.title}
                <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
              </span>
              {s.summary && <span className="line-clamp-2 text-sm text-muted-foreground">{s.summary}</span>}
              <span className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span>{s.local ? "You, on this device" : (s.author?.name ?? "A member")}</span>
                <span>{ago(s.createdAt)}</span>
                <span className="truncate">{new URL(s.url).hostname}</span>
                {s.tags.slice(0, 3).map((t) => (
                  <Chip key={t}>#{t}</Chip>
                ))}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {items.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + 20)} className="pressable self-start rounded-full bg-secondary px-4 py-2 text-sm hover:bg-accent">
          Show more
        </button>
      )}
    </section>
  )
}
