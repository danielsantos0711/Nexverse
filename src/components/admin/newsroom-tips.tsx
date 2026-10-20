"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CheckIcon, ExternalLinkIcon, InboxIcon, SparklesIcon, Undo2Icon, XIcon } from "lucide-react"
import { Notice, StatusLine, when } from "@/components/admin/controls"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAiStatus } from "@/lib/ai-client"
import { draftFromLink, listTips, setTipStatus, type Tip, type TipStatus } from "@/lib/newsroom"
import { useSession } from "@/lib/store"
import { cn } from "@/lib/utils"

const FILTERS: { id: TipStatus; label: string }[] = [
  { id: "new", label: "New" },
  { id: "used", label: "Used" },
  { id: "dismissed", label: "Dismissed" },
]

/** Members' tips: read them, draft a story from a tip's link with the free AI, mark used, or dismiss. */
export function NewsroomTips() {
  const { user } = useSession()
  const ai = useAiStatus()
  const router = useRouter()
  const [filter, setFilter] = useState<TipStatus>("new")
  const [data, setData] = useState<{ filter: TipStatus; tips: Tip[]; error: string | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let on = true
    void listTips(filter).then((r) => on && setData({ filter, ...r }))
    return () => {
      on = false
    }
  }, [filter])

  async function mark(t: Tip, to: TipStatus) {
    if (!user) return
    setBusy(t.id)
    setStatus(null)
    try {
      await setTipStatus(t.id, to, user.id)
      setData((d) => (d ? { ...d, tips: d.tips.filter((x) => x.id !== t.id) } : d))
      setStatus({ ok: true, text: to === "dismissed" ? "Dismissed." : to === "used" ? "Marked as used." : "Back in the inbox." })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function draft(t: Tip) {
    if (!t.url) return
    setBusy(t.id)
    setStatus({ ok: true, text: "Reading the page and the official pages it links to, then researching and writing… this can take two or three minutes." })
    try {
      const { story } = await draftFromLink(t.url, t.note, { tipId: t.id })
      router.push(`/admin/newsroom?tab=write&story=${story.id}` as Route)
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
      setBusy(null)
    }
  }

  const loading = !data || data.filter !== filter

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Tip status" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "pressable inline-flex h-8 items-center rounded-full px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-white/[0.04] text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <StatusLine status={status} />
      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading tips">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : data.error ? (
        <Notice tone="warn" title="The tips could not load">
          {data.error}
        </Notice>
      ) : !data.tips.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
          <InboxIcon aria-hidden className="size-5" />
          {filter === "new" ? "No new tips. Members send them from the bottom of /news." : "Nothing here."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.tips.map((t) => (
            <li key={t.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground">
                From {t.member?.name ?? "a member"} · {when(t.createdAt)}
              </p>
              <p className="text-sm whitespace-pre-line">{t.note}</p>
              {t.url && (
                <a href={t.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 self-start text-sm text-ion hover:underline">
                  <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate">{t.url}</span>
                </a>
              )}
              <div className="flex flex-wrap gap-2">
                {filter === "new" && t.url && ai.enabled && (
                  <Button size="sm" disabled={busy === t.id} onClick={() => draft(t)}>
                    <SparklesIcon aria-hidden /> Draft a story from it
                  </Button>
                )}
                {filter === "new" && (
                  <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => mark(t, "used")}>
                    <CheckIcon aria-hidden /> Mark used
                  </Button>
                )}
                {filter === "new" ? (
                  <Button size="sm" variant="ghost" disabled={busy === t.id} onClick={() => mark(t, "dismissed")}>
                    <XIcon aria-hidden /> Dismiss
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => mark(t, "new")}>
                    <Undo2Icon aria-hidden /> Back to the inbox
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
