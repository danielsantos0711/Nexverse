"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { PencilIcon, QuoteIcon, RotateCwIcon, Trash2Icon } from "lucide-react"
import { AddToCollection } from "@/components/collections/add-to-collection"
import { selectionIn, ThreadDiscussion, type QuoteRequest } from "@/components/forum/discussion"
import { getForumThread, listForumThreads, type ForumReply, type ForumThread } from "@/components/forum/forum-data"
import { Breadcrumbs, EditedMarker, HiddenBadge, LockedBadge, PinnedBadge, SolvedBadge } from "@/components/forum/forum-ui"
import { ThreadSummary } from "@/components/ai/thread-summary"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { PollCard } from "@/components/forum/poll"
import { PostBody } from "@/components/forum/post-body"
import { PostModeration } from "@/components/forum/post-moderation"
import { PostReactions } from "@/components/forum/reactions"
import { TagInput, TagList } from "@/components/forum/tags"
import { Post, SimilarThreads, ThreadStats } from "@/components/forum/thread-parts"
import type { Poster, Topic } from "@/components/forum/topics"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { LangTag } from "@/components/hub/bits"
import { SaveButton } from "@/components/social/save-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { editThread, memberCandidate, mentionedMemberIds, type MentionCandidate } from "@/lib/community"
import { categoryPath } from "@/lib/data"
import { accentChip, findCategory, postBlockText, useForumMap } from "@/lib/forum-categories"
import { deleteQuestion, useSession } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const replyPoster = (a: ForumReply): Poster => ({ name: a.local ? "You" : (a.author?.name ?? "A member") })

type Editing = { title: string; body: string; tags: string[]; picked: MentionCandidate[]; error: string; busy: boolean }

