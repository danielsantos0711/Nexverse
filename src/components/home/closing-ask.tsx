"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"

/** The closing sentence has a gap in it, and the gap is where the question goes. */
export function ClosingAsk() {
  const router = useRouter()
  const [q, setQ] = useState("")
  const id = useId()

  return (
    <section aria-labelledby={`${id}-h`} className="px-gutter py-40">
      <h2 id={`${id}-h`} className="sr-only">
        Ask your question
      </h2>
      <form
        action="/new"
        onSubmit={(e) => {
          e.preventDefault()
          router.push(q.trim() ? `/new?q=${encodeURIComponent(q.trim())}` : "/new")
        }}
        className="font-wide text-[9vw] leading-[1.15] font-medium tracking-[-0.03em] md:text-[clamp(40px,5vw,84px)]"
        data-reveal
      >
        <span>Bring </span>
        <label htmlFor={`${id}-q`} className="sr-only">
          Your question
        </label>
        <input
          id={`${id}-q`}
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="your question"
          autoComplete="off"
          className="my-1 inline-block h-[1.15em] w-full rounded-[0.12em] bg-card px-[0.25em] align-bottom text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring md:my-0 md:w-[8.8em]"
        />
        <span> to the </span>
        <button
          type="submit"
          className="pressable inline-block h-[1.15em] rounded-[0.12em] bg-primary px-[0.3em] align-bottom text-primary-foreground transition-colors duration-150 hover:bg-primary/85"
        >
          loop.
        </button>
      </form>
      <p className="mt-6 max-w-[52ch] text-muted-foreground" data-reveal>
        Next you choose an orbit and the language you are writing in. Nothing is posted until you confirm it.
      </p>
    </section>
  )
}
