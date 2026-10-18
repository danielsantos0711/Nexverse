"use client"

import { useRouter } from "next/navigation"
import { createContext, use, useEffect, useState } from "react"
import { MessageSquareIcon, NewspaperIcon, SparklesIcon, UserIcon } from "lucide-react"
import { KIND_ICONS } from "@/components/hub/bits"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { constellations, KINDS, news, people, resourcePath, resources, threads, threadTitle, type ResourceKind } from "@/lib/data"

const Ctx = createContext<() => void>(() => {})
export const useOpenCommandMenu = () => use(Ctx)

const PAGES = [
  ["Explore everything", "/explore"],
  ["Forum", "/forum"],
  ["Start a thread", "/forum/new"],
  ["News", "/news"],
  ["Constellations", "/constellations"],
  ["People", "/people"],
  ["Share something", "/share"],
] as const

/** ⌘K: jump to any model, dataset, tool, repo, thread, story or person. Opens instantly, by design. */
export function CommandMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

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

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <Ctx value={() => setOpen(true)}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen} title="Search Nexverse" description="Find models, datasets, tools, repos, threads and people">
        <Command>
          <CommandInput placeholder="Search everything…" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>Nothing found. Try another word, or search in the forum.</CommandEmpty>
            <CommandGroup heading="Go to">
              {PAGES.map(([label, href]) => (
                <CommandItem key={href} value={label} onSelect={() => go(href)}>
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
            {(Object.keys(KINDS) as ResourceKind[]).map((k) => {
              const Icon = KIND_ICONS[k]
              return (
                <CommandGroup key={k} heading={KINDS[k].plural}>
                  {resources
                    .filter((r) => r.kind === k)
                    .map((r) => (
                      <CommandItem key={r.slug} value={`${r.owner}/${r.name} ${r.summary} ${r.tags.join(" ")}`} onSelect={() => go(resourcePath(r))}>
                        <Icon aria-hidden />
                        <span className="truncate">
                          <span className="text-muted-foreground">{r.owner}/</span>
                          {r.name}
                        </span>
                        <CommandShortcut>{r.task}</CommandShortcut>
                      </CommandItem>
                    ))}
                </CommandGroup>
              )
            })}
            <CommandGroup heading="Forum">
              {threads.map((t) => (
                <CommandItem key={t.id} value={`${t.title} ${threadTitle(t)} ${t.tags.join(" ")}`} onSelect={() => go(`/forum/${t.id}`)}>
                  <MessageSquareIcon aria-hidden />
                  <span className="truncate">{threadTitle(t)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="News">
              {news.map((n) => (
                <CommandItem key={n.id} value={`${n.title} ${n.summary}`} onSelect={() => go(`/news/${n.id}`)}>
                  <NewspaperIcon aria-hidden />
                  <span className="truncate">{n.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Constellations">
              {constellations.map((c) => (
                <CommandItem key={c.slug} value={`${c.name} ${c.goal}`} onSelect={() => go(`/constellations/${c.slug}`)}>
                  <SparklesIcon aria-hidden />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="People">
              {people.map((p) => (
                <CommandItem key={p.handle} value={`${p.name} ${p.handle} ${p.role} ${p.place}`} onSelect={() => go(`/people/${p.handle}`)}>
                  <UserIcon aria-hidden />
                  {p.name}
                  <CommandShortcut>{p.place}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </Ctx>
  )
}
