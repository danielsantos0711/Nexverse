import {
  AtomIcon,
  AudioLinesIcon,
  BookOpenIcon,
  BotIcon,
  BrainIcon,
  CodeIcon,
  CpuIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  GlobeIcon,
  GraduationCapIcon,
  ImageIcon,
  LanguagesIcon,
  LeafIcon,
  MicroscopeIcon,
  OrbitIcon,
  PaletteIcon,
  RocketIcon,
  SatelliteIcon,
  ScaleIcon,
  ShieldIcon,
  SmartphoneIcon,
  SparklesIcon,
  TelescopeIcon,
  type LucideIcon,
} from "lucide-react"
import { ChatAvatar } from "@/components/chat/glyphs"
import { MemberAvatar } from "@/components/forum/forum-ui"
import type { Who } from "@/lib/community"
import { CREW_COLORS, type CrewColor, type CrewIcon } from "@/lib/crews"
import { cn } from "@/lib/utils"

export const CREW_ICON: Record<CrewIcon, LucideIcon> = {
  orbit: OrbitIcon,
  rocket: RocketIcon,
  atom: AtomIcon,
  brain: BrainIcon,
  bot: BotIcon,
  languages: LanguagesIcon,
  "book-open": BookOpenIcon,
  "flask-conical": FlaskConicalIcon,
  cpu: CpuIcon,
  smartphone: SmartphoneIcon,
  "audio-lines": AudioLinesIcon,
  image: ImageIcon,
  database: DatabaseIcon,
  telescope: TelescopeIcon,
  sparkles: SparklesIcon,
  code: CodeIcon,
  globe: GlobeIcon,
  shield: ShieldIcon,
  "graduation-cap": GraduationCapIcon,
  satellite: SatelliteIcon,
  microscope: MicroscopeIcon,
  palette: PaletteIcon,
  scale: ScaleIcon,
  leaf: LeafIcon,
}

/**
 * A crew's emblem: its icon inside a tinted disc, with a thin orbit ring and a small moon in the crew's colour.
 * Drawn with CSS only, so it costs nothing on a page full of crews.
 */
export function CrewEmblem({ icon, color, size = 44, className }: { icon: CrewIcon; color: CrewColor; size?: number; className?: string }) {
  const Icon = CREW_ICON[icon] ?? OrbitIcon
  const tint = CREW_COLORS[color]?.value ?? CREW_COLORS.ion.value
  return (
    <span
      aria-hidden
      className={cn("relative inline-grid shrink-0 place-items-center rounded-2xl", className)}
      style={{
        width: size,
        height: size,
        color: tint,
        background: `radial-gradient(120% 120% at 30% 20%, color-mix(in oklab, ${tint} 28%, transparent), color-mix(in oklab, ${tint} 6%, transparent) 70%)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tint} 35%, transparent)`,
      }}
    >
      <span
        className="absolute inset-[12%] rounded-full border opacity-50"
        style={{ borderColor: `color-mix(in oklab, ${tint} 45%, transparent)`, transform: "rotate(-24deg) scaleY(0.42)" }}
      />
      <span className="absolute rounded-full" style={{ width: Math.max(3, size * 0.09), height: Math.max(3, size * 0.09), background: tint, top: "18%", right: "14%", boxShadow: `0 0 ${size * 0.15}px ${tint}` }} />
      <Icon className="relative" style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={1.75} />
    </span>
  )
}

/** A face for anyone on a crew: a member's (seeded by id, as in chat), or initials. */
export function WhoAvatar({ who, size = 28, className }: { who: Who; size?: number; className?: string }) {
  if (who.memberId) return <ChatAvatar id={who.memberId} name={who.name} size={size} className={className} />
  return <MemberAvatar name={who.name} size={size} className={className} />
}

/** "Saved in this browser" / "Invite only" badges in one place. */
export function CrewBadges({ crew, className }: { crew: { visibility: string; local: boolean }; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {crew.visibility === "invite" && <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold">Invite only</span>}
      {crew.local && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground">Saved in this browser</span>}
    </span>
  )
}
