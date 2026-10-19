import { CircleHelpIcon, SparklesIcon } from "lucide-react"
import { Cover } from "@/components/hub/bits"
import { categoryInfo, type NewsCategory, type Story } from "@/lib/newsroom"
import { cn } from "@/lib/utils"

/*
 * Small pieces every newsroom surface shares: the category label, the "Unconfirmed" badge, the AI note and
 * the cover (an editor's image, or a star field drawn from the story's id).
 */

const TONE: Record<NewsCategory, string> = {
  launch: "text-ion",
  research: "text-dataset",
  policy: "text-gold",
  industry: "text-model",
  tools: "text-repo",
  rumor: "text-[#f0a3a3]",
}

export function CategoryTag({ category, className }: { category: NewsCategory; className?: string }) {
  return <span className={cn("text-xs font-medium tracking-wide uppercase", TONE[category], className)}>{categoryInfo(category).one}</span>
}

export function UnconfirmedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border border-[#f0a3a3]/35 bg-[#f0a3a3]/10 px-2 py-0.5 text-xs font-medium text-[#f6c4c4]", className)}
      title="Reported but not confirmed by the company involved"
    >
      <CircleHelpIcon aria-hidden className="size-3" />
      Unconfirmed
    </span>
  )
}

export function AiNote({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)} title="Drafted with AI from the cited sources, reviewed by a Nexverse editor">
      <SparklesIcon aria-hidden className="size-3" />
      AI-assisted
    </span>
  )
}

export function StoryCover({ story, className }: { story: Pick<Story, "id" | "cover">; className?: string }) {
  if (story.cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- an image address an editor chose; no optimisation, no referrer
      <img src={story.cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={cn("block size-full object-cover", className)} />
    )
  }
  return <Cover seed={story.id} kind="news" className={className} />
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })

/** A fixed UTC date, so prerendered markup never depends on the reader's clock. */
export const storyDate = (iso: string | null) => (iso ? DATE.format(new Date(iso)) : "")
export const storyDateTime = (iso: string | null) => (iso ? DATE_TIME.format(new Date(iso)) : "")
