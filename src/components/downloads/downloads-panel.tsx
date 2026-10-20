"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useId, useRef, useState } from "react"
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileArchiveIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FolderDownIcon,
  Loader2Icon,
  LockIcon,
  PencilIcon,
  Trash2Icon,
  UploadCloudIcon,
} from "lucide-react"
import { ConfirmDialog } from "@/components/studio/ui"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCopy } from "@/lib/content"
import { formatBytes } from "@/lib/editor/media"
import { downloadAll, downloadFile, FILE_LIMITS, fileProblem, listFiles, myUsage, removeFile, updateFile, uploadFile, type FileTargetKind, type HostedFile } from "@/lib/publish/files"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Upload = { key: string; name: string; stage: "waiting" | "hashing" | "uploading" | "saving" | "done" | "error"; error?: string }

const ICONS: [RegExp, typeof FileIcon][] = [
  [/\.(zip|tar|gz|tgz|bz2|xz|7z|rar|zst)$/i, FileArchiveIcon],
  [/\.(png|jpe?g|webp|gif|svg|avif)$/i, FileImageIcon],
  [/\.(py|ts|js|rs|go|c|cpp|h|java|rb|sh|ipynb|json|ya?ml|toml)$/i, FileCodeIcon],
  [/\.(md|txt|pdf|csv|tsv|parquet|jsonl)$/i, FileTextIcon],
]
const iconFor = (name: string) => ICONS.find(([re]) => re.test(name))?.[1] ?? FileIcon

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

/**
 * Files to download on a project or shared link: name, version, size, SHA-256, count, a button per file and
 * "Download all" as one zip. Signed-in members download; visitors see the list and a way to sign in. People who
 * can edit the page get an upload area (50 MB a file, 1 GB per member).
 */
