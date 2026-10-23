"use client"

import { SmartAnswer } from "@/components/ai/inline-ai"
import { useRouter } from "next/navigation"
import { createContext, use, useCallback, useEffect, useState } from "react"
import { FileTextIcon, FolderGit2Icon, LinkIcon, MessageSquareIcon, NewspaperIcon, PlusIcon, ShieldIcon, UserIcon, type LucideIcon } from "lucide-react"
import { openCreate } from "@/components/site/create-sheet"
import { iconFor } from "@/components/site/icons"
import { GO_KEYS } from "@/components/site/shortcuts"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { useRole } from "@/lib/roles"
import { sharePath } from "@/lib/hub"
import { useMenus } from "@/lib/menus"
import { isLinkVisible, useSiteSettings } from "@/lib/site-settings"
import { db } from "@/lib/supabase"
import { useCopy } from "@/lib/content"
import { GlassKeys } from "@/components/glass/glass-keys"

const Ctx = createContext<() => void>(() => {})
export const useOpenCommandMenu = () => use(Ctx)

// Places the menus do not list, so ⌘K still finds them. Everything else comes from the admins' menus.
const EXTRA: { label: string; href: string; icon: string; group: string }[] = [
  { label: "Lab: VRAM calculator", href: "/lab/vram", icon: "flask-conical", group: "Build" },
  { label: "Lab: token cost", href: "/lab/tokens", icon: "flask-conical", group: "Build" },
  { label: "Lab: licence checker", href: "/lab/licences", icon: "flask-conical", group: "Build" },
  { label: "Lab: model card builder", href: "/lab/model-card", icon: "flask-conical", group: "Build" },
  { label: "Arena ratings", href: "/arena/ratings", icon: "trophy", group: "Build" },
  { label: "Compare side by side", href: "/compare", icon: "scale", group: "Build" },
  { label: "GitHub repositories, by topic", href: "/code?from=github", icon: "git-branch", group: "Build" },
  { label: "Import a repository from GitHub", href: "/code/import", icon: "git-branch", group: "Build" },
  { label: "Explore as a star map", href: "/explore?show=map", icon: "orbit", group: "Discover" },
  { label: "Collections as star maps", href: "/collections?show=map", icon: "sparkles", group: "Discover" },
  { label: "Start a thread", href: "/forum/new", icon: "message-square", group: "Community" },
]

type Hit = { key: string; label: string; hint?: string; href: string; icon: LucideIcon; group: string }

/** Real things members made, matched on title or name. Each table is asked separately so one failure hides only its group. */
async function searchHub(q: string): Promise<Hit[]> {
  const c = db()
  if (!c) return []
  const like = `%${q.replace(/[%_,()]/g, " ").trim()}%`
  const [threads, links, projects, people, pages, stories] = await Promise.all([
    c.from("questions").select("id, title").ilike("title", like).order("created_at", { ascending: false }).limit(6),
    c.from("submissions").select("id, kind, title").ilike("title", like).order("created_at", { ascending: false }).limit(6),
    c.from("projects").select("id, name, kind").eq("status", "published").eq("visibility", "public").ilike("name", like).limit(6),
    c.from("profiles").select("handle, name").not("handle", "is", null).or(`name.ilike.${like},handle.ilike.${like}`).limit(6),
    c.from("site_pages").select("slug, title").eq("status", "published").ilike("title", like).limit(6),
    c.from("news_stories").select("slug, title").eq("status", "published").ilike("title", like).order("published_at", { ascending: false }).limit(6),
  ])
  const hits: Hit[] = []
  for (const t of threads.data ?? []) hits.push({ key: `q${t.id}`, label: t.title, href: `/forum/${t.id}`, icon: MessageSquareIcon, group: "Forum" })
  for (const s of links.data ?? [])
    // every shared link has its own page on Nexverse (with the link, likes and the discussion): open that
    hits.push({ key: `s${s.id}`, label: s.title, hint: s.kind, href: sharePath(s), icon: LinkIcon, group: "Shared links" })
  for (const p of projects.data ?? []) hits.push({ key: `p${p.id}`, label: p.name, hint: p.kind, href: `/p/${p.id}`, icon: FolderGit2Icon, group: "Projects" })
  for (const p of people.data ?? []) hits.push({ key: `u${p.handle}`, label: p.name, hint: `@${p.handle}`, href: `/people/${p.handle}`, icon: UserIcon, group: "People" })
  for (const p of pages.data ?? []) hits.push({ key: `g${p.slug}`, label: p.title, href: `/pages/${p.slug}`, icon: FileTextIcon, group: "Pages" })
  for (const n of stories.data ?? []) hits.push({ key: `n${n.slug}`, label: n.title, href: `/news/${n.slug}`, icon: NewspaperIcon, group: "News" })
  return hits
}

