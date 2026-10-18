"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { LIMITS, type ProjectVersion } from "@/lib/projects"

const today = () => new Date().toISOString().slice(0, 10)

/** Suggests the next version after the newest one: 1.2.3 → 1.2.4, v2 → v3, otherwise 1.0.0. */
function nextVersion(list: ProjectVersion[]) {
  const last = list[0]?.version
  if (!last) return "1.0.0"
  const m = last.match(/^(.*?)(\d+)([^\d]*)$/)
  return m ? `${m[1]}${Number(m[2]) + 1}${m[3]}` : `${last}-next`
}

type Row = ProjectVersion & { key: string }

/** The changelog: one row per release, newest first. Rows keep a stable key so edits never jump. */
export function VersionsEditor({ value, onChange, describedBy }: { value: Row[]; onChange: (rows: Row[]) => void; describedBy?: string }) {
  const reduce = useReducedMotion()
  const firstInput = useRef<HTMLInputElement>(null)

  function add() {
    onChange([{ key: crypto.randomUUID(), version: nextVersion(value), notes: "", releasedOn: today() }, ...value])
    requestAnimationFrame(() => firstInput.current?.focus())
  }

  const edit = (key: string, patch: Partial<ProjectVersion>) => onChange(value.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <div className="flex flex-col gap-3" aria-describedby={describedBy}>
      <Button type="button" variant="secondary" onClick={add} disabled={value.length >= LIMITS.versions} className="self-start">
        <PlusIcon aria-hidden /> Add a version
      </Button>
      {value.length === 0 && <p className="text-sm text-muted-foreground">No releases listed yet. Add one when you ship something people can use.</p>}
      <ol className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {value.map((r, i) => (
            <motion.li
              key={r.key}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-3"
            >
              <fieldset className="contents">
                <legend className="sr-only">Version {r.version || i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-[10rem_11rem_1fr_auto] sm:items-end">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium">Version</span>
                    <Input
                      ref={i === 0 ? firstInput : undefined}
                      value={r.version}
                      onChange={(e) => edit(r.key, { version: e.target.value })}
                      maxLength={40}
                      placeholder="1.0.0"
                      className="h-10 bg-background/60 font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium">Released</span>
                    <Input type="date" value={r.releasedOn} onChange={(e) => edit(r.key, { releasedOn: e.target.value })} max="2100-12-31" className="h-10 bg-background/60" />
                  </label>
                  <span className="hidden sm:block" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((x) => x.key !== r.key))} aria-label={`Remove version ${r.version || i + 1}`} className="justify-self-end">
                    <Trash2Icon aria-hidden />
                  </Button>
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">What changed</span>
                  <Textarea
                    value={r.notes}
                    onChange={(e) => edit(r.key, { notes: e.target.value })}
                    maxLength={LIMITS.notes}
                    rows={2}
                    placeholder="New features, fixes, breaking changes. Markdown works."
                    className="bg-background/60"
                  />
                </label>
              </fieldset>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  )
}

export type VersionRow = Row
export const toRows = (versions: ProjectVersion[]): Row[] => versions.map((v) => ({ ...v, key: v.id ?? crypto.randomUUID() }))
export const fromRows = (rows: Row[]): ProjectVersion[] => rows.map((r) => ({ id: r.id, version: r.version, notes: r.notes, releasedOn: r.releasedOn }))
