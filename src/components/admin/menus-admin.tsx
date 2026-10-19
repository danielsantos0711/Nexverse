"use client"

import Link from "next/link"
import type { Route } from "next"
import { useEffect, useState } from "react"
import { FileTextIcon, FolderPlusIcon, PlusIcon, RotateCcwIcon, SaveIcon, Trash2Icon } from "lucide-react"
import { AdminHeading, Notice, StatusLine, SwitchRow } from "@/components/admin/controls"
import { MoveButtons, moved, Select } from "@/components/pages/admin-bits"
import { ICON_NAMES, NamedIcon } from "@/components/site/icons"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ACCENTS } from "@/lib/forum-categories"
import { DEFAULT_MENUS, LIMITS, menuProblems, saveMenus, useSavedMenus, type MenuGroup, type MenuLink, type Menus } from "@/lib/menus"
import { listPages, pagePath, type SitePage } from "@/lib/pages"
import { FEATURES, isSafeHref, useSiteSettings } from "@/lib/site-settings"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Tab = "header" | "footer" | "mobile" | "areas"
const TABS: { id: Tab; label: string }[] = [
  { id: "header", label: "Header" },
  { id: "footer", label: "Footer" },
  { id: "mobile", label: "Phone menu" },
  { id: "areas", label: "Areas" },
]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const blankLink = (): MenuLink => ({ label: "", href: "/", description: "", icon: "link", accent: "ion" })
const TINT: Record<string, string> = { ion: "text-ion", gold: "text-gold", model: "text-model", dataset: "text-dataset", tool: "text-tool", repo: "text-repo" }

/** /admin/menus: the header, footer and phone menu, plus new names for areas of the site. One save, live everywhere. */
export function MenusAdmin() {
  // Without a database there are no accounts: the screen opens read only under the shell's notice.
  if (!live) return <MenusAdminInner />
  return (
    <Gate role="moderator" cap="menus.edit" action="edit the menus">
      <MenusAdminInner />
    </Gate>
  )
}

function MenusAdminInner() {
  const { menus: saved, ready, saved: hasSaved } = useSavedMenus()
  const [draft, setDraft] = useState<Menus | null>(null)
  const [tab, setTab] = useState<Tab>("header")
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pages, setPages] = useState<SitePage[]>([])
  const value = draft ?? saved
  const dirty = draft !== null && !same(draft, saved)
  const problems = menuProblems(value)

  useEffect(() => {
    void listPages()
      .then(setPages)
      .catch(() => setPages([]))
  }, [])

  const set = (patch: Partial<Menus>) => setDraft({ ...value, ...patch })

  async function save() {
    setBusy(true)
    setStatus(null)
    try {
      await saveMenus(value)
      setDraft(null)
      setStatus({ ok: true, text: "Menus saved. Every open tab has them now." })
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <AdminHeading title="Menus" lead="What the header, footer and phone menu link to, in what order, with which icons. Links into parts of the site that are switched off disappear on their own.">
        <Button variant="ghost" disabled={busy || same(value, DEFAULT_MENUS)} onClick={() => setDraft(structuredClone(DEFAULT_MENUS))}>
          <RotateCcwIcon aria-hidden /> Start from the defaults
        </Button>
        <Button disabled={!live || busy || !dirty || problems.length > 0} onClick={() => void save()}>
          <SaveIcon aria-hidden /> {busy ? "Saving…" : "Save menus"}
        </Button>
      </AdminHeading>
      {ready && !hasSaved && <Notice title="These are the built-in menus">Nobody has saved menus yet, so the site uses these. Change anything and save to make them yours.</Notice>}
      <StatusLine status={status} />
      {dirty && problems.length > 0 && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <p className="font-medium">Before saving:</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {problems.slice(0, 6).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div role="tablist" aria-label="Menu" className="glass flex w-fit max-w-full overflow-x-auto rounded-full p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {tab === "header" && (
            <>
              <GroupsEditor groups={value.header} onChange={(header) => set({ header })} pages={pages} what="menu" withDescriptions />
              <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card/40 p-4">
                <h3 className="text-sm font-semibold">Links in the header bar</h3>
                <p className="text-sm text-muted-foreground">Up to four links that sit next to the menus, such as Explore.</p>
                <LinksEditor links={value.headerLinks} onChange={(headerLinks) => set({ headerLinks })} pages={pages} max={4} />
              </section>
            </>
          )}
          {tab === "footer" && <GroupsEditor groups={value.footer} onChange={(footer) => set({ footer })} pages={pages} what="column" />}
          {tab === "mobile" && (
            <>
              <SwitchRow id="m-same" label="Same as the header" description="The phone menu shows the header's menus. Switch off to give phones a shorter list of their own." checked={value.mobile.sameAsHeader} onChange={(on) => set({ mobile: { sameAsHeader: on, groups: on ? value.mobile.groups : value.mobile.groups.length ? value.mobile.groups : structuredClone(value.header) } })} />
              {!value.mobile.sameAsHeader && <GroupsEditor groups={value.mobile.groups} onChange={(groups) => set({ mobile: { ...value.mobile, groups } })} pages={pages} what="section" />}
            </>
          )}
          {tab === "areas" && <AreasEditor value={value} onChange={(areas) => set({ areas })} />}
        </div>
        <Preview menus={value} tab={tab} />
      </div>
    </section>
  )
}

