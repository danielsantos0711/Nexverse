"use client"

import Link from "next/link"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDownIcon, Columns2Icon, FileDiffIcon, MessageSquarePlusIcon, Rows3Icon } from "lucide-react"
import { PostBody } from "@/components/forum/post-body"
import { TimeAgo } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { encPath, readBlob, type Comment } from "@/lib/code/api"
import { diffLines, diffStats, splitLines, splitRows, toHunks, type DiffLine, type Hunk } from "@/lib/code/diff"
import { highlightLines, type Token } from "@/lib/code/highlight"
import { imageType, langOf, looksLikeText } from "@/lib/code/lang"
import type { FileChange } from "@/lib/code/tree"
import { cn } from "@/lib/utils"
import { Tokens } from "./code-view"
import { FormError, href, PersonName, plural, textareaCls } from "./ui"

/*
 * Diffs between two trees: one collapsible card per changed file, unified or side by side, with syntax colours.
 * Blobs load when a card scrolls near the screen, so a big pull request does not download everything at once.
 * With `onComment`, every line gets a "+" to leave a review comment on it.
 */

export type DiffMode = "unified" | "split"

const MODE_KEY = "nexverse.code.diff"

export function useDiffMode(): [DiffMode, (m: DiffMode) => void] {
  const [mode, setMode] = useState<DiffMode>("unified")
  useEffect(() => {
    try {
      const v = localStorage.getItem(MODE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved preference once mounted
      if (v === "split" || v === "unified") setMode(v)
      else if (window.matchMedia("(min-width: 1100px)").matches) setMode("split")
    } catch {}
  }, [])
  return [
    mode,
    (m) => {
      setMode(m)
      try {
        localStorage.setItem(MODE_KEY, m)
      } catch {}
    },
  ]
}

export type LineComments = {
  comments: Comment[]
  onComment?: (at: { path: string; line: number; side: "old" | "new" }, body: string) => Promise<void>
}

export function DiffList({
  changes,
  oldRepo,
  newRepo,
  base,
  newRef,
  review,
}: {
  changes: FileChange[]
  oldRepo: string
  newRepo: string
  /** Repository path for "View file" links on the new side. */
  base: string
  newRef: string
  review?: LineComments
}) {
  const [mode, setMode] = useDiffMode()
  if (!changes.length) return <p className="rounded-xl border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">No files changed.</p>
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <FileDiffIcon aria-hidden className="size-4" /> {plural(changes.length, "file")} changed
        </span>
        <div className="ml-auto inline-flex rounded-full border border-border p-0.5" role="group" aria-label="Diff layout">
          {(
            [
              ["unified", Rows3Icon, "Unified"],
              ["split", Columns2Icon, "Split"],
            ] as const
          ).map(([m, Icon, label]) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-colors", mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {changes.map((c) => (
        <FileDiff key={`${c.oldPath}->${c.path}`} change={c} oldRepo={oldRepo} newRepo={newRepo} mode={mode} viewHref={c.new ? `${base}/blob/${encPath(newRef)}/${encPath(c.path)}` : null} review={review} />
      ))}
    </div>
  )
}

type Loaded = { kind: "text"; a: string[]; b: string[]; hunks: Hunk[]; added: number; removed: number; ta: Token[][]; tb: Token[][] } | { kind: "binary" | "image" | "big" }

const STATUS: Record<FileChange["status"], { label: string; cls: string }> = {
  added: { label: "Added", cls: "text-ok bg-ok/10 border-ok/25" },
  removed: { label: "Deleted", cls: "text-destructive bg-destructive/10 border-destructive/25" },
  modified: { label: "Modified", cls: "text-gold bg-gold/10 border-gold/25" },
  renamed: { label: "Renamed", cls: "text-ion bg-ion/10 border-ion/25" },
}

