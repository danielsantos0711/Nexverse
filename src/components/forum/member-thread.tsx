"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { Breadcrumbs, SolvedBadge } from "@/components/forum/forum-ui"
import { AcceptedAnswer, Post, SimilarThreads, ThreadStats } from "@/components/forum/thread-parts"
import { similarTopics, type Poster } from "@/components/forum/topics"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { LangTag } from "@/components/hub/bits"
import { LikeButton } from "@/components/hub/like-button"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { categoryPath, getCategory } from "@/lib/data"
import { deleteQuestion, getQuestion, useSession, type Answer, type Question } from "@/lib/store"
import { SaveButton } from "@/components/social/save-button"

const answerPoster = (a: Answer): Poster => ({ name: a.local ? "You" : (a.author?.name ?? "A member") })

/** A thread a member started, loaded from the database (or from this browser in a local copy). */
export function MemberThread({ id }: { id: string }) {
  const router = useRouter()
  const { user } = useSession()
  const [q, setQ] = useState<Question | null | undefined>(undefined)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    let stale = false
    getQuestion(id)
      .then((x) => {
        if (stale) return
        setQ(x)
        if (x) document.title = `${x.title} · Nexverse`
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [id])

  if (error) return <Missing title="This thread could not be loaded" detail={error} />
  if (q === undefined) return <PageSkeleton />
  if (q === null) return <Missing title="This thread is not here" detail="It may have been deleted by the person who started it." />

  const cat = getCategory(q.orbit)
  const isAuthor = q.local || Boolean(user && q.author?.id === user.id)
  const author: Poster = { name: q.local ? "You" : (q.author?.name ?? "A member") }
  const acceptedIndex = answers.findIndex((a) => a.id === q.acceptedAnswerId)
  const accepted = acceptedIndex >= 0 ? answers[acceptedIndex] : null
  const participants = [author, ...answers.map(answerPoster)].filter((p, i, all) => all.findIndex((x) => x.name === p.name) === i)
  const similar = cat ? similarTopics(q.id, cat.slug) : []

  async function remove() {
    if (!q || !confirm("Delete this thread and its replies?")) return
    try {
      await deleteQuestion(q.id)
      router.push(cat ? categoryPath(cat.slug) : "/forum")
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="shell pt-6 pb-16 lg:pt-8">
      <Breadcrumbs items={[{ label: "Forum", href: "/forum" }, ...(cat ? [{ label: cat.name, href: categoryPath(cat.slug) }] : []), { label: q.title }]} />

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-3">
            <h1 lang={q.lang} className="text-xl leading-snug font-semibold tracking-[-0.015em] md:text-2xl">
              {q.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {cat && (
                <Link href={categoryPath(cat.slug)} className="rounded-full border border-ion/25 bg-ion/10 px-2.5 py-0.5 text-xs text-ion transition-colors hover:bg-ion/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {cat.name}
                </Link>
              )}
              <LangTag lang={q.lang} />
              {accepted && <SolvedBadge />}
              {isAuthor && (
                <Button variant="ghost" size="sm" onClick={remove} className="ml-auto">
                  Delete thread
                </Button>
              )}
            </div>
            {q.local && <p className="text-sm text-muted-foreground">Saved on this device only. This copy of Nexverse has no database, so nobody else can see it.</p>}
          </header>

          <Post
            n={1}
            original
            poster={author}
            date={q.createdAt}
            actions={
              !q.local && (
                <>
                  <LikeButton target={`thread:${q.id}`} label="Upvote" />
                  <SaveButton target={`thread:${q.id}`} />
                </>
              )
            }
          >
            {q.body ? (
              <p lang={q.lang} className="text-[15px] leading-relaxed whitespace-pre-wrap">
                {q.body}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No details, just the title.</p>
            )}
          </Post>

          {accepted && (
            <AcceptedAnswer n={acceptedIndex + 2} poster={answerPoster(accepted)} date={accepted.createdAt}>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{accepted.body}</p>
            </AcceptedAnswer>
          )}

          <ThreadDiscussion
            threadId={q.id}
            question={q}
            startAt={2}
            onChange={(next, acceptedAnswerId) => {
              setAnswers(next)
              setQ((x) => x && { ...x, answerCount: next.length, acceptedAnswerId })
            }}
          />
        </div>

        <aside aria-label="Thread details" className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <ThreadStats replies={answers.length} views={null} participants={participants} created={q.createdAt} lastReply={answers.at(-1)?.createdAt ?? null} />
          <SimilarThreads topics={similar} categoryName={cat?.name} />
        </aside>
      </div>
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
