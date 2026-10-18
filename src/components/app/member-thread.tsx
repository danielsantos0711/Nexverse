"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { MemberAnswers, MemberAvatar, questionStage } from "@/components/app/member"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { formatDate, getOrbit, LANGUAGES, LOOP_STAGES } from "@/lib/data"
import { deleteQuestion, getQuestion, useSession, type Question } from "@/lib/store"
import { cn } from "@/lib/utils"

/** A question asked by a member, loaded from the database (or from this browser in a local copy). */
export function MemberThread({ id }: { id: string }) {
  const router = useRouter()
  const { user } = useSession()
  const [question, setQuestion] = useState<Question | null | undefined>(undefined)
  const [error, setError] = useState("")

  useEffect(() => {
    let stale = false
    getQuestion(id)
      .then((q) => {
        if (stale) return
        setQuestion(q)
        if (q) document.title = `${q.title} · Nexverse`
      })
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [id])

  if (error) return <Missing title="This question could not be loaded" detail={error} />
  if (question === undefined) return <PageSkeleton />
  if (question === null)
    return <Missing title="This question is not here" detail="It may have been deleted by the person who asked it." />

  const orbit = getOrbit(question.orbit)
  const at = LOOP_STAGES.findIndex((s) => s.id === questionStage(question))
  const isAsker = question.local || Boolean(user && question.author?.id === user.id)

  async function remove() {
    if (!question || !confirm("Delete this question and its answers?")) return
    try {
      await deleteQuestion(question.id)
      router.push(orbit ? `/orbits/${orbit.slug}` : "/explore")
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-14 pt-10 lg:grid-cols-[1fr_20rem] lg:pt-16">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-8 text-small text-muted-foreground">
          <Link href="/orbits" className="hover:text-foreground">
            Orbits
          </Link>
          {orbit && (
            <>
              <span aria-hidden> / </span>
              <Link href={`/orbits/${orbit.slug}`} className="hover:text-foreground">
                {orbit.name}
              </Link>
            </>
          )}
        </nav>
        <article className="flex flex-col gap-12">
          <header className="flex flex-col gap-6">
            <h1
              lang={question.lang}
              className="font-wide text-[clamp(1.9rem,1.2rem+2.6vw,3.6rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance"
            >
              {question.title}
            </h1>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="flex items-center gap-3">
                <MemberAvatar name={question.author?.name} />
                <span className="flex flex-col leading-tight">
                  <span className="font-medium">{question.local ? "You" : (question.author?.name ?? "A member")}</span>
                  <span className="text-small text-muted-foreground">
                    {formatDate(question.createdAt)} · Written in {LANGUAGES[question.lang]?.native}
                  </span>
                </span>
              </span>
              {isAsker && (
                <Button variant="ghost" onClick={remove}>
                  Delete question
                </Button>
              )}
            </div>
            {question.local && (
              <p className="text-small text-muted-foreground">
                Saved on this device only. This copy of Nexverse has no database, so nobody else can see it.
              </p>
            )}
            {question.body && (
              <p lang={question.lang} className="max-w-[68ch] text-lg leading-relaxed whitespace-pre-wrap">
                {question.body}
              </p>
            )}
          </header>

          <section aria-labelledby="replies-h" className="flex flex-col gap-4">
            <h2 id="replies-h" className="text-lg font-medium">
              {question.answerCount === 0
                ? "No answers yet"
                : `${question.answerCount} ${question.answerCount === 1 ? "answer" : "answers"}`}
            </h2>
            {question.answerCount === 0 && (
              <p className="max-w-[60ch] text-muted-foreground">
                This question is still open. If you have done this, your answer is the start of the loop.
              </p>
            )}
            <MemberAnswers
              thread={{ kind: question.local ? "sample" : "question", id: question.id }}
              question={question}
              onChange={(answers, acceptedAnswerId) =>
                setQuestion((q) => q && { ...q, answerCount: answers.length, acceptedAnswerId })
              }
            />
          </section>
        </article>
      </div>

      <aside className="flex flex-col gap-10 lg:pt-16">
        <section aria-labelledby="loop-h" className="flex flex-col gap-4">
          <h2 id="loop-h" className="font-medium">
            Where this loop is
          </h2>
          <ol className="flex flex-col gap-1.5">
            {LOOP_STAGES.map((s, i) => (
              <li
                key={s.id}
                aria-current={i === at ? "step" : undefined}
                className={cn(
                  "rounded-md px-4 py-3",
                  i < at && "bg-card text-muted-foreground",
                  i === at && "bg-foreground text-background",
                  i > at && "bg-card/40 text-muted-foreground/70"
                )}
              >
                <span className="block font-medium">{s.label}</span>
                <span className="text-small opacity-80">{s.detail}</span>
              </li>
            ))}
          </ol>
        </section>
        {orbit && (
          <LinkButton href={`/orbits/${orbit.slug}`} variant="secondary" className="self-start">
            More in {orbit.name}
          </LinkButton>
        )}
      </aside>
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
        <LinkButton href="/explore">Explore threads</LinkButton>
      </EmptyContent>
    </Empty>
  )
}
