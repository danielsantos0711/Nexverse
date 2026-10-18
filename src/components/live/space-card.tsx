import { HeartIcon } from "lucide-react"
import { Cover, Stat } from "@/components/hub/bits"
import { Spotlight } from "@/components/hub/motion"
import type { HubRepo } from "@/lib/live"
import { cn } from "@/lib/utils"
import { ExternalLink } from "./bits"
import { TimeAgo } from "./time"

/** Hugging Face's card colour names, as RGB triplets dimmed for the dark theme. */
const HF_COLORS: Record<string, string> = {
  red: "248 113 113",
  yellow: "234 196 92",
  green: "110 220 160",
  blue: "110 160 250",
  indigo: "140 148 248",
  purple: "190 140 250",
  pink: "240 130 190",
  gray: "150 158 172",
}

/** A Space: the author's emoji on their chosen gradient, or a drawn cover when they set none. */
export function SpaceCard({ space: s, className }: { space: HubRepo; className?: string }) {
  const from = HF_COLORS[s.colorFrom] ?? HF_COLORS.indigo
  const to = HF_COLORS[s.colorTo] ?? HF_COLORS.purple
  return (
    <Spotlight className={cn("group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <div className="relative h-24 overflow-hidden">
        {s.emoji ? (
          <div
            aria-hidden
            className="flex size-full items-center justify-center text-3xl transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none"
            style={{ background: `radial-gradient(120% 140% at 0% 0%, rgb(${from} / 0.42), transparent 60%), radial-gradient(120% 140% at 100% 100%, rgb(${to} / 0.38), transparent 60%), #0b0d13` }}
          >
            <span className="drop-shadow-[0_4px_12px_rgb(0_0_0/0.5)]">{s.emoji}</span>
          </div>
        ) : (
          <Cover seed={`hf-space-${s.id}`} kind="tool" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        {s.running && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-ok backdrop-blur">
            <span aria-hidden className="size-1.5 rounded-full bg-ok" />
            Running
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4 pt-1">
        <ExternalLink href={s.url} className="line-clamp-1 leading-tight font-medium after:absolute after:inset-0">
          {s.title || s.name}
        </ExternalLink>
        <p className="line-clamp-2 text-[13px] text-muted-foreground">{s.description || `A Space by ${s.owner}.`}</p>
        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-muted-foreground">
          <span className="truncate">{s.owner}</span>
          {s.task && <span className="text-tool">{s.task}</span>}
          <TimeAgo date={s.updatedAt} className="hidden sm:inline" />
          <span className="ml-auto">
            <Stat icon={HeartIcon} value={s.likes} label="likes" />
          </span>
        </div>
      </div>
    </Spotlight>
  )
}