function GroupsEditor({ groups, onChange, pages, what, withDescriptions = false }: { groups: MenuGroup[]; onChange: (g: MenuGroup[]) => void; pages: SitePage[]; what: string; withDescriptions?: boolean }) {
  const patch = (i: number, p: Partial<MenuGroup>) => onChange(groups.map((g, j) => (j === i ? { ...g, ...p } : g)))
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g, i) => (
        <section key={g.id} aria-label={g.label || `Unnamed ${what}`} className="rounded-2xl border border-border bg-card/40">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Input aria-label={`${what} name`} value={g.label} maxLength={LIMITS.groupLabel} placeholder={`Name of the ${what}`} onChange={(e) => patch(i, { label: e.target.value })} className="h-9 max-w-xs bg-background/60 font-medium" />
            <span className="ml-auto flex items-center">
              <MoveButtons index={i} count={groups.length} label={g.label || what} onMove={(by) => onChange(moved(groups, i, by))} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${g.label || what}`} onClick={() => onChange(groups.filter((_, j) => j !== i))}>
                <Trash2Icon aria-hidden />
              </Button>
            </span>
          </div>
          <div className="p-3">
            <LinksEditor links={g.links} onChange={(links) => patch(i, { links })} pages={pages} max={LIMITS.links} withDescriptions={withDescriptions} />
          </div>
        </section>
      ))}
      {groups.length < LIMITS.groups && (
        <Button type="button" variant="secondary" className="self-start" onClick={() => onChange([...groups, { id: `g${Date.now().toString(36)}`, label: "", links: [] }])}>
          <FolderPlusIcon aria-hidden /> Add a {what}
        </Button>
      )}
    </div>
  )
}

function LinksEditor({ links, onChange, pages, max, withDescriptions = false }: { links: MenuLink[]; onChange: (l: MenuLink[]) => void; pages: SitePage[]; max: number; withDescriptions?: boolean }) {
  const patch = (i: number, p: Partial<MenuLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const published = pages.filter((p) => p.status === "published")
  return (
    <div className="flex flex-col gap-2">
      {links.length === 0 && <p className="text-sm text-muted-foreground">No links yet.</p>}
      <ol className="flex flex-col gap-2">
        {links.map((l, i) => {
          const bad = !isSafeHref(l.href)
          return (
            <li key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-background/30 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] ring-1 ring-white/10", TINT[l.accent])}>
                  <NamedIcon name={l.icon} className="size-4" />
                </span>
                <Input aria-label={`Link ${i + 1} label`} value={l.label} maxLength={LIMITS.label} placeholder="Label" onChange={(e) => patch(i, { label: e.target.value })} className="h-9 min-w-32 flex-1 bg-background/60" />
                <Input
                  aria-label={`Link ${i + 1} address`}
                  aria-invalid={bad || undefined}
                  value={l.href}
                  maxLength={400}
                  placeholder="/forum"
                  onChange={(e) => patch(i, { href: e.target.value.trim() })}
                  className={cn("h-9 min-w-32 flex-1 bg-background/60 font-mono text-sm", bad && "border-destructive/60")}
                />
                <MoveButtons index={i} count={links.length} label={l.label || `link ${i + 1}`} onMove={(by) => onChange(moved(links, i, by))} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${l.label || `link ${i + 1}`}`} onClick={() => onChange(links.filter((_, j) => j !== i))}>
                  <Trash2Icon aria-hidden />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {withDescriptions && (
                  <Input aria-label={`Link ${i + 1} description`} value={l.description} maxLength={LIMITS.description} placeholder="One line under the label" onChange={(e) => patch(i, { description: e.target.value })} className="h-8 min-w-40 flex-[2] bg-background/60 text-xs" />
                )}
                <Select aria-label={`Link ${i + 1} icon`} value={l.icon} onChange={(e) => patch(i, { icon: e.target.value })} className="h-8 w-36 text-xs">
                  {ICON_NAMES.map((n) => (
                    <option key={n} value={n} className="bg-popover">
                      {n}
                    </option>
                  ))}
                </Select>
                <Select aria-label={`Link ${i + 1} colour`} value={l.accent} onChange={(e) => patch(i, { accent: e.target.value as MenuLink["accent"] })} className="h-8 w-36 text-xs">
                  {ACCENTS.map((a) => (
                    <option key={a.id} value={a.id} className="bg-popover">
                      {a.label}
                    </option>
                  ))}
                </Select>
                {bad && <span className="text-xs text-destructive">Use a path on this site (/forum) or an https address.</span>}
              </div>
            </li>
          )
        })}
      </ol>
      {links.length < max && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...links, blankLink()])}>
            <PlusIcon aria-hidden /> Add a link
          </Button>
          {published.length > 0 && (
            <Select
              aria-label="Add one of your pages"
              value=""
              onChange={(e) => {
                const p = published.find((x) => x.id === e.target.value)
                if (p) onChange([...links, { label: p.title.slice(0, LIMITS.label), href: pagePath(p.slug), description: p.description.slice(0, LIMITS.description), icon: "file-text", accent: "ion" }])
              }}
              className="h-8 w-auto text-xs"
            >
              <option value="" className="bg-popover">
                + Add one of your pages…
              </option>
              {published.map((p) => (
                <option key={p.id} value={p.id} className="bg-popover">
                  {p.title}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}
    </div>
  )
}

function AreasEditor({ value, onChange }: { value: Menus; onChange: (a: Menus["areas"]) => void }) {
  const { settings } = useSiteSettings()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Give a part of the site a new name and one-line blurb. Every menu link to it uses them: header, footer, phone menu. Leave blank to keep each link&apos;s own text. To switch an area off, use{" "}
        <Link href={"/admin/settings/features" as Route} className="text-ion hover:underline">
          Site settings › Features
        </Link>
        .
      </p>
      <ul className="flex flex-col gap-2">
        {FEATURES.filter((f) => f.key !== "ai").map((f) => {
          const a = value.areas[f.key] ?? { label: "", blurb: "" }
          const set = (p: Partial<typeof a>) => {
            const next = { ...a, ...p }
            const areas = { ...value.areas }
            if (next.label.trim() || next.blurb.trim()) areas[f.key] = next
            else delete areas[f.key]
            onChange(areas)
          }
          const off = settings.features[f.key] === false
          return (
            <li key={f.key} className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-3 sm:flex-row sm:items-center">
              <span className="flex w-40 shrink-0 flex-col">
                <span className="text-sm font-medium">{f.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {f.href}
                  {off && " · switched off"}
                </span>
              </span>
              <Input aria-label={`New name for ${f.label}`} value={a.label} maxLength={LIMITS.label} placeholder="New name (optional)" onChange={(e) => set({ label: e.target.value })} className="h-9 flex-1 bg-background/60" />
              <Input aria-label={`New blurb for ${f.label}`} value={a.blurb} maxLength={LIMITS.description} placeholder="New blurb (optional)" onChange={(e) => set({ blurb: e.target.value })} className="h-9 flex-[2] bg-background/60" />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A small live picture of the menu being edited. */
function Preview({ menus, tab }: { menus: Menus; tab: Tab }) {
  const groups = tab === "footer" ? menus.footer : tab === "mobile" && !menus.mobile.sameAsHeader ? menus.mobile.groups : menus.header
  const name = (l: MenuLink) => {
    const area = FEATURES.find((f) => f.href === l.href.split("?")[0])
    return (area && menus.areas[area.key]?.label) || l.label || "Untitled"
  }
  return (
    <aside aria-label="Preview" className="flex flex-col gap-2 xl:sticky xl:top-20 xl:self-start">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview · {tab === "areas" ? "header" : TABS.find((t) => t.id === tab)?.label.toLowerCase()}</p>
      <div className={cn("overflow-hidden rounded-2xl border border-border bg-popover p-3", tab === "mobile" && "mx-auto w-full max-w-[18rem]")}>
        {tab !== "footer" && tab !== "mobile" && (
          <div className="mb-3 flex flex-wrap gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1 text-xs">
            {menus.header.map((g) => (
              <span key={g.id} className="rounded-full px-2.5 py-1 text-muted-foreground">
                {g.label || "Untitled"} ▾
              </span>
            ))}
            {menus.headerLinks.map((l, i) => (
              <span key={i} className="rounded-full px-2.5 py-1 text-muted-foreground">
                {name(l)}
              </span>
            ))}
          </div>
        )}
        <div className={cn("flex flex-col gap-4", tab === "footer" && "grid grid-cols-2 gap-4")}>
          {groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-1">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{g.label || "Untitled"}</p>
              {g.links.slice(0, tab === "footer" ? 8 : 6).map((l, i) => (
                <span key={i} className="flex items-center gap-2 truncate text-sm">
                  {tab !== "footer" && <NamedIcon name={l.icon} className={cn("size-3.5 shrink-0", TINT[l.accent])} />}
                  <span className="truncate">{name(l)}</span>
                </span>
              ))}
              {g.links.length > (tab === "footer" ? 8 : 6) && <span className="text-xs text-muted-foreground">+{g.links.length - (tab === "footer" ? 8 : 6)} more</span>}
            </div>
          ))}
          {!groups.length && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileTextIcon aria-hidden className="size-3.5" /> Published pages marked &ldquo;show in menus&rdquo; are added to the footer and phone menu.
      </p>
    </aside>
  )
}
