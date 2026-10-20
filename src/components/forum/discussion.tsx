"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2Icon, LockIcon, PencilIcon, QuoteIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import { listForumReplies, type ForumReply } from "@/components/forum/forum-data"
import { EditedMarker, HiddenBadge, MemberAvatar } from "@/components/forum/forum-ui"
import { AiAssistButton } from "@/components/ai/ai-assist-button"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { PostBody } from "@/components/forum/post-body"
import { PostModeration } from "@/components/forum/post-moderation"
import { PostReactions } from "@/components/forum/reactions"
import { Post } from "@/components/forum/thread-parts"
import { TimeAgo } from "@/components/live/time"
import { Gate } from "@/components/moderation/gate"
import { createReply, editReply, markSolved, memberCandidate, mentionedMemberIds, type MentionCandidate, type Reply } from "@/lib/community"
import { useRole } from "@/lib/roles"
import { deleteAnswer, useSession, type Member, type Question, type ThreadRef } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

// Kept here so existing imports keep working; it lives with the forum's other bits now.
export { MemberAvatar }

const replyName = (a: Reply) => (a.local ? "You" : (a.author?.name ?? "A member"))

/** A request to quote a post into the reply box. `key` changes each time, so quoting the same post twice works. */
export type QuoteRequest = { key: number; name: string; body: string; author: Member | null }

/** The Markdown for a quote: the author, then the quoted text as a blockquote, then a blank line to write under. */
export function quoteMarkdown(name: string, text: string) {
  const clean = text.trim()
  const short = clean.length > 700 ? `${clean.slice(0, 700).trimEnd()}…` : clean
  return `> **${name}** wrote:\n${short
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")}\n\n`
}

/** The text selected inside an element, if any; otherwise null. */
export function selectionIn(id: string): string | null {
  const sel = typeof window === "undefined" ? null : window.getSelection()
  const text = sel?.toString().trim()
  const el = document.getElementById(id)
  if (!sel || !text || !el || !sel.anchorNode || !el.contains(sel.anchorNode)) return null
  return text
}

/**
 * Members' replies to a thread, and the box to write one. Used by forum threads (by question id) and by the
 * comment threads on news, projects and launches (by a text key). Replies are Markdown with @mentions,
 * quotes and reactions; authors can edit or delete theirs, staff can remove any, and on their own forum
 * thread the author can mark the reply that solved it. Writing needs an account (see <Gate>).
 */
