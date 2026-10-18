import type { Metadata } from "next"
import Link from "next/link"
import { GlowCard } from "@/components/hub/glow-card"
import { ArrowUpRightIcon, LockIcon } from "lucide-react"
import { PageTitle } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { LAB_TOOLS, labPath, type LabToolSlug } from "@/components/lab/tools"

export const metadata: Metadata = {
  title: "Lab",
  description: "Small, useful AI tools that run entirely in your browser: VRAM calculator, token cost, licence checker, model and dataset cards, prompt playground.",
}

export default function Page() {
  return (
    <div className="shell pb-16">
      <PageTitle
        eyebrow="Lab"
        title="Tools for building with AI"
        lead="Quick answers to the questions that come up every week: will it fit, what will it cost, can I use it, how do I document it. Everything runs in your browser; nothing you type is sent anywhere."
      >
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LockIcon aria-hidden className="size-3.5" />
          No sign-in, no servers, no tracking of what you enter.
        </p>
      </PageTitle>

      <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LAB_TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <Item as="li" key={t.slug}>
              <GlowCard className="group h-full rounded-2xl border border-border bg-card/70 transition-colors hover:bg-card">
                <Link href={labPath(t.slug)} className="relative flex h-full flex-col gap-4 rounded-2xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl ring-1 ring-white/10" style={{ background: `rgb(${t.tint} / 0.12)`, color: `rgb(${t.tint})` }}>
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <ArrowUpRightIcon aria-hidden className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground motion-reduce:transition-none" />
                  </div>
                  <Preview slug={t.slug} tint={t.tint} />
                  <div className="flex flex-col gap-1">
                    <h2 className="text-base font-semibold tracking-tight">{t.name}</h2>
                    <p className="text-sm text-muted-foreground">{t.tagline}</p>
                  </div>
                </Link>
              </GlowCard>
            </Item>
          )
        })}
      </Stagger>
    </div>
  )
}

/** A small static hint of what each tool shows. */
function Preview({ slug, tint }: { slug: LabToolSlug; tint: string }) {
  const box = "flex h-16 items-center rounded-xl border border-white/[0.06] bg-black/25 px-3"
  switch (slug) {
    case "vram":
      return (
        <div aria-hidden className={box}>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <span className="h-full w-[52%] bg-ion" />
            <span className="h-full w-[18%] bg-[#9fe3cf]" />
            <span className="h-full w-[9%] bg-[#e9c79a]" />
            <span className="h-full w-[7%] bg-[#5d6577]" />
          </div>
        </div>
      )
    case "tokens":
      return (
        <div aria-hidden className={`${box} gap-1 overflow-hidden font-mono text-[11px]`}>
          {["Hel", "lo", " wor", "ld", " 你", "好", " مر", "حبا"].map((x, i) => (
            <span key={i} className="shrink-0 rounded px-1 py-0.5 whitespace-pre" style={{ background: `rgb(${tint} / ${0.08 + (i % 3) * 0.06})`, color: `rgb(${tint})` }}>
              {x}
            </span>
          ))}
        </div>
      )
    case "licences":
      return (
        <div aria-hidden className={`${box} gap-1.5 text-[11px] font-medium`}>
          <span className="rounded-full bg-ok/10 px-2 py-0.5 text-ok">Can</span>
          <span className="rounded-full bg-gold/10 px-2 py-0.5 text-gold">Must</span>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">Can&rsquo;t</span>
        </div>
      )
    case "model-card":
    case "dataset-card":
      return (
        <div aria-hidden className={`${box} flex-col items-start justify-center gap-1.5`}>
          <span className="h-2 w-1/3 rounded-full" style={{ background: `rgb(${tint} / 0.7)` }} />
          <span className="h-1.5 w-4/5 rounded-full bg-white/15" />
          <span className="h-1.5 w-3/5 rounded-full bg-white/10" />
        </div>
      )
    case "prompts":
      return (
        <div aria-hidden className={`${box} gap-1 font-mono text-xs text-muted-foreground`}>
          Explain
          <span className="rounded px-1" style={{ background: `rgb(${tint} / 0.14)`, color: `rgb(${tint})` }}>
            {"{topic}"}
          </span>
          to
          <span className="rounded border border-dashed px-1" style={{ borderColor: `rgb(${tint} / 0.5)`, color: `rgb(${tint})` }}>
            {"{audience}"}
          </span>
        </div>
      )
  }
}
