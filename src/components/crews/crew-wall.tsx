"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon, SmilePlusIcon, Trash2Icon } from "lucide-react"
import { WhoAvatar } from "@/components/crews/emblem"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { Gate } from "@/components/moderation/gate"
import { EditedMarker, PinnedBadge } from "@/components/forum/forum-ui"
import { PostBody } from "@/components/forum/post-body"
import { relative, useNow } from "@/components/live/time"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { mentionedMemberIds, REACTION_NAMES, REACTIONS, type MentionCandidate, type ReactionEmoji, type Reactions } from "@/lib/community"
import {
  canManage,
  CREW_LIMITS,
  createPost,
  deletePost,
  editPost,
  getPostReactions,
  listPosts,
  setPinned,
  setPostReaction,
  sortPosts,
  subscribeCrew,
  validatePost,
  type Crew,
  type CrewMember,
  type CrewPost,
  type CrewRole,
} from "@/lib/crews"
import { cn } from "@/lib/utils"

const EASE = [0.23, 1, 0.32, 1] as const

/**
 * The crew wall: members write Markdown posts (with @mentions of other members), react to them, and the owner
 * and admins pin up to three to the top. New posts from others arrive live.
 */
export function CrewWall({ crew, role, meId, members, onActivity }: { crew: Crew; role: CrewRole | null; meId: string | null; members: CrewMember[]; onActivity: () => void }) {
  const reduce = useReducedMotion()
  const [posts, setPosts] = useState<CrewPost[] | null>(null)
  const [reactions, setReactions] = useState<Record<string, Reactions>>({})
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let stale = false
    listPosts(crew)
      .then(async (list) => {
        if (stale) return
        setPosts(list)
        setError("")
        const r = await getPostReactions(crew, list).catch(() => ({}))
        if (!stale) setReactions(r)
      })
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setPosts((p) => p ?? [])
      })
    return () => {
      stale = true
    }
  }, [crew, reload])

  useEffect(
    () =>
      subscribeCrew(crew, {
        onPost: (p) => setPosts((list) => sortPosts([p, ...(list ?? []).filter((x) => x.id !== p.id)])),
        onPostDeleted: (id) => setPosts((list) => (list && list.some((p) => p.id === id) ? list.filter((p) => p.id !== id) : list)),
        onChange: () => setReload((n) => n + 1),
      }),
    [crew]
  )

  const participants: MentionCandidate[] = members
    .filter((m) => m.memberId && m.memberId !== meId)
    .map((m) => ({ key: m.key, name: m.name, memberId: m.memberId, insert: `@${m.name}`, hint: "Crew member" }))
  const names = members.filter((m) => m.memberId).map((m) => m.name)

  async function toggleReaction(p: CrewPost, emoji: ReactionEmoji) {
    if (!role) {
      setStatus("Join the crew to react.")
      return
    }
    const r = reactions[p.id]
    if (!r) return
    const on = !r[emoji].mine
    const apply = (mine: boolean, delta: number) =>
      setReactions((all) => ({ ...all, [p.id]: { ...all[p.id], [emoji]: { count: Math.max(0, all[p.id][emoji].count + delta), mine } } }))
    apply(on, on ? 1 : -1)
    try {
      await setPostReaction(p, emoji, on)
      setStatus(on ? `Reacted with ${REACTION_NAMES[emoji]}` : `Removed ${REACTION_NAMES[emoji]} reaction`)
    } catch (e) {
      apply(!on, on ? -1 : 1)
      setStatus((e as Error).message)
    }
  }

  async function pin(p: CrewPost) {
    try {
      await setPinned(p, !p.pinned, posts ?? [])
      setPosts((list) => sortPosts((list ?? []).map((x) => (x.id === p.id ? { ...x, pinned: !p.pinned } : x))))
      setStatus(p.pinned ? "Post unpinned." : "Post pinned to the top.")
    } catch (e) {
      setStatus((e as Error).message)
      setError((e as Error).message)
    }
  }

  async function remove(p: CrewPost) {
    if (!confirm("Delete this post? This cannot be undone.")) return
    const before = posts
    setPosts((list) => (list ?? []).filter((x) => x.id !== p.id))
    try {
      await deletePost(p)
      setStatus("Post deleted.")
      onActivity()
    } catch (e) {
      setPosts(before)
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {role ? (
        <Gate action="write on the crew wall">
        <NewPost
          crew={crew}
          participants={participants}
          onPosted={(p) => {
            setPosts((list) => sortPosts([p, ...(list ?? []).filter((x) => x.id !== p.id)]))
            setReactions((r) => ({ ...r, [p.id]: Object.fromEntries(REACTIONS.map((e) => [e, { count: 0, mine: false }])) as Reactions }))
            onActivity()
          }}
        />
        </Gate>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Join the crew to write on its wall.</p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>

      {posts === null ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading posts">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : posts.length === 0 ? (
        <p className="rounded-xl border border-border bg-card/40 px-6 py-10 text-center text-sm text-muted-foreground">
          Nothing on the wall yet. {role ? "Write the first post: say what the crew is working on." : ""}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {posts.map((p) => (
              <motion.li
                key={p.id}
                layout={!reduce ? "position" : false}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                <PostCard
                  post={p}
                  reactions={reactions[p.id]}
                  names={names}
                  participants={participants}
                  canEdit={Boolean(meId && p.author.memberId === meId)}
                  canModerate={canManage(role)}
                  canReact={Boolean(role)}
                  onReact={(e) => toggleReaction(p, e)}
                  onPin={() => pin(p)}
                  onDelete={() => remove(p)}
                  onEdited={(next) => setPosts((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  )
}

function NewPost({ crew, participants, onPosted }: { crew: Crew; participants: MentionCandidate[]; onPosted: (p: CrewPost) => void }) {
  const [body, setBody] = useState("")
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy) return
    const problem = validatePost(body)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError("")
    try {
      const p = await createPost(crew, body.trim(), mentionedMemberIds(body, picked))
      setBody("")
      setPicked([])
      onPosted(p)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <MarkdownComposer
        id={`crew-post-${crew.id}`}
        value={body}
        onChange={setBody}
        label={`Write on the ${crew.name} wall`}
        placeholder="Share an update, a link or a question with the crew. Markdown works; @ mentions a member."
        rows={3}
        maxLength={CREW_LIMITS.post}
        invalid={Boolean(error)}
        participants={participants}
        onMention={(c) => setPicked((list) => (list.some((x) => x.key === c.key) ? list : [...list, c]))}
        onSubmit={submit}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
          {error || "Ctrl+Enter to post"}
        </span>
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          {busy ? "Posting…" : "Post"}
        </Button>
      </div>
    </form>
  )
}

function PostCard({
  post: p,
  reactions,
  names,
  participants,
  canEdit,
  canModerate,
  canReact,
  onReact,
  onPin,
  onDelete,
  onEdited,
}: {
  post: CrewPost
  reactions?: Reactions
  names: string[]
  participants: MentionCandidate[]
  canEdit: boolean
  canModerate: boolean
  canReact: boolean
  onReact: (e: ReactionEmoji) => void
  onPin: () => void
  onDelete: () => void
  onEdited: (p: CrewPost) => void
}) {
  const now = useNow()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(p.body)
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const used = reactions ? REACTIONS.filter((e) => reactions[e].count > 0) : []

  async function save() {
    setBusy(true)
    setError("")
    try {
      const next = await editPost(p, draft.trim(), mentionedMemberIds(draft, picked))
      onEdited(next)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border bg-card/40 p-4", p.pinned ? "border-gold/30" : "border-border")}>
      <header className="flex items-start gap-3">
        <WhoAvatar who={p.author} size={32} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium">{p.author.name}</span>
            {p.pinned && <PinnedBadge />}
          </div>
          <span className="text-xs text-muted-foreground">
            <time dateTime={p.createdAt}>{now === null ? p.createdAt.slice(0, 10) : relative(Date.parse(p.createdAt), now)}</time>
            <EditedMarker at={p.editedAt} className="ml-1" />
          </span>
        </div>
        {(canEdit || canModerate) && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Post options" />}>
              <MoreHorizontalIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canModerate && (
                <DropdownMenuItem onClick={onPin}>
                  {p.pinned ? <PinOffIcon aria-hidden /> : <PinIcon aria-hidden />} {p.pinned ? "Unpin" : "Pin to top"}
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem
                  onClick={() => {
                    setDraft(p.body)
                    setEditing(true)
                  }}
                >
                  <PencilIcon aria-hidden /> Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2Icon aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {editing ? (
        <div className="flex flex-col gap-2">
          <MarkdownComposer
            id={`crew-edit-${p.id}`}
            value={draft}
            onChange={setDraft}
            label="Edit your post"
            rows={4}
            maxLength={CREW_LIMITS.post}
            participants={participants}
            onMention={(c) => setPicked((list) => (list.some((x) => x.key === c.key) ? list : [...list, c]))}
            onSubmit={save}
            autoFocus
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy || !draft.trim()}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <PostBody source={p.body} names={names} className="text-[15px]" />
      )}

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Reactions">
        {used.map((e) => {
          const r = reactions![e]
          return (
            <button
              key={e}
              type="button"
              onClick={() => onReact(e)}
              disabled={!canReact}
              aria-pressed={r.mine}
              aria-label={`${REACTION_NAMES[e]}: ${r.count}. ${r.mine ? "Remove your reaction" : "React"}`}
              className={cn(
                "pressable inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-sm tabular transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default",
                r.mine ? "border-ion/50 bg-ion/10 text-ion" : "border-border bg-secondary/50 text-foreground enabled:hover:bg-secondary"
              )}
            >
              <span aria-hidden>{e}</span>
              <span aria-hidden>{r.count}</span>
            </button>
          )
        })}
        {canReact && reactions && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Add a reaction"
                  title="Add a reaction"
                  className="pressable grid size-8 place-items-center rounded-full border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
              }
            >
              <SmilePlusIcon aria-hidden className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="grid w-auto min-w-0 grid-cols-6 gap-0.5 p-1">
              {REACTIONS.map((e) => (
                <DropdownMenuItem key={e} onClick={() => onReact(e)} aria-label={`${reactions[e].mine ? "Remove" : "React with"} ${REACTION_NAMES[e]}`} className={cn("justify-center px-2 text-lg", reactions[e].mine && "bg-ion/15")}>
                  {e}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </article>
  )
}
