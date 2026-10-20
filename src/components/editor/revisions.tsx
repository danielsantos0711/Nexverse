"use client"

import { useEffect, useState } from "react"
import { HistoryIcon, RotateCcwIcon } from "lucide-react"
import { Markdown } from "@/components/live/markdown"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { listRevisions, type ProjectRevision } from "@/lib/projects"
import { cn } from "@/lib/utils"

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

/**
 * Version history of a project's text: every save that changed the name, summary or README keeps the text it
 * replaced. Pick one to read it, then bring it back into the editor (nothing is saved until you save).
 */
export function RevisionsDialog({ projectId, open, onOpenChange, onRestore }: { projectId: string; open: boolean; onOpenChange: (v: boolean) => void; onRestore: (r: ProjectRevision) => void }) {
  const [list, setList] = useState<ProjectRevision[] | null>(null)
  const [pick, setPick] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let stale = false
    listRevisions(projectId)
      .then((l) => {
        if (stale) return
        setList(l)
        setPick(l[0]?.id ?? null)
      })
      .catch(() => !stale && setList([]))
    return () => {
      stale = true
    }
  }, [open, projectId])

  const chosen = list?.find((r) => r.id === pick) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon aria-hidden className="size-4" /> Version history
          </DialogTitle>
          <DialogDescription>Earlier texts of this project, kept each time someone saved a change to the name, summary or README.</DialogDescription>
        </DialogHeader>
        {list === null ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading history…</p>
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No earlier versions yet. They appear here after the first saved change.</p>
        ) : (
          <div className="grid min-h-0 gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
            <ul aria-label="Saved versions" className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto md:pr-1">
              {list.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={r.id === pick}
                    onClick={() => setPick(r.id)}
                    className={cn(
                      "flex w-full flex-col rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      r.id === pick ? "border-ion/50 bg-ion/10" : "border-transparent hover:bg-white/[0.05]"
                    )}
                  >
                    <span className="font-medium">{when(r.createdAt)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {r.editor ? `Replaced by ${r.editor.name}` : "Replaced"} · {r.readme.length.toLocaleString("en")} characters
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {chosen && (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="rounded-xl border border-border bg-card/40 px-4 py-3">
                  <p className="font-medium">{chosen.name}</p>
                  <p className="text-sm text-muted-foreground">{chosen.summary}</p>
                </div>
                <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-border bg-background/40 p-4">
                  {chosen.readme.trim() ? <Markdown source={chosen.readme} ctx={{ source: "none" }} embeds /> : <p className="text-sm text-muted-foreground">The README was empty.</p>}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return
              onRestore(chosen)
              onOpenChange(false)
            }}
          >
            <RotateCcwIcon aria-hidden /> Bring this version back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
