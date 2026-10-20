import { Markdown } from "@/components/live/markdown"
import { cn } from "@/lib/utils"

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Makes known mentions stand out by turning "@Their Name" into bold text. Code spans and fenced blocks are left
 * alone, so a decorator like "@property" in code stays as written. The result is still plain Markdown.
 */
export function highlightMentions(source: string, names: string[] = []): string {
  const tokens = [...new Set(names.filter(Boolean).map((n) => `@${n}`))].sort((a, b) => b.length - a.length)
  if (!tokens.length || !source.includes("@")) return source
  const re = new RegExp(`(^|[\\s(])(${tokens.map(escapeRe).join("|")})(?=$|[\\s.,;:!?)])`, "giu")
  return source
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(re, (_, lead: string, at: string) => `${lead}**${at}**`)))
    .join("")
}

/**
 * A forum post's text: Markdown rendered by the shared safe renderer (no raw HTML is ever injected; links and
 * images are filtered there). `names` are members' display names in this thread, so "@Their Name" is highlighted.
 */
export function PostBody({ source, names, lang, className }: { source: string; names?: string[]; lang?: string; className?: string }) {
  return (
    <div lang={lang} className={cn("[&>div>:first-child]:mt-0 [&>div>:last-child]:mb-0", className)}>
      <Markdown source={highlightMentions(source, names)} ctx={{ source: "none" }} className="max-w-[72ch]" embeds />
    </div>
  )
}
