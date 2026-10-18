import Image from "next/image"
import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"
import { NMark } from "@/components/brand"
import { AskLine } from "@/components/home/ask-line"
import { ClosingAsk } from "@/components/home/closing-ask"
import { Drift } from "@/components/home/drift"
import { Hero } from "@/components/home/hero"
import { LinkButton } from "@/components/link-button"
import { Reveal } from "@/components/reveal"
import { artifacts, formatDate, getPerson, signal, SIGNAL_KINDS } from "@/lib/data"

export default function Home() {
  return (
    <Reveal>
      <main id="main">
        <Hero />
        <Intro />
        <AskLine />
        <Loop />
        <Signal />
        <SharedHere />
        <Name />
        <ClosingAsk />
      </main>
      <Closing />
    </Reveal>
  )
}

/* A statement with small pieces of the product set inside its sentence. */
function Intro() {
  const chip = "mx-[0.14em] inline-flex h-[1.5em] items-center rounded-[0.25em] align-[-0.3em] text-[0.62em] font-medium tracking-normal"
  return (
    <section aria-label="What Nexverse is" className="px-gutter py-[14vh]">
      <p data-reveal className="text-statement mx-auto max-w-[min(100%,1000px)] font-medium md:text-center">
        One public place to ask in your own language
        <span data-ui aria-hidden className={`${chip} gap-[0.4em] bg-card px-[0.6em] text-muted-foreground`}>
          PT <span className="text-foreground">→ EN</span>
        </span>
        , answer each other
        <span data-ui aria-hidden className={`${chip} gap-[0.3em] bg-card px-[0.5em]`}>
          <span className="size-[1.2em] rounded-full bg-raised" />
          <span className="size-[1.2em] rounded-full bg-muted-foreground/40" />
          <span className="text-muted-foreground">+3</span>
        </span>
        , and share back what you built
        <span data-ui aria-hidden className={`${chip} bg-field px-[0.6em] text-field-foreground`}>
          tagus-3b-pt
        </span>
        .
      </p>
    </section>
  )
}