function FileDiff({ change, oldRepo, newRepo, mode, viewHref, review }: { change: FileChange; oldRepo: string; newRepo: string; mode: DiffMode; viewHref: string | null; review?: LineComments }) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [open, setOpen] = useState(true)
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: "800px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  useEffect(() => {
    if (!near || data) return
    let live = true
    ;(async () => {
      const size = Math.max(change.old?.size ?? 0, change.new?.size ?? 0)
      if (imageType(change.path)) return setData({ kind: "image" })
      if (size > 1_500_000) return setData({ kind: "big" })
      const [o, n] = await Promise.all([change.old ? readBlob(oldRepo, change.old.sha) : null, change.new ? readBlob(newRepo, change.new.sha) : null])
      if ((o && !looksLikeText(o.bytes)) || (n && !looksLikeText(n.bytes))) return live && setData({ kind: "binary" })
      const dec = new TextDecoder()
      const ta = o ? dec.decode(o.bytes) : ""
      const tb = n ? dec.decode(n.bytes) : ""
      const a = splitLines(ta)
      const b = splitLines(tb)
      const edits = diffLines(a, b)
      const lang = langOf(change.path)
      if (live) setData({ kind: "text", a, b, hunks: toHunks(a, b, edits, 3), ...diffStats(edits), ta: highlightLines(ta, lang), tb: highlightLines(tb, lang) })
    })().catch((err) => live && setError((err as Error).message))
    return () => {
      live = false
    }
  }, [near, data, change, oldRepo, newRepo])

  const s = STATUS[change.status]
  const fileComments = review?.comments.filter((c) => c.path === change.path) ?? []
  return (
    <div ref={ref} className="overflow-hidden rounded-xl border border-border bg-[#07080d]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-3 py-2 text-sm">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={open ? "Collapse file" : "Expand file"}>
          <ChevronDownIcon aria-hidden className={cn("size-4 transition-transform duration-200", !open && "-rotate-90")} />
        </button>
        <span className={cn("rounded-full border px-2 text-[11px] font-medium", s.cls)}>{s.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
          {change.status === "renamed" && change.oldPath ? (
            <>
              <span className="text-muted-foreground">{change.oldPath}</span> → {change.path}
            </>
          ) : (
            change.path
          )}
        </span>
        {data?.kind === "text" && (
          <span className="font-mono text-xs tabular">
            <span className="text-ok">+{data.added}</span> <span className="text-destructive">−{data.removed}</span>
          </span>
        )}
        {fileComments.length > 0 && <span className="text-xs text-muted-foreground">{plural(fileComments.length, "comment")}</span>}
        {viewHref && (
          <Link href={href(viewHref)} className="text-xs text-ion hover:underline">
            View file
          </Link>
        )}
      </div>
      {open && (
        <div className="overflow-x-auto">
          {error ? (
            <p className="p-4 text-sm text-destructive">{error}</p>
          ) : !data ? (
            <div className="h-24 animate-pulse bg-white/[0.02]" aria-label="Loading diff" />
          ) : data.kind === "binary" ? (
            <p className="p-4 text-sm text-muted-foreground">Binary file, not shown.</p>
          ) : data.kind === "image" ? (
            <p className="p-4 text-sm text-muted-foreground">Image {change.status === "removed" ? "removed" : change.status === "added" ? "added" : "changed"}. Open the file to see it.</p>
          ) : data.kind === "big" ? (
            <p className="p-4 text-sm text-muted-foreground">This file is too large to show a diff here.</p>
          ) : data.kind !== "text" ? null : data.hunks.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{change.status === "renamed" ? "Moved without changes." : "Only the file mode changed."}</p>
          ) : mode === "split" ? (
            <SplitView data={data} path={change.path} review={review} />
          ) : (
            <UnifiedView data={data} path={change.path} review={review} />
          )}
        </div>
      )}
    </div>
  )
}

const ROW: Record<DiffLine["kind"], string> = { ctx: "", del: "bg-[#ff7a70]/[0.09]", add: "bg-[#7fe0b0]/[0.09]" }
const NUM: Record<DiffLine["kind"], string> = { ctx: "text-muted-foreground/50", del: "text-[#ff9a92]/70 bg-[#ff7a70]/[0.08]", add: "text-[#9fe8c4]/70 bg-[#7fe0b0]/[0.08]" }
const SIGN = { ctx: " ", del: "−", add: "+" }

type TextData = Extract<Loaded, { kind: "text" }>

const tokensFor = (d: TextData, l: DiffLine) => (l.kind === "del" ? d.ta[(l.old ?? 1) - 1] : d.tb[(l.new ?? 1) - 1]) ?? [{ k: "plain" as const, v: l.text }]

