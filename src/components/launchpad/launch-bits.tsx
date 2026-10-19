"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { CheckIcon, RocketIcon } from "lucide-react"
import { launchPhase, type Launch, type LaunchPhase } from "@/lib/launchpad"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

// ─── Phase ──────────────────────────────────────────────────────────────────────────────────────────────────

const PHASE: Record<LaunchPhase, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "border-ion/30 bg-ion/10 text-ion" },
  live: { label: "Live now", cls: "border-ok/30 bg-ok/15 text-ok" },
  landed: {
    label: "Landed",
    cls: "border-border bg-white/[0.04] text-muted-foreground",
  },
}

export function PhaseBadge({ phase, className }: { phase: LaunchPhase; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", PHASE[phase].cls, className)}>
      {phase === "live" && (
        <span aria-hidden className="relative flex size-1.5">
          <span className="absolute inline-flex size-full rounded-full bg-ok/70 motion-safe:animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
        </span>
      )}
      {PHASE[phase].label}
    </span>
  )
}

// ─── Clock ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The time, ticking every second while mounted; null on the server and during hydration. */
export function useSecond(active = true): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [active])
  return now
}

const split = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  }
}

/** "2 d 4 h", "4 h 12 min", "12 min", for compact places. */
export function shortCountdown(ms: number) {
  const { d, h, m } = split(ms)
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return m > 0 ? `${m} min` : "under a minute"
}

/**
 * Days, hours, minutes and seconds until `to`, as four tiles. Seconds roll with reduced motion off; screen
 * readers get a sentence that changes once a minute rather than every second.
 */
