"use client"

import type { Route } from "next"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { ArrowLeftIcon, ArrowRightIcon, ExternalLinkIcon, LightbulbIcon, OrbitIcon, PlusIcon, RocketIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { canManage, crewTint, type Crew, type CrewRole } from "@/lib/crews"
import { createProject, deleteProject, listProjects, moveProject, PROJECT_STATUS, STATUS_LABEL, validateProject, type CrewProject, type ProjectStatus } from "@/lib/crews-home"
import { cn } from "@/lib/utils"

const ICON = { idea: LightbulbIcon, building: OrbitIcon, shipped: RocketIcon }

/**
 * The crew's project board: ideas, things in orbit (being built) and landed (shipped). Any member drags a card
 * between columns or moves it with the arrows; its author and the officers delete it. Shipping a card is what
 * the crew leaderboard rewards most.
 */
export function CrewBoard({ crew, role, meId }: { crew: Crew; role: CrewRole | null; meId: string | null }) {
  const reduce = useReducedMotion()
  const [cards, setCards] = useState<CrewProject[] | null>(null)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState<ProjectStatus | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<ProjectStatus | null>(null)
  const tint = crewTint(crew)

  useEffect(() => {
    let stale = false
    listProjects(crew).then(
      (l) => !stale && setCards(l),
      (e: Error) => !stale && (setError(e.message), setCards([]))
    )
    return () => {
      stale = true
    }
  }, [crew])

  async function move(card: CrewProject, status: ProjectStatus) {
    if (card.status === status || !role) return
    const before = cards
    setCards((l) => l?.map((x) => (x.id === card.id ? { ...x, status, position: Date.now() / 1000 } : x)) ?? l)
    try {
      const next = await moveProject(card, status)
      setCards((l) => l?.map((x) => (x.id === card.id ? next : x)) ?? l)
    } catch (e) {
      setCards(before)
      setError((e as Error).message)
    }
  }

  async function remove(card: CrewProject) {
    if (!confirm(`Delete “${card.title}”?`)) return
    try {
      await deleteProject(card)
      setCards((l) => l?.filter((x) => x.id !== card.id) ?? l)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-1 grid snap-x snap-mandatory auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-1 pb-1 md:grid-flow-row md:grid-cols-3 md:overflow-visible">
        {PROJECT_STATUS.map((status, col) => {
          const Icon = ICON[status]
          const list = (cards ?? []).filter((c) => c.status === status).sort((a, b) => b.position - a.position)
          return (
            <section
              key={status}
              aria-label={STATUS_LABEL[status]}
              onDragOver={(e) => {
                if (!dragging) return
                e.preventDefault()
                setOver(status)
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                const card = cards?.find((c) => c.id === dragging)
                setDragging(null)
                setOver(null)
                if (card) move(card, status)
              }}
              className={cn("flex min-h-40 snap-start flex-col gap-2 rounded-xl border border-border bg-card p-2.5 transition-colors", over === status && "border-dashed")}
              style={over === status ? { borderColor: tint, background: `color-mix(in oklab, ${tint} 6%, var(--card))` } : undefined}
            >
              <header className="flex items-center gap-2 px-1">
                <Icon aria-hidden className="size-4" style={{ color: status === "shipped" ? "var(--ok)" : status === "building" ? tint : "var(--gold)" }} />
                <h3 className="font-sans text-sm font-medium tracking-normal">{STATUS_LABEL[status]}</h3>
                <span className="text-xs text-muted-foreground tabular">{list.length}</span>
                {role && (
                  <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={`Add a card to ${STATUS_LABEL[status]}`} onClick={() => setAdding(status)}>
                    <PlusIcon aria-hidden />
                  </Button>
                )}
              </header>
              {adding === status && (
                <NewCard
                  onCancel={() => setAdding(null)}
                  onCreate={async (input) => {
                    const card = await createProject(crew, input, status)
                    setCards((l) => [...(l ?? []), card])
                    setAdding(null)
                  }}
                />
              )}
              <ul className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {list.map((card) => (
                    <motion.li
                      key={card.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.96 }}
                      transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                    >
                      <div
                        draggable={Boolean(role)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move"
                          setDragging(card.id)
                        }}
                        onDragEnd={() => {
                          setDragging(null)
                          setOver(null)
                        }}
                        className={cn("group/card rounded-lg border border-border bg-background/60 p-2.5", role && "cursor-grab active:cursor-grabbing", dragging === card.id && "opacity-50")}
                      >
                        <p className="text-sm leading-snug font-medium">{card.title}</p>
                        {card.blurb && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{card.blurb}</p>}
                        <div className="mt-2 flex items-center gap-1">
                          {card.href && (
                            <Link href={card.href as Route} className="inline-flex items-center gap-1 text-xs text-ion hover:underline">
                              <ExternalLinkIcon aria-hidden className="size-3" /> Open
                            </Link>
                          )}
                          {role && (
                            <span className="ml-auto flex items-center gap-0.5">
                              <Button variant="ghost" size="icon-xs" aria-label={`Move ${card.title} back`} disabled={col === 0} onClick={() => move(card, PROJECT_STATUS[col - 1])}>
                                <ArrowLeftIcon aria-hidden />
                              </Button>
                              <Button variant="ghost" size="icon-xs" aria-label={`Move ${card.title} on`} disabled={col === PROJECT_STATUS.length - 1} onClick={() => move(card, PROJECT_STATUS[col + 1])}>
                                <ArrowRightIcon aria-hidden />
                              </Button>
                              {(card.createdBy === meId || canManage(role)) && (
                                <Button variant="ghost" size="icon-xs" aria-label={`Delete ${card.title}`} onClick={() => remove(card)}>
                                  <Trash2Icon aria-hidden />
                                </Button>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {cards !== null && list.length === 0 && adding !== status && <p className="px-1 py-3 text-xs text-muted-foreground">{status === "idea" ? "Drop an idea here." : status === "building" ? "Nothing in orbit yet." : "Nothing has landed yet."}</p>}
            </section>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function NewCard({ onCreate, onCancel }: { onCreate: (input: { title: string; blurb: string; href: string }) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState("")
  const [blurb, setBlurb] = useState("")
  const [href, setHref] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-background/60 p-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const input = { title, blurb, href }
        const problem = validateProject(input)
        if (problem) return setError(problem)
        setBusy(true)
        try {
          await onCreate(input)
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Input autoFocus value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Card title" className="h-8" />
      <Input value={blurb} maxLength={500} onChange={(e) => setBlurb(e.target.value)} placeholder="A line about it (optional)" aria-label="Card note" className="h-8" />
      <Input value={href} maxLength={300} onChange={(e) => setHref(e.target.value)} placeholder="/projects/… or /gh/owner/repo (optional)" aria-label="Link on Nexverse" className="h-8" />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-1">
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={busy}>
          Add card
        </Button>
      </div>
    </form>
  )
}
