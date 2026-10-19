"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CheckIcon, FolderPlusIcon, LockIcon, PlusIcon } from "lucide-react"
import { CollectionForm } from "@/components/collections/collection-form"
import { describeItem } from "@/components/collections/describe-item"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { addToCollection, COLLECTION_ITEM_TARGET, createCollection, listMyCollections, removeFromCollection, type Collection } from "@/lib/community"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/**
 * "Add to collection": drop it next to a SaveButton for anything with a like/save key ("model:orbit-8b",
 * "thread:<id>", "ghrepo:<encoded id>"…). Opens a dialog to put the item in (or take it
 * out of) your collections, or to start a new one with it. `variant="icon"` is a round icon-only button.
 */
export function AddToCollection({ target, variant = "pill", className, label = "Collect" }: { target: string; variant?: "pill" | "icon"; className?: string; label?: string }) {
  const { ready, user } = useSession()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  if (!COLLECTION_ITEM_TARGET.test(target)) return null

  function onClick(e: React.MouseEvent) {
    // Cards make their whole surface a link; the button must not follow it.
    e.preventDefault()
    e.stopPropagation()
    if (live && !user) {
      router.push(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={live && !ready}
        aria-haspopup="dialog"
        aria-label={variant === "icon" ? "Add to a collection" : undefined}
        title={variant === "icon" ? "Add to a collection" : undefined}
        className={cn(
          "pressable relative z-10 inline-flex items-center justify-center rounded-full border border-border bg-secondary/60 text-sm text-foreground transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
          variant === "icon" ? "size-9" : "h-9 gap-2 px-3.5",
          className
        )}
      >
        <FolderPlusIcon aria-hidden className="size-4" />
        {variant === "pill" && <span>{label}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* React events bubble through portals: keep clicks in the dialog from reaching a card link around the button. */}
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          {open && <Picker target={target} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Picker({ target, onDone }: { target: string; onDone: () => void }) {
  const item = describeItem(target)
  const [list, setList] = useState<Collection[] | null>(null)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    listMyCollections()
      .then((l) => {
        if (stale) return
        setList(l)
        if (!l.length) setCreating(true)
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [])

  async function toggle(c: Collection) {
    if (busy || !list) return
    const inIt = c.items.some((i) => i.target === target)
    const before = list
    const now = new Date().toISOString()
    setBusy(c.id)
    setList(list.map((x) => (x.id === c.id ? { ...x, items: inIt ? x.items.filter((i) => i.target !== target) : [...x.items, { target, note: "", position: x.items.length, addedAt: now }] } : x)))
    try {
      if (inIt) await removeFromCollection(c.id, target)
      else await addToCollection(c.id, target)
      setStatus(inIt ? `Removed from ${c.title}` : `Added to ${c.title}`)
    } catch (e) {
      setList(before)
      setStatus((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add to a collection</DialogTitle>
        <DialogDescription>
          <span className="text-foreground">{item.label}</span> · {item.type}
        </DialogDescription>
      </DialogHeader>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Your collections could not be loaded: {error}
        </p>
      ) : list === null ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading your collections">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : (
        <>
          {list.length > 0 && (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto" aria-label="Your collections">
              {list.map((c) => {
                const inIt = c.items.some((i) => i.target === target)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={inIt}
                      onClick={() => toggle(c)}
                      disabled={busy === c.id}
                      className={cn(
                        "pressable flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        inIt ? "border-ion/50 bg-ion/10" : "border-border hover:bg-white/[0.04]"
                      )}
                    >
                      <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border transition-colors", inIt ? "border-ion bg-ion text-ion-foreground" : "border-input")}>
                        {inIt && <CheckIcon aria-hidden className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular">
                        {!c.isPublic && <LockIcon aria-label="Private" className="size-3" />}
                        {c.items.length}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {creating ? (
            <div className="rounded-xl border border-border p-3">
              <p className="mb-3 text-sm font-medium">{list.length ? "New collection" : "Start your first collection"}</p>
              <CollectionForm
                compact
                submitLabel="Create and add"
                onCancel={list.length ? () => setCreating(false) : undefined}
                onSubmit={async (input) => {
                  const c = await createCollection(input, target)
                  setList([c, ...list])
                  setCreating(false)
                  setStatus(`Created ${c.title} and added this to it`)
                }}
              />
            </div>
          ) : (
            <Button variant="ghost" className="self-start" onClick={() => setCreating(true)}>
              <PlusIcon aria-hidden /> New collection
            </Button>
          )}
        </>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p role="status" className="min-w-0 truncate text-xs text-muted-foreground">
          {status}
        </p>
        <div className="flex shrink-0 gap-2">
          <Link href="/collections?view=mine" onClick={onDone} className="inline-flex h-9 items-center rounded-full px-3 text-sm text-ion hover:underline">
            Your collections
          </Link>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    </>
  )
}