export function Countdown({ to, className, size = "lg" }: { to: string; className?: string; size?: "sm" | "lg" }) {
  const now = useSecond()
  const reduce = useReducedMotion()
  const target = Date.parse(to)
  if (now === null) return <div className={cn("h-16", className)} aria-hidden />
  const parts = split(target - now)
  const tiles: [string, number][] = [
    ["days", parts.d],
    ["hours", parts.h],
    ["min", parts.m],
    ["sec", parts.s],
  ]
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div aria-hidden className="flex gap-2">
        {tiles.map(([label, value]) => (
          <div
            key={label}
            className={cn(
              "flex flex-col items-center rounded-xl border border-ion/20 bg-[linear-gradient(180deg,rgb(143_180_255/0.10),rgb(143_180_255/0.02))]",
              size === "lg" ? "min-w-16 px-3 py-2" : "min-w-11 px-2 py-1",
            )}
          >
            <span className={cn("relative overflow-hidden font-semibold tabular", size === "lg" ? "h-8 text-2xl leading-8" : "h-5 text-base leading-5")}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={value}
                  className="block"
                  initial={reduce ? false : { y: "-100%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  {String(value).padStart(2, "0")}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className={cn("text-muted-foreground uppercase", size === "lg" ? "text-[10px] tracking-[0.14em]" : "text-[9px] tracking-wider")}>{label}</span>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="off">
        Launches in {parts.d} days, {parts.h} hours and {parts.m} minutes.
      </p>
    </div>
  )
}

// ─── Cover ──────────────────────────────────────────────────────────────────────────────────────────────────

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * The first gallery picture, or (no pictures) a small night sky drawn from the launch id: a few stars and an
 * arc for the flight path, so every launch has its own cover without any images.
 */
export function LaunchCover({ launch, className, rounded = "rounded-xl" }: { launch: Pick<Launch, "id" | "name" | "gallery">; className?: string; rounded?: string }) {
  const src = launch.gallery[0]
  if (src) {
    return (
      <span className={cn("relative block overflow-hidden bg-secondary", rounded, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- member uploads from Supabase Storage; the host depends on the deployment */}
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      </span>
    )
  }
  const h = hash(launch.id)
  const hue = h % 360
  const stars = Array.from({ length: 14 }, (_, i) => {
    const v = hash(`${launch.id}-${i}`)
    return {
      x: v % 100,
      y: (v >>> 8) % 100,
      r: ((v >>> 16) % 3) * 0.35 + 0.4,
      o: ((v >>> 20) % 50) / 100 + 0.35,
    }
  })
  const bend = 20 + (h % 30)
  return (
    <span
      aria-hidden
      className={cn("relative block overflow-hidden", rounded, className)}
      style={{
        background: `radial-gradient(120% 90% at 85% 110%, hsl(${hue} 70% 40% / 0.55), transparent 60%), radial-gradient(90% 80% at 0% 0%, hsl(${(hue + 60) % 360} 60% 35% / 0.35), transparent 60%), #0a0d16`,
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.o} vectorEffect="non-scaling-stroke" />
        ))}
        <path
          d={`M 8 96 Q ${bend} ${30 - (h % 10)} 92 6`}
          fill="none"
          stroke={`hsl(${hue} 90% 75%)`}
          strokeOpacity={0.55}
          strokeWidth={0.8}
          strokeDasharray="2 2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <RocketIcon className="absolute top-[18%] right-[18%] size-[22%] max-h-8 min-h-3 max-w-8 min-w-3 rotate-0 text-white/85" />
    </span>
  )
}

// ─── Boost ──────────────────────────────────────────────────────────────────────────────────────────────────

export type BoostState = "open" | "boosted" | "own" | "scheduled" | "landed" | "example"

/**
 * The boost button. Pressing it launches the rocket off the button (a short flight with exhaust sparks), the
 * count rolls up, and the button settles as "Boosted". Boosts from other members arriving live float a "+1".
 */
export function BoostButton({
  launch,
  state,
  count,
  incoming,
  onBoost,
  size = "lg",
  className,
}: {
  launch: Pick<Launch, "id" | "name">
  state: BoostState
  count: number
  /** Increments each time someone else's boost arrives, to float a "+1". */
  incoming?: number
  onBoost: () => void
  size?: "sm" | "lg"
  className?: string
}) {
  const reduce = useReducedMotion()
  const [flights, setFlights] = useState<number[]>([])
  const [floats, setFloats] = useState<number[]>([])
  const lastIncoming = useRef(incoming ?? 0)

  useEffect(() => {
    if (incoming === undefined || incoming === lastIncoming.current) return
    lastIncoming.current = incoming
    if (reduce) return
    const id = Date.now() + Math.random()
    // A "+1" floats off when someone else boosts; it removes itself when its animation ends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFloats((f) => [...f.slice(-4), id])
  }, [incoming, reduce])

  const disabled = state !== "open"
  const lg = size === "lg"

  function press() {
    if (disabled) return
    if (!reduce) setFlights((f) => [...f, Date.now()])
    onBoost()
  }

  const label =
    state === "boosted" ? "Boosted" : state === "own" ? "Your launch" : state === "scheduled" ? "Opens at launch" : state === "landed" ? "Launch day over" : state === "example" ? "Example" : "Boost"

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={press}
        disabled={disabled}
        aria-pressed={state === "boosted"}
        aria-label={`${label}: ${launch.name}, ${count} ${count === 1 ? "boost" : "boosts"}`}
        className={cn(
          "pressable group relative isolate inline-flex items-center overflow-visible rounded-full border font-medium transition-[background-color,border-color,filter] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
          lg ? "h-12 gap-2.5 pr-5 pl-4 text-base" : "h-9 gap-1.5 pr-3 pl-2.5 text-sm",
          state === "open" && "border-transparent bg-[linear-gradient(135deg,#8fb4ff,#b9a3ff)] text-[#0b1020] hover:brightness-110",
          state === "boosted" && "border-ok/40 bg-ok/15 text-ok",
          disabled && state !== "boosted" && "cursor-not-allowed border-border bg-white/[0.04] text-muted-foreground",
        )}
      >
        <span className={cn("relative grid place-items-center", lg ? "size-6" : "size-4")}>
          {state === "boosted" ? (
            <CheckIcon aria-hidden className="size-full" />
          ) : (
            <RocketIcon aria-hidden className={cn("size-full -rotate-45 transition-transform duration-200 ease-out", state === "open" && "group-hover:-translate-y-0.5 group-hover:translate-x-0.5")} />
          )}
          <AnimatePresence>
            {flights.map((id) => (
              <Flight key={id} big={lg} onDone={() => setFlights((f) => f.filter((x) => x !== id))} />
            ))}
          </AnimatePresence>
        </span>
        <span className={cn(!lg && "sr-only sm:not-sr-only")}>{label}</span>
        <span className={cn("relative overflow-hidden tabular", lg ? "h-6 leading-6" : "h-5 leading-5", state === "open" ? "text-[#0b1020]/75" : "opacity-80")}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              className="block"
              initial={reduce ? false : { y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {count.toLocaleString("en")}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      <AnimatePresence>
        {floats.map((id) => (
          <motion.span
            key={id}
            aria-hidden
            className="pointer-events-none absolute -top-1 right-3 text-xs font-semibold text-ok"
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: -22, opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, ease: EASE }}
            onAnimationComplete={() => setFloats((f) => f.filter((x) => x !== id))}
          >
            +1
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** One rocket leaving the button: up and to the right, with sparks falling behind it. */
function Flight({ big, onDone }: { big: boolean; onDone: () => void }) {
  const dist = big ? 90 : 60
  return (
    <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-10" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.span
        className="absolute inset-0 grid place-items-center text-white drop-shadow-[0_0_6px_rgb(143_180_255/0.9)]"
        initial={{ x: 0, y: 0, scale: 1 }}
        animate={{ x: dist * 0.55, y: -dist, scale: 0.7, opacity: [1, 1, 0] }}
        transition={{ duration: 0.75, ease: [0.5, 0, 0.75, 0] }}
        onAnimationComplete={onDone}
      >
        <RocketIcon className="size-full -rotate-45" />
      </motion.span>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = Math.PI * (0.55 + (i / 5) * 0.5)
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 size-1 rounded-full bg-[#ffcf8a]"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(a) * (14 + i * 3),
              y: Math.sin(a) * (10 + i * 3) + 8,
              opacity: 0,
              scale: 0.4,
            }}
            transition={{ duration: 0.55, delay: 0.04 * i, ease: EASE }}
          />
        )
      })}
    </motion.span>
  )
}

/** Which state the boost button is in for a launch, at a moment, for a viewer. */
export function boostState(l: Launch, now: number | null, opts: { isOwner: boolean; readOnly: boolean }): BoostState {
  if (opts.readOnly) return "example"
  if (l.boosted) return "boosted"
  if (opts.isOwner) return "own"
  if (now === null) return "scheduled"
  const phase = launchPhase(l, now)
  return phase === "live" ? "open" : phase
}
