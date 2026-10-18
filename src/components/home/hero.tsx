"use client"

import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import { NMark } from "@/components/brand"
import { LinkButton } from "@/components/link-button"
import { SiteHeader } from "@/components/site-header"
import { getArtifact, getThread, formatDate } from "@/lib/data"

gsap.registerPlugin(useGSAP, ScrollTrigger)

const thread = getThread("fine-tune-3b-european-portuguese")!
const artifact = getArtifact("tagus-3b-pt")!

/**
 * The sentence holds while a reel of frames passes through its middle: the N, a question asked in
 * Portuguese, the model built from its answers, and the N again. The loop is the story of the page.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null)
  const reel = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        root.current!.dataset.pinned = "true"
        const frames = reel.current!.children
        const step = () => (frames[1] as HTMLElement).offsetTop - (frames[0] as HTMLElement).offsetTop
        const travel = gsap.to(reel.current, {
          y: () => -step() * (frames.length - 1),
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.6,
            invalidateOnRefresh: true,
            snap: { snapTo: 1 / (frames.length - 1), duration: { min: 0.2, max: 0.5 }, ease: "power2.inOut" },
          },
        })
        ScrollTrigger.refresh()
        return () => {
          travel.kill()
          delete root.current?.dataset.pinned
        }
      })
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-hero-in]", { opacity: 0, y: 20, duration: 0.9, ease: "expo.out", stagger: 0.08, delay: 0.1 })
        gsap.from("[data-hero-frame]", { opacity: 0, scale: 0.96, duration: 1.1, ease: "expo.out", delay: 0.25 })
      })
    },
    { scope: root }
  )

  return (
    <section
      ref={root}
      aria-labelledby="hero-title"
      className="group/hero relative h-svh min-h-[560px] data-[pinned=true]:h-[230svh]"
    >
      <div className="sticky top-0 flex h-svh min-h-[560px] flex-col overflow-hidden">
        <SiteHeader />

        <div className="relative flex flex-1 flex-col justify-center px-gutter md:static">
          <h1
            id="hero-title"
            className="font-wide relative z-10 flex flex-col gap-3 text-[9vw] leading-none font-medium tracking-[-0.03em] md:pointer-events-none md:absolute md:inset-x-[var(--gutter)] md:top-1/2 md:-translate-y-1/2 md:flex-row md:justify-between md:text-[clamp(28px,3.05vw,54px)]"
          >
            <span data-hero-in>Ask out loud,</span>
            <span aria-hidden data-hero-frame className="block aspect-[4/3] w-full overflow-hidden rounded-[6px] md:hidden">
              <NMark material="chrome" priority fit="contain" sizes="100vw" className="size-full" />
            </span>
            <span data-hero-in className="self-end md:self-auto">
              build it back.
            </span>
          </h1>
        </div>

        {/* The reel passes through the middle of the sentence while the stage is pinned. */}
        <div
          data-hero-frame
          className="absolute top-0 left-1/2 hidden h-full w-[35vw] -translate-x-1/2 md:block"
          style={{ ["--fh" as string]: "calc(35vw * 9 / 16)" }}
        >
          <div
            ref={reel}
            className="flex flex-col gap-[max(24px,calc((100svh-var(--fh))/2-60px))] pt-[calc((100svh-var(--fh))/2)]"
          >
            <Frame>
              <NMark material="chrome" priority fit="contain" sizes="35vw" className="size-full" />
            </Frame>
            <Frame ui label="A question asked in Portuguese, readable in English">
              <ThreadFragment />
            </Frame>
            <Frame ui label="The model built from its answers">
              <ArtifactFragment />
            </Frame>
            <Frame>
              <NMark material="champagne" fit="contain" sizes="35vw" className="size-full" />
            </Frame>
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-4 px-gutter pb-8 md:absolute md:bottom-0 md:left-0 md:w-[calc(32.5vw-24px)] md:pb-8">
          <p data-hero-in className="max-w-[34ch] text-[17px] leading-snug">
            Nexverse is a public community where people who build with AI ask in their own language, answer
            each other, and share back the models, datasets and tools they make.
          </p>
          <LinkButton data-hero-in href="/new" size="lg" className="self-start sm:hidden">
            Ask a question
          </LinkButton>
        </div>
      </div>
    </section>
  )
}

function Frame({ children, ui, label }: { children: React.ReactNode; ui?: boolean; label?: string }) {
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      className="relative aspect-video w-full shrink-0 overflow-hidden rounded-[6px]"
      {...(ui ? { "data-ui": "" } : {})}
    >
      {children}
    </div>
  )
}

function ThreadFragment() {
  return (
    <div aria-hidden className="flex size-full flex-col justify-between bg-card p-[5%] text-[clamp(11px,0.95vw,15px)]">
      <div className="flex items-center justify-between text-muted-foreground">
        <span>Small models</span>
        <span>Translated from Português</span>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[1.45em] leading-tight font-medium text-foreground">{thread.en!.title}</p>
        <p className="text-muted-foreground">{thread.title}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex -space-x-1.5">
            {["K", "M", "I"].map((l) => (
              <span
                key={l}
                className="grid size-[1.9em] place-items-center rounded-full bg-raised text-[0.8em] font-medium ring-2 ring-card"
              >
                {l}
              </span>
            ))}
          </span>
          <span className="text-muted-foreground">{thread.replies.length} replies</span>
        </span>
        <span className="rounded-full bg-foreground px-[0.8em] py-[0.25em] text-background">Answered</span>
      </div>
    </div>
  )
}

function ArtifactFragment() {
  return (
    <div aria-hidden className="flex size-full flex-col justify-between bg-field p-[5%] text-field-foreground text-[clamp(11px,0.95vw,15px)]">
      <div className="flex items-center justify-between">
        <span>Model · {artifact.license}</span>
        <span>{formatDate(artifact.updated)}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="font-wide text-[2.1em] leading-none font-semibold tracking-[-0.03em]">{artifact.name}</p>
        <p>{artifact.summary}</p>
      </div>
      <p className="opacity-80">Built from: {thread.en!.title}</p>
    </div>
  )
}
