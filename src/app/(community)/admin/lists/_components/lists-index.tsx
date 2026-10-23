"use client"

import type { Route } from "next"
import Link from "next/link"
import { ArrowRightIcon, BrainCircuitIcon, FlaskConicalIcon, GitBranchIcon, KeyRoundIcon, LayersIcon, MessageCircleIcon, MessagesSquareIcon, OrbitIcon, RadioTowerIcon, SwordsIcon, type LucideIcon } from "lucide-react"
import { Notice, when } from "@/components/admin/controls"
import { Gate } from "@/components/moderation/gate"
import { Skeleton } from "@/components/ui/skeleton"
import { countOf, GROUPS, LISTS, resolveRows, type ListGroup } from "@/lib/lists/registry"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { AvailabilityNotice } from "./notices"
import { useSavedLists } from "./use-saved"

const GROUP_ICON: Record<ListGroup, LucideIcon> = { github: GitBranchIcon, hub: LayersIcon, arena: SwordsIcon, community: OrbitIcon, lab: FlaskConicalIcon }

/** Curated content that lives in other admin sections, linked here so every list is one click away. */
const ELSEWHERE: { href: string; label: string; blurb: string; icon: LucideIcon }[] = [
  { href: "/admin/forum", label: "Forum categories", blurb: "Groups, categories, their order and who may post.", icon: MessagesSquareIcon },
  { href: "/admin/chat", label: "Chat rooms", blurb: "The rooms, their topics, order and rules.", icon: MessageCircleIcon },
  { href: "/admin/roles", label: "Reputation tiers", blurb: "The points that unlock links, events, missions and duels.", icon: KeyRoundIcon },
  { href: "/admin/newsroom", label: "News sources", blurb: "The official blogs and changelogs the newsroom reads.", icon: RadioTowerIcon },
  { href: "/admin/ai", label: "AI models", blurb: "The free models the site and the Lab can reach.", icon: BrainCircuitIcon },
]

export function ListsIndex() {
  const body = <Index />
  return live ? (
    <Gate role="admin" action="edit the site's lists">
      {body}
    </Gate>
  ) : (
    body
  )
}

function Index() {
  const { ready, saved, availability } = useSavedLists()
  return (
    <section aria-label="Curated lists" className="flex flex-col gap-8">
      <AvailabilityNotice availability={availability} />

      {GROUPS.map((g) => {
        const Icon = GROUP_ICON[g.id]
        const lists = LISTS.filter((l) => l.group === g.id)
        return (
          <section key={g.id} aria-labelledby={`group-${g.id}`} className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg border border-ion/25 bg-ion/10 text-ion">
                <Icon aria-hidden className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col">
                <h3 id={`group-${g.id}`} className="font-medium">
                  {g.label}
                </h3>
                <p className="text-xs text-muted-foreground">{g.blurb}</p>
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {lists.map((l) => {
                const s = saved[l.key]
                const count = resolveRows(l, s?.value).length
                return (
                  <li key={l.slug}>
                    <Link
                      href={`/admin/lists/${l.slug}` as Route}
                      className="liquid-glass press group flex h-full flex-col gap-2 rounded-2xl p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        {l.title}
                        <ArrowRightIcon aria-hidden className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </span>
                      <span className="text-sm text-muted-foreground">{l.blurb}</span>
                      <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">{countOf(l, count)}</span>
                        <span aria-hidden>·</span>
                        {!ready ? (
                          <Skeleton className="h-3 w-16" />
                        ) : s ? (
                          <span className="text-ion">Customised{s.updatedAt ? ` ${when(s.updatedAt)}` : ""}</span>
                        ) : (
                          <span>Defaults</span>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <section aria-labelledby="elsewhere" className="flex flex-col gap-3">
        <div className="flex flex-col">
          <h3 id="elsewhere" className="font-medium">
            Edited in their own sections
          </h3>
          <p className="text-xs text-muted-foreground">These lists have richer settings, so they keep a page of their own.</p>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {ELSEWHERE.map((e) => (
            <li key={e.href}>
              <Link
                href={e.href as Route}
                className={cn(
                  "press group flex h-full items-start gap-3 rounded-xl border border-border bg-card/40 p-3.5 hover:bg-card/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                )}
              >
                <e.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-ion" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{e.label}</span>
                  <span className="text-xs text-muted-foreground">{e.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Notice title="Saving updates the whole site">
          Open pages pick up a saved list within seconds, and pages built on the server refresh on their next visit. Every save and reset is written to the moderation log, and the last 20 versions of each list are kept.
        </Notice>
      </section>
    </section>
  )
}
