"use client"

import { useEffect, useState } from "react"
import { ListIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { cn } from "@/lib/utils"
import type { Heading } from "./article-body"

/** Which heading the reader is in: the last one whose top has passed a line a third of the way down. */
function useActive(ids: string[]) {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (!ids.length) return
    let frame = 0
    const update = () => {
      frame = 0
      const line = window.innerHeight * 0.32
      let current: string | null = null
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) current = id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [ids])
  return active
}

function List({ headings, active }: { headings: Heading[]; active: string | null }) {
  return (
    <ol className="relative flex flex-col border-l border-border">
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            aria-current={active === h.id ? "location" : undefined}
            className={cn(
              "-ml-px block border-l py-1.5 text-sm leading-snug transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              h.level === 3 ? "pl-7 text-[13px]" : "pl-4",
              active === h.id ? "border-ion text-foreground" : "border-transparent text-muted-foreground hover:border-white/30 hover:text-foreground"
            )}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  )
}

/** "On this page": a sticky list beside the story on wide screens, highlighting the section being read. */
export function StoryToc({ headings }: { headings: Heading[] }) {
  const active = useActive(headings.map((h) => h.id))
  if (headings.length < 2) return null
  return (
    <nav aria-label="Sections of this story" className="flex flex-col gap-3">
      <Copy k="news.story.toc" as="p" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        On this page
      </Copy>
      <List headings={headings} active={active} />
    </nav>
  )
}

/** The same list, folded, above the story on phones and tablets. */
export function StoryTocMobile({ headings }: { headings: Heading[] }) {
  if (headings.length < 2) return null
  return (
    <details className="liquid-glass group rounded-2xl px-4 py-3 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ListIcon aria-hidden className="size-4 text-ion" />
        <Copy k="news.story.toc">On this page</Copy>
        <span className="ml-auto text-xs text-muted-foreground">{headings.filter((h) => h.level === 2).length} sections</span>
      </summary>
      <div className="mt-3">
        <List headings={headings} active={null} />
      </div>
    </details>
  )
}

/** A thin bar at the top of the window that fills as the story is read. Static for reduced motion. */
export function ReadingProgress({ target }: { target: string }) {
  const [p, setP] = useState(0)
  useEffect(() => {
    const el = document.getElementById(target)
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const box = el.getBoundingClientRect()
      const total = box.height - window.innerHeight * 0.6
      setP(total > 0 ? Math.min(1, Math.max(0, -box.top / total)) : 0)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [target])
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div className="h-full origin-left bg-gradient-to-r from-ion via-ion to-gold" style={{ transform: `scaleX(${p})` }} />
    </div>
  )
}
