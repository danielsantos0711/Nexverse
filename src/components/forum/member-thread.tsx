"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { MemberAvatar, ThreadDiscussion } from "@/components/forum/discussion"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { LangTag } from "@/components/hub/bits"
import { LikeButton } from "@/components/hub/like-button"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ago, getCategory } from "@/lib/data"
import { deleteQuestion, getQuestion, useSession, type Question } from "@/lib/store"

/** A thread a member started, loaded from the database (or from this browser in a local copy). */
export function MemberThread({ id }: { id: string }) {
  const router = useRouter()
  const { user } = useSession()
  const [q, setQ] = useState<Question | null | undefined>(undefined)
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

  async function remove() {
    if (!q || !confirm("Delete this thread and its replies?")) return
    try {
      await deleteQuestion(q.id)
      router.push("/forum")
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="shell flex max-w-4xl flex-col gap-8 pt-8 lg:pt-12">
      <header className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/forum" className="hover:text-foreground">
            Forum
          </Link>
          {cat && (
            <>
              <span aria-hidden> / </span>
              <Link href={`/forum?c=${cat.slug}`} className="text-ion hover:underline">
                {cat.name}
              </Link>
            </>
          )}
        </nav>
        <h1 lang={q.lang} className="text-2xl leading-tight font-semibold tracking-[-0.025em] md:text-[2.1rem]">
          {q.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2 text-foreground">
            <MemberAvatar name={q.author?.name} size={26} />
            {q.local ? "You" : (q.author?.name ?? "A member")}
          </span>
          <span>{ago(q.createdAt)}</span>
          <LangTag lang={q.lang} />
          {isAuthor && (
            <Button variant="ghost" size="sm" onClick={remove} className="ml-auto">
              Delete thread
            </Button>
          )}
        </div>
        {q.local && <p className="text-sm text-muted-foreground">Saved on this device only. This copy of Nexverse has no database, so nobody else can see it.</p>}
      </header>
      {q.body && (
        <div className="rounded-2xl border border-border bg-card/60 p-5 md:p-6">
          <p lang={q.lang} className="text-[15px] leading-relaxed whitespace-pre-wrap md:text-base">
            {q.body}
          </p>
          {!q.local && (
            <div className="mt-5">
              <LikeButton target={`thread:${q.id}`} label="Upvote" />
            </div>
          )}
        </div>
      )}
      <ThreadDiscussion threadId={q.id} question={q} onChange={(answers, acceptedAnswerId) => setQ((x) => x && { ...x, answerCount: answers.length, acceptedAnswerId })} />
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