/** A forum thread from the database (or from this browser in a copy without one): the first post, its replies and the reply box. */
export function MemberThread({ id }: { id: string }) {
  const router = useRouter()
  const { ready, user } = useSession()
  const map = useForumMap()
  const [q, setQ] = useState<ForumThread | null | undefined>(undefined)
  const [answers, setAnswers] = useState<ForumReply[]>([])
  const [accepted, setAccepted] = useState<string | null>(null)
  const [similar, setSimilar] = useState<Topic[]>([])
  const [editing, setEditing] = useState<Editing | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [quote, setQuote] = useState<QuoteRequest | null>(null)
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [attempt, setAttempt] = useState(0)

  // Loads once the session is known: authors and staff also receive threads moderators hid.
  useEffect(() => {
    if (!ready) return
    let stale = false
    getForumThread(id)
      .then((x) => {
        if (stale) return
        setQ(x)
        setLoadError("")
        if (!x) return
        setAccepted(x.acceptedAnswerId)
        document.title = `${x.title} · Forum · Nexverse`
        listForumThreads({ category: x.orbit, limit: 8 })
          .then((list) => !stale && setSimilar(list.filter((t) => t.id !== x.id).slice(0, 5)))
          .catch(() => {})
      })
      .catch((e: Error) => !stale && setLoadError(e.message))
    return () => {
      stale = true
    }
  }, [id, ready, user?.id, attempt])

  const participantsForMentions = useMemo(() => (q?.author && q.author.id !== user?.id ? [memberCandidate(q.author)] : []), [q?.author, user?.id])

  if (loadError && !q) {
    return (
      <Empty className="mx-auto max-w-xl py-24">
        <EmptyHeader>
          <EmptyTitle><Copy k="thread.member-thread.this-thread-could-not-be">This thread could not be loaded</Copy></EmptyTitle>
          <EmptyDescription>{loadError}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            <RotateCwIcon aria-hidden /> <Copy k="thread.member-thread.try-again">Try again</Copy>
          </Button>
          <Button variant="ghost" nativeButton={false} render={<Link href="/forum" />}>
            <Copy k="thread.member-thread.back-to-the-forum">Back to the forum</Copy>
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  if (q === undefined) return <PageSkeleton />
  // Deleted, never existed, or hidden by moderators (others do not receive hidden threads at all).
  // Shown in place: the site-wide 404 page brings its own header, and this page already has one.
  if (q === null) {
    return (
      <Empty className="mx-auto max-w-xl py-24">
        <EmptyHeader>
          <EmptyTitle><Copy k="thread.member-thread.this-thread-is-not-here">This thread is not here</Copy></EmptyTitle>
          <EmptyDescription><Copy k="thread.member-thread.it-may-have-been-deleted">It may have been deleted, or the link is wrong.</Copy></EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="secondary" nativeButton={false} render={<Link href="/forum" />}>
            <Copy k="thread.member-thread.back-to-the-forum">Back to the forum</Copy>
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const cat = findCategory(map, q.orbit)
  const isAuthor = q.local || Boolean(user && q.authorId === user.id)
  const author: Poster = { name: q.local ? "You" : (q.author?.name ?? "A member") }
  const solved = answers.some((a) => a.id === accepted)
  const participants = [author, ...answers.map(replyPoster)].filter((p, i, all) => all.findIndex((x) => x.name === p.name) === i)
  const names = [q.author?.name, ...answers.map((a) => a.author?.name)].filter((n): n is string => Boolean(n))
  const crumbs = [{ label: "Forum", href: "/forum" }, ...(cat ? [{ label: cat.name, href: categoryPath(cat.slug) }] : []), { label: q.title }]

  async function remove() {
    if (!q) return
    setConfirmDelete(false)
    try {
      await deleteQuestion(q.id)
      router.push(cat ? categoryPath(cat.slug) : "/forum")
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function save() {
    if (!q || !editing || editing.busy) return
    setEditing({ ...editing, busy: true, error: "" })
    try {
      const editedAt = await editThread(q, { title: editing.title, body: editing.body, tags: editing.tags, mentions: mentionedMemberIds(editing.body, editing.picked) })
      setQ({ ...q, title: editing.title.trim(), body: editing.body.trim(), tags: editing.tags, editedAt })
      setEditing(null)
    } catch (e) {
      setEditing((x) => x && { ...x, busy: false, error: (e as Error).message })
    }
  }

  return (
    <div className="shell pt-6 pb-16 lg:pt-8">
      <Breadcrumbs items={crumbs} />

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-3">
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-title" className="text-sm font-medium">
                  <Copy k="thread.member-thread.title">Title</Copy>
                </label>
                <Input id="edit-title" value={editing.title} maxLength={300} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="h-11 bg-background/60 text-base" />
              </div>
            ) : (
              <h1 lang={q.lang} className="text-xl leading-snug font-semibold tracking-[-0.015em] md:text-2xl">
                {q.title}
              </h1>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {cat && (
                <Link
                  href={categoryPath(cat.slug)}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", accentChip(cat.accent))}
                >
                  {cat.name}
                </Link>
              )}
              <LangTag lang={q.lang} />
              {q.pinned && <PinnedBadge />}
              {q.locked && <LockedBadge />}
              {q.hidden && <HiddenBadge />}
              {solved && <SolvedBadge />}
              {!editing && <TagList tags={q.tags} hrefBase={cat ? categoryPath(cat.slug) : undefined} />}
            </div>
            {q.hidden && (
              <p className="rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2 text-sm text-muted-foreground">
                {isAuthor ? "Moderators hid this thread. Only you and the moderators can see it." : "Hidden from members. Only its author and the moderators can see it."}
              </p>
            )}
            {q.local && <p className="text-sm text-muted-foreground"><Copy k="thread.member-thread.saved-on-this-device-only" multiline>Saved on this device only. This copy of Nexverse has no database, so nobody else can see it.</Copy></p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </header>

          <Post
            n={1}
            original
            poster={author}
            date={q.createdAt}
            hidden={q.hidden}
            note={<EditedMarker at={q.editedAt} />}
            actions={
              !editing && (
                <>
                  <PostReactions target={`thread:${q.id}`} />
                  {!q.locked && (
                    <Button variant="ghost" size="sm" onClick={() => setQuote({ key: Date.now(), name: author.name, body: selectionIn("post-1") ?? q.body ?? q.title, author: q.author })}>
                      <QuoteIcon aria-hidden /> <Copy k="thread.member-thread.quote">Quote</Copy>
                    </Button>
                  )}
                  {!q.local && <SaveButton target={`thread:${q.id}`} />}
                  {!q.local && <AddToCollection target={`thread:${q.id}`} />}
                  {isAuthor && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ title: q.title, body: q.body, tags: q.tags, picked: [], error: "", busy: false })}>
                      <PencilIcon aria-hidden /> <Copy k="thread.member-thread.edit">Edit</Copy>
                    </Button>
                  )}
                  {isAuthor && (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                      <Trash2Icon aria-hidden /> <Copy k="thread.member-thread.delete-thread">Delete thread</Copy>
                    </Button>
                  )}
                  {!q.local && (
                    <PostModeration
                      kind="question"
                      id={q.id}
                      mine={isAuthor}
                      anchor="post-1"
                      hidden={q.hidden}
                      onModerated={(act) =>
                        act === "remove" ? router.push(cat ? categoryPath(cat.slug) : "/forum") : setQ((x) => x && { ...x, hidden: act === "hide" ? true : act === "unhide" ? false : x.hidden })
                      }
                      orbit={q.orbit}
                      thread={{ pinned: q.pinned, locked: q.locked, onChange: (f) => setQ((x) => x && { ...x, ...f }) }}
                    />
                  )}
                </>
              )
            }
          >
            {editing ? (
              <div className="flex flex-col gap-3">
                <MarkdownComposer
                  id="edit-body"
                  label="Details"
                  value={editing.body}
                  onChange={(body) => setEditing((x) => x && { ...x, body })}
                  participants={participantsForMentions}
                  onMention={(c) => setEditing((x) => x && { ...x, picked: [...x.picked, c] })}
                  onSubmit={save}
                  rows={8}
                />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="edit-tags" className="text-sm font-medium">
                    <Copy k="thread.member-thread.tags">Tags</Copy>
                  </label>
                  <TagInput id="edit-tags" value={editing.tags} onChange={(tags) => setEditing((x) => x && { ...x, tags })} />
                </div>
                {editing.error && <FieldError>{editing.error}</FieldError>}
                <div className="flex gap-2">
                  <Button onClick={save} disabled={editing.busy}>
                    {editing.busy ? "Saving…" : "Save changes"}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    <Copy k="thread.member-thread.cancel">Cancel</Copy>
                  </Button>
                </div>
              </div>
            ) : q.body ? (
              <PostBody source={q.body} names={names} lang={q.lang} />
            ) : (
              <p className="text-sm text-muted-foreground"><Copy k="thread.member-thread.no-details-just-the-title">No details, just the title.</Copy></p>
            )}
          </Post>

          <PollCard question={q} />

          <ThreadDiscussion
            threadId={q.id}
            question={q}
            acceptedId={accepted}
            startAt={2}
            participants={participantsForMentions}
            locked={q.locked || Boolean(cat?.archived)}
            lockedNote={!q.locked && cat?.archived ? postBlockText("archived", cat) : undefined}
            quote={quote}
            onChange={(next, acceptedAnswerId) => {
              setAnswers(next)
              setAccepted(acceptedAnswerId)
            }}
          />
        </div>

        <aside aria-label="Thread details" className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <ThreadStats replies={answers.length} participants={participants} created={q.createdAt} lastReply={answers.at(-1)?.createdAt ?? null} />
          <ThreadSummary
            threadId={q.id}
            title={q.title}
            posts={[{ author: author.name, body: q.body ?? "" }, ...answers.map((a) => ({ author: replyPoster(a).name, body: a.body }))]}
          />
          <SimilarThreads topics={similar} categoryName={cat?.name} />
        </aside>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this thread?</DialogTitle>
            <DialogDescription>
              The thread, its replies and its poll disappear for everyone. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              <Copy k="thread.member-thread.cancel">Cancel</Copy>
            </Button>
            <Button variant="destructive" onClick={remove}>
              <Copy k="thread.member-thread.delete-thread">Delete thread</Copy>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