function HunkHead({ h, cols }: { h: Hunk; cols: number }) {
  return (
    <tr className="bg-ion/[0.06] text-ion/80">
      <td colSpan={cols} className="px-4 py-1 font-mono text-xs select-none">
        @@ −{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
      </td>
    </tr>
  )
}

function UnifiedView({ data, path, review }: { data: TextData; path: string; review?: LineComments }) {
  const [composer, setComposer] = useState<string | null>(null)
  return (
    <table className="w-full border-collapse font-mono text-[13px] leading-[1.6]">
      <tbody>
        {data.hunks.map((h, hi) => (
          <Fragment key={hi}>
            <HunkHead h={h} cols={4} />
            {h.lines.map((l, li) => {
              const side: "old" | "new" = l.kind === "del" ? "old" : "new"
              const line = (side === "old" ? l.old : l.new) ?? 0
              const key = `${side}:${line}`
              const here = review?.comments.filter((c) => c.path === path && c.side === side && c.line === line) ?? []
              return (
                <Fragment key={li}>
                  <tr className={cn("group", ROW[l.kind])}>
                    <td className={cn("w-px px-2 text-right tabular select-none", NUM[l.kind])}>{l.old ?? ""}</td>
                    <td className={cn("w-px px-2 text-right tabular select-none", NUM[l.kind])}>{l.new ?? ""}</td>
                    <td className="relative w-5 pl-2 text-muted-foreground/70 select-none">
                      {review?.onComment ? <AddComment onClick={() => setComposer(key)} /> : null}
                      <span className={cn(review?.onComment && "group-hover:invisible")}>{SIGN[l.kind]}</span>
                    </td>
                    <td className="pr-6 whitespace-pre text-[#d6deec]">
                      <Tokens tokens={tokensFor(data, l)} />
                    </td>
                  </tr>
                  {(here.length > 0 || composer === key) && (
                    <tr>
                      <td colSpan={4} className="border-y border-border bg-card/70 p-3 font-sans">
                        <Thread comments={here} composing={composer === key} onCancel={() => setComposer(null)} onSend={review?.onComment ? (body) => review.onComment!({ path, line, side }, body).then(() => setComposer(null)) : undefined} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

function SplitView({ data, path, review }: { data: TextData; path: string; review?: LineComments }) {
  const [composer, setComposer] = useState<string | null>(null)
  const cell = (l: DiffLine | null, side: "old" | "new") => {
    if (!l) return [<td key="n" className="w-px bg-white/[0.015]" />, <td key="c" className="border-r border-border bg-white/[0.015]" />]
    const n = side === "old" ? l.old : l.new
    return [
      <td key="n" className={cn("relative w-px px-2 text-right tabular select-none", NUM[l.kind])}>
        {review?.onComment && n ? <AddComment onClick={() => setComposer(`${side}:${n}`)} /> : null}
        <span className={cn(review?.onComment && "group-hover/cell:invisible")}>{n}</span>
      </td>,
      <td key="c" className={cn("w-1/2 border-r border-border pr-4 pl-2 whitespace-pre text-[#d6deec]", ROW[l.kind])}>
        <Tokens tokens={tokensFor(data, l)} />
      </td>,
    ]
  }
  return (
    <table className="w-full min-w-[720px] table-fixed border-collapse font-mono text-[13px] leading-[1.6]">
      <colgroup>
        <col className="w-12" />
        <col />
        <col className="w-12" />
        <col />
      </colgroup>
      <tbody>
        {data.hunks.map((h, hi) => (
          <Fragment key={hi}>
            <HunkHead h={h} cols={4} />
            {splitRows(h).map((r, ri) => {
              const keys = [r.left?.old ? `old:${r.left.old}` : null, r.right?.new ? `new:${r.right.new}` : null].filter(Boolean) as string[]
              const here = review?.comments.filter((c) => c.path === path && keys.includes(`${c.side}:${c.line}`)) ?? []
              const composing = composer && keys.includes(composer) ? composer : null
              return (
                <Fragment key={ri}>
                  <tr className="group/cell">
                    {cell(r.left, "old")}
                    {cell(r.right, "new")}
                  </tr>
                  {(here.length > 0 || composing) && (
                    <tr>
                      <td colSpan={4} className="border-y border-border bg-card/70 p-3 font-sans whitespace-normal">
                        <Thread
                          comments={here}
                          composing={Boolean(composing)}
                          onCancel={() => setComposer(null)}
                          onSend={
                            review?.onComment && composing
                              ? (body) => {
                                  const [side, line] = composing.split(":")
                                  return review.onComment!({ path, line: Number(line), side: side as "old" | "new" }, body).then(() => setComposer(null))
                                }
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

function AddComment({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Comment on this line"
      className="absolute top-1/2 left-1 z-10 hidden size-5 -translate-y-1/2 place-items-center rounded-md bg-ion text-ion-foreground group-hover:grid group-hover/cell:grid focus-visible:grid"
    >
      <MessageSquarePlusIcon aria-hidden className="size-3" />
    </button>
  )
}

function Thread({ comments, composing, onSend, onCancel }: { comments: Comment[]; composing: boolean; onSend?: (body: string) => Promise<void>; onCancel: () => void }) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sorted = useMemo(() => [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [comments])
  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm">
      {sorted.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <PersonName person={c.author} avatar={16} /> <TimeAgo date={c.createdAt} />
          </div>
          {c.hiddenAt ? <p className="text-muted-foreground italic">Hidden by moderators.</p> : <PostBody source={c.body} />}
        </div>
      ))}
      {composing && onSend && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!body.trim()) return
            setBusy(true)
            setError(null)
            try {
              await onSend(body.trim())
              setBody("")
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
          className="flex flex-col gap-2"
        >
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} autoFocus placeholder="Leave a review comment" aria-label="Review comment" className={textareaCls} />
          <FormError message={error} />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy || !body.trim()}>
              Comment
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
