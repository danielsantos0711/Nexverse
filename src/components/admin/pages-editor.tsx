"use client"

import Link from "next/link"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import {
  ArrowLeftIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  HistoryIcon,
  ImagePlusIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  Undo2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { Notice, StatusLine, SwitchRow, when } from "@/components/admin/controls"
import { MoveButtons, moved, Select, toSlug } from "@/components/pages/admin-bits"
import { PageBlocks } from "@/components/pages/page-blocks"
import { NamedIcon } from "@/components/site/icons"
import { Gate } from "@/components/moderation/gate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { loadMenuPages } from "@/lib/menus"
import {
  BLOCK_TYPES,
  blockProblem,
  createPage,
  deletePage,
  getPage,
  LIST_SOURCES,
  listMedia,
  listRevisions,
  newBlock,
  PAGE_SLUG,
  pagePath,
  pageProblems,
  parseVideo,
  safeImage,
  savePage,
  TONES,
  uploadMedia,
  type Block,
  type BlockType,
  type MediaFile,
  type PageDraft,
  type Revision,
  type SitePage,
} from "@/lib/pages"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EMPTY: PageDraft = { slug: "", title: "", description: "", blocks: [], status: "draft", showInMenu: false }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The page builder: blocks on the left, a live preview on the right (a tab on phones), drafts and publishing. */
export function PageEditor({ id }: { id: string }) {
  if (!live) return <EditorInner key={id} id={id} />
  return (
    <Gate role="moderator" cap="pages.edit" action="edit pages">
      <EditorInner key={id} id={id} />
    </Gate>
  )
}

function EditorInner({ id }: { id: string }) {
  const router = useRouter()
  const isNew = id === "new"
  const [page, setPage] = useState<SitePage | null>(null)
  const [loadError, setLoadError] = useState("")
  const [draft, setDraft] = useState<PageDraft>(EMPTY)
  const [saved, setSaved] = useState<PageDraft>(EMPTY)
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<"edit" | "preview">("edit")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loaded, setLoaded] = useState(isNew)
  const dirty = !same(draft, saved)

  useEffect(() => {
    if (isNew) return
    let on = true
    getPage(id)
      .then((p) => {
        if (!on) return
        if (!p) setLoadError("There is no page with this id. It may have been removed.")
        else {
          const d = toDraft(p)
          setPage(p)
          setDraft(d)
          setSaved(d)
        }
        setLoaded(true)
      })
      .catch((e: Error) => on && (setLoadError(e.message), setLoaded(true)))
    return () => {
      on = false
    }
  }, [id, isNew])

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const set = (patch: Partial<PageDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const setBlocks = (fn: (b: Block[]) => Block[]) => setDraft((d) => ({ ...d, blocks: fn(d.blocks) }))

  async function save(nextStatus: PageDraft["status"]) {
    const next = { ...draft, status: nextStatus }
    const found = pageProblems(next)
    setProblems(found)
    setStatus(null)
    if (found.length) {
      document.getElementById("page-problems")?.focus()
      return
    }
    setBusy(true)
    try {
      const p = isNew || !page ? await createPage(next) : await savePage(page.id, next)
      const d = toDraft(p)
      setPage(p)
      setDraft(d)
      setSaved(d)
      void loadMenuPages(true)
      setStatus({ ok: true, text: nextStatus === "published" ? (saved.status === "published" ? "Published changes are live." : "Published. The page is live.") : saved.status === "published" && !isNew ? "Unpublished: the page is a draft again." : "Draft saved." })
      if (isNew) router.replace(`/admin/pages/${p.id}` as Route)
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!page) return
    setBusy(true)
    try {
      await deletePage(page.id)
      void loadMenuPages(true)
      router.push("/admin/pages" as Route)
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message })
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  if (!loaded) return <Skeleton className="h-[32rem] w-full rounded-2xl" />
  if (loadError) {
    return (
      <Notice tone="warn" title="This page could not be opened">
        {loadError}{" "}
        <Link href={"/admin/pages" as Route} className="text-ion hover:underline">
          Back to pages
        </Link>
      </Notice>
    )
  }

  const published = saved.status === "published" && !isNew

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={"/admin/pages" as Route} />}>
          <ArrowLeftIcon aria-hidden /> Pages
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-[-0.02em]">{draft.title.trim() || (isNew ? "New page" : "Untitled page")}</h2>
        <Badge variant={published ? "secondary" : "outline"} className={!published ? "border-gold/40 text-gold" : undefined}>
          {published ? "Published" : "Draft"}
        </Badge>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={busy || (!dirty && !isNew && !published)} onClick={() => void save("draft")}>
          {published ? <Undo2Icon aria-hidden /> : <PencilIcon aria-hidden />} {published ? "Unpublish" : "Save draft"}
        </Button>
        <Button disabled={busy || (published && !dirty)} onClick={() => void save("published")}>
          <SendIcon aria-hidden /> {published ? "Publish changes" : "Publish"}
        </Button>
        {page && published && (
          <Button variant="ghost" nativeButton={false} render={<Link href={pagePath(page.slug) as Route} target="_blank" />}>
            <ExternalLinkIcon aria-hidden /> View live page
          </Button>
        )}
        {page && !published && (
          <Button variant="ghost" nativeButton={false} render={<Link href={pagePath(page.slug) as Route} target="_blank" />}>
            <EyeIcon aria-hidden /> Open draft
          </Button>
        )}
        {page && (
          <Button variant="ghost" className="ml-auto text-destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>
            <Trash2Icon aria-hidden /> Delete
          </Button>
        )}
      </div>

      <StatusLine status={status} />
      {problems.length > 0 && (
        <div id="page-problems" tabIndex={-1} role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm outline-none">
          <p className="font-medium">Fix these first:</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div role="tablist" aria-label="Editor view" className="glass flex w-fit rounded-full p-1 xl:hidden">
        {(["edit", "preview"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("rounded-full px-4 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t === "edit" ? "Edit" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn("flex min-w-0 flex-col gap-5", tab === "preview" && "hidden xl:flex")}>
          <PageFields draft={draft} set={set} slugLocked={slugTouched} onSlugTouch={() => setSlugTouched(true)} />
          <BlocksEditor blocks={draft.blocks} setBlocks={setBlocks} />
          {page && <Revisions pageId={page.id} savedAt={page.updatedAt} onRestore={(r) => set({ title: r.title, description: r.description, blocks: r.blocks })} />}
        </div>
        <div className={cn("min-w-0", tab === "edit" && "hidden xl:block")}>
          <div className="flex flex-col gap-3 xl:sticky xl:top-20">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Live preview</p>
            <SearchSnippet draft={draft} />
            <div className="xl:max-h-[calc(100dvh-12rem)] xl:overflow-y-auto rounded-2xl border border-border bg-background p-5 md:p-6">
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">{draft.title.trim() || "Untitled page"}</h1>
              {draft.description && <p className="mt-2 text-[15px] text-muted-foreground">{draft.description}</p>}
              <div className="mt-6">{draft.blocks.length ? <PageBlocks blocks={draft.blocks} preview /> : <p className="text-sm text-muted-foreground">Add a block and it appears here as you type.</p>}</div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{saved.title}”?</DialogTitle>
            <DialogDescription>The page and its revisions are removed, and links to {pagePath(saved.slug)} stop working. To take it offline but keep it, unpublish it instead.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
              Delete page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const toDraft = (p: SitePage): PageDraft => ({ slug: p.slug, title: p.title, description: p.description, blocks: p.blocks, status: p.status, showInMenu: p.showInMenu })

function PageFields({ draft, set, slugLocked, onSlugTouch }: { draft: PageDraft; set: (p: Partial<PageDraft>) => void; slugLocked: boolean; onSlugTouch: () => void }) {
  const badSlug = draft.slug !== "" && !PAGE_SLUG.test(draft.slug)
  return (
    <section aria-labelledby="page-fields-h" className="glass flex flex-col gap-4 rounded-2xl p-4 md:p-5">
      <h3 id="page-fields-h" className="text-sm font-semibold">
        Page and search
      </h3>
      <Field>
        <FieldLabel htmlFor="pg-title">Title</FieldLabel>
        <Input id="pg-title" value={draft.title} maxLength={120} onChange={(e) => set({ title: e.target.value, ...(!slugLocked ? { slug: toSlug(e.target.value, 60) } : {}) })} className="bg-background/60" />
        <FieldDescription>Shown on the page, in the browser tab and in search results.</FieldDescription>
      </Field>
      <Field data-invalid={badSlug ? true : undefined}>
        <FieldLabel htmlFor="pg-slug">Address</FieldLabel>
        <div className="flex items-center gap-1">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">/pages/</span>
          <Input id="pg-slug" value={draft.slug} maxLength={60} onChange={(e) => (onSlugTouch(), set({ slug: toSlug(e.target.value, 60) }))} className="bg-background/60 font-mono" />
        </div>
        {badSlug && <FieldError>Lowercase letters, numbers and dashes.</FieldError>}
      </Field>
      <Field>
        <div className="flex items-baseline justify-between gap-2">
          <FieldLabel htmlFor="pg-desc">Search description</FieldLabel>
          <span className={cn("text-xs tabular", draft.description.length > 160 ? "text-gold" : "text-muted-foreground")}>{draft.description.length}/300</span>
        </div>
        <Textarea id="pg-desc" value={draft.description} maxLength={300} rows={2} onChange={(e) => set({ description: e.target.value })} className="bg-background/60" />
        <FieldDescription>One or two sentences. Search engines usually show about 160 characters.</FieldDescription>
      </Field>
      <SwitchRow id="pg-menu" label="Show in menus" description="Adds the page to the footer and the phone menu (once published). You can also place it anywhere in Admin › Menus." checked={draft.showInMenu} onChange={(showInMenu) => set({ showInMenu })} />
    </section>
  )
}

function SearchSnippet({ draft }: { draft: PageDraft }) {
  return (
    <div aria-label="How the page may look in search results" className="rounded-xl border border-border bg-card/40 px-4 py-3 text-sm">
      <p className="truncate font-mono text-xs text-muted-foreground">nexverse · {pagePath(draft.slug || "your-page")}</p>
      <p className="truncate text-[15px] text-ion">{draft.title.trim() || "Untitled page"}</p>
      <p className="line-clamp-2 text-muted-foreground">{draft.description.trim() || "Add a search description so people know what the page is about."}</p>
    </div>
  )
}

// ─── Blocks ─────────────────────────────────────────────────────────────────────────────────────────────────

function BlocksEditor({ blocks, setBlocks }: { blocks: Block[]; setBlocks: (fn: (b: Block[]) => Block[]) => void }) {
  const reduce = useReducedMotion()
  const [adding, setAdding] = useState(false)
  const lastAdded = useRef<string | null>(null)

  useEffect(() => {
    if (!lastAdded.current) return
    document.getElementById(`block-${lastAdded.current}`)?.querySelector<HTMLElement>("input, textarea, select")?.focus()
    lastAdded.current = null
  }, [blocks.length])

  const add = (type: BlockType) => {
    const b = newBlock(type)
    lastAdded.current = b.id
    setBlocks((list) => [...list, b])
    setAdding(false)
  }

  return (
    <section aria-labelledby="blocks-h" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="blocks-h" className="text-sm font-semibold">
          Blocks <span className="font-normal text-muted-foreground">· {blocks.length}</span>
        </h3>
      </div>
      <ol className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {blocks.map((b, i) => (
            <motion.li
              key={b.id}
              id={`block-${b.id}`}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              <BlockCard
                block={b}
                index={i}
                count={blocks.length}
                onChange={(next) => setBlocks((list) => list.map((x) => (x.id === b.id ? next : x)))}
                onMove={(by) => setBlocks((list) => moved(list, i, by))}
                onDuplicate={() => setBlocks((list) => [...list.slice(0, i + 1), { ...structuredClone(b), id: newBlock(b.type).id }, ...list.slice(i + 1)])}
                onRemove={() => setBlocks((list) => list.filter((x) => x.id !== b.id))}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      {adding ? (
        <div className="rounded-2xl border border-ion/30 bg-ion/[0.04] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Add a block</p>
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setAdding(false)}>
              <XIcon aria-hidden />
            </Button>
          </div>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {BLOCK_TYPES.map((t) => (
              <li key={t.type}>
                <button
                  type="button"
                  onClick={() => add(t.type)}
                  className="pressable flex w-full items-start gap-2.5 rounded-xl border border-border bg-card/60 px-3 py-2.5 text-left transition-colors hover:border-ion/40 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <NamedIcon name={t.icon} className="mt-0.5 size-4 shrink-0 text-ion" />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{t.blurb}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Button variant="secondary" className="self-start" disabled={blocks.length >= 80} onClick={() => setAdding(true)}>
          <PlusIcon aria-hidden /> Add a block
        </Button>
      )}
    </section>
  )
}

function BlockCard({
  block,
  index,
  count,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: Block
  index: number
  count: number
  onChange: (b: Block) => void
  onMove: (by: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const meta = BLOCK_TYPES.find((t) => t.type === block.type)!
  const problem = block.type === "divider" ? null : blockProblem(block)
  const label = `${meta.label} block ${index + 1}`
  return (
    <div className="rounded-2xl border border-border bg-card/50">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <NamedIcon name={meta.icon} className="size-4 text-ion" />
        <span className="text-sm font-medium">{meta.label}</span>
        {problem && <span className="hidden truncate text-xs text-gold sm:inline">· {problem}</span>}
        <span className="ml-auto flex items-center">
          <MoveButtons index={index} count={count} label={label} onMove={onMove} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Duplicate ${label}`} onClick={onDuplicate}>
            <CopyIcon aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${label}`} onClick={onRemove}>
            <Trash2Icon aria-hidden />
          </Button>
        </span>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <BlockFields block={block} onChange={onChange} />
      </div>
    </div>
  )
}

const area = "bg-background/60"

function BlockFields({ block: b, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const fid = (k: string) => `${b.id}-${k}`
  switch (b.type) {
    case "heading":
      return (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Field className="flex-1">
            <FieldLabel htmlFor={fid("t")} className="sr-only">
              Heading text
            </FieldLabel>
            <Input id={fid("t")} value={b.text} maxLength={160} placeholder="Section title" onChange={(e) => onChange({ ...b, text: e.target.value })} className={area} />
          </Field>
          <Select aria-label="Heading size" value={b.level} onChange={(e) => onChange({ ...b, level: e.target.value === "3" ? 3 : 2 })} className="sm:w-40">
            <option value={2} className="bg-popover">
              Section
            </option>
            <option value={3} className="bg-popover">
              Subsection
            </option>
          </Select>
        </div>
      )
    case "text":
      return (
        <Field>
          <FieldLabel htmlFor={fid("md")} className="sr-only">
            Text in Markdown
          </FieldLabel>
          <Textarea id={fid("md")} value={b.markdown} rows={6} maxLength={20000} placeholder="Write here. **bold**, _italic_, [links](/forum), lists with -" onChange={(e) => onChange({ ...b, markdown: e.target.value })} className={cn(area, "font-mono text-sm")} />
          <FieldDescription>Markdown: **bold**, _italic_, [a link](/forum), - lists, `code`.</FieldDescription>
        </Field>
      )
    case "image":
      return (
        <>
          <ImageField id={fid("src")} value={b.src} onChange={(src) => onChange({ ...b, src })} />
          <Field>
            <FieldLabel htmlFor={fid("alt")}>Alt text</FieldLabel>
            <Input id={fid("alt")} value={b.alt} maxLength={200} placeholder="What the image shows, for people who cannot see it" onChange={(e) => onChange({ ...b, alt: e.target.value })} className={area} />
          </Field>
          <Field>
            <FieldLabel htmlFor={fid("cap")}>Caption (optional)</FieldLabel>
            <Input id={fid("cap")} value={b.caption} maxLength={300} onChange={(e) => onChange({ ...b, caption: e.target.value })} className={area} />
          </Field>
          <SwitchRow id={fid("wide")} label="Full width" checked={b.wide} onChange={(wide) => onChange({ ...b, wide })} />
        </>
      )
    case "callout":
      return (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Callout title" value={b.title} maxLength={120} placeholder="Title" onChange={(e) => onChange({ ...b, title: e.target.value })} className={cn(area, "flex-1")} />
            <Select aria-label="Callout style" value={b.tone} onChange={(e) => onChange({ ...b, tone: e.target.value as typeof b.tone })} className="sm:w-40">
              {TONES.map((t) => (
                <option key={t.id} value={t.id} className="bg-popover">
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <Textarea aria-label="Callout text (Markdown)" value={b.body} rows={3} maxLength={2000} placeholder="What people should know" onChange={(e) => onChange({ ...b, body: e.target.value })} className={area} />
        </>
      )
    case "buttons":
      return (
        <>
          {b.items.map((it, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-2 sm:flex-row sm:items-center">
              <Input aria-label={`Button ${i + 1} label`} value={it.label} maxLength={40} placeholder="Label" onChange={(e) => onChange({ ...b, items: b.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className={cn(area, "sm:w-40")} />
              <Input aria-label={`Button ${i + 1} link`} value={it.href} maxLength={400} placeholder="/forum or https://…" onChange={(e) => onChange({ ...b, items: b.items.map((x, j) => (j === i ? { ...x, href: e.target.value.trim() } : x)) })} className={cn(area, "flex-1 font-mono text-sm")} />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={it.primary} onChange={(e) => onChange({ ...b, items: b.items.map((x, j) => (j === i ? { ...x, primary: e.target.checked } : x)) })} className="size-4 accent-(--ion)" /> Main
              </label>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove button ${i + 1}`} onClick={() => onChange({ ...b, items: b.items.filter((_, j) => j !== i) })}>
                <XIcon aria-hidden />
              </Button>
            </div>
          ))}
          {b.items.length < 3 && (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange({ ...b, items: [...b.items, { label: "", href: "", primary: false }] })}>
              <PlusIcon aria-hidden /> Add a button
            </Button>
          )}
        </>
      )
    case "faq":
      return (
        <>
          {b.items.map((it, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-2">
              <div className="flex items-center gap-2">
                <Input aria-label={`Question ${i + 1}`} value={it.q} maxLength={200} placeholder="Question" onChange={(e) => onChange({ ...b, items: b.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} className={cn(area, "flex-1")} />
                <MoveButtons index={i} count={b.items.length} label={`question ${i + 1}`} onMove={(by) => onChange({ ...b, items: moved(b.items, i, by) })} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove question ${i + 1}`} onClick={() => onChange({ ...b, items: b.items.filter((_, j) => j !== i) })}>
                  <XIcon aria-hidden />
                </Button>
              </div>
              <Textarea aria-label={`Answer ${i + 1} (Markdown)`} value={it.a} rows={2} maxLength={4000} placeholder="Answer" onChange={(e) => onChange({ ...b, items: b.items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} className={area} />
            </div>
          ))}
          {b.items.length < 30 && (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange({ ...b, items: [...b.items, { q: "", a: "" }] })}>
              <PlusIcon aria-hidden /> Add a question
            </Button>
          )}
        </>
      )
    case "list":
      return (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select aria-label="What to list" value={b.source} onChange={(e) => onChange({ ...b, source: e.target.value as typeof b.source })} className="sm:w-56">
            {LIST_SOURCES.map((s) => (
              <option key={s.id} value={s.id} className="bg-popover">
                {s.label}
              </option>
            ))}
          </Select>
          <Input aria-label="List title (optional)" value={b.title} maxLength={120} placeholder="Title (optional)" onChange={(e) => onChange({ ...b, title: e.target.value })} className={cn(area, "flex-1")} />
          <Select aria-label="How many" value={b.count} onChange={(e) => onChange({ ...b, count: Number(e.target.value) })} className="sm:w-24">
            {[3, 5, 8, 12].map((n) => (
              <option key={n} value={n} className="bg-popover">
                {n}
              </option>
            ))}
          </Select>
        </div>
      )
    case "gallery":
      return (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {b.images.map((im, i) => (
              <li key={i} className="flex flex-col gap-1.5 rounded-xl border border-border p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- a preview of the editor's own upload */}
                <img src={im.src} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
                <Input aria-label={`Image ${i + 1} alt text`} value={im.alt} maxLength={200} placeholder="Alt text" onChange={(e) => onChange({ ...b, images: b.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} className={cn(area, "h-8 text-xs")} />
                <span className="flex items-center justify-between">
                  <MoveButtons index={i} count={b.images.length} label={`image ${i + 1}`} onMove={(by) => onChange({ ...b, images: moved(b.images, i, by) })} />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove image ${i + 1}`} onClick={() => onChange({ ...b, images: b.images.filter((_, j) => j !== i) })}>
                    <XIcon aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {b.images.length < 24 && <ImageField id={`${b.id}-add`} value="" addLabel="Add an image" onChange={(src) => src && onChange({ ...b, images: [...b.images, { src, alt: "" }] })} />}
        </>
      )
    case "video":
      return <VideoField block={b} onChange={onChange} />
    case "columns":
      return (
        <>
          <div className={cn("grid grid-cols-1 gap-2", b.columns.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
            {b.columns.map((c, i) => (
              <Textarea key={i} aria-label={`Column ${i + 1} (Markdown)`} value={c} rows={5} maxLength={6000} placeholder={`Column ${i + 1}`} onChange={(e) => onChange({ ...b, columns: b.columns.map((x, j) => (j === i ? e.target.value : x)) })} className={cn(area, "text-sm")} />
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange({ ...b, columns: b.columns.length === 3 ? b.columns.slice(0, 2) : [...b.columns, ""] })}>
            {b.columns.length === 3 ? "Use two columns" : "Use three columns"}
          </Button>
        </>
      )
    case "divider":
      return <p className="text-sm text-muted-foreground">A thin line between sections. Nothing to set.</p>
  }
}

function VideoField({ block: b, onChange }: { block: Extract<Block, { type: "video" }>; onChange: (b: Block) => void }) {
  const [url, setUrl] = useState(b.videoId ? (b.provider === "youtube" ? `https://www.youtube.com/watch?v=${b.videoId}` : `https://vimeo.com/${b.videoId}`) : "")
  const [error, setError] = useState("")
  return (
    <>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`${b.id}-url`}>YouTube or Vimeo link</FieldLabel>
        <Input
          id={`${b.id}-url`}
          value={url}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(e) => {
            setUrl(e.target.value)
            const v = parseVideo(e.target.value)
            setError(e.target.value.trim() && !v ? "That is not a YouTube or Vimeo link." : "")
            onChange({ ...b, provider: v?.provider ?? b.provider, videoId: v?.videoId ?? "" })
          }}
          className={cn(area, "font-mono text-sm")}
        />
        <FieldDescription>The player loads only when someone presses play (YouTube without cookies, Vimeo with do-not-track).</FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Input aria-label="Video title" value={b.title} maxLength={160} placeholder="Title, also read out by screen readers" onChange={(e) => onChange({ ...b, title: e.target.value })} className={area} />
    </>
  )
}

/** An image: upload to the site's media library, pick one already there, or paste an https address. */
function ImageField({ id, value, onChange, addLabel }: { id: string; value: string; onChange: (src: string) => void; addLabel?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [library, setLibrary] = useState<MediaFile[] | null>(null)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const file = useRef<HTMLInputElement>(null)

  async function upload(f: File | undefined) {
    if (!f) return
    setBusy(true)
    setError("")
    try {
      onChange(await uploadMedia(f))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value && !addLabel && (
        // eslint-disable-next-line @next/next/no-img-element -- a preview of the chosen image
        <img src={value} alt="" className="max-h-48 w-full rounded-xl border border-border object-cover" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} id={id} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => file.current?.click()}>
          <UploadIcon aria-hidden /> {busy ? "Uploading…" : addLabel ?? (value ? "Replace" : "Upload")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(true)
            void listMedia().then(setLibrary)
          }}
        >
          <ImagePlusIcon aria-hidden /> Media library
        </Button>
      </div>
      <div className="flex gap-2">
        <Input aria-label="Or paste an https image address" value={url} placeholder="…or paste an https image address" onChange={(e) => setUrl(e.target.value)} className={cn(area, "h-8 flex-1 text-xs")} />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!url.trim()}
          onClick={() => {
            const s = safeImage(url)
            if (!s) return setError("Use an https address.")
            setError("")
            onChange(s)
            setUrl("")
          }}
        >
          Use
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Media library</DialogTitle>
            <DialogDescription>Images uploaded for pages. Pick one to use it.</DialogDescription>
          </DialogHeader>
          {!library ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : library.length ? (
            <ul className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
              {library.map((m) => (
                <li key={m.name}>
                  <button
                    type="button"
                    onClick={() => (onChange(m.url), setOpen(false))}
                    className="block w-full overflow-hidden rounded-lg border border-border hover:border-ion/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Use ${m.name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails from the site's own bucket */}
                    <img src={m.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No images yet. Upload one from a block and it appears here.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Revisions({ pageId, savedAt, onRestore }: { pageId: string; savedAt: string; onRestore: (r: Revision) => void }) {
  const [list, setList] = useState<Revision[] | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    let on = true
    void listRevisions(pageId).then((r) => on && setList(r))
    return () => {
      on = false
    }
  }, [open, pageId, savedAt])
  return (
    <details className="group rounded-2xl border border-border bg-card/40" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <HistoryIcon aria-hidden className="size-4 text-muted-foreground" /> Revisions
        <span className="text-xs font-normal text-muted-foreground">· the last 30 saves</span>
      </summary>
      <div className="border-t border-border px-4 py-3">
        {!list ? (
          <Skeleton className="h-20 w-full" />
        ) : list.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {list.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {when(r.savedAt)}
                    {r.savedBy ? ` · ${r.savedBy}` : ""} · {r.status === "published" ? "published" : "draft"} · {r.blocks.length} blocks
                  </span>
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onRestore(r)}>
                  <Undo2Icon aria-hidden /> Load
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No revisions yet.</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Loading a revision puts it in the editor. Nothing changes on the site until you save or publish.</p>
      </div>
    </details>
  )
}