/* The loop, drawn as one progress bar whose stages are as long as they really feel. */
function Loop() {
  const stages = [
    {
      when: "A minute",
      grow: 1,
      tone: "bg-card text-foreground",
      clause: "First, ask in any language. Everyone else reads it in theirs.",
    },
    {
      when: "A few hours",
      grow: 3,
      tone: "bg-raised text-foreground",
      clause: "Then people who have done it answer, and the asker marks what worked.",
    },
    {
      when: "Days, sometimes weeks",
      grow: 7,
      tone: "bg-field text-field-foreground",
      clause: "Often someone builds the fix: a model, a dataset, a tool, a guide.",
    },
    {
      when: "For good",
      grow: 4,
      tone: "bg-foreground text-background",
      clause: "Finally it is shared back, linked forever to the question that started it.",
    },
  ]
  return (
    <section aria-labelledby="loop-h" className="px-gutter py-40">
      <h2 id="loop-h" data-reveal className="font-wide text-head mb-16 max-w-[11ch] font-semibold">
        Every question is a loop
      </h2>
      <div data-ui className="flex flex-col gap-1.5 md:flex-row">
        {stages.map((s) => (
          <div
            key={s.when}
            data-reveal
            className="flex flex-col gap-4 md:min-w-[12%]"
            style={{ flexGrow: s.grow, flexBasis: 0 }}
          >
            <div
              className={`${s.tone} flex min-h-[72px] items-start rounded-[6px] p-5 md:h-[22vh]`}
              style={{ minHeight: `${Math.max(72, s.grow * 22)}px` }}
            >
              <span className="text-[clamp(20px,2vw,30px)] leading-tight font-medium">{s.when}</span>
            </div>
            <p className="max-w-[24ch] text-[17px] leading-snug">{s.clause}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* News, explained by members: a statement on the left, the table pushed right. */
function Signal() {
  const rows = signal.slice(0, 7)
  return (
    <section aria-labelledby="signal-h" className="px-gutter py-40">
      <h2
        id="signal-h"
        data-reveal
        className="font-wide text-head max-w-[18ch] font-semibold max-md:text-[7.6vw] md:indent-[3vw]"
      >
        News, explained by members
      </h2>
      <div className="mt-24 grid gap-12 md:grid-cols-12 md:gap-6">
        <Drift className="relative order-2 ml-auto aspect-[4/5] w-[60%] self-end overflow-hidden rounded-[6px] md:order-none md:col-span-4 md:ml-0 md:w-auto">
          <NMark material="titanium" sizes="(min-width: 768px) 30vw, 60vw" className="size-full" />
        </Drift>
        <p className="hidden pt-1 text-small text-muted-foreground md:col-span-2 md:col-start-6 md:block md:text-right">
          Signal
        </p>
        <ul className="flex flex-col md:col-span-5 md:col-start-8">
          {rows.map((s, i) => (
            <li key={s.id} data-reveal className={i > 0 && i % 4 === 0 ? "mt-11" : ""}>
              <Link
                href={s.thread ? `/threads/${s.thread}` : "/signal"}
                className="group/s -mx-3 grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-x-4 rounded-md px-3 py-[13px] text-[17px] transition-colors duration-150 hover:bg-card"
              >
                <span className="text-muted-foreground">{SIGNAL_KINDS[s.kind]}</span>
                <span className="leading-snug">{s.title}</span>
                <span className="flex items-center gap-1 text-small text-muted-foreground tabular">
                  {formatDate(s.date).replace(/ \d{4}$/, "")}
                  <ArrowUpRightIcon
                    aria-hidden
                    className="size-3.5 transition-transform duration-200 ease-out group-hover/s:translate-x-0.5 group-hover/s:-translate-y-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
          <li className="mt-8">
            <LinkButton href="/signal" variant="secondary">
              Read every note
            </LinkButton>
          </li>
        </ul>
      </div>
    </section>
  )
}

/* Everything members have built, as one paragraph of names. */
function SharedHere() {
  return (
    <section aria-labelledby="shared-h" className="bg-card px-gutter py-32">
      <p data-reveal className="text-statement max-w-[1100px] font-medium">
        <span id="shared-h">Shared back so far:</span>{" "}
        {artifacts.map((a, i) => (
          <span key={a.slug}>
            <Link
              href={`/artifacts/${a.slug}`}
              className="text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:text-foreground"
            >
              {a.name}
            </Link>
            {i < artifacts.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
      <p data-reveal className="mt-8 text-small text-muted-foreground">
        {artifacts.length} sample artifacts, each linked to the question that started it.{" "}
        <Link href="/explore" className="text-foreground underline">
          Explore them all
        </Link>
      </p>
    </section>
  )
}

/* What the name and the N mean, with the N set as a drop capital. */
function Name() {
  const ines = getPerson("ines")!
  return (
    <section aria-label="About the name" className="grid gap-10 px-gutter py-36 md:grid-cols-12 md:gap-6">
      <ul className="order-2 flex flex-wrap gap-2 text-small text-muted-foreground md:order-none md:col-span-2 md:flex-col md:gap-3">
        <li className="rounded-md bg-card px-3 py-2 md:bg-transparent md:p-0">Public and free to read</li>
        <li className="rounded-md bg-card px-3 py-2 md:bg-transparent md:p-0">Written in any language</li>
        <li className="rounded-md bg-card px-3 py-2 md:bg-transparent md:p-0">Opening in 2026</li>
      </ul>
      <div className="md:col-span-10 md:col-start-3">
        <p data-reveal className="text-lead">
          <NMark
            material="chrome"
            sizes="140px"
            small
            className="float-left mt-[0.15em] mr-[0.5em] size-[4.6em] rounded-[4px] md:size-[3.6em]"
          />
          <span className="font-medium">Nexverse</span>{" "}
          <span className="text-muted-foreground">
            is nexus and universe in one word. Its N is one ribbon folded over itself, with no inside and no
            outside: the person asking today answers tomorrow, and what gets built goes back to where the
            question began.
          </span>
        </p>
        <p data-reveal className="text-lead mt-[1.25em] text-muted-foreground">
          Profiles show who you helped and who helped you, never how many follow you.{" "}
          <Link href={`/people/${ines.handle}`} className="text-foreground underline">
            See {ines.name.split(" ")[0]}&apos;s
          </Link>
          .
        </p>
      </div>
    </section>
  )
}

/* The close: an invitation over the wordmark, cropped by the bottom edge. */
function Closing() {
  return (
    <footer className="relative flex min-h-svh flex-col overflow-hidden bg-foreground text-background">
      <div className="grid gap-10 px-gutter pt-24 md:grid-cols-12">
        <div className="flex flex-col gap-8 md:col-span-7">
          <p className="font-wide text-head font-semibold max-md:text-[11vw]">
            Start with a question.
          </p>
          <Link
            href="/new"
            className="pressable inline-flex h-12 items-center self-start rounded-full bg-background px-6 text-foreground transition-opacity duration-150 hover:opacity-90"
          >
            Ask the community
          </Link>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-3 text-[17px] md:col-span-3 md:col-start-10 md:flex-col">
          {[
            ["/explore", "Explore"],
            ["/orbits", "Orbits"],
            ["/signal", "Signal"],
            ["/people/ines", "A profile"],
          ].map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="opacity-80 transition-opacity duration-150 hover:opacity-100">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto flex flex-col justify-between gap-2 px-gutter pt-16 pb-4 text-small opacity-75 sm:flex-row">
        <span>© 2026 Nexverse</span>
        <span>Every person, thread and figure shown is sample content.</span>
      </div>
      <div aria-hidden className="relative h-[9vw] w-full shrink-0 overflow-hidden">
        <Image
          src="/brand/wordmark-dark.png"
          alt=""
          width={1600}
          height={175}
          sizes="120vw"
          className="theme-img-dark absolute top-0 left-[var(--gutter)] h-auto w-[118vw] max-w-none"
        />
        <Image
          src="/brand/wordmark-white.png"
          alt=""
          width={1600}
          height={175}
          sizes="120vw"
          className="theme-img-light absolute top-0 left-[var(--gutter)] h-auto w-[118vw] max-w-none"
        />
      </div>
    </footer>
  )
}
