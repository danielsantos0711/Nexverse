import type { LabToolSlug } from "./tools"
import { Copy } from "@/components/content/copy"

/*
 * A small hint of what each tool shows, drawn with CSS only. Each one moves a little when its card is
 * hovered or focused (the card is the `group`), and holds still under reduced motion.
 */

const box = "relative flex h-16 items-center overflow-hidden rounded-xl border border-white/[0.06] bg-black/25 px-3"
const move = "transition-[transform,width,opacity] duration-500 ease-[var(--ease-out)] motion-reduce:transition-none"

export function ToolPreview({ slug, tint }: { slug: LabToolSlug; tint: string }) {
  const c = (a: number) => `rgb(${tint} / ${a})`
  switch (slug) {
    case "prompts":
      return (
        <div aria-hidden className={`${box} gap-2`}>
          {[0, 1, 2].map((k) => (
            <div key={k} className="flex flex-1 flex-col gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5">
              <span className={`h-1.5 rounded-full ${move} w-1/2 group-hover:w-4/5 group-focus-visible:w-4/5`} style={{ background: c(0.75), transitionDelay: `${k * 90}ms` }} />
              <span className={`h-1 rounded-full bg-white/15 ${move} w-3/4 group-hover:w-full group-focus-visible:w-full`} style={{ transitionDelay: `${k * 90 + 60}ms` }} />
              <span className={`h-1 rounded-full bg-white/10 ${move} w-1/3 group-hover:w-2/3 group-focus-visible:w-2/3`} style={{ transitionDelay: `${k * 90 + 120}ms` }} />
            </div>
          ))}
        </div>
      )
    case "token-counter":
    case "tokens":
      return (
        <div aria-hidden className={`${box} gap-0.5 font-mono text-[11px]`}>
          {(slug === "tokens" ? ["Hel", "lo", " wor", "ld", " 你", "好", " مر", "حبا"] : ["The", " token", "izer", " cuts", " text", " into", " pieces"]).map((x, i) => (
            <span key={i} className={`shrink-0 rounded px-0.5 py-0.5 whitespace-pre ${move} group-hover:-translate-y-0.5 group-focus-visible:-translate-y-0.5`} style={{ background: c(0.08 + (i % 3) * 0.07), color: `rgb(${tint})`, transitionDelay: `${i * 40}ms` }}>
              {x}
            </span>
          ))}
        </div>
      )
    case "context":
      return (
        <div aria-hidden className={box}>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <span className="h-full w-[8%] bg-[#e9c79a]" />
            <span className={`h-full bg-ion ${move} w-[34%] group-hover:w-[44%] group-focus-visible:w-[44%]`} />
            <span className="h-full w-[14%] bg-[#c4e38f]" />
            <span className="h-full w-[12%] bg-ok" />
          </div>
        </div>
      )
    case "inference-cost":
      return (
        <div aria-hidden className={`${box} items-end gap-1.5 pb-2`}>
          {[38, 62, 24, 80, 46].map((h, i) => (
            <span key={i} className={`flex-1 origin-bottom rounded-t-sm ${move} scale-y-75 group-hover:scale-y-100 group-focus-visible:scale-y-100`} style={{ height: `${h}%`, background: c(0.25 + i * 0.1), transitionDelay: `${i * 50}ms` }} />
          ))}
        </div>
      )
    case "vram":
    case "fine-tuning":
      return (
        <div aria-hidden className={box}>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <span className={`h-full bg-ion ${move} ${slug === "vram" ? "w-[52%]" : "w-[30%]"} group-hover:w-[40%] group-focus-visible:w-[40%]`} />
            <span className="h-full w-[18%] bg-[#9fe3cf]" />
            {slug === "fine-tuning" && <span className="h-full w-[16%] bg-[#ffc58a]" />}
            <span className="h-full w-[9%] bg-[#e9c79a]" />
            <span className="h-full w-[7%] bg-[#5d6577]" />
          </div>
        </div>
      )
    case "quantization":
      return (
        <div aria-hidden className={`${box} flex-col items-stretch justify-center gap-1`}>
          {[100, 53, 30, 21].map((w, i) => (
            <span key={i} className={`h-1.5 rounded-full ${move} group-hover:opacity-100 group-focus-visible:opacity-100`} style={{ width: `${w}%`, background: c(0.3 + i * 0.15), opacity: 0.7, transitionDelay: `${i * 60}ms` }} />
          ))}
        </div>
      )
    case "rag-chunks":
      return (
        <div aria-hidden className={`${box} gap-1`}>
          {[22, 18, 26, 14, 20].map((w, i) => (
            <span key={i} className={`h-6 rounded-md ${move} group-hover:-translate-y-1 group-focus-visible:-translate-y-1 ${i % 2 ? "group-hover:translate-y-1 group-focus-visible:translate-y-1" : ""}`} style={{ width: `${w}%`, background: ["rgb(143 180 255 / .25)", "rgb(127 224 176 / .25)", "rgb(216 197 158 / .25)", "rgb(211 180 255 / .25)", "rgb(255 159 138 / .25)"][i], transitionDelay: `${i * 50}ms` }} />
          ))}
        </div>
      )
    case "embeddings":
      return (
        <div aria-hidden className={`${box} justify-center`}>
          <div className="grid grid-cols-6 gap-0.5">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className={`size-3.5 rounded-[3px] ${move} group-hover:scale-90 group-focus-visible:scale-90`} style={{ background: c(0.1 + (((i * 7) % 5) / 5) * 0.6), transitionDelay: `${i * 25}ms` }} />
            ))}
          </div>
        </div>
      )
    case "json-schema":
      return (
        <div aria-hidden className={`${box} font-mono text-[11px] leading-tight text-muted-foreground`}>
          <span>
            {"{ "}
            <span style={{ color: `rgb(${tint})` }}>&quot;label&quot;</span>: <span className="text-ok">enum</span>,{" "}
            <span className={`inline-block ${move} opacity-40 group-hover:opacity-100 group-focus-visible:opacity-100`}>
              <span style={{ color: `rgb(${tint})` }}>&quot;score&quot;</span>: <span className="text-gold">0–1</span>
            </span>
            {" }"}
          </span>
        </div>
      )
    case "regex":
      return (
        <div aria-hidden className={`${box} gap-1 font-mono text-[11px] text-muted-foreground`}>
          mail
          <span className={`rounded px-1 ${move} group-hover:bg-[rgb(255_159_138/0.3)] group-focus-visible:bg-[rgb(255_159_138/0.3)]`} style={{ background: c(0.14), color: `rgb(${tint})` }}>
            ana@lab.io
          </span>
          or
          <span className={`rounded px-1 ${move} delay-100 group-hover:bg-[rgb(255_159_138/0.3)] group-focus-visible:bg-[rgb(255_159_138/0.3)]`} style={{ background: c(0.14), color: `rgb(${tint})` }}>
            ops@x.org
          </span>
        </div>
      )
    case "licences":
    case "licence-compare":
      return (
        <div aria-hidden className={`${box} gap-1.5 text-[11px] font-medium`}>
          <span className={`rounded-full bg-ok/10 px-2 py-0.5 text-ok ${move} group-hover:-translate-y-0.5`}>Can</span>
          <span className={`rounded-full bg-gold/10 px-2 py-0.5 text-gold ${move} delay-75 group-hover:-translate-y-0.5`}>Must</span>
          <span className={`rounded-full bg-destructive/10 px-2 py-0.5 text-destructive ${move} delay-150 group-hover:-translate-y-0.5`}>Can&rsquo;t</span>
          {slug === "licence-compare" && <span className="ml-auto text-muted-foreground"><Copy k="lab-tool.previews.a-b-c">A · B · C</Copy></span>}
        </div>
      )
    case "model-card":
    case "dataset-card":
      return (
        <div aria-hidden className={`${box} flex-col items-start justify-center gap-1.5`}>
          <span className={`h-2 rounded-full ${move} w-1/3 group-hover:w-1/2 group-focus-visible:w-1/2`} style={{ background: c(0.7) }} />
          <span className={`h-1.5 rounded-full bg-white/15 ${move} w-3/5 group-hover:w-4/5 group-focus-visible:w-4/5`} />
          <span className={`h-1.5 rounded-full bg-white/10 ${move} w-2/5 group-hover:w-3/5 group-focus-visible:w-3/5`} />
        </div>
      )
  }
}
