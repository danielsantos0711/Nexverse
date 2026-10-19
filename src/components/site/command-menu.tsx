"use client"

import { useRouter } from "next/navigation"
import { createContext, use, useEffect, useState } from "react"
import { FilmIcon, FolderGit2Icon, LinkIcon, MessageSquareIcon, UserIcon, type LucideIcon } from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { useRole } from "@/lib/roles"
import { isLinkVisible, useSiteSettings } from "@/lib/site-settings"
import { db } from "@/lib/supabase"

const Ctx = createContext<() => void>(() => {})
export const useOpenCommandMenu = () => use(Ctx)

const PAGES = [
  ["Explore everything", "/explore"],
  ["Trending now", "/trending"],
  ["Papers", "/papers"],
  ["Most cited papers", "/papers?view=cited"],
  ["Forum", "/forum"],
  ["Chat rooms", "/chat"],
  ["Start a thread", "/forum/new"],
  ["News", "/news"],
  ["Constellations", "/constellations"],
  ["People", "/people"],
  ["Video lab", "/video"],
  ["Shot builder for AI video", "/video/builder"],
  ["Share a video", "/video/share"],
  ["Publish a project", "/new/project"],
  ["Your studio", "/studio"],
  ["Lab: VRAM calculator", "/lab/vram"],
  ["Lab: token cost", "/lab/tokens"],
  ["Lab: licence checker", "/lab/licences"],
  ["Lab: model card builder", "/lab/model-card"],
  ["GitHub topics", "/gh/topics"],
  ["Settings", "/settings"],
  ["Share something", "/share"],
  ["Compare side by side", "/compare"],
  ["For you", "/for-you"],
  ["Cosmos: star map of the hub", "/cosmos"],
  ["Arena: play blind duels", "/arena"],
  ["Arena ratings", "/arena/ratings"],
  ["Post a duel", "/arena/new"],
  ["Benchmarks", "/benchmarks"],
  ["Missions", "/missions"],
  ["Post a mission", "/missions/new"],
  ["Launchpad", "/launchpad"],
  ["Schedule a launch", "/launchpad/new"],
  ["Crews", "/crews"],
  ["Start a crew", "/crews/new"],
  ["Messages", "/messages"],
  ["Events", "/events"],
  ["Create an event", "/events/new"],
  ["Collections", "/collections"],
  ["Leaderboard", "/leaderboard"],
  ["Saved", "/saved"],
  ["Notifications", "/notifications"],
] as const

type Hit = { key: string; label: string; hint?: string; href: string; icon: LucideIcon; group: string }

/** Real things members made, matched on title or name. Each table is asked separately so one failure hides only its group. */
async function searchHub(q: string): Promise<Hit[]> {
  const c = db()
  if (!c) return []
  const like = `%${q.replace(/[%_,()]/g, " ").trim()}%`
  const [threads, links, projects, people, videos] = await Promise.all([
    c.from("questions").select("id, title").ilike("title", like).order("created_at", { ascending: false }).limit(6),
    c.from("submissions").select("id, kind, title").ilike("title", like).order("created_at", { ascending: false }).limit(6),
    c.from("projects").select("slug, name, kind").eq("status", "published").ilike("name", like).limit(6),
    c.from("profiles").select("handle, name").not("handle", "is", null).or(`name.ilike.${like},handle.ilike.${like}`).limit(6),
    c.from("video_posts").select("id, title").ilike("title", like).limit(6),
  ])
  const hits: Hit[] = []
  for (const t of threads.data ?? []) hits.push({ key: `q${t.id}`, label: t.title, href: `/forum/${t.id}`, icon: MessageSquareIcon, group: "Forum" })
  for (const s of links.data ?? [])
    hits.push({ key: `s${s.id}`, label: s.title, hint: s.kind, href: s.kind === "news" ? `/news/${s.id}` : `/explore?q=${encodeURIComponent(s.title)}`, icon: LinkIcon, group: "Shared links" })
  for (const p of projects.data ?? []) hits.push({ key: `p${p.slug}`, label: p.name, hint: p.kind, href: `/p/${p.slug}`, icon: FolderGit2Icon, group: "Projects" })
  for (const p of people.data ?? []) hits.push({ key: `u${p.handle}`, label: p.name, hint: `@${p.handle}`, href: `/people/${p.handle}`, icon: UserIcon, group: "People" })
  for (const v of videos.data ?? []) hits.push({ key: `v${v.id}`, label: v.title, href: `/video/${v.id}`, icon: FilmIcon, group: "Videos" })
  return hits
}

/** ⌘K: jump to any page, or to threads, links, projects, people and videos members shared. Opens instantly, by design. */
export function CommandMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[]>([])
  const router = useRouter()
  const { settings } = useSiteSettings()
  const { isStaff } = useRole()

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

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const pages = [...PAGES, ...(isStaff ? ([["Admin panel", "/admin"]] as const) : [])].filter(([, href]) => isLinkVisible(settings, href.split("?")[0]))
  const shown = query.trim().length >= 2 ? hits : []
  const groups = [...new Set(shown.map((h) => h.group))]

  return (
    <Ctx value={() => setOpen(true)}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen} title="Search Nexverse" description="Find pages, threads, links, projects, people and videos">
        <Command>
          <CommandInput placeholder="Search everything…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>Nothing found. Try another word, or search in the forum.</CommandEmpty>
            <CommandGroup heading="Go to">
              {pages.map(([label, href]) => (
                <CommandItem key={href} value={label} onSelect={() => go(href)}>
                  {label}
                </CommandItem>
              ))}
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
        </Command>
      </CommandDialog>
    </Ctx>
  )
}
