import type { Metadata } from "next"
import Link from "next/link"
import { PageHead, PersonAvatar, PersonLink } from "@/components/app/bits"
import { formatDate, getThread, signal, SIGNAL_KINDS, threadTitle } from "@/lib/data"

export const metadata: Metadata = { title: "Signal" }

export default function SignalPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHead
        title="Signal"
        lead="The week in AI, with a note from a member on why it matters to people who build. No hype, no ranking by clicks."
      />
      <ol className="flex flex-col gap-2">
        {signal.map((s) => {
          const thread = s.thread ? getThread(s.thread) : undefined
          return (
            <li key={s.id} className="grid gap-4 rounded-md py-8 md:grid-cols-[8rem_1fr] md:gap-8">
              <div className="flex gap-3 text-small text-muted-foreground md:flex-col md:gap-1">
                <span className="text-foreground">{SIGNAL_KINDS[s.kind]}</span>
                <span className="tabular">{formatDate(s.date)}</span>
                <span>{s.source}</span>
              </div>
              <div className="flex flex-col gap-4">
                <h2 className="font-wide text-[clamp(1.35rem,1rem+1vw,1.9rem)] leading-tight font-semibold tracking-[-0.025em] text-balance">
                  {s.title}
                </h2>
                <figure className="flex flex-col gap-3 rounded-md bg-card p-5">
                  <blockquote className="max-w-[62ch] text-[17px] leading-relaxed">{s.why}</blockquote>
                  <figcaption className="flex items-center gap-2 text-small text-muted-foreground">
                    <PersonAvatar handle={s.noteBy} size="sm" />
                    <span>
                      Why it matters, by <PersonLink handle={s.noteBy} className="text-foreground" />
                    </span>
                  </figcaption>
                </figure>
                {thread && (
                  <Link href={`/threads/${thread.id}`} className="text-[15px] text-muted-foreground hover:text-foreground">
                    Discussed in: <span className="underline">{threadTitle(thread)}</span>
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-10 text-small text-muted-foreground">
        These items are sample content written to show the format. They do not describe real releases.
      </p>
    </div>
  )
}
