import { CopyButton } from "@/components/hub/copy-button"
import { cn } from "@/lib/utils"

/** A fenced code block from a README: language label, copy button, horizontal scroll. */
export function CodeBlock({ code, lang, className }: { code: string; lang?: string; className?: string }) {
  const text = code.replace(/\n$/, "")
  return (
    <div className={cn("group/code relative my-4 overflow-hidden rounded-xl border border-border bg-[#07080d]", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{lang || "text"}</span>
        <CopyButton text={text} />
      </div>
      <pre tabIndex={0} className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-[#cfd8ea] focus-visible:outline-2 focus-visible:outline-ring">
        <code>{text}</code>
      </pre>
    </div>
  )
}

const LINE_MAX = 6000

/** A whole file with line numbers, for the in-site file viewer. Numbers are not selectable, so copying grabs only code. */
export function CodeView({ text, name, actions }: { text: string; name: string; actions?: React.ReactNode }) {
  const all = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n")
  const lines = all.slice(0, LINE_MAX)
  const width = String(lines.length).length
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#07080d]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="truncate font-mono text-foreground/80">{name}</span>
        <span className="flex items-center gap-3">
          <span className="tabular">
            {all.length.toLocaleString("en")} {all.length === 1 ? "line" : "lines"}
          </span>
          {actions}
          <CopyButton text={text} />
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[13px] leading-[1.6]">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} id={`L${i + 1}`} className="target:bg-ion/10 hover:bg-white/[0.02]">
                <td
                  aria-hidden
                  className="sticky left-0 bg-[#07080d] pr-3 pl-4 text-right align-top text-muted-foreground/60 select-none tabular"
                  style={{ minWidth: `${width + 2.5}ch` }}
                >
                  {i + 1}
                </td>
                <td className="pr-4 whitespace-pre text-[#cfd8ea]">{line || " "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {all.length > LINE_MAX && <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Showing the first {LINE_MAX.toLocaleString("en")} lines.</p>}
    </div>
  )
}
