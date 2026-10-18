"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { PencilIcon, Trash2Icon } from "lucide-react"
import { AddToCollection } from "@/components/collections/add-to-collection"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { Breadcrumbs, EditedMarker, SolvedBadge } from "@/components/forum/forum-ui"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { PollCard } from "@/components/forum/poll"
import { PostBody } from "@/components/forum/post-body"
import { PostReactions } from "@/components/forum/reactions"
import { TagInput, TagList } from "@/components/forum/tags"
import { AcceptedAnswer, Post, SimilarThreads, ThreadStats } from "@/components/forum/thread-parts"
import { similarTopics, type Poster } from "@/components/forum/topics"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { LangTag } from "@/components/hub/bits"
import { LikeButton } from "@/components/hub/like-button"
import { SaveButton } from "@/components/social/save-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { editThread, getThreadExtras, memberCandidate, mentionedMemberIds, type MentionCandidate, type Reply, type ThreadExtras } from "@/lib/community"
import { categoryPath, getCategory } from "@/lib/data"
import { deleteQuestion, getQuestion, useSession, type Question } from "@/lib/store"

const answerPoster = (a: Reply): Poster => ({ name: a.local ? "You" : (a.author?.name ?? "A member") })

type Editing = { title: string; body: string; tags: string[]; picked: MentionCandidate[]; error: string; busy: boolean }

/** A thread a member started, loaded from the database (or from this browser in a local copy). */
export function MemberThread({ id }: { id: string }) {
  const router = useRouter()
  const { user } = useSession()
  const [q, setQ] = useState<Question | null | undefined>(undefined)
  const [extras, setExtras] = useState<ThreadExtras>({ tags: [], editedAt: null, acceptedAnswerId: null })
  const [answers, setAnswers] = useState<Reply[]>([])
  const [accepted, setAccepted] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let stale = false
    getQuestion(id)
      .then(async (x) => {
        if (stale) return
        if (!x) {
          setQ(null)
          return
        }
        const more = await getThreadExtras(x).catch(() => ({ tags: [], editedAt: null, acceptedAnswerId: x.acceptedAnswerId }))
        if (stale) return
        setExtras(more)
        setAccepted(more.acceptedAnswerId)
        setQ(x)
        document.title = `${x.title} · Nexverse`
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [id])

  const participantsForMentions = useMemo(() => (q?.author && q.author.id !== user?.id ? [memberCandidate(q.author)] : []), [q?.author, user?.id])

  if (error && q === undefined) return <Missing title="This thread could not be loaded" detail={error} />
  if (q === undefined) return <PageSkeleton />
  if (q === null) return <Missing title="This thread is not here" detail="It may have been deleted by the person who started it." />

  const cat = getCategory(q.orbit)
  const isAuthor = q.local || Boolean(user && q.author?.id === user.id)
  const author: Poster = { name: q.local ? "You" : (q.author?.name ?? "A member") }
  const acceptedIndex = answers.findIndex((a) => a.id === accepted)
  const acceptedReply = acceptedIndex >= 0 ? answers[acceptedIndex] : null
  const participants = [author, ...answers.map(answerPoster)].filter((p, i, all) => all.findIndex((x) => x.name === p.name) === i)
  const similar = cat ? similarTopics(q.id, cat.slug) : []
  const names = [q.author?.name, ...answers.map((a) => a.author?.name)].filter((n): n is string => Boolean(n))

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
      setQ({ ...q, title: editing.title.trim(), body: editing.body.trim() })
      setExtras((x) => ({ ...x, tags: editing.tags, editedAt }))
      setEditing(null)
    } catch (e) {
      setEditing((x) => x && { ...x, busy: false, error: (e as Error).message })
    }
  }

  return (
    <div className="shell pt-6 pb-16 lg:pt-8">
      <Breadcrumbs items={[{ label: "Forum", href: "/forum" }, ...(cat ? [{ label: cat.name, href: categoryPath(cat.slug) }] : []), { label: q.title }]} />

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-3">
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-title" className="text-sm font-medium">
                  Title
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
                <Link href={categoryPath(cat.slug)} className="rounded-full border border-ion/25 bg-ion/10 px-2.5 py-0.5 text-xs text-ion transition-colors hover:bg-ion/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {cat.name}
                </Link>
              )}
              <LangTag lang={q.lang} />
              {acceptedReply && <SolvedBadge />}
              {!editing && <TagList tags={extras.tags} hrefBase={cat ? categoryPath(cat.slug) : undefined} />}
              {isAuthor && !editing && (
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ title: q.title, body: q.body, tags: extras.tags, picked: [], error: "", busy: false })}>
                    <PencilIcon aria-hidden /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                    <Trash2Icon aria-hidden /> Delete thread
                  </Button>
                </span>
              )}
            </div>
            {q.local && <p className="text-sm text-muted-foreground">Saved on this device only. This copy of Nexverse has no database, so nobody else can see it.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </header>

          <Post
            n={1}
            original
            poster={author}
            date={q.createdAt}
            note={<EditedMarker at={extras.editedAt} />}
            actions={
              !editing && (
                <>
                  {!q.local && <LikeButton target={`thread:${q.id}`} label="Upvote" />}
                  {!q.local && <SaveButton target={`thread:${q.id}`} />}
                  {!q.local && <AddToCollection target={`thread:${q.id}`} />}
                  <PostReactions target={`thread:${q.id}`} />
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
                    Tags
                  </label>
                  <TagInput id="edit-tags" value={editing.tags} onChange={(tags) => setEditing((x) => x && { ...x, tags })} />
                </div>
                {editing.error && <FieldError>{editing.error}</FieldError>}
                <div className="flex gap-2">
                  <Button onClick={save} disabled={editing.busy}>
                    {editing.busy ? "Saving…" : "Save changes"}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : q.body ? (
              <PostBody source={q.body} names={names} lang={q.lang} />
            ) : (
              <p className="text-sm text-muted-foreground">No details, just the title.</p>
            )}
          </Post>

          <PollCard question={q} />

          {acceptedReply && (
            <AcceptedAnswer n={acceptedIndex + 2} poster={answerPoster(acceptedReply)} date={acceptedReply.createdAt}>
              <PostBody source={acceptedReply.body} names={names} />
            </AcceptedAnswer>
          )}

          <ThreadDiscussion
            threadId={q.id}
            question={q}
            acceptedId={accepted}
            startAt={2}
            participants={participantsForMentions}
            onChange={(next, acceptedAnswerId) => {
              setAnswers(next)
              setAccepted(acceptedAnswerId)
              setQ((x) => x && { ...x, answerCount: next.length, acceptedAnswerId })
            }}
          />
        </div>

        <aside aria-label="Thread details" className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <ThreadStats replies={answers.length} views={null} participants={participants} created={q.createdAt} lastReply={answers.at(-1)?.createdAt ?? null} />
          <SimilarThreads topics={similar} categoryName={cat?.name} />
        </aside>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this thread?</DialogTitle>
            <DialogDescription>The thread, its replies and its poll disappear for everyone. This can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete thread
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Missing({ title, detail }: { title: string; detail: string }) {
  return (
    <Empty className="mx-auto max-w-xl py-24">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/forum" className="text-ion hover:underline">
          Back to the forum
        </Link>
      </EmptyContent>
    </Empty>
  )
}
