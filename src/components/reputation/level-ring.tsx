"use client"

import { motion, useReducedMotion } from "motion/react"
import { useId } from "react"
import { EarthIcon, FlameIcon, GalaxyIcon, OrbitIcon, SparklesIcon, StarIcon, type LucideIcon } from "lucide-react"
import { levelFor, LEVELS } from "@/lib/community"
import { compact } from "@/lib/data"
import { cn } from "@/lib/utils"

export const LEVEL_ICONS: Record<string, LucideIcon> = {
  Stardust: SparklesIcon,
  Comet: FlameIcon,
  Planet: EarthIcon,
  Star: StarIcon,
  Nebula: OrbitIcon,
  Galaxy: GalaxyIcon,
}

/** One colour per level, brighter as it climbs. Pairs are the ring's gradient. */
export const LEVEL_COLORS: Record<string, [string, string]> = {
  Stardust: ["#949cad", "#c9cfdb"],
  Comet: ["#8fb4ff", "#c4d6ff"],
  Planet: ["#7fe0b0", "#9fe3cf"],
  Star: ["#d8c59e", "#f3e3bd"],
  Nebula: ["#d3b4ff", "#ffb4e6"],
  Galaxy: ["#8fb4ff", "#ffd59e"],
}

/**
 * A member's level as a ring that fills toward the next one. The ring draws in once (not with reduced motion);
 * the centre shows the level's mark. With `label`, the level name and points sit beside it.
 */
export function LevelRing({ points, size = 88, stroke = 6, label = true, className }: { points: number; size?: number; stroke?: number; label?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, "")
  const reduce = useReducedMotion()
  const info = levelFor(points)
  const Icon = LEVEL_ICONS[info.level.name] ?? SparklesIcon
  const [from, to] = LEVEL_COLORS[info.level.name] ?? LEVEL_COLORS.Stardust
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const description = info.next
    ? `${info.level.name}, level ${info.index + 1} of ${LEVELS.length}. ${points} points, ${info.toNext} to ${info.next.name}.`
    : `${info.level.name}, the highest level. ${points} points.`

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div role="img" aria-label={description} className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <defs>
            <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={from} />
              <stop offset="100%" stopColor={to} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${uid}-g)`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={reduce ? false : { strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - Math.max(info.progress, 0.02)) }}
            transition={reduce ? { duration: 0 } : { duration: 1.1, ease: [0.23, 1, 0.32, 1], delay: 0.15 }}
          />
        </svg>
        <span
          aria-hidden
          className="absolute inset-0 m-auto grid place-items-center rounded-full"
          style={{ width: size - stroke * 4, height: size - stroke * 4, background: `radial-gradient(circle at 30% 25%, ${from}33, transparent 70%)`, color: to }}
        >
          <Icon style={{ width: size * 0.3, height: size * 0.3 }} />
        </span>
      </div>
      {label && (
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-semibold" style={{ color: to }}>
            {info.level.name}
          </span>
          <span className="text-sm text-muted-foreground tabular">{compact(points)} points</span>
          <span className="text-xs text-muted-foreground">{info.next ? `${compact(info.toNext)} to ${info.next.name}` : "Highest level"}</span>
        </div>
      )}
    </div>
  )
}

/** A small level chip for lists: icon and name. */
export function LevelChip({ points, className }: { points: number; className?: string }) {
  const { level } = levelFor(points)
  const Icon = LEVEL_ICONS[level.name] ?? SparklesIcon
  const [, to] = LEVEL_COLORS[level.name] ?? LEVEL_COLORS.Stardust
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-xs font-medium", className)} style={{ color: to, background: `${to}14` }}>
      <Icon aria-hidden className="size-3" />
      {level.name}
    </span>
  )
}
