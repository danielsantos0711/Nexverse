"use client"

import { useSyncExternalStore } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useCopy } from "@/lib/content"
import { cn } from "@/lib/utils"

/** True on Apple devices, where shortcuts use ⌘ instead of Ctrl. */
export function useIsMac() {
  return useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent),
    () => false
  )
}

/** "Mod+Shift+K" as key caps: ⌘ ⇧ K on a Mac, Ctrl Shift K elsewhere. */
export function Keys({ combo, className }: { combo: string; className?: string }) {
  const mac = useIsMac()
  const caps = combo.split("+").map((k) => {
    if (k === "Mod") return mac ? "⌘" : "Ctrl"
    if (k === "Shift") return mac ? "⇧" : "Shift"
    if (k === "Alt") return mac ? "⌥" : "Alt"
    if (k === "Enter") return mac ? "↩" : "Enter"
    return k
  })
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {caps.map((c, i) => (
        <kbd
          key={i}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-white/15 bg-gradient-to-b from-white/[0.12] to-white/[0.03] px-1 font-sans text-[11px] font-medium text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_0_rgba(0,0,0,0.4)]"
        >
          {c}
        </kbd>
      ))}
    </span>
  )
}

/** Every shortcut the editor knows, in the order the help lists them. */
export const SHORTCUTS: { group: string; items: { label: string; combo: string }[] }[] = [
  {
    group: "Text",
    items: [
      { label: "Bold", combo: "Mod+B" },
      { label: "Italic", combo: "Mod+I" },
      { label: "Strikethrough", combo: "Mod+Shift+X" },
      { label: "Inline code", combo: "Mod+E" },
      { label: "Link", combo: "Mod+K" },
    ],
  },
  {
    group: "Blocks",
    items: [
      { label: "Heading 1, 2, 3", combo: "Mod+Alt+1" },
      { label: "Bulleted list", combo: "Mod+Shift+8" },
      { label: "Numbered list", combo: "Mod+Shift+7" },
      { label: "Task list", combo: "Mod+Shift+9" },
      { label: "Quote", combo: "Mod+Shift+." },
      { label: "Code block", combo: "Mod+Alt+C" },
      { label: "Indent or outdent a list item", combo: "Tab" },
    ],
  },
  {
    group: "Editor",
    items: [
      { label: "Commands menu", combo: "/" },
      { label: "Mention someone", combo: "@" },
      { label: "Emoji by name", combo: ":" },
      { label: "Switch write and preview", combo: "Mod+Shift+P" },
      { label: "Focus mode", combo: "Mod+Shift+F" },
      { label: "Send or save", combo: "Mod+Enter" },
      { label: "This list", combo: "Mod+/" },
    ],
  },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const title = useCopy("editor.shortcuts.title", "Keyboard shortcuts")
  const lead = useCopy("editor.shortcuts.lead", "Markdown works as you type too: # for a heading, - for a list, > for a quote, ``` for code.")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{lead}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {SHORTCUTS.map((g) => (
            <section key={g.group} aria-label={g.group} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">{g.group}</h3>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card/40">
                {g.items.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>{s.label}</span>
                    <Keys combo={s.combo} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
