"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState, type ComponentType } from "react"
import { LEVEL_COLORS, LEVEL_ICONS } from "@/components/reputation/level-ring"
import { AmberSphere } from "@/components/reputation/fx/amber-sphere"
import { LEVELS } from "@/lib/community"
import { Copy } from "@/components/content/copy"
import { compact } from "@/lib/data"
import { useQuality } from "@/lib/perf"
import { cn } from "@/lib/utils"

/*
 * The six levels, Stardust to Galaxy. On capable screens the HorizonX "Lumen Rise" carousel shows each level as a
 * glass card rising out of a pool of light, engraved with the points it starts at; it loads only when the section
 * nears the screen. Beside it, and in its place at low quality, the plain list with what each level means, with
 * an Amber Sphere in the level's colours for the one that is selected.
 */

type LumenProps = { names: string[]; digits?: string[]; order?: number[]; autoplay?: number; label?: string; className?: string }
const LumenRise = dynamic<LumenProps>(() => import("@/components/reputation/fx/lumen-rise") as Promise<{ default: ComponentType<LumenProps> }>, { ssr: false })

// Lumen Rise palettes by index: 0 Midnight, 1 Amethyst, 2 Verdant, 3 Ember, 4 Glacier, 5 Graphite.
const PALETTE: Record<string, number> = { Stardust: 5, Comet: 0, Planet: 2, Star: 3, Nebula: 1, Galaxy: 4 }

export function LevelsShowcase() {
  const quality = useQuality()
  const host = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [pick, setPick] = useState(0)
  const rich = quality === "high" || quality === "medium"

  useEffect(() => {
    const el = host.current
    if (!el || !rich) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "300px" })
    io.observe(el)
    return () => io.disconnect()
  }, [rich])

  const levels = LEVELS
  const order = levels.map((l, i) => PALETTE[l.name] ?? i % 6)
  const showCards = rich && near && levels.length === 6
  const chosen = levels[pick] ?? levels[0]
  const [amber, gold] = LEVEL_COLORS[chosen.name] ?? LEVEL_COLORS.Stardust

  return (
    <section aria-labelledby="levels-showcase-h" className="liquid-glass-flat relative mt-10 overflow-hidden rounded-3xl p-4 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[70%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(216_197_158/0.18),transparent)]" />
      <div className="relative mb-5 flex flex-col gap-1">
        <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
          <Copy k="leaderboard.levels.eyebrow">From dust to galaxy</Copy>
        </p>
        <h2 id="levels-showcase-h" className="text-2xl font-semibold tracking-[-0.02em]">
          <Copy k="leaderboard.levels.title">Six levels of light</Copy>
        </h2>
      </div>
      <div ref={host} className={cn("relative grid gap-6", showCards && "md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]")}>
        {showCards && (
          <div className="h-[19rem] overflow-hidden rounded-3xl sm:h-[22rem]">
            <LumenRise names={levels.map((l) => l.name)} digits={levels.map((l) => `${compact(l.min)}+ PTS`)} order={order} autoplay={5} label="Levels, as cards" />
          </div>
        )}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <AmberSphere amber={amber} gold={gold} energy={pick / Math.max(1, levels.length - 1)} size={104} />
            <div className="min-w-0">
              <p className="text-lg font-semibold">{chosen.name}</p>
              <p className="text-sm text-muted-foreground">{chosen.blurb}</p>
              <p className="mt-1 text-xs text-muted-foreground tabular">From {compact(chosen.min)} points</p>
            </div>
          </div>
          <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {levels.map((l, i) => {
              const Icon = LEVEL_ICONS[l.name]
              const [from] = LEVEL_COLORS[l.name] ?? LEVEL_COLORS.Stardust
              return (
                <li key={l.name}>
                  <button
                    type="button"
                    aria-pressed={i === pick}
                    onClick={() => setPick(i)}
                    className="liquid-glass-pill flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                  >
                    {Icon && <Icon aria-hidden className="size-4 shrink-0" style={{ color: from }} />}
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="text-[11px] text-muted-foreground tabular">{compact(l.min)}+</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
