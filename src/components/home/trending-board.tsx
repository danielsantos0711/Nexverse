"use client"

import Image from "next/image"
import Link from "next/link"
import type { Route } from "next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { ArrowUpRightIcon, PlusIcon } from "lucide-react"
import { Cover, KIND_ICONS, kindText } from "@/components/hub/bits"
import { Skeleton } from "@/components/ui/skeleton"
import { KINDS, type ResourceKind } from "@/lib/data"
import { live } from "@/lib/supabase"
import { GlowCard } from "@/components/hub/glow-card"
import { cn } from "@/lib/utils"
import { PixelField } from "./fx"
import { loadHubItems, since, useLoad, type HubItem } from "./hub-data"
import { FirstLight } from "./sections"

const EASE = [0.23, 1, 0.32, 1] as const
const SKY = ["/space/ring.webp", "/space/deep-field.webp", "/space/eagle.webp", "/space/horizon.webp"]

/** A row's link: a Nexverse page, or a shared address opening in a new tab (said so for screen readers). */
function ItemLink({ item, className, children }: { item: HubItem; className?: string; children: React.ReactNode }) {
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  }
  return (
    <Link href={item.href as Route} className={className}>
      {children}
    </Link>
  )
}

/**
 * New in the hub: one tab per kind, with what members published and shared, newest first. The newest gets the
 * big drawn cover (pixels bloom from the pointer over it); the rest are dense rows. A kind with nothing yet
 * says so and offers to publish the first one.
 */
export function TrendingBoard() {
  const items = useLoad(() => loadHubItems(40), [])
  const kinds = Object.keys(KINDS) as ResourceKind[]
  const [kind, setKind] = useState<ResourceKind>("model")
  const reduce = useReducedMotion()
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({})
  const list = (items ?? []).filter((i) => i.kind === kind).slice(0, 7)
  const [lead, ...rest] = list
  const counts = Object.fromEntries(kinds.map((k) => [k, (items ?? []).filter((i) => i.kind === k).length])) as Record<ResourceKind, number>

  function onKey(e: React.KeyboardEvent) {
    const i = kinds.indexOf(kind)
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? kinds.length - 1 : null
    if (to === null) return
    e.preventDefault()
    const next = kinds[(to + kinds.length) % kinds.length]
    setKind(next)
    tabs.current[next]?.focus()
  }

  if (items === undefined) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Skeleton className="h-72 rounded-2xl" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!items.length) {
    return (
      <FirstLight
        icon={PlusIcon}
        title="The hub is ready for its first project"
        body={
          live
            ? "Publish a model, dataset, tool or repo with a proper page, or share a link to one. The newest arrivals show here for everyone."
            : "Connect the database and what members publish shows here."
        }
        href="/new/project"
        action="Publish the first project"
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="New in the hub by kind" onKeyDown={onKey} className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full border border-white/[0.06] bg-white/[0.03] p-1">
        {kinds.map((k) => {
          const Icon = KIND_ICONS[k]
          const on = k === kind
          return (
            <button
              key={k}
              ref={(el) => {
                tabs.current[k] = el
              }}
              type="button"
              role="tab"
              id={`trend-tab-${k}`}
              aria-selected={on}
              aria-controls="trend-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setKind(k)}
              className={cn(
                "pressable relative shrink-0 rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {on && <motion.span layoutId="trend-board-pill" className="absolute inset-0 rounded-full bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.45 }} />}
              <span className="relative inline-flex items-center gap-1.5">
                <Icon aria-hidden className="size-3.5" />
                {KINDS[k].plural}
                {counts[k] > 0 && <span className={cn("text-xs tabular", on ? "opacity-60" : "opacity-70")}>{counts[k]}</span>}
              </span>
            </button>
          )
        })}
      </div>

      <div id="trend-panel" role="tabpanel" aria-labelledby={`trend-tab-${kind}`} className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={kind}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(8px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            {!lead ? (
              <FirstLight
                title={`No ${KINDS[kind].plural.toLowerCase()} yet`}
                body={`Be the first to publish a ${KINDS[kind].label.toLowerCase()} on the hub, with a README, a licence and a changelog, or share a link to one.`}
                href="/new/project"
                action={`Publish a ${KINDS[kind].label.toLowerCase()}`}
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
                <GlowCard className="rounded-2xl">
                <ItemLink item={lead} className="press group relative isolate z-[1] flex h-full min-h-[17rem] flex-col justify-end overflow-hidden rounded-2xl border border-white/[0.06] bg-card p-6">
                  <span aria-hidden className="absolute inset-0 -z-20 transition-transform duration-700 ease-out group-hover:scale-[1.04]">
                    <Image src={SKY[lead.id.length % SKY.length]} alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover opacity-50" />
                    <Cover seed={lead.id} kind={lead.kind} className="absolute inset-0 opacity-80 mix-blend-screen" />
                  </span>
                  <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(12_14_20/0.95),rgb(12_14_20/0.55)_45%,transparent)]" />
                  <PixelField className="-z-10" />
                  <span className="flex items-center gap-2 text-sm">
                    <span className={cn("font-medium", kindText(lead.kind))}>Newest {KINDS[lead.kind].label.toLowerCase()}</span>
                    <span className="text-muted-foreground">· {lead.external ? "shared link" : "project page"}</span>
                  </span>
                  <span className="mt-2 flex items-center gap-1.5 font-display text-2xl font-semibold tracking-[-0.03em]">
                    {lead.name}
                    {lead.external && <ArrowUpRightIcon aria-hidden className="size-5 text-muted-foreground" />}
                  </span>
                  {lead.summary && <span className="mt-2 line-clamp-2 max-w-[48ch] text-[15px] text-foreground/85">{lead.summary}</span>}
                  <span className="mt-4 text-sm text-muted-foreground">
                    By {lead.by} · {since(lead.at)}
                  </span>
                </ItemLink>
                </GlowCard>
                {rest.length ? (
                  <ol className="flex flex-col">
                    {rest.map((r) => (
                      <li key={r.id}>
                        <ItemLink item={r} className="press group -mx-2 flex items-center gap-4 rounded-xl px-2 py-2.5 hover:bg-white/[0.035]">
                          <span className="relative size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                            <Cover seed={r.id} kind={r.kind} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex min-w-0 items-center gap-1 text-[15px] leading-tight">
                              <span className="truncate font-medium group-hover:text-ion">{r.name}</span>
                              {r.external && <ArrowUpRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
                            </span>
                            <span className="truncate text-[13px] text-muted-foreground">{r.summary || `By ${r.by}`}</span>
                          </span>
                          <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{since(r.at)}</span>
                        </ItemLink>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="flex flex-col justify-center gap-3 rounded-2xl border border-dashed border-white/[0.08] p-6 text-sm text-muted-foreground">
                    <p>Only one so far. Yours could sit next to it.</p>
                    <Link href="/new/project" className="pressable inline-flex h-9 items-center gap-1.5 self-start rounded-full bg-white/[0.06] px-4 text-foreground hover:bg-white/[0.1]">
                      <PlusIcon aria-hidden className="size-4" /> Publish a project
                    </Link>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
