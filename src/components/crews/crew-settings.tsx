"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon, Link2Icon, Trash2Icon, UserCheckIcon, XIcon } from "lucide-react"
import { ChatAvatar } from "@/components/chat/glyphs"
import { CrewForm } from "@/components/crews/crew-form"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { answerRequest, createInvite, deleteCrew, inviteHref, listInvites, listRequests, revokeInvite, type Crew, type CrewInvite, type CrewRequest, type CrewRole } from "@/lib/crews"
import { live } from "@/lib/supabase"
import { Copy } from "@/components/content/copy"

const when = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" })

/** For the crew's owner and admins: requests to join, invite links, the crew's details and (owner) deleting it. */
export function CrewSettings({ crew, role, onSaved, onMembersChanged }: { crew: Crew; role: CrewRole; onSaved: (c: Crew) => void; onMembersChanged: () => void }) {
  return (
    <div className="flex flex-col gap-8">
      {live && <Requests crew={crew} onAnswered={onMembersChanged} />}
      <Invites crew={crew} />
      <section aria-labelledby="crew-edit-h" className="flex flex-col gap-3">
        <h2 id="crew-edit-h" className="font-sans text-base font-semibold tracking-normal">
          <Copy k="crew.crew-settings.crew-details">Crew details</Copy>
        </h2>
        <CrewForm crew={crew} onSaved={onSaved} />
      </section>
      {role === "owner" && <DangerZone crew={crew} />}
    </div>
  )
}

function Requests({ crew, onAnswered }: { crew: Crew; onAnswered: () => void }) {
  const [list, setList] = useState<CrewRequest[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let stale = false
    listRequests(crew)
      .then((l) => !stale && setList(l))
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setList([])
      })
    return () => {
      stale = true
    }
  }, [crew])

  async function answer(r: CrewRequest, accept: boolean) {
    setError("")
    try {
      await answerRequest(crew, r.userId, accept)
      setList((l) => (l ?? []).filter((x) => x.userId !== r.userId))
      if (accept) onAnswered()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (crew.visibility !== "invite" && !list?.length) return null
  return (
    <section aria-labelledby="crew-requests-h" className="flex flex-col gap-3">
      <h2 id="crew-requests-h" className="font-sans text-base font-semibold tracking-normal">
        Requests to join {list && list.length > 0 && <span className="ml-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold tabular">{list.length}</span>}
      </h2>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {list === null ? (
        <Skeleton className="h-14 rounded-xl" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground"><Copy k="crew.crew-settings.no-one-is-waiting-requests">No one is waiting. Requests show up here and in your notifications.</Copy></p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card/40">
          {list.map((r) => (
            <li key={r.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <ChatAvatar id={r.userId} name={r.name} size={32} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{r.name}</span>
                {r.message && <span className="text-sm text-muted-foreground">“{r.message}”</span>}
                <span className="text-xs text-muted-foreground">Asked {when.format(new Date(r.createdAt))}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => answer(r, true)}>
                  <UserCheckIcon aria-hidden /> <Copy k="crew.crew-settings.let-in">Let in</Copy>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => answer(r, false)} aria-label={`Turn down ${r.name}`}>
                  <XIcon aria-hidden /> <Copy k="crew.crew-settings.decline">Decline</Copy>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Invites({ crew }: { crew: Crew }) {
  const [list, setList] = useState<CrewInvite[] | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [days, setDays] = useState(7)

  useEffect(() => {
    let stale = false
    listInvites(crew)
      .then((l) => !stale && setList(l))
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setList([])
      })
    return () => {
      stale = true
    }
  }, [crew])

  async function make() {
    setBusy(true)
    setError("")
    try {
      const i = await createInvite(crew, { days })
      setList((l) => [i, ...(l ?? [])])
      await copy(i)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy(i: CrewInvite) {
    try {
      await navigator.clipboard.writeText(`${location.origin}${inviteHref(crew.slug, i.token)}`)
      setCopied(i.token)
      setTimeout(() => setCopied((c) => (c === i.token ? null : c)), 2000)
    } catch {
      setError("Your browser would not copy. Select the link and copy it yourself.")
    }
  }

  async function revoke(i: CrewInvite) {
    try {
      await revokeInvite(crew, i.token)
      setList((l) => (l ?? []).filter((x) => x.token !== i.token))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section aria-labelledby="crew-invites-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="crew-invites-h" className="font-sans text-base font-semibold tracking-normal">
          <Copy k="crew.crew-settings.invite-links">Invite links</Copy>
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="invite-days" className="sr-only">
            <Copy k="crew.crew-settings.link-lasts">Link lasts</Copy>
          </label>
          <select
            id="invite-days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-8 rounded-full border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={1} className="bg-popover">
              1 day
            </option>
            <option value={7} className="bg-popover">
              7 days
            </option>
            <option value={30} className="bg-popover">
              30 days
            </option>
          </select>
          <Button size="sm" variant="secondary" onClick={make} disabled={busy}>
            <Link2Icon aria-hidden /> {busy ? "Making…" : "New link"}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground"><Copy k="crew.crew-settings.anyone-with-a-link-can" multiline>Anyone with a link can join, up to 25 people per link, until it runs out. New links are copied for you.</Copy></p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {list === null ? (
        <Skeleton className="h-12 rounded-xl" />
      ) : list.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card/40">
          {list.map((i) => (
            <li key={i.token} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{inviteHref(crew.slug, i.token)}</code>
              <span className="text-xs text-muted-foreground tabular">
                {i.uses}/{i.maxUses} used · until {when.format(new Date(i.expiresAt))}
              </span>
              <Button size="icon-sm" variant="ghost" onClick={() => copy(i)} aria-label="Copy invite link">
                {copied === i.token ? <CheckIcon aria-hidden className="text-ok" /> : <CopyIcon aria-hidden />}
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => revoke(i)} aria-label="Revoke invite link">
                <Trash2Icon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <span role="status" className="sr-only">
        {copied ? "Invite link copied." : ""}
      </span>
    </section>
  )
}

function DangerZone({ crew }: { crew: Crew }) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function remove() {
    setBusy(true)
    setError("")
    try {
      await deleteCrew(crew)
      router.push("/crews")
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="crew-danger-h" className="flex flex-col gap-3 rounded-xl border border-destructive/30 p-4">
      <h2 id="crew-danger-h" className="font-sans text-base font-semibold tracking-normal text-destructive">
        <Copy k="crew.crew-settings.delete-this-crew">Delete this crew</Copy>
      </h2>
      <p className="text-sm text-muted-foreground"><Copy k="crew.crew-settings.the-wall-the-chat-room" multiline>The wall, the chat room, members and invite links go with it. Shared collections stay with their owners. This cannot be undone.</Copy></p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span>
          Type <span className="font-mono text-foreground">{crew.slug}</span> to confirm
        </span>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background/60 px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          autoComplete="off"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button variant="destructive" className="self-start" disabled={confirmText !== crew.slug || busy} onClick={remove}>
        <Trash2Icon aria-hidden /> {busy ? "Deleting…" : "Delete crew"}
      </Button>
    </section>
  )
}
