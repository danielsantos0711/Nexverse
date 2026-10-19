"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { isUuid } from "@/lib/community"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { getVideo, settingRows, type VideoPost } from "@/lib/video"
import { LitePlayer } from "./lite-player"
import { CopyText } from "./video-bits"

/** Two shared videos side by side: players, models, prompts and settings, with the differences marked. */
export function CompareView() {
  const { ready } = useSession()
  const [pair, setPair] = useState<(VideoPost | null)[] | null>(null)

  useEffect(() => {
    if (live && !ready) return
    const q = new URLSearchParams(window.location.search)
    const ids = [q.get("a") ?? "", q.get("b") ?? ""]
    if (!ids.every(isUuid)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the address once mounted
      setPair([null, null])
      return
    }
    let stale = false
    Promise.all(ids.map((id) => getVideo(id).catch(() => null))).then((p) => !stale && setPair(p))
    return () => {
      stale = true
    }
  }, [ready])

  if (!pair) {
    return (
      <div aria-busy="true" aria-label="Loading" className="grid gap-6 md:grid-cols-2">
        <Skeleton className="aspect-video rounded-2xl" />
        <Skeleton className="aspect-video rounded-2xl" />
      </div>
    )
  }
  const [a, b] = pair
  if (!a || !b) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Pick two videos in the{" "}
        <Link href="/video" className="text-ion hover:underline">
          gallery
        </Link>{" "}
        with their “Compare” buttons to see them side by side.
      </p>
    )
  }

  const rowsA = new Map(settingRows(a.settings).map((r) => [r.label, r.value]))
  const rowsB = new Map(settingRows(b.settings).map((r) => [r.label, r.value]))
  const labels = ["Model", "Tool", ...new Set([...rowsA.keys(), ...rowsB.keys()])]
  const value = (p: VideoPost, rows: Map<string, string>, l: string) => (l === "Model" ? p.model : l === "Tool" ? p.tool : rows.get(l)) || "—"

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {[
        [a, rowsA],
        [b, rowsB],
      ].map(([p, rows], i) => {
        const post = p as VideoPost
        const other = i === 0 ? b : a
        const otherRows = i === 0 ? rowsB : rowsA
        return (
          <section key={post.id} aria-label={post.title} className="flex min-w-0 flex-col gap-4">
            <h2 className="truncate text-lg font-semibold">
              <Link href={`/video/${post.id}`} className="hover:underline">
                {post.title}
              </Link>
            </h2>
            <LitePlayer source={post.source} poster={post.posterUrl} title={post.title} />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              {labels.map((l) => {
                const v = value(post, rows as Map<string, string>, l)
                const differs = v !== value(other, otherRows, l)
                return (
                  <div key={l} className="contents">
                    <dt className="text-muted-foreground">{l}</dt>
                    <dd className={cn("truncate", differs && "text-gold")}>
                      {v}
                      {differs && <span className="sr-only"> (differs)</span>}
                    </dd>
                  </div>
                )
              })}
            </dl>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Prompt</h3>
                {post.prompt && <CopyText text={post.prompt} />}
              </div>
              <p className="rounded-2xl border border-border bg-card/60 p-4 font-mono text-[13px] leading-relaxed whitespace-pre-line">{post.prompt || "No prompt shared."}</p>
            </div>
          </section>
        )
      })}
      <p className="text-xs text-muted-foreground md:col-span-2">Settings that differ are shown in gold.</p>
    </div>
  )
}
