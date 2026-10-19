"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowRightIcon, BarChart3Icon, Trash2Icon } from "lucide-react"
import { DuelCard } from "@/components/arena/duel-card"
import { primaryButton } from "@/components/forum/forum-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { deleteDuel, getDuel, isMine, type Duel } from "@/lib/arena"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

/** One duel on its own page. Sample duels arrive from the server; members' duels load here. */
export function DuelDetail({ id, initial }: { id: string; initial?: Duel }) {
  const router = useRouter()
  const { ready, user, member } = useSession()
  const [duel, setDuel] = useState<Duel | null | undefined>(initial)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (initial || (live && !ready)) return
    let stale = false
    getDuel(id)
      .then((d) => !stale && setDuel(d))
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [id, initial, ready, user?.id])

  async function remove() {
    if (!duel || !confirm("Delete this duel and all its votes? This cannot be undone.")) return
    setDeleting(true)
    try {
      await deleteDuel(duel)
      router.push("/arena")
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  if (error && !duel) {
    return (
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        This duel could not be loaded ({error}).
      </p>
    )
  }
  if (duel === undefined) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading duel">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    )
  }
  if (duel === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
        <p className="text-sm text-muted-foreground">This duel does not exist, or its author deleted it.</p>
        <Link href="/arena" className={primaryButton}>
          Back to the arena
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <DuelCard duel={duel} hotkeys />
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/arena" className={primaryButton}>
          Play more duels <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
        <Link
          href="/arena/ratings"
          className="pressable inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <BarChart3Icon aria-hidden className="size-4" /> Ratings
        </Link>
        {isMine(duel, member?.id) && (
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="pressable ml-auto inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
          >
            <Trash2Icon aria-hidden className="size-4" /> {deleting ? "Deleting…" : "Delete duel"}
          </button>
        )}
      </div>
    </div>
  )
}
