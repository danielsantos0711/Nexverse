"use client"

import { useRouter } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { CheckIcon, Loader2Icon, SearchIcon, UsersIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatAvatar } from "@/components/chat/glyphs"
import { Gate } from "@/components/moderation/gate"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { searchMembers, type MentionCandidate } from "@/lib/community"
import { dmExtras, startConversation, startGroup } from "@/lib/messages"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

/**
 * Find a member by name and open a conversation with them, or pick several and start a group (3 to 20 people).
 * Needs a database: without one there are no members.
 */
export function NewMessageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const { user } = useSession()
  const uid = useId()
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<{ q: string; list: MentionCandidate[] }>({ q: "", list: [] })
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [groupMode, setGroupMode] = useState(false)
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [title, setTitle] = useState("")
  const q = query.trim()

  useEffect(() => {
    if (!live) return
    if (!q) return
    let stale = false
    const t = setTimeout(() => {
      searchMembers(q, 8)
        .then((list) => !stale && setFound({ q, list: list.filter((c) => c.memberId !== user?.id) }))
        .catch((e: Error) => !stale && setError(e.message))
    }, 200)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, user?.id])

  const results = live && found.q === q ? found.list : []
  const searching = live && q.length > 0 && found.q !== q

  async function createGroup() {
    if (picked.length < 2) return setError("Pick at least two people for a group.")
    setOpening("group")
    setError("")
    try {
      const g = await startGroup(title || picked.map((p) => p.name.split(/\s+/)[0]).join(", "), picked.map((p) => p.memberId!).filter(Boolean))
      onOpenChange(false)
      setPicked([])
      setTitle("")
      setGroupMode(false)
      router.push(`/messages/${g}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOpening(null)
    }
  }

  async function pick(c: MentionCandidate) {
    const id = c.memberId
    if (!id) return
    if (groupMode) {
      setPicked((list) => (list.some((x) => x.key === c.key) ? list.filter((x) => x.key !== c.key) : list.length >= 19 ? list : [...list, c]))
      setQuery("")
      return
    }
    setOpening(c.key)
    setError("")
    try {
      const thread = await startConversation(id, c.name)
      onOpenChange(false)
      setQuery("")
      router.push(`/messages/${thread}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOpening(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{groupMode ? "New group" : "New message"}</DialogTitle>
          <DialogDescription>{!live ? "Direct messages need member accounts." : groupMode ? "Pick 2 to 19 members and give the group a name." : "Search members by name."}</DialogDescription>
        </DialogHeader>
        {!live ? (
          <p className="text-sm text-muted-foreground">This copy of Nexverse is not connected to its database, so there are no other members to write to yet.</p>
        ) : (
          <Gate cap="message.send" action="write a message">
            {dmExtras() && (
              <div role="tablist" aria-label="Kind of conversation" className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.03] p-0.5">
                {[
                  { on: false, label: "One person" },
                  { on: true, label: "A group" },
                ].map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    role="tab"
                    aria-selected={groupMode === t.on}
                    onClick={() => setGroupMode(t.on)}
                    className={`pressable h-8 rounded-md text-sm transition-colors ${groupMode === t.on ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {groupMode && (
              <>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Group name (optional)" aria-label="Group name" />
                {picked.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="In the group">
                    {picked.map((p) => (
                      <li key={p.key}>
                        <button
                          type="button"
                          onClick={() => setPicked((l) => l.filter((x) => x.key !== p.key))}
                          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-ion/30 bg-ion/10 pr-2 pl-1 text-xs"
                          aria-label={`Remove ${p.name}`}
                        >
                          <ChatAvatar id={p.memberId ?? p.key} name={p.name} size={20} />
                          {p.name}
                          <XIcon aria-hidden className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <div className="relative">
              <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name"
                aria-label="Search members"
                aria-controls={`${uid}-results`}
                className="pl-9"
                maxLength={60}
              />
            </div>
            <ul id={`${uid}-results`} className="-mx-2 flex max-h-72 flex-col overflow-y-auto" aria-busy={searching} aria-live="polite">
              {results.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    disabled={opening !== null}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none disabled:opacity-60"
                  >
                    <ChatAvatar id={c.memberId ?? c.key} name={c.name} size={32} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.hint}</span>
                    </span>
                    {opening === c.key && <Loader2Icon aria-hidden className="size-4 animate-spin text-muted-foreground" />}
                    {groupMode && picked.some((x) => x.key === c.key) && <CheckIcon aria-label="Picked" className="size-4 text-ion" />}
                  </button>
                </li>
              ))}
              {live && q && !searching && results.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted-foreground">No member by that name.</li>}
              {live && !q && <li className="px-2 py-4 text-center text-sm text-muted-foreground">Type a name to search.</li>}
              {searching && <li className="px-2 py-4 text-center text-sm text-muted-foreground">Searching…</li>}
            </ul>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {groupMode && (
              <Button onClick={createGroup} disabled={picked.length < 2 || opening !== null}>
                {opening === "group" ? <Loader2Icon aria-hidden className="animate-spin" /> : <UsersIcon aria-hidden />}
                Start the group{picked.length ? ` with ${picked.length + 1}` : ""}
              </Button>
            )}
          </Gate>
        )}
      </DialogContent>
    </Dialog>
  )
}
