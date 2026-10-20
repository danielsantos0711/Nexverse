import { BookOpenIcon, MapPinIcon, MessageCircleQuestionIcon, MonitorIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { PosterAvatar } from "@/components/forum/forum-ui"
import { type EventKind, type EventMode, type Who } from "@/lib/community"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"
import { useEventKinds } from "@/lib/lists/hooks"

export const KIND_ICON: Record<EventKind, LucideIcon> = {
  "paper-club": BookOpenIcon,
  meetup: UsersIcon,
  "office-hours": MessageCircleQuestionIcon,
  ama: MessageCircleQuestionIcon,
}

const KIND_TONE: Record<EventKind, string> = {
  "paper-club": "border-[#d3b4ff]/30 bg-[#d3b4ff]/10 text-repo",
  meetup: "border-gold/30 bg-gold/10 text-gold",
  "office-hours": "border-ok/30 bg-ok/10 text-ok",
  ama: "border-ion/30 bg-ion/10 text-ion",
}

export function KindBadge({ kind, className }: { kind: EventKind; className?: string }) {
  const EVENT_KINDS = useEventKinds()
  const Icon = KIND_ICON[kind]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", KIND_TONE[kind], className)}>
      <Icon aria-hidden className="size-3" />
      {EVENT_KINDS[kind].label}
    </span>
  )
}

export function ModeLabel({ mode, location, className }: { mode: EventMode; location?: string; className?: string }) {
  const Icon = mode === "online" ? MonitorIcon : MapPinIcon
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground", className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{mode === "online" ? "Online" : (location ?? "In person")}</span>
    </span>
  )
}

/** Overlapping avatars with a "+N" for the rest. Names are read out to screen readers. */
export function AvatarStack({ people, max = 6, size = 26, label, className }: { people: Who[]; max?: number; size?: number; label: string; className?: string }) {
  if (!people.length) return null
  const shown = people.slice(0, max)
  return (
    <ul aria-label={label} className={cn("flex items-center -space-x-1.5", className)}>
      {shown.map((p, i) => (
        <li key={`${p.handle ?? p.memberId ?? p.name}-${i}`} title={p.name} className="rounded-full ring-2 ring-background">
          <PosterAvatar poster={p} size={size} />
          <span className="sr-only">{p.name}</span>
        </li>
      ))}
      {people.length > shown.length && (
        <li className="grid place-items-center rounded-full bg-secondary text-[11px] text-muted-foreground tabular ring-2 ring-background" style={{ width: size, height: size }}>
          +{people.length - shown.length}
          <span className="sr-only"> <Copy k="events.event-bits.more">more</Copy></span>
        </li>
      )}
    </ul>
  )
}
