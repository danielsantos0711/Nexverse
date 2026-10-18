"use client"

import Link from "next/link"
import { AnimatePresence, motion, Reorder, useDragControls, useReducedMotion } from "motion/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, GlobeIcon, GripVerticalIcon, LayersIcon, LockIcon, PencilIcon, PlusIcon, StickyNoteIcon, Trash2Icon, XIcon } from "lucide-react"
import { CollectionForm } from "@/components/collections/collection-form"
import { describeItem } from "@/components/collections/describe-item"
import { Breadcrumbs, PosterAvatar } from "@/components/forum/forum-ui"
import { KIND_ICONS, kindText } from "@/components/hub/bits"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Textarea } from "@/components/ui/textarea"
import { compact, formatDate } from "@/lib/data"
import {
  deleteCollection,
  getCollection,
  getCollectionFollow,
  removeFromCollection,
  reorderCollection,
  setCollectionFollow,
  setItemNote,
  updateCollection,
  type Collection,
  type CollectionItem,
} from "@/lib/community"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

/** One collection. Its owner can rename it, reorder items by dragging (or with the arrow buttons), add notes and remove items. */
export function CollectionDetail({ id, initial }: { id: string; initial?: Collection }) {
  const [c, setC] = useState<Collection | null | undefined>(initial)
  const [error, setError] = useState("")
  const { ready, user } = useSession()

  useEffect(() => {
    if (initial || (live && !ready)) return
    let stale = false
    getCollection(id)
      .then((x) => {
        if (stale) return
        setC(x)
        if (x) document.title = `${x.title} · Nexverse`
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [id, initial, ready, user?.id])

  if (error) return <Missing title="This collection could not be loaded" detail={error} />
  if (c === undefined) return <PageSkeleton />
  if (c === null) return <Missing title="This collection is not here" detail="It may be private, or its owner deleted it." />
  return <CollectionPage key={c.id} initial={c} />
}

function CollectionPage({ initial }: { initial: Collection }) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const { user } = useSession()
  const [c, setC] = useState(initial)
  const [items, setItems] = useState<CollectionItem[]>(initial.items)
  const saved = useRef(initial.items.map((i) => i.target))
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const isOwner = !c.sample && (c.local || Boolean(user && c.owner.memberId === user.id))

  async function persistOrder(next: CollectionItem[]) {
    const targets = next.map((i) => i.target)
    if (targets.join("|") === saved.current.join("|")) return
    try {
      await reorderCollection(c.id, targets)
      saved.current = targets
      setError("")
    } catch (e) {
      setError(`The new order could not be saved: ${(e as Error).message}`)
      const order = saved.current
      setItems((list) => [...list].sort((a, b) => order.indexOf(a.target) - order.indexOf(b.target)))
    }
  }

  function move(index: number, delta: -1 | 1) {
    const to = index + delta
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [it] = next.splice(index, 1)
    next.splice(to, 0, it)
    setItems(next)
    setStatus(`${describeItem(it.target).label} moved to position ${to + 1} of ${next.length}`)
    void persistOrder(next)
    // Keep focus on the same control after the row moves.
    requestAnimationFrame(() => document.getElementById(`move-${delta < 0 ? "up" : "down"}-${it.target}`)?.focus())
  }

  async function remove(target: string) {
    const before = items
    const next = items.filter((i) => i.target !== target)
    setItems(next)
    saved.current = saved.current.filter((t) => t !== target)
    try {
      await removeFromCollection(c.id, target)
      setStatus(`Removed ${describeItem(target).label}`)
    } catch (e) {
      setItems(before)
      saved.current = before.map((i) => i.target)
      setError((e as Error).message)
    }
  }

  async function saveNote(target: string, note: string) {
    await setItemNote(c.id, target, note)
    setItems((list) => list.map((i) => (i.target === target ? { ...i, note } : i)))
    setStatus("Note saved")
  }

  async function remove_() {
    setConfirmDelete(false)
    try {
      await deleteCollection(c.id)
      router.push("/collections?view=mine")
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="shell max-w-4xl pt-6 pb-16 lg:pt-8">
      <Breadcrumbs items={[{ label: "Collections", href: "/collections" }, { label: c.title }]} />

      <header className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
            {c.isPublic ? <GlobeIcon aria-hidden className="size-3" /> : <LockIcon aria-hidden className="size-3" />}
            {c.isPublic ? "Public" : "Private"}
          </span>
          <span className="tabular">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
          <span>· Updated {formatDate(c.updatedAt)}</span>
          {c.local && <span>· Saved in this browser</span>}
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{c.title}</h1>
        {c.description && <p className="max-w-[68ch] text-[15px] text-muted-foreground">{c.description}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {c.owner.handle ? (
            <Link href={`/people/${c.owner.handle}`} className="flex items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <PosterAvatar poster={c.owner} size={24} /> Curated by <span className="font-medium text-foreground">{c.owner.name}</span>
            </Link>
          ) : (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <PosterAvatar poster={c.owner} size={24} /> Curated by <span className="font-medium text-foreground">{c.owner.name}</span>
            </span>
          )}
          <span className="flex flex-wrap gap-2 sm:ml-auto">
            {!isOwner && c.isPublic && <FollowCollection c={c} />}
            {isOwner && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <PencilIcon aria-hidden /> Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2Icon aria-hidden /> Delete
                </Button>
              </>
            )}
          </span>
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>

      <section aria-label="Items" className="mt-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ion/10 text-ion">
              <LayersIcon aria-hidden className="size-5" />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">
              {isOwner ? "Nothing here yet. Use “Collect” on any model, dataset, tool, paper or thread to add it." : "This collection is empty for now."}
            </p>
            {isOwner && (
              <div className="flex flex-wrap justify-center gap-2 text-sm">
                {[
                  ["/models", "Models"],
                  ["/datasets", "Datasets"],
                  ["/papers", "Papers"],
                  ["/forum", "Forum"],
                ].map(([href, label]) => (
                  <Link key={href} href={href} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 hover:bg-white/[0.04]">
                    <PlusIcon aria-hidden className="size-3.5" /> {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : isOwner ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Drag the handle to reorder, or use the arrow buttons.</p>
            <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col gap-2">
              {items.map((it, i) => (
                <OwnerRow
                  key={it.target}
                  item={it}
                  index={i}
                  total={items.length}
                  reduce={Boolean(reduce)}
                  onDragEnd={() => void persistOrder(items)}
                  onMove={move}
                  onRemove={remove}
                  onSaveNote={saveNote}
                />
              ))}
            </Reorder.Group>
          </>
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((it, i) => (
              <li key={it.target}>
                <ItemCard item={it} index={i} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit collection</DialogTitle>
            <DialogDescription>Change its title, description or who can see it.</DialogDescription>
          </DialogHeader>
          <CollectionForm
            initial={{ title: c.title, description: c.description, isPublic: c.isPublic }}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              await updateCollection(c.id, input)
              setC({ ...c, ...input, updatedAt: new Date().toISOString() })
              setEditing(false)
              setStatus("Collection saved")
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this collection?</DialogTitle>
            <DialogDescription>The collection and its notes are removed for everyone who follows it. The items themselves stay where they are.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove_}>
              Delete collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ItemCard({ item, index, children, handle }: { item: CollectionItem; index: number; children?: React.ReactNode; handle?: React.ReactNode }) {
  const info = describeItem(item.target)
  const Icon = info.kind ? KIND_ICONS[info.kind] : LayersIcon
  return (
    <article className="group relative flex gap-3 rounded-xl border border-border bg-card/40 p-3.5 transition-colors hover:bg-white/[0.03] sm:p-4">
      {handle}
      <span aria-hidden className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-muted-foreground tabular">
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", info.kind ? kindText(info.kind) : "text-muted-foreground")}>
          <Icon aria-hidden className="size-3.5" />
          {info.type}
        </span>
        {info.href ? (
          <Link href={info.href} className="w-fit rounded-sm text-[15px] leading-snug font-medium hover:text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {info.label}
          </Link>
        ) : (
          <span className="text-[15px] leading-snug font-medium">{info.label}</span>
        )}
        {info.summary && <p className="line-clamp-2 text-sm text-muted-foreground">{info.summary}</p>}
        {item.note && !children && (
          <p className="mt-1 flex gap-2 rounded-lg border-l-2 border-gold/50 bg-gold/[0.04] px-3 py-1.5 text-sm">
            <span className="sr-only">Curator’s note: </span>
            {item.note}
          </p>
        )}
        {children}
      </div>
    </article>
  )
}

function OwnerRow({
  item,
  index,
  total,
  reduce,
  onDragEnd,
  onMove,
  onRemove,
  onSaveNote,
}: {
  item: CollectionItem
  index: number
  total: number
  reduce: boolean
  onDragEnd: () => void
  onMove: (index: number, delta: -1 | 1) => void
  onRemove: (target: string) => void
  onSaveNote: (target: string, note: string) => Promise<void>
}) {
  const controls = useDragControls()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(item.note)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const label = describeItem(item.target).label
  const iconBtn =
    "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-30"

  async function save() {
    setBusy(true)
    setError("")
    try {
      await onSaveNote(item.target, note.trim())
      setNoteOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      layout="position"
      transition={reduce ? { duration: 0 } : { duration: 0.25, ease: EASE }}
      whileDrag={reduce ? undefined : { scale: 1.015, boxShadow: "0 18px 40px -16px rgb(0 0 0 / 0.6)" }}
      className="relative list-none rounded-xl"
    >
      <ItemCard
        item={item}
        index={index}
        handle={
          <button
            type="button"
            aria-label={`Drag to reorder ${label}`}
            title="Drag to reorder"
            onPointerDown={(e) => controls.start(e)}
            className="-ml-1 grid w-6 shrink-0 cursor-grab touch-none place-items-center self-stretch rounded-md text-muted-foreground hover:bg-white/[0.04] hover:text-foreground active:cursor-grabbing"
            tabIndex={-1}
          >
            <GripVerticalIcon aria-hidden className="size-4" />
          </button>
        }
      >
        <AnimatePresence initial={false} mode="wait">
          {noteOpen ? (
            <motion.div
              key="edit"
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="mt-1 flex flex-col gap-2 overflow-hidden"
            >
              <label htmlFor={`note-${item.target}`} className="sr-only">
                Note for {label}
              </label>
              <Textarea id={`note-${item.target}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Why is this here? What should people look at?" className="bg-background/60" autoFocus />
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={busy}>
                  <CheckIcon aria-hidden /> {busy ? "Saving…" : "Save note"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => (setNote(item.note), setNoteOpen(false))}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="view" initial={false} className="flex flex-col gap-2">
              {item.note && (
                <p className="mt-1 rounded-lg border-l-2 border-gold/50 bg-gold/[0.04] px-3 py-1.5 text-sm">
                  <span className="sr-only">Your note: </span>
                  {item.note}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1">
                <Button size="xs" variant="ghost" onClick={() => setNoteOpen(true)}>
                  <StickyNoteIcon aria-hidden /> {item.note ? "Edit note" : "Add a note"}
                </Button>
                <span className="ml-auto flex items-center gap-0.5">
                  <button type="button" id={`move-up-${item.target}`} onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${label} up`} className={iconBtn}>
                    <ArrowUpIcon aria-hidden className="size-4" />
                  </button>
                  <button type="button" id={`move-down-${item.target}`} onClick={() => onMove(index, 1)} disabled={index === total - 1} aria-label={`Move ${label} down`} className={iconBtn}>
                    <ArrowDownIcon aria-hidden className="size-4" />
                  </button>
                  <button type="button" onClick={() => onRemove(item.target)} aria-label={`Remove ${label} from this collection`} className={iconBtn}>
                    <XIcon aria-hidden className="size-4" />
                  </button>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </ItemCard>
    </Reorder.Item>
  )
}

function FollowCollection({ c }: { c: Collection }) {
  const { ready, user } = useSession()
  const router = useRouter()
  const reduce = useReducedMotion()
  const [state, setState] = useState({ followers: 0, mine: false, loaded: false })
  const [error, setError] = useState("")

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getCollectionFollow(c.id)
      .then((s) => !stale && setState({ ...s, loaded: true }))
      .catch(() => !stale && setState((s) => ({ ...s, loaded: true })))
    return () => {
      stale = true
    }
  }, [c.id, ready, user?.id])

  async function toggle() {
    if (live && !user) {
      router.push(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    const on = !state.mine
    setError("")
    setState((s) => ({ ...s, followers: s.followers + (on ? 1 : -1), mine: on }))
    try {
      await setCollectionFollow(c.id, on)
    } catch (e) {
      setState((s) => ({ ...s, followers: s.followers + (on ? -1 : 1), mine: !on }))
      setError((e as Error).message)
    }
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={state.mine}
        disabled={!state.loaded}
        className={cn(
          "pressable inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
          state.mine ? "border-ion/40 bg-ion/10 text-ion" : "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={state.mine ? "on" : "off"}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="inline-flex"
          >
            {state.mine ? <CheckIcon aria-hidden className="size-4" /> : <PlusIcon aria-hidden className="size-4" />}
          </motion.span>
        </AnimatePresence>
        {state.mine ? "Following" : "Follow"}
        <span className="tabular opacity-70">
          {compact(c.baseFollowers + state.followers)}
          <span className="sr-only"> followers</span>
        </span>
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}

function Missing({ title, detail }: { title: string; detail: string }) {
  return (
    <Empty className="mx-auto max-w-xl py-24">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/collections" className="text-ion hover:underline">
          Back to collections
        </Link>
      </EmptyContent>
    </Empty>
  )
}
