"use client"

import Image from "next/image"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"
import { HeartIcon } from "lucide-react"
import { Cover, KIND_ICONS, kindText } from "@/components/hub/bits"
import { compact, KINDS, type ResourceKind } from "@/lib/data"
import { cn } from "@/lib/utils"
import { PixelField } from "./fx"

export type TrendItem = { slug: string; name: string; owner: string; summary: string; kind: ResourceKind; task: string; likes: number; updated: string; href: string; ago: string }

const EASE = [0.23, 1, 0.32, 1] as const
const SKY = ["/space/ring.webp", "/space/deep-field.webp", "/space/eagle.webp", "/space/horizon.webp"]
const BAR: Record<ResourceKind, string> = { model: "bg-model/45", dataset: "bg-dataset/45", tool: "bg-tool/45", repo: "bg-repo/45" }

/**
 * Trending in the hub: one tab per kind. The leader gets the big drawn cover (pixels bloom from the pointer
 * over it); the rest are dense rows with a bar for their likes as a share of the leader's.
 */
export function TrendingBoard({ lists }: { lists: Record<ResourceKind, TrendItem[]> }) {
  const kinds = Object.keys(KINDS) as ResourceKind[]
  const [kind, setKind] = useState<ResourceKind>("model")
  const reduce = useReducedMotion()
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [lead, ...rest] = lists[kind]
  const top = lead?.likes || 1

  function onKey(e: React.KeyboardEvent) {
    const i = kinds.indexOf(kind)
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? kinds.length - 1 : null
    if (to === null) return
    e.preventDefault()
    const next = kinds[(to + kinds.length) % kinds.length]
    setKind(next)
    tabs.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Trending by kind" onKeyDown={onKey} className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full bg-white/[0.04] p-1">
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
              className={cn("pressable relative shrink-0 rounded-full px-4 py-2 text-sm transition-colors", on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {on && <motion.span layoutId="trend-board-pill" className="absolute inset-0 rounded-full bg-primary" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.45 }} />}
              <span className="relative inline-flex items-center gap-1.5">
                <Icon aria-hidden className="size-3.5" />
                {KINDS[k].plural}
              </span>
            </button>
          )
        })}
      </div>

      <div id="trend-panel" role="tabpanel" aria-labelledby={`trend-tab-${kind}`} className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={kind}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(10px)", filter: "blur(4px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: reduce ? "none" : "blur(4px)" }}
            transition={{ duration: 0.32, ease: EASE }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10"
          >
            {lead && (
              <Link href={lead.href} className="press group relative isolate flex min-h-[19rem] flex-col justify-end overflow-hidden rounded-2xl bg-card p-6">
                <span aria-hidden className="absolute inset-0 -z-20 transition-transform duration-700 ease-out group-hover:scale-[1.04]">
                  <Image src={SKY[lead.slug.length % SKY.length]} alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover opacity-55" />
                  <Cover seed={lead.slug + "x"} kind={lead.kind} className="absolute inset-0 opacity-80 mix-blend-screen" />
                </span>
                <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(12_14_20/0.95),rgb(12_14_20/0.55)_45%,transparent)]" />
                <PixelField className="-z-10" />
                <span className="flex items-center gap-2 text-sm">
                  <span className={cn("inline-flex items-center gap-1.5 font-medium", kindText(lead.kind))}>Leading this week</span>
                  <span className="text-muted-foreground">· {lead.task}</span>
                </span>
                <span className="mt-2 flex items-baseline gap-1 text-2xl font-semibold tracking-[-0.03em]">
                  <span className="font-normal text-muted-foreground">{lead.owner}/</span>
                  <span className="font-display">{lead.name}</span>
                </span>
                <span className="mt-2 line-clamp-2 max-w-[48ch] text-[15px] text-foreground/85">{lead.summary}</span>
                <span className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 tabular">
                    <HeartIcon aria-hidden className="size-4" /> {compact(lead.likes)} <span className="sr-only">likes</span>
                  </span>
                  <span>Updated {lead.ago}</span>
                </span>
              </Link>
            )}
            <ol className="flex flex-col">
              {rest.map((r, i) => (
                <motion.li
                  key={r.slug}
                  initial={reduce ? false : { opacity: 0, transform: "translateX(-8px)" }}
                  animate={{ opacity: 1, transform: "translateX(0px)" }}
                  transition={{ duration: 0.35, delay: 0.04 * i, ease: EASE }}
                >
                  <Link href={r.href} className="press group -mx-2 flex items-center gap-4 rounded-xl px-2 py-2.5 hover:bg-white/[0.035]">
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                      <Cover seed={r.slug} kind={r.kind} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-baseline gap-1 text-[15px] leading-tight">
                        <span className="truncate text-muted-foreground">{r.owner}/</span>
                        <span className="truncate font-medium">{r.name}</span>
                      </span>
                      <span className="truncate text-[13px] text-muted-foreground">{r.summary}</span>
                      <span aria-hidden className="mt-1 h-px w-full overflow-hidden rounded-full bg-white/[0.05]">
                        <span className={cn("momentum block h-full rounded-full", BAR[r.kind])} style={{ "--m": Math.max(0.04, r.likes / top) } as React.CSSProperties} />
                      </span>
                    </span>
                    <span className="inline-flex w-14 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground tabular">
                      <HeartIcon aria-hidden className="size-3" />
                      {compact(r.likes)}
                      <span className="sr-only"> likes</span>
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ol>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