/** ⌘K: jump to any page (including the admins' custom pages), or to threads, links, projects and people. Opens instantly, by design. */
export function CommandMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[]>([])
  const router = useRouter()
  const { settings } = useSiteSettings()
  const { isStaff } = useRole()
  const { pages: menuPages, header, you, create } = useMenus()
  const placeholder = useCopy("search.placeholder", "Search the universe…")
  const empty = useCopy("search.empty", "No star matches that yet. Try another word, or ask in the forum.")
  const goTo = useCopy("search.goto", "Jump to")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) return
    let on = true
    const t = setTimeout(() => {
      searchHub(q)
        .then((h) => on && setHits(h))
        .catch(() => on && setHits([]))
    }, 220)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [query, open])

  const show = useCallback(() => setOpen(true), [])
  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  // Every place, grouped as the header groups it (so ⌘K teaches the same map), then You and the extras.
  type Place = { label: string; href: string; icon: string; blurb?: string }
  const placeGroups: { id: string; label: string; items: Place[] }[] = [
    ...header.map((g) => ({ id: g.id, label: g.label, items: g.links.map((l) => ({ label: l.label, href: l.href, icon: l.icon, blurb: l.description })) })),
    // You's links that a header group already lists (For you) show once, in that group
    { id: "you", label: you.label, items: you.links.filter((l) => !header.some((g) => g.links.some((h) => h.href === l.href))).map((l) => ({ label: l.label, href: l.href, icon: l.icon, blurb: l.description })) },
  ]
  const seen = new Set(placeGroups.flatMap((g) => g.items.map((i) => i.href)))
  for (const x of EXTRA) {
    if (seen.has(x.href)) continue
    const g = placeGroups.find((p) => p.label === x.group) ?? placeGroups[0]
    g?.items.push(x)
  }
  const more: Place[] = [
    { label: "Home", href: "/", icon: "house" },
    ...menuPages.map((p) => ({ label: p.title, href: p.href, icon: "file-text" })),
    ...(isStaff ? [{ label: "Admin panel", href: "/admin", icon: "shield" }] : []),
  ]
  const visibleOnly = (items: Place[]) => items.filter((i) => !i.href.startsWith("/") || isLinkVisible(settings, i.href.split("?")[0]))
  const shown = query.trim().length >= 2 ? hits : []
  const groups = [...new Set(shown.map((h) => h.group))]

  return (
    <Ctx value={show}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen} title="Search Nexverse" description="Find pages, threads, links, projects and people">
        <Command>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-[60vh]">
            <SmartAnswer query={query} className="px-2 pt-2" />
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup heading={goTo}>
              <CommandItem
                value="create something new make publish start"
                onSelect={() => {
                  setOpen(false)
                  openCreate()
                }}
              >
                <PlusIcon aria-hidden className="text-ion" />
                Create something
                <CommandShortcut>C</CommandShortcut>
              </CommandItem>
              {visibleOnly(more).map((p) => {
                const Icon = p.href === "/admin" ? ShieldIcon : iconFor(p.icon)
                return (
                  <CommandItem key={p.href} value={p.label} onSelect={() => go(p.href)}>
                    <Icon aria-hidden />
                    {p.label}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {placeGroups.map((g) => (
              <CommandGroup key={g.id} heading={g.label}>
                {visibleOnly(g.items).map((p) => {
                  const Icon = iconFor(p.icon)
                  return (
                    <CommandItem key={p.href} value={`${p.label} ${p.blurb ?? ""}`} onSelect={() => go(p.href)}>
                      <Icon aria-hidden />
                      <span className="truncate">{p.label}</span>
                      {p.blurb && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{p.blurb}</span>}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
            <CommandGroup heading="Create">
              {create.map((c) => {
                const Icon = iconFor(c.icon, PlusIcon)
                return (
                  <CommandItem key={c.href} value={`new ${c.label} create ${c.description}`} onSelect={() => go(c.href)}>
                    <Icon aria-hidden />
                    New {c.label.toLowerCase()}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {groups.map((g) => (
              <CommandGroup key={g} heading={g}>
                {shown
                  .filter((h) => h.group === g)
                  .map((h) => (
                    // The query is part of the value so the list's own filter keeps what the database matched.
                    <CommandItem key={h.key} value={`${h.label} ${h.hint ?? ""} ${query} ${h.key}`} onSelect={() => go(h.href)}>
                      <h.icon aria-hidden />
                      <span className="truncate">{h.label}</span>
                      {h.hint && <CommandShortcut>{h.hint}</CommandShortcut>}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
          {/* the keys that drive the palette, as glass keycaps */}
          <div aria-hidden className="hidden items-center gap-4 border-t border-white/[0.06] px-3 py-2 text-xs text-muted-foreground sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <GlassKeys keys={["↑", "↓"]} live={false} /> move
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GlassKeys keys={["↵"]} live={false} /> open
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GlassKeys keys={["Esc"]} live={false} /> close
            </span>
            <span className="inline-flex items-center gap-1.5" title={GO_KEYS.map((g) => `G ${g.key.toUpperCase()}: ${g.label}`).join(", ")}>
              <GlassKeys keys={["G"]} live={false} /> then a letter to jump
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5">
              <GlassKeys keys={["mod", "K"]} /> anywhere
            </span>
          </div>
        </Command>
      </CommandDialog>
    </Ctx>
  )
}
