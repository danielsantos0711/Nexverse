import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  ARTIFACT_KINDS,
  formatDate,
  getOrbit,
  getPerson,
  LANGUAGES,
  LOOP_STAGES,
  threadTitle,
  type Artifact,
  type LanguageCode,
  type LoopStage,
  type Thread,
} from "@/lib/data"
import { cn } from "@/lib/utils"

export function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
}

export function PersonAvatar({ handle, size = "default" }: { handle: string; size?: "default" | "sm" | "lg" }) {
  const p = getPerson(handle)
  return (
    <Avatar size={size}>
      <AvatarFallback>{p ? initials(p.name) : "?"}</AvatarFallback>
    </Avatar>
  )
}

export function PersonLink({ handle, className }: { handle: string; className?: string }) {
  const p = getPerson(handle)
  if (!p) return <span className={className}>Someone</span>
  return (
    <Link href={`/people/${p.handle}`} className={cn("font-medium hover:underline", className)}>
      {p.name}
    </Link>
  )
}

export function LangTag({ lang, className }: { lang: LanguageCode; className?: string }) {
  return (
    <abbr
      title={`Written in ${LANGUAGES[lang].name}`}
      className={cn("text-small font-medium uppercase no-underline", className)}
    >
      {lang}
    </abbr>
  )
}

/** Four short segments, filled up to where the thread is in its loop. */
export function LoopMark({ stage, withLabel = true }: { stage: LoopStage; withLabel?: boolean }) {
  const at = LOOP_STAGES.findIndex((s) => s.id === stage)
  return (
    <span className="inline-flex items-center gap-2" title={LOOP_STAGES[at].detail}>
      <span aria-hidden className="flex gap-0.5">
        {LOOP_STAGES.map((s, i) => (
          <span
            key={s.id}
            className={cn("h-1.5 w-3 rounded-full", i <= at ? (i === 3 ? "bg-field" : "bg-foreground") : "bg-raised")}
          />
        ))}
      </span>
      {withLabel ? (
        <span className="text-small text-muted-foreground">{LOOP_STAGES[at].label}</span>
      ) : (
        <span className="sr-only">{LOOP_STAGES[at].label}</span>
      )}
    </span>
  )
}

export function ThreadRow({ thread, showOrbit = true }: { thread: Thread; showOrbit?: boolean }) {
  const orbit = getOrbit(thread.orbit)
  const translated = thread.lang !== "en" && thread.en?.title
  return (
    <li>
      <Link
        href={`/threads/${thread.id}`}
        className="group/t -mx-3 flex flex-col gap-2 rounded-md px-3 py-4 transition-colors duration-150 hover:bg-card"
      >
        <span className="text-lg leading-snug font-medium">{threadTitle(thread)}</span>
        {translated && <span className="text-small text-muted-foreground">{thread.title}</span>}
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-muted-foreground">
          <LoopMark stage={thread.stage} />
          {showOrbit && orbit && <span>{orbit.name}</span>}
          <span>{getPerson(thread.author)?.name}</span>
          <LangTag lang={thread.lang} />
          <span className="tabular">
            {thread.replies.length} {thread.replies.length === 1 ? "reply" : "replies"}
          </span>
          <span className="tabular">{formatDate(thread.date)}</span>
        </span>
      </Link>
    </li>
  )
}

export function ArtifactRow({ artifact }: { artifact: Artifact }) {
  return (
    <li className="@container">
      <Link
        href={`/artifacts/${artifact.slug}`}
        className="-mx-3 grid gap-1 rounded-md px-3 py-4 transition-colors duration-150 hover:bg-card @xl:grid-cols-[9rem_1fr]"
      >
        <span className="text-small text-muted-foreground">{ARTIFACT_KINDS[artifact.kind].label}</span>
        <span className="flex flex-col gap-1">
          <span className="font-wide text-lg leading-tight font-semibold tracking-[-0.02em]">{artifact.name}</span>
          <span className="text-muted-foreground">{artifact.summary}</span>
          <span className="flex flex-wrap gap-x-4 text-small text-muted-foreground">
            <span>{getPerson(artifact.author)?.name}</span>
            <span>{artifact.license}</span>
            <span className="tabular">Updated {formatDate(artifact.updated)}</span>
          </span>
        </span>
      </Link>
    </li>
  )
}

export function KindBadge({ children }: { children: React.ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>
}

export function PageHead({
  title,
  lead,
  children,
}: {
  title: React.ReactNode
  lead?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-5 pt-14 pb-10 md:pt-20">
      <h1 className="font-wide text-[clamp(2.25rem,1.4rem+3.4vw,4.5rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-balance">
        {title}
      </h1>
      {lead && <p className="text-lead max-w-[46ch] text-muted-foreground">{lead}</p>}
      {children}
    </div>
  )
}
