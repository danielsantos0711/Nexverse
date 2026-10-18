"use client"

import Link from "next/link"
import { useId, useState } from "react"
import { ArrowUpRightIcon } from "lucide-react"
import { ARTIFACT_KINDS, LANGUAGES, threadTitle } from "@/lib/data"
import { route } from "@/lib/search"

const EXAMPLES = ["stop an agent looping", "run a 7B model offline", "AI Act for open models"]

/**
 * The section headline is the question box. As the visitor types, the community's own content answers:
 * the orbit to ask in, the closest thread, and something already built.
 */
export function AskLine() {
  const [q, setQ] = useState("fine-tune in Portuguese")
  const id = useId()
  const r = route(q)
  const empty = !r.orbit && !r.thread && !r.artifact

  return (
    <section aria-labelledby={`${id}-h`} className="flex min-h-[88svh] flex-col justify-between gap-12 bg-card px-gutter py-24">
      <h2 id={`${id}-h`} className="sr-only">
        Ask the community
      </h2>
      <div data-ui className="flex flex-col gap-10 md:gap-12" data-reveal>
        <label htmlFor={`${id}-q`} className="text-lead text-muted-foreground">
          What are you trying to do?
        </label>
        <input
          id={`${id}-q`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="font-wide -mt-6 w-full min-w-0 bg-transparent text-[11vw] leading-[1.05] font-medium tracking-[-0.035em] outline-none placeholder:text-muted-foreground/60 focus-visible:outline-none md:text-[clamp(48px,6.4vw,112px)]"
          placeholder="Type a question"
        />

        <div aria-live="polite" className="flex w-full max-w-[560px] flex-col gap-1">
          {empty ? (
            <p className="py-3 text-muted-foreground">
              Nothing close yet. That usually means it is a good question to{" "}
              <Link href={`/new?q=${encodeURIComponent(q)}`} className="text-foreground underline">
                ask first
              </Link>
              .
            </p>
          ) : (
            <>
              {r.orbit && (
                <Row href={`/orbits/${r.orbit.item.slug}`} kind="Ask in" title={r.orbit.item.name} note={r.orbit.item.blurb} />
              )}
              {r.thread && (
                <Row
                  href={`/threads/${r.thread.item.id}`}
                  kind="Asked before"
                  title={threadTitle(r.thread.item)}
                  note={
                    r.thread.item.lang === "en"
                      ? `${r.thread.item.replies.length} replies`
                      : `${r.thread.item.replies.length} replies · written in ${LANGUAGES[r.thread.item.lang].native}`
                  }
                />
              )}
              {r.artifact && (
                <Row
                  href={`/artifacts/${r.artifact.item.slug}`}
                  kind={`${ARTIFACT_KINDS[r.artifact.item.kind].label} already built`}
                  title={r.artifact.item.name}
                  note={r.artifact.item.summary}
                />
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 md:gap-x-6" data-reveal>
        <span className="sr-only">Try:</span>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setQ(e)}
            className="pressable min-h-11 rounded-full bg-raised px-4 text-[17px] text-muted-foreground transition-colors duration-150 hover:text-foreground md:bg-transparent md:px-0"
          >
            {e}
          </button>
        ))}
      </div>
    </section>
  )
}

function Row({ href, kind, title, note }: { href: string; kind: string; title: string; note: string }) {
  return (
    <Link
      href={href}
      className="group/row grid grid-cols-[1fr_auto] gap-x-4 -mx-3 rounded-md px-3 py-3 transition-colors duration-150 hover:bg-raised"
    >
      <span className="text-small text-muted-foreground">{kind}</span>
      <ArrowUpRightIcon
        aria-hidden
        className="row-span-3 size-4 self-center text-muted-foreground transition-transform duration-200 ease-out group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5"
      />
      <span className="font-medium">{title}</span>
      <span className="truncate text-small text-muted-foreground">{note}</span>
    </Link>
  )
}
