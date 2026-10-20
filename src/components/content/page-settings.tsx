"use client"

import { ImageUpIcon, Loader2Icon, XIcon } from "lucide-react"
import { useRef, useState } from "react"
import { ChoiceCards } from "@/components/admin/controls"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { defaultPageVisibility } from "@/components/moderation/site-guard"
import { useCaps } from "@/lib/caps"
import { saveContent, seoKey, useContentValues, VISIBILITIES, visibilityKey, isVisibility, type Seo, type Visibility } from "@/lib/content"
import { MEDIA_MAX, MEDIA_TYPES, uploadMedia } from "@/lib/pages"
import { useRole } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { announce } from "./status"

/*
 * Per-page settings shared by the on-page editor panel and the admin site editor: what search engines and
 * share cards show (title, description, image), and who may see the page. Both are rows in site_content:
 * "seo.<route>" and "visibility.<route>", where <route> is the site-map path ("/forum", "/forum/c/[slug]").
 */

const TITLE_MAX = 70
const DESC_MAX = 200

function readSeo(values: Record<string, unknown>, route: string): Seo {
  const raw = values[seoKey(route)] as Partial<Seo> | undefined
  const s = (v: unknown) => (typeof v === "string" ? v : "")
  return { title: s(raw?.title), description: s(raw?.description), image: s(raw?.image) }
}

/** Title, description and share image for one route. */
export function SeoForm({ route, defaultTitle, compact }: { route: string; defaultTitle?: string; compact?: boolean }) {
  const values = useContentValues()
  const saved = readSeo(values, route)
  const [draft, setDraft] = useState<Seo | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const v = draft ?? saved
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const empty = !saved.title && !saved.description && !saved.image
  const idp = `seo-${route.replace(/[^a-z0-9]+/gi, "-")}`

  async function save(next: Seo | null) {
    setBusy(true)
    try {
      const clean = next && { title: next.title.trim(), description: next.description.trim(), image: next.image.trim() }
      const blank = !clean || (!clean.title && !clean.description && !clean.image)
      if (clean?.title && clean.title.length > TITLE_MAX) throw new Error(`Titles are up to ${TITLE_MAX} characters.`)
      if (clean?.description && clean.description.length > DESC_MAX) throw new Error(`Descriptions are up to ${DESC_MAX} characters.`)
      if (clean?.image && !/^https:\/\//.test(clean.image)) throw new Error("The share image must be an https:// address. Upload one to get it.")
      await saveContent(seoKey(route), "block", blank ? null : clean, { path: route.includes("[") ? undefined : route })
      setDraft(null)
      announce(true, blank ? "Search and share details are back to the defaults." : "Saved. Search engines pick it up on their next visit.")
    } catch (err) {
      announce(false, (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function upload(f: File) {
    setUploading(true)
    try {
      const url = await uploadMedia(f)
      setDraft({ ...v, image: url })
      announce(true, "Image uploaded. Save to use it.")
    } catch (err) {
      announce(false, (err as Error).message)
    } finally {
      setUploading(false)
      if (file.current) file.current.value = ""
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty) void save(v)
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idp}-t`} className="text-sm font-medium">
          Title
        </label>
        <Input id={`${idp}-t`} value={v.title} maxLength={TITLE_MAX + 10} placeholder={defaultTitle ?? "The page's own title"} onChange={(e) => setDraft({ ...v, title: e.target.value })} className="h-9 bg-background/60" />
        <p className={cn("text-xs text-muted-foreground", v.title.length > TITLE_MAX && "text-destructive")}>
          {v.title.length}/{TITLE_MAX} · Shown in search results and browser tabs. Empty keeps the built-in title.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idp}-d`} className="text-sm font-medium">
          Description
        </label>
        <Textarea id={`${idp}-d`} rows={compact ? 2 : 3} value={v.description} maxLength={DESC_MAX + 20} onChange={(e) => setDraft({ ...v, description: e.target.value })} className="bg-background/60" />
        <p className={cn("text-xs text-muted-foreground", v.description.length > DESC_MAX && "text-destructive")}>
          {v.description.length}/{DESC_MAX} · One or two sentences for search results and share cards.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id={`${idp}-i`}>
          Share image
        </span>
        <div className="flex flex-wrap items-center gap-3" aria-labelledby={`${idp}-i`}>
          {v.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- a remote image from the site's media bucket, any size
            <img src={v.image} alt="Share image preview" className="h-16 w-28 rounded-lg border border-border object-cover" />
          ) : (
            <span className="grid h-16 w-28 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">None</span>
          )}
          <div className="flex flex-wrap gap-2">
            <input ref={file} type="file" accept={MEDIA_TYPES.join(",")} className="sr-only" id={`${idp}-f`} onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => file.current?.click()}>
              {uploading ? <Loader2Icon aria-hidden className="animate-spin" /> : <ImageUpIcon aria-hidden />}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            {v.image && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...v, image: "" })}>
                <XIcon aria-hidden /> Remove
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">1200 × 630 works best. PNG, JPEG, WebP, GIF or AVIF, up to {MEDIA_MAX / 1024 / 1024} MB.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!dirty || busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {dirty && (
          <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)}>
            Discard
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={empty || busy} onClick={() => void save(null)}>
          Reset to default
        </Button>
      </div>
    </form>
  )
}

/** Who may see a route. Admins (and members with settings.manage) only; others see it read only. */
export function VisibilityForm({ route, membersOnly }: { route: string; membersOnly?: boolean }) {
  const values = useContentValues()
  const caps = useCaps()
  const me = useRole()
  const allowed = me.isAdmin || caps.can("settings.manage")
  const raw = values[visibilityKey(route)]
  // Nobody chose: the site guard's built-in default for this kind of page (members only for chat, staff for admin…).
  const fallback = defaultPageVisibility(route) as Visibility
  const current: Visibility = isVisibility(raw) ? raw : fallback
  const [busy, setBusy] = useState(false)

  async function choose(next: Visibility) {
    if (next === current || !allowed) return
    setBusy(true)
    try {
      // Choosing the default removes the override (null), so the page follows the built-in default again.
      await saveContent(visibilityKey(route), "block", next === fallback ? null : next)
      announce(true, `Now visible to: ${VISIBILITIES.find((x) => x.id === next)!.label.toLowerCase()}.`)
    } catch (err) {
      announce(false, (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", busy && "opacity-70")}>
      {allowed ? (
        <ChoiceCards name={`vis-${route}`} label="Who can see this page" columns={2} value={current} options={VISIBILITIES} onChange={(v) => void choose(v)} />
      ) : (
        <p className="text-sm">
          Visible to: <strong>{VISIBILITIES.find((x) => x.id === current)!.label}</strong>. Only admins change who sees a page.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Default for this page: {VISIBILITIES.find((x) => x.id === fallback)?.label.toLowerCase() ?? fallback}
        {isVisibility(raw) && raw !== fallback ? " (changed)" : ""}.
        {membersOnly ? " Its forms need an account anyway." : ""}
      </p>
    </div>
  )
}
