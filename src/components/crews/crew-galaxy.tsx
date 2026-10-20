"use client"

import { useRef } from "react"
import { CrewEmblem, WhoAvatar } from "@/components/crews/emblem"
import { crewTint, ROLE_LABEL, type Crew, type CrewMember } from "@/lib/crews"
import { useFx } from "@/lib/perf"
import { cn } from "@/lib/utils"

/**
 * The crew as a little galaxy: the crew's sigil is the sun, the captain and officers ride the inner orbit and the
 * crew the outer ones. Pure CSS rotation (one transform per ring); it pauses when off screen, in a hidden tab, on
 * slow machines and under reduced motion, where the stars simply hold their places.
 */
export function CrewGalaxy({ crew, members, onOpenMembers }: { crew: Crew; members: CrewMember[]; onOpenMembers?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const { run } = useFx(ref)
  const tint = crewTint(crew)
  const officers = members.filter((m) => m.role !== "member").slice(0, 8)
  const crewOnly = members.filter((m) => m.role === "member")
  const rings = [officers, crewOnly.slice(0, 12), crewOnly.slice(12, 30)].filter((r) => r.length)
  const hidden = Math.max(0, members.length - rings.reduce((n, r) => n + r.length, 0))
  const radii = [26, 38, 48]
  const speeds = [48, 80, 120]

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={ref}
        data-run={run || undefined}
        className="group/galaxy relative mx-auto aspect-square w-full max-w-[26rem] select-none"
        style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${tint} 16%, transparent), transparent 75%)` }}
        role="img"
        aria-label={`${crew.name}: ${members.length} ${members.length === 1 ? "member" : "members"}, ${officers.length} of them captain or officers.`}
      >
        {radii.slice(0, Math.max(1, rings.length)).map((r, i) => (
          <span key={r} aria-hidden className="absolute rounded-full border border-dashed border-white/10" style={{ inset: `${50 - r}%` }} data-ring={i} />
        ))}
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {crew.sigil ? (
            <span
              className="grid size-20 place-items-center rounded-full text-4xl"
              style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${tint} 55%, white 10%), color-mix(in oklab, ${tint} 25%, #070a14) 70%)`, boxShadow: `0 0 60px -6px ${tint}` }}
            >
              {crew.sigil}
            </span>
          ) : (
            <span className="block rounded-2xl" style={{ boxShadow: `0 0 60px -10px ${tint}` }}>
              <CrewEmblem icon={crew.icon} color={crew.color} size={72} />
            </span>
          )}
        </span>
        {rings.map((ring, i) => (
          <div
            key={i}
            aria-hidden
            className={cn(
              "absolute inset-0 animate-[spin_var(--period)_linear_infinite] [animation-play-state:paused] group-data-[run]/galaxy:[animation-play-state:running] motion-reduce:animate-none",
              i % 2 === 1 && "[animation-direction:reverse]"
            )}
            style={{ "--period": `${speeds[i]}s` } as React.CSSProperties}
          >
            {ring.map((m, j) => {
              const angle = (j / ring.length) * Math.PI * 2 + i * 0.6
              const x = 50 + radii[i] * Math.cos(angle)
              const y = 50 + radii[i] * Math.sin(angle)
              const size = i === 0 ? 34 : 26
              return (
                <span key={m.key} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }} title={`${m.name}${m.role !== "member" ? ` · ${ROLE_LABEL[m.role]}` : ""}`}>
                  {/* Each star turns back against its ring, so faces stay upright. */}
                  <span
                    className={cn(
                      "block animate-[spin_var(--period)_linear_infinite] [animation-play-state:paused] group-data-[run]/galaxy:[animation-play-state:running] motion-reduce:animate-none",
                      i % 2 === 1 ? "[animation-direction:normal]" : "[animation-direction:reverse]"
                    )}
                  >
                    <span className="block rounded-full" style={{ boxShadow: m.role === "owner" ? `0 0 0 2px var(--gold), 0 0 14px -2px var(--gold)` : m.role === "admin" ? `0 0 0 2px ${tint}` : "0 0 10px -3px rgb(255 255 255 / 0.4)" }}>
                      <WhoAvatar who={m} size={size} />
                    </span>
                  </span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-gold" /> Captain
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full" style={{ background: tint }} /> Officers
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-white/60" /> Crew
        </span>
        {(hidden > 0 || onOpenMembers) && (
          <button type="button" onClick={onOpenMembers} className="text-ion hover:underline">
            {hidden > 0 ? `+${hidden} more aboard` : "Everyone aboard"}
          </button>
        )}
      </div>
    </div>
  )
}
