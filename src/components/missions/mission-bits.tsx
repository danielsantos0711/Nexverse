import { CheckCircle2Icon, CircleDotIcon, ClockIcon, HourglassIcon, RocketIcon, SearchCheckIcon, SparklesIcon, type LucideIcon } from "lucide-react"
import { DIFFICULTIES, STATUSES, type Difficulty, type MissionStatus } from "@/lib/missions"
import { cn } from "@/lib/utils"

export const STATUS_ICON: Record<MissionStatus, LucideIcon> = {
  open: CircleDotIcon,
  "in-progress": RocketIcon,
  review: SearchCheckIcon,
  completed: CheckCircle2Icon,
  expired: HourglassIcon,
}

/** Text colour per status, shared by badges, the mission control strip and the filters. */
export const STATUS_TONE: Record<MissionStatus, string> = {
  open: "text-ion",
  "in-progress": "text-repo",
  review: "text-gold",
  completed: "text-ok",
  expired: "text-muted-foreground",
}

const STATUS_CHIP: Record<MissionStatus, string> = {
  open: "border-ion/30 bg-ion/10",
  "in-progress": "border-[#d3b4ff]/30 bg-[#d3b4ff]/10",
  review: "border-gold/30 bg-gold/10",
  completed: "border-ok/30 bg-ok/10",
  expired: "border-border bg-white/[0.04]",
}

export function StatusBadge({ status, className }: { status: MissionStatus; className?: string }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_CHIP[status], STATUS_TONE[status], className)}>
      <Icon aria-hidden className="size-3" />
      {STATUSES[status].label}
    </span>
  )
}

const DIFFICULTY_TONE: Record<Difficulty, string> = {
  cadet: "text-ok",
  pilot: "text-ion",
  commander: "text-gold",
}

/** Rank insignia: one, two or three chevrons. Drawn, not an icon font, so it stays crisp at any size. */
export function Insignia({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  const n = DIFFICULTIES[difficulty].rank
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 14"
      className={cn("size-3.5", DIFFICULTY_TONE[difficulty], className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {Array.from({ length: n }, (_, i) => {
        const y = 12 - i * 4 - (3 - n) * 2
        return <path key={i} d={`M1.5 ${y} L6 ${y - 3} L10.5 ${y}`} />
      })}
    </svg>
  )
}

export function DifficultyBadge({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-white/[0.03] px-2 py-0.5 text-xs font-medium", DIFFICULTY_TONE[difficulty], className)}>
      <Insignia difficulty={difficulty} className="size-3" />
      {DIFFICULTIES[difficulty].label}
    </span>
  )
}

/** "150 pts", or "Badge only" for missions with no points riding on them. */
export function Reward({ points, className, size = "sm" }: { points: number; className?: string; size?: "sm" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium text-gold tabular", size === "lg" ? "text-lg" : "text-sm", className)}>
      <SparklesIcon aria-hidden className={size === "lg" ? "size-4" : "size-3.5"} />
      {points > 0 ? (
        <>
          {points.toLocaleString("en")} <span className="font-normal text-gold/80">pts</span>
        </>
      ) : (
        <span className="font-normal">Badge only</span>
      )}
    </span>
  )
}

/** "12 days left", "Ends today", "Ended 6 days ago". Needs the current time, so it renders nothing before mount. */
export function deadlineText(deadline: string, now: number) {
  const ms = Date.parse(deadline) - now
  const days = Math.round(Math.abs(ms) / 864e5)
  const hours = Math.round(Math.abs(ms) / 36e5)
  if (ms >= 0) {
    if (hours < 1) return "Less than an hour left"
    if (hours < 24) return `${hours} h left`
    return days === 1 ? "1 day left" : `${days} days left`
  }
  if (hours < 24) return "Ended today"
  return days === 1 ? "Ended yesterday" : `Ended ${days} days ago`
}

export function Deadline({ deadline, now, className }: { deadline: string; now: number | null; className?: string }) {
  if (now === null) return null
  const urgent = Date.parse(deadline) - now < 3 * 864e5 && Date.parse(deadline) > now
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground tabular", urgent && "text-gold", className)}>
      <ClockIcon aria-hidden className="size-3.5" />
      <time dateTime={deadline} title={new Date(deadline).toUTCString()}>
        {deadlineText(deadline, now)}
      </time>
    </span>
  )
}