export function ThreadDiscussion({
  threadId,
  question,
  acceptedId: acceptedProp,
  heading = "Replies",
  onChange,
  startAt,
  participants = [],
  locked = false,
  lockedNote,
  quote,
}: {
  threadId: string
  question?: Question
  /** The accepted reply, when the page already knows it (browser-only threads keep it outside the question). */
  acceptedId?: string | null
  heading?: string
  /** Called when replies load and whenever they or the accepted reply change. */
  onChange?: (answers: ForumReply[], acceptedId: string | null) => void
  /** On forum threads, the post number of the first reply here (posts above it are numbered before). */
  startAt?: number
  /** People already in the thread, suggested first when someone types @. */
  participants?: MentionCandidate[]
  /** Locked by staff: members can read but not reply. */
  locked?: boolean
  /** Why replies are closed, when it is not a moderator's lock (an archived category, say). */
  lockedNote?: string
  /** Set by the page to quote a post outside this list (the thread's first post) into the reply box. */
  quote?: QuoteRequest | null
}) {
  const thread: ThreadRef = { kind: question && !question.local ? "question" : "sample", id: threadId }
  const { user } = useSession()
  const { isStaff } = useRole()
  const reduce = useReducedMotion()
  const [answers, setAnswers] = useState<ForumReply[]>([])
  const [loaded, setLoaded] = useState(false)
  const [accepted, setAccepted] = useState<string | null>(acceptedProp ?? question?.acceptedAnswerId ?? null)
  const [draft, setDraft] = useState("")
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [editing, setEditing] = useState<{ id: string; body: string; picked: MentionCandidate[]; error: string; busy: boolean } | null>(null)
  const [deleting, setDeleting] = useState<ForumReply | null>(null)
  const isAuthor = Boolean(question && (question.local || (user && question.author?.id === user.id)))
  const composerId = `${threadId}-reply`
  const lastQuote = useRef<number | null>(null)

  useEffect(() => {
    let stale = false
    listForumReplies(thread)
      .then((a) => {
        if (stale) return
        setAnswers(a)
        setLoaded(true)
        onChange?.(a, acceptedProp ?? question?.acceptedAnswerId ?? null)
      })
      .catch((e: Error) => !stale && (setLoadError(e.message), setLoaded(true)))
    return () => {
      stale = true
    }
  }, [thread.kind, thread.id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Everyone who replied can be mentioned, along with whoever the page passes in.
  const mentionable = useMemo(() => {
    const fromReplies = answers.filter((a) => a.author && a.author.id !== user?.id).map((a) => memberCandidate(a.author!))
    const all = [...participants, ...fromReplies]
    return all.filter((c, i) => all.findIndex((x) => x.key === c.key) === i)
  }, [answers, participants, user?.id])
  const names = useMemo(() => mentionable.filter((c) => c.memberId).map((c) => c.name), [mentionable])

  function addQuote(name: string, text: string, author: Member | null) {
    setDraft((d) => `${d && !d.endsWith("\n\n") ? `${d.trimEnd()}\n\n` : d}${quoteMarkdown(name, text)}`)
    if (author && author.id !== user?.id) {
      const c = memberCandidate(author)
      setPicked((p) => (p.some((x) => x.key === c.key) ? p : [...p, c]))
    }
    // The box may still be behind the sign-in prompt; when it is there, put the caret under the quote.
    requestAnimationFrame(() => {
      const box = document.getElementById(composerId) as HTMLTextAreaElement | null
      if (!box) return
      box.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
      box.focus({ preventScroll: true })
      box.setSelectionRange(box.value.length, box.value.length)
    })
  }

  useEffect(() => {
    if (!quote || lastQuote.current === quote.key) return
    lastQuote.current = quote.key
    addQuote(quote.name, quote.body, quote.author)
  }, [quote]) // eslint-disable-line react-hooks/exhaustive-deps

  function update(next: ForumReply[], nextAccepted = accepted) {
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
      const r = await createReply(thread, draft.trim(), mentionedMemberIds(draft, picked))
      update([...answers, { ...r, hidden: false }])
      setDraft("")
      setPicked([])
    } catch (err) {
      const msg = (err as Error).message
      setError(/row-level security/i.test(msg) || /not allowed/i.test(msg) ? "Your reply was not posted. The thread may be locked, or posting is paused on your account." : msg)
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing || editing.busy) return
    const { id, body } = editing
    setEditing({ ...editing, busy: true, error: "" })
    try {
      const r = await editReply(thread, id, body, mentionedMemberIds(body, editing.picked))
      update(answers.map((a) => (a.id === id ? { ...a, body: r.body, editedAt: r.editedAt } : a)))
      setEditing(null)
    } catch (err) {
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
      if (accepted === a.id && question && isAuthor) await markSolved(question, null).catch(() => {})
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

  const visible = answers.length
  const headingId = `${threadId}-replies`

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-base font-semibold">
        {!loaded ? "Loading replies…" : visible ? `${heading} · ${visible}` : question ? "No replies yet" : heading}
      </h2>
      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          The replies could not be loaded. {loadError}
        </p>
      )}
      {loaded && !visible && !loadError && <p className="-mt-2 text-sm text-muted-foreground">{locked ? "This thread was locked before anyone replied." : "Be the first to reply."}</p>}
      <ol className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {answers.map((a, i) => {
            const mine = a.local || Boolean(user && a.author?.id === user.id)
            const isAccepted = accepted === a.id
            const isEditing = editing?.id === a.id
            const postKey = startAt !== undefined ? `post-${startAt + i}` : `reply-${a.id}`
            const controls = !isEditing && (
              <div className="flex flex-wrap items-center gap-1.5">
                <PostReactions target={`answer:${a.id}`} />
                {!locked && (
                  <Button variant="ghost" size="sm" onClick={() => addQuote(replyName(a), selectionIn(postKey) ?? a.body, a.author)}>
                    <QuoteIcon aria-hidden /> <Copy k="thread.discussion.quote">Quote</Copy>
                  </Button>
                )}
                {isAuthor && question && (
                  <Button variant={isAccepted ? "secondary" : "ghost"} size="sm" onClick={() => accept(a.id)} aria-pressed={isAccepted}>
                    <CheckCircle2Icon aria-hidden className={cn(isAccepted && "text-ok")} />
                    {isAccepted ? "Solution · undo" : "Mark as solution"}
                  </Button>
                )}
                {mine && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ id: a.id, body: a.body, picked: [], error: "", busy: false })}>
                    <PencilIcon aria-hidden /> <Copy k="thread.discussion.edit">Edit</Copy>
                  </Button>
                )}
                {mine && (
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(a)}>
                    <Trash2Icon aria-hidden /> <Copy k="thread.discussion.delete">Delete</Copy>
                  </Button>
                )}
                {!a.local && (
                  <PostModeration
                    kind="answer"
                    id={a.id}
                    orbit={question?.orbit}
                    mine={mine}
                    anchor={postKey}
                    hidden={a.hidden}
                    onModerated={(act) =>
                      act === "remove"
                        ? update(
                            answers.filter((x) => x.id !== a.id),
                            accepted === a.id ? null : accepted
                          )
                        : update(answers.map((x) => (x.id === a.id ? { ...x, hidden: act === "hide" ? true : act === "unhide" ? false : x.hidden } : x)))
                    }
                  />
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
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={saveEdit} disabled={editing.busy || !editing.body.trim()}>
                    {editing.busy ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    <Copy k="thread.discussion.cancel">Cancel</Copy>
                  </Button>
                  <AiAssistButton value={editing.body} onAccept={(body) => setEditing((x) => x && { ...x, body })} />
                </div>
              </div>
            ) : (
              <PostBody source={a.body} names={names} />
            )
            const meta = (
              <>
                {a.local && <span className="text-xs text-muted-foreground"><Copy k="thread.discussion.saved-on-this-device-only">· saved on this device only</Copy></span>}
                <EditedMarker at={a.editedAt} />
                {a.hidden && <HiddenBadge />}
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
                id={startAt === undefined ? postKey : undefined}
                className={
                  startAt === undefined
                    ? cn("flex scroll-mt-24 flex-col gap-3 rounded-xl border p-4", isAccepted ? "border-ok/40 bg-ok/[0.05]" : a.hidden ? "border-gold/25 bg-gold/[0.03]" : "border-border bg-card/60")
                    : undefined
                }
              >
                {startAt !== undefined ? (
                  <Post n={startAt + i} animate={false} poster={{ name: replyName(a) }} date={a.createdAt} accepted={isAccepted} hidden={a.hidden} note={meta} actions={controls}>
                    {body}
                  </Post>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                      <MemberAvatar name={a.author?.name ?? replyName(a)} size={24} />
                      <span className="font-medium">{replyName(a)}</span>
                      <TimeAgo date={a.createdAt} className="text-xs text-muted-foreground" />
                      {meta}
                      {isAccepted && (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs text-ok">
                          <CheckCircle2Icon aria-hidden className="size-3.5" /> <Copy k="thread.discussion.solution">Solution</Copy>
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

      {locked && !isStaff ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
          <LockIcon aria-hidden className="size-4 shrink-0" />
          {lockedNote ?? "The moderators locked this thread. You can still read it, react and quote it in a new thread."}
        </div>
      ) : (
        <Gate cap="reply.create" action="reply">
          <form onSubmit={post} className="glass flex flex-col gap-3 rounded-xl p-4">
            <label htmlFor={composerId} className="text-sm font-medium">
              <Copy k="thread.discussion.your-reply">Your reply</Copy>
            </label>
            {locked && <p className="text-xs text-gold"><Copy k="thread.discussion.this-thread-is-locked-as">This thread is locked. As a moderator you can still reply.</Copy></p>}
            <MarkdownComposer
              id={composerId}
              value={draft}
              onChange={setDraft}
              rows={4}
              placeholder="Write in whichever language you think in. Type @ to mention someone."
              participants={mentionable}
              onMention={(c) => setPicked((p) => (p.some((x) => x.key === c.key) ? p : [...p, c]))}
              onSubmit={() => void post()}
              invalid={Boolean(error)}
              describedBy={`${composerId}-note`}
            />
            {error ? (
              <FieldError>{error}</FieldError>
            ) : (
              <p id={`${composerId}-note`} className="text-sm text-muted-foreground">
                {live ? "Everyone can read replies. Yours appears with your name. Markdown works; select text in a post and press Quote to quote just that part." : "This copy has no database, so your reply stays in this browser."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!draft.trim() || busy}>
                {busy ? "Posting…" : "Post reply"}
              </Button>
              <AiAssistButton value={draft} onAccept={setDraft} />
            </div>
          </form>
        </Gate>
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
              <Copy k="thread.discussion.cancel">Cancel</Copy>
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Copy k="thread.discussion.delete">Delete</Copy>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
