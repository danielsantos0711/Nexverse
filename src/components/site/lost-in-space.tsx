"use client"

import Link from "next/link"
import { NMark } from "@/components/brand"
import { Copy } from "@/components/content/copy"
import { BlackHole } from "@/components/fx"

/**
 * The page for "not here" and "something broke": a black hole (HorizonX Cinematic Black Hole) swallowing the
 * missing page, with the N held safely in front of it and the ways back home.
 */
export function LostInSpace({ kind = "missing", onRetry }: { kind?: "missing" | "error"; onRetry?: () => void }) {
  const error = kind === "error"
  return (
    <div className="relative isolate flex min-h-[72vh] w-full flex-col items-center justify-center gap-6 overflow-hidden px-gutter py-24 text-center">
      <div aria-hidden className="absolute inset-x-0 top-1/2 -z-10 mx-auto aspect-video w-[min(1100px,160vw)] -translate-y-1/2 opacity-90">
        <BlackHole className="size-full" />
      </div>
      <div aria-hidden className="absolute inset-0 -z-10 bg-radial from-transparent from-30% to-background" />
      <NMark material="titanium" sizes="160px" small className="size-24 rounded-3xl shadow-[0_0_60px_-10px_rgb(216_197_158/0.45)]" />
      {error ? (
        <>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl"><Copy k="error.page.title">Pulled into a black hole</Copy></h1>
          <p className="max-w-[44ch] text-muted-foreground"><Copy k="error.page.lead">Something on this page broke while it loaded. Try again; if it keeps happening, the team has already been told by the logs.</Copy></p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl"><Copy k="not-found.not-found.lost-in-space">Lost in space</Copy></h1>
          <p className="max-w-[44ch] text-muted-foreground"><Copy k="not-found.not-found.this-page-drifted-out-of">This page drifted out of orbit, or it was never here. Everything else is one search away.</Copy></p>
        </>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {error && onRetry && (
          <button type="button" onClick={onRetry} className="pressable inline-flex h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
            <Copy k="error.page.retry">Try again</Copy>
          </button>
        )}
        <Link href="/" className={error ? "pressable inline-flex h-11 items-center rounded-full bg-secondary px-6 font-medium" : "pressable inline-flex h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground"}>
          <Copy k="not-found.not-found.back-home">Back home</Copy>
        </Link>
        <Link href="/explore" className="pressable inline-flex h-11 items-center rounded-full bg-secondary px-6 font-medium">
          <Copy k="not-found.not-found.explore">Explore</Copy>
        </Link>
      </div>
    </div>
  )
}
