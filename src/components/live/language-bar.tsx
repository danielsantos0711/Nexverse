"use client"

import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

/** GitHub's language colours for the common ones; others get a neutral tone. */
export const LANG_COLOR: Record<string, string> = {
  Python: "#6c9bd2",
  TypeScript: "#5b8fd6",
  JavaScript: "#e6cf6a",
  Rust: "#d39a74",
  Go: "#6cc6d9",
  "C++": "#e07aa5",
  C: "#9aa3b2",
  "C#": "#7bc47f",
  "Jupyter Notebook": "#e59a5a",
  Swift: "#f08a5d",
  Java: "#c99a5b",
  Kotlin: "#a98bf0",
  Ruby: "#d0605e",
  PHP: "#8892bf",
  Shell: "#89e051",
  HTML: "#e3714f",
  CSS: "#8d6cc4",
  SCSS: "#c6538c",
  Vue: "#5cbf94",
  Svelte: "#ff6a3d",
  Dart: "#4fc3d9",
  Lua: "#6b74d6",
  Cuda: "#76b947",
  Dockerfile: "#6a8fa6",
  Makefile: "#7d9a4a",
  MDX: "#f0b85b",
  PLpgSQL: "#6f97c6",
  Zig: "#e8a53b",
  Julia: "#a270ba",
  R: "#4f8fd6",
  Scala: "#d0544d",
  Haskell: "#8a72b8",
  Elixir: "#9a7ab8",
  "Objective-C": "#6b9ae6",
  Nix: "#7e9fd8",
}

const color = (name: string) => LANG_COLOR[name] ?? "#8a93a6"

/** Share of bytes per language: a bar whose segments grow in from the left, and a legend. */
export function LanguageBar({ languages, className }: { languages: { name: string; share: number }[]; className?: string }) {
  const reduce = useReducedMotion()
  const shown = languages.filter((l) => l.share >= 0.001)
  if (!shown.length) return null
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <motion.div
        aria-hidden
        className="flex h-2 origin-left overflow-hidden rounded-full bg-secondary"
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
      >
        {shown.map((l) => (
          <span key={l.name} className="h-full border-r border-background/60 last:border-0" style={{ width: `${l.share * 100}%`, background: color(l.name) }} />
        ))}
      </motion.div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {shown.map((l) => (
          <li key={l.name} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: color(l.name) }} />
            <span className="text-foreground/90">{l.name}</span>
            <span className="text-muted-foreground tabular">{(l.share * 100).toFixed(l.share < 0.1 ? 1 : 0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
