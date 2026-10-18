"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { CheckCircle2Icon, PencilIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { EditedMarker, MemberAvatar } from "@/components/forum/forum-ui"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { PostBody } from "@/components/forum/post-body"
import { PostReactions } from "@/components/forum/reactions"
import { Post } from "@/components/forum/thread-parts"
import { ago } from "@/lib/data"
import { createReply, editReply, listReplies, markSolved, memberCandidate, mentionedMemberIds, type MentionCandidate, type Reply } from "@/lib/community"
import { deleteAnswer, useSession, type Question, type ThreadRef } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

// Kept here so existing imports keep working; it lives with the forum's other bits now.
export { MemberAvatar }

const replyName = (a: Reply) => (a.local ? "You" : (a.author?.name ?? "A member"))

/**
 * Members' replies to a thread, and the box to write one. Works for sample threads (by slug) and for members'
 * own threads (by id). Replies are Markdown with @mentions and reactions; authors can edit or delete theirs, and
 * on their own thread the author can mark the reply that solved it.
 */
export function ThreadDiscussion({
  threadId,
  question,
  acceptedId: acceptedProp,
  heading = "Replies from members",
  onChange,
  startAt,
  participants = [],
}: {
  threadId: string
  question?: Question
  /** The accepted reply, when the page already knows it (browser-only threads keep it outside the question). */
  acceptedId?: string | null
  heading?: string
  /** Called when replies load and whenever they or the accepted reply change. */
  onChange?: (answers: Reply[], acceptedId: string | null) => void
  /** On forum threads, the post number of the first reply here (posts above it are numbered before). */
  startAt?: number
  /** People already in the thread, suggested first when someone types @. */
  participants?: MentionCandidate[]
}) {
  const thread: ThreadRef = { kind: question && !question.local ? "question" : "sample", id: threadId }
  const { ready, user } = useSession()
  const pathname = usePathname()
  const reduce = useReducedMotion()
  const [answers, setAnswers] = useState<Reply[]>([])
  const [loaded, setLoaded] = useState(false)
  const [accepted, setAccepted] = useState<string | null>(acceptedProp ?? question?.acceptedAnswerId ?? null)
  const [draft, setDraft] = useState("")
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<{ id: string; body: string; picked: MentionCandidate[]; error: string; busy: boolean } | null>(null)
  const [deleting, setDeleting] = useState<Reply | null>(null)
  const isAuthor = Boolean(question && (question.local || (user && question.author?.id === user.id)))

  useEffect(() => {
    let stale = false
    listReplies(thread)
      .then((a) => {
        if (stale) return
        setAnswers(a)
        setLoaded(true)
        onChange?.(a, acceptedProp ?? question?.acceptedAnswerId ?? null)
      })
      .catch((e: Error) => !stale && (setError(e.message), setLoaded(true)))
    return () => {
      stale = true
    }
  }, [thread.kind, thread.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Everyone who replied can be mentioned, along with whoever the page passes in.
  const mentionable = useMemo(() => {
    const fromReplies = answers.filter((a) => a.author && a.author.id !== user?.id).map((a) => memberCandidate(a.author!))
    const all = [...participants, ...fromReplies]
    return all.filter((c, i) => all.findIndex((x) => x.key === c.key) === i)
  }, [answers, participants, user?.id])
  const names = useMemo(() => mentionable.filter((c) => c.memberId).map((c) => c.name), [mentionable])

  function update(next: Reply[], nextAccepted = accepted) {
    setAnswers(next)
    setAccepted(nextAccepted)
    onChange?.(next, nextAccepted)
  }

  async function post(e?: React.FormEvent) {
    e?.preventDefault()
    if (!draft.trim() || busy) return
    setBusy(true)
    setError("")
    try {
      update([...answers, await createReply(thread, draft.trim(), mentionedMemberIds(draft, picked))])
      setDraft("")
      setPicked([])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing || editing.busy) return
    const { id, body } = editing
    setEditing({ ...editing, busy: true, error: "" })
    const before = answers
    try {
      const r = await editReply(thread, id, body, mentionedMemberIds(body, editing.picked))
      update(answers.map((a) => (a.id === id ? { ...a, body: r.body, editedAt: r.editedAt } : a)))
      setEditing(null)
    } catch (err) {
      update(before)
      setEditing((x) => x && { ...x, busy: false, error: (err as Error).message })
    }
  }

  async function confirmDelete() {
    const a = deleting
    if (!a) return
    setDeleting(null)
    const before = answers
    // Optimistic: the reply leaves the list at once and comes back if the database refuses.
    update(
      answers.filter((x) => x.id !== a.id),
      accepted === a.id ? null : accepted
    )
    try {
      await deleteAnswer(thread, a.id)
      if (accepted === a.id && question) await markSolved(question, null).catch(() => {})
    } catch (err) {
      update(before, accepted)
      setError((err as Error).message)
    }
  }

  async function accept(id: string) {
    if (!question) return
    const before = accepted
    const next = accepted === id ? null : id
    update(answers, next)
    try {
      await markSolved(question, next)
    } catch (err) {
      update(answers, before)
      setError((err as Error).message)
    }
  }

  const signedOut = live && ready && !user

  return (
    <section aria-labelledby={`${threadId}-replies`} className="flex flex-col gap-4">
      {(answers.length > 0 || question) && (
        <h2 id={`${threadId}-replies`} className="text-base font-semibold">
          {answers.length ? `${heading} · ${answers.length}` : loaded ? "No replies yet" : "Loading replies…"}
        </h2>
      )}
      <ol className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {answers.map((a, i) => {
            const mine = a.local || Boolean(user && a.author?.id === user.id)
            const isAccepted = accepted === a.id
            const isEditing = editing?.id === a.id
            const controls = !isEditing && (
              <div className="flex flex-wrap items-center gap-2">
                <PostReactions target={`answer:${a.id}`} />
                {isAuthor && (
                  <Button variant={isAccepted ? "secondary" : "ghost"} size="sm" onClick={() => accept(a.id)} aria-pressed={isAccepted}>
                    <CheckCircle2Icon aria-hidden className={cn(isAccepted && "text-ok")} />
                    {isAccepted ? "Solved it · undo" : "Mark as solved"}
                  </Button>
                )}
                {mine && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ id: a.id, body: a.body, picked: [], error: "", busy: false })}>
                      <PencilIcon aria-hidden /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(a)}>
                      <Trash2Icon aria-hidden /> Delete
                    </Button>
                  </>
                )}
              </div>
            )
            const body = isEditing ? (
              <div className="flex flex-col gap-2">
                <MarkdownComposer
                  id={`edit-${a.id}`}
                  label="Edit your reply"
                  value={editing.body}
                  onChange={(body) => setEditing((x) => x && { ...x, body })}
                  participants={mentionable}
                  onMention={(c) => setEditing((x) => x && { ...x, picked: [...x.picked, c] })}
                  onSubmit={saveEdit}
                  autoFocus
                  invalid={Boolean(editing.error)}
                />
                {editing.error && <FieldError>{editing.error}</FieldError>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit} disabled={editing.busy || !editing.body.trim()}>
                    {editing.busy ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <PostBody source={a.body} names={names} />
            )
            const meta = (
              <>
                {a.local && <span className="text-xs text-muted-foreground">· saved on this device only</span>}
                <EditedMarker at={a.editedAt} />
              </>
            )
            return (
              <motion.li
                key={a.id}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(10px)" }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.98)" }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className={startAt === undefined ? cn("flex flex-col gap-3 rounded-xl border p-4", isAccepted ? "border-ok/40 bg-ok/[0.05]" : "border-border bg-card/60") : undefined}
              >
                {startAt !== undefined ? (
                  <Post n={startAt + i} animate={false} poster={{ name: replyName(a) }} date={a.createdAt} accepted={isAccepted} note={meta} actions={controls}>
                    {body}
                  </Post>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                      <MemberAvatar name={a.author?.name} size={24} />
                      <span className="font-medium">{replyName(a)}</span>
                      <span className="text-xs text-muted-foreground">{ago(a.createdAt)}</span>
                      {meta}
                      {isAccepted && (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs text-ok">
                          <CheckCircle2Icon aria-hidden className="size-3.5" /> Solved it
                        </span>
                      )}
                    </div>
                    {body}
                    {controls}
                  </>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>

      {signedOut ? (
        <div className="glass flex flex-col items-start gap-3 rounded-xl p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Sign in to reply. It takes an email address and nothing else.</p>
          <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className="pressable inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
            Sign in to reply
          </Link>
        </div>
      ) : (
        <form onSubmit={post} className="glass flex flex-col gap-3 rounded-xl p-4">
          <label htmlFor={`${threadId}-reply`} className="text-sm font-medium">
            Your reply
          </label>
          <MarkdownComposer
            id={`${threadId}-reply`}
            value={draft}
            onChange={setDraft}
            rows={4}
            placeholder="Write in whichever language you think in. Type @ to mention someone."
            participants={mentionable}
            onMention={(c) => setPicked((p) => (p.some((x) => x.key === c.key) ? p : [...p, c]))}
            onSubmit={() => void post()}
            invalid={Boolean(error)}
            describedBy={`${threadId}-reply-note`}
          />
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <p id={`${threadId}-reply-note`} className="text-sm text-muted-foreground">
              {live ? "Everyone can read replies. Yours appears with your name." : "This copy has no database, so your reply stays in this browser."}
            </p>
          )}
          <Button type="submit" className="self-start" disabled={!draft.trim() || busy || (live && !ready)}>
            {busy ? "Posting…" : "Post reply"}
          </Button>
        </form>
      )}

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this reply?</DialogTitle>
            <DialogDescription>It disappears for everyone. This can’t be undone.</DialogDescription>
          </DialogHeader>
          {deleting && <p className="line-clamp-3 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground">{deleting.body}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