export function DownloadsPanel({
  kind,
  targetId,
  canEdit,
  zipName,
  versions = [],
  className,
}: {
  kind: FileTargetKind
  targetId: string
  canEdit: boolean
  /** File name of "Download all", without .zip. */
  zipName: string
  /** Version names offered when uploading (the project's changelog). */
  versions?: string[]
  className?: string
}) {
  const { ready, user } = useSession()
  const path = usePathname()
  const reduce = useReducedMotion()
  const uid = useId()
  const [state, setState] = useState<{ files: HostedFile[]; available: boolean; error: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null)
  const [removing, setRemoving] = useState<HostedFile | null>(null)
  const [editing, setEditing] = useState<HostedFile | null>(null)

  const t = {
    title: useCopy("downloads.title", "Downloads"),
    signIn: useCopy("downloads.signin", "Sign in to download"),
    signInLead: useCopy("downloads.signin.lead", "Files are free for members. Signing in keeps downloads fair and the counts honest."),
    all: useCopy("downloads.all", "Download all (.zip)"),
    empty: useCopy("downloads.empty.editor", "No files yet. Add weights, data, builds or anything people should be able to download."),
    off: useCopy("downloads.off", "Downloads are not switched on for this site yet. Ask an admin to run the latest database update."),
  }

  async function load() {
    try {
      const r = await listFiles(kind, targetId)
      setState({ ...r, error: "" })
    } catch (e) {
      setState({ files: [], available: true, error: (e as Error).message })
    }
  }

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    listFiles(kind, targetId)
      .then((r) => !stale && setState({ ...r, error: "" }))
      .catch((e: Error) => !stale && setState({ files: [], available: true, error: e.message }))
    return () => {
      stale = true
    }
  }, [kind, targetId, ready, user?.id])

  if (!state) return null
  // Without the database or the files table, only editors hear about it; visitors see nothing.
  if (!state.available) {
    return canEdit && live ? (
      <section aria-labelledby={`${uid}-h`} className={cn("liquid-glass flex flex-col gap-2 rounded-2xl border border-border p-5 text-sm", className)}>
        <h2 id={`${uid}-h`} className="text-base font-semibold">
          {t.title}
        </h2>
        <p className="text-muted-foreground">{t.off}</p>
      </section>
    ) : null
  }
  const files = state.files
  if (!files.length && !canEdit) return null

  const total = files.reduce((n, f) => n + f.size, 0)
  const signedIn = Boolean(user)
  const signInHref = `/sign-in?next=${encodeURIComponent(path)}`

  async function one(f: HostedFile) {
    setBusy(f.id)
    setMessage(null)
    try {
      const n = await downloadFile(f)
      if (n !== null) setState((s) => s && { ...s, files: s.files.map((x) => (x.id === f.id ? { ...x, downloads: n } : x)) })
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function all() {
    setZip({ done: 0, total: files.length })
    setMessage(null)
    try {
      const counts = await downloadAll(files, zipName, (done, n) => setZip({ done, total: n }))
      setState((s) => s && { ...s, files: s.files.map((x) => (counts[x.id] != null ? { ...x, downloads: counts[x.id]! } : x)) })
      setMessage({ tone: "ok", text: `Saved ${files.length} files as ${zipName}.zip. Every file matched its checksum.` })
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message })
    } finally {
      setZip(null)
    }
  }

  return (
    <section aria-labelledby={`${uid}-h`} className={cn("liquid-glass flex flex-col gap-4 rounded-2xl border border-border p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 id={`${uid}-h`} className="flex items-center gap-2 text-base font-semibold">
            <FolderDownIcon aria-hidden className="size-4 text-ion" /> {t.title}
          </h2>
          {files.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {files.length} {files.length === 1 ? "file" : "files"} · {formatBytes(total)}
            </p>
          )}
        </div>
        {files.length > 1 && signedIn && (
          <Button variant="secondary" size="sm" onClick={all} disabled={zip !== null || total > FILE_LIMITS.zipBytes} title={total > FILE_LIMITS.zipBytes ? "Over 300 MB: download the files one by one" : undefined}>
            {zip ? <Loader2Icon aria-hidden className="motion-safe:animate-spin" /> : <DownloadIcon aria-hidden />}
            {zip ? `Zipping ${zip.done}/${zip.total}…` : t.all}
          </Button>
        )}
      </div>

      {!signedIn && files.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ion/25 bg-ion/[0.07] px-3.5 py-3 text-sm">
          <LockIcon aria-hidden className="size-4 shrink-0 text-ion" />
          <p className="min-w-0 flex-1 text-foreground/85">{t.signInLead}</p>
          <Button nativeButton={false} size="sm" render={<Link href={signInHref as "/sign-in"} />}>
            {t.signIn}
          </Button>
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {files.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/30">
          <AnimatePresence initial={false}>
            {files.map((f) => {
              const Icon = iconFor(f.name)
              const mine = canEdit || f.ownerId === user?.id
              return (
                <motion.li
                  key={f.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] ring-1 ring-white/10">
                      <Icon aria-hidden className="size-4 text-muted-foreground" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="truncate text-sm font-medium">{f.name}</span>
                        {f.version && <span className="rounded-full bg-ion/10 px-1.5 py-px font-mono text-[11px] text-ion">{f.version}</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="tabular">{formatBytes(f.size)}</span>
                        <span aria-hidden>·</span>
                        <Sha sha={f.sha256} />
                        <span aria-hidden>·</span>
                        <span className="tabular">
                          {f.downloads.toLocaleString("en")} {f.downloads === 1 ? "download" : "downloads"}
                        </span>
                        <span aria-hidden>·</span>
                        <time dateTime={f.createdAt}>{dateOf(f.createdAt)}</time>
                      </p>
                      {f.note && <p className="text-xs text-foreground/75">{f.note}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    {mine && (
                      <>
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${f.name}`} onClick={() => setEditing(f)}>
                          <PencilIcon aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.name}`} onClick={() => setRemoving(f)}>
                          <Trash2Icon aria-hidden />
                        </Button>
                      </>
                    )}
                    {signedIn ? (
                      <Button size="sm" onClick={() => one(f)} disabled={busy === f.id}>
                        {busy === f.id ? <Loader2Icon aria-hidden className="motion-safe:animate-spin" /> : <DownloadIcon aria-hidden />}
                        Download<span className="sr-only"> {f.name}</span>
                      </Button>
                    ) : (
                      <Button nativeButton={false} size="sm" variant="secondary" render={<Link href={signInHref as "/sign-in"} />}>
                        <LockIcon aria-hidden /> Sign in<span className="sr-only"> to download {f.name}</span>
                      </Button>
                    )}
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-sm", message.tone === "error" ? "text-destructive" : "text-ok")}>
          {message.text}
        </p>
      )}

      {canEdit && signedIn && <Uploader kind={kind} targetId={targetId} versions={versions} count={files.length} onAdded={(f) => setState((s) => s && { ...s, files: [f, ...s.files] })} />}

      {files.length > 0 && <p className="text-xs text-muted-foreground">Check a download with sha256sum (Linux), shasum -a 256 (macOS) or Get-FileHash (Windows) and compare it with the checksum above.</p>}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? "this file"}?`}
        description="It stops being downloadable for everyone, and its download count goes with it."
        confirm="Remove file"
        onConfirm={async () => {
          if (!removing) return
          await removeFile(removing)
          setState((s) => s && { ...s, files: s.files.filter((x) => x.id !== removing.id) })
        }}
      />
      <EditFile
        file={editing}
        versions={versions}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          void load()
        }}
      />
    </section>
  )
}

function Sha({ sha }: { sha: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title={`SHA-256 ${sha}. Click to copy.`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(sha)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {}
      }}
      className="inline-flex items-center gap-1 rounded font-mono hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="sr-only">Copy SHA-256 checksum</span>
      sha256 {sha.slice(0, 10)}…{done ? <CheckIcon aria-hidden className="size-3 text-ok" /> : <CopyIcon aria-hidden className="size-3" />}
      <span className="sr-only" aria-live="polite">
        {done ? "Copied" : ""}
      </span>
    </button>
  )
}

const STAGE: Record<Upload["stage"], string> = { waiting: "Waiting", hashing: "Checking", uploading: "Uploading", saving: "Saving", done: "Added", error: "Failed" }

function Uploader({ kind, targetId, versions, count, onAdded }: { kind: FileTargetKind; targetId: string; versions: string[]; count: number; onAdded: (f: HostedFile) => void }) {
  const uid = useId()
  const input = useRef<HTMLInputElement>(null)
  const [version, setVersion] = useState(versions[0] ?? "")
  const [note, setNote] = useState("")
  const [queue, setQueue] = useState<Upload[]>([])
  const [drag, setDrag] = useState(false)
  const [usage, setUsage] = useState<number | null>(null)

  useEffect(() => {
    let on = true
    void myUsage().then((u) => on && setUsage(u))
    return () => {
      on = false
    }
  }, [])

  async function add(list: File[]) {
    const room = FILE_LIMITS.perPage - count
    const picked = list.slice(0, Math.max(0, room))
    const items: Upload[] = picked.map((f) => ({ key: crypto.randomUUID(), name: f.name, stage: "waiting" }))
    setQueue((q) => [...items, ...q.filter((x) => x.stage !== "done")].slice(0, 20))
    const patch = (key: string, p: Partial<Upload>) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...p } : x)))
    for (const [i, f] of picked.entries()) {
      const key = items[i].key
      const problem = fileProblem(f)
      if (problem) {
        patch(key, { stage: "error", error: problem })
        continue
      }
      try {
        const added = await uploadFile(kind, targetId, f, { version, note, onStage: (stage) => patch(key, { stage }) })
        patch(key, { stage: "done" })
        onAdded(added)
        setUsage((u) => (u === null ? u : u + added.size))
      } catch (e) {
        patch(key, { stage: "error", error: (e as Error).message })
      }
    }
  }

  const pct = usage === null ? null : Math.min(100, (usage / FILE_LIMITS.memberBytes) * 100)

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${uid}-v`}>
            Version <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id={`${uid}-v`} value={version} onChange={(e) => setVersion(e.target.value.slice(0, 40))} list={`${uid}-vl`} placeholder="1.0.0" className="h-9 bg-background/60 font-mono" />
          <datalist id={`${uid}-vl`}>
            {versions.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${uid}-n`}>
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input id={`${uid}-n`} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="e.g. 4-bit weights for laptops" className="h-9 bg-background/60" />
        </Field>
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          void add(Array.from(e.dataTransfer.files))
        }}
        className={cn(
          "flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          drag ? "border-ion/70 bg-ion/10" : "border-border bg-background/30 hover:border-ion/40 hover:bg-ion/[0.04]"
        )}
      >
        <UploadCloudIcon aria-hidden className="size-6 text-ion" />
        <span className="font-medium">Drop files here or choose them</span>
        <span className="text-xs text-muted-foreground">Up to 50 MB each and 100 per page. Checked with SHA-256 before upload.</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? [])
          e.target.value = ""
          void add(list)
        }}
      />
      {queue.length > 0 && (
        <ul aria-live="polite" className="flex flex-col gap-1 text-sm">
          {queue.map((u) => (
            <li key={u.key} className="flex items-start gap-2">
              {u.stage === "done" ? (
                <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
              ) : u.stage === "error" ? (
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive" />
              ) : (
                <Loader2Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ion motion-safe:animate-spin" />
              )}
              <span className="min-w-0 flex-1">
                <span className="truncate">{u.name}</span> <span className="text-muted-foreground">· {STAGE[u.stage]}</span>
                {u.error && <span className="block text-xs text-destructive">{u.error}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pct !== null && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Your file storage used">
            <div className={cn("h-full rounded-full", pct > 90 ? "bg-destructive" : "bg-ion")} style={{ width: `${Math.max(pct, 1)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            You use {formatBytes(usage ?? 0)} of your 1 GB for files.
          </p>
        </div>
      )}
    </div>
  )
}

function EditFile({ file, versions, onClose, onSaved }: { file: HostedFile | null; versions: string[]; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={file !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{file && <EditBody key={file.id} file={file} versions={versions} onClose={onClose} onSaved={onSaved} />}</DialogContent>
    </Dialog>
  )
}

function EditBody({ file, versions, onClose, onSaved }: { file: HostedFile; versions: string[]; onClose: () => void; onSaved: () => void }) {
  const uid = useId()
  const [name, setName] = useState(file.name)
  const [version, setVersion] = useState(file.version ?? "")
  const [note, setNote] = useState(file.note)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError("")
        try {
          await updateFile(file.id, { name: name.trim(), version: version.trim() || null, note: note.trim() })
          onSaved()
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit file</DialogTitle>
        <DialogDescription>The bytes and the checksum stay the same. Upload a new file for a new version.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={`${uid}-name`}>Name</FieldLabel>
        <Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value.slice(0, 200))} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${uid}-ver`}>Version</FieldLabel>
        <Input id={`${uid}-ver`} value={version} onChange={(e) => setVersion(e.target.value.slice(0, 40))} list={`${uid}-vl`} className="font-mono" />
        <datalist id={`${uid}-vl`}>
          {versions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${uid}-note`}>Note</FieldLabel>
        <Input id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} />
        <FieldDescription>One line on what this file is for.</FieldDescription>
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  )
}
