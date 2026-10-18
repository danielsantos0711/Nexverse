"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CheckIcon } from "lucide-react"
import { initials, LangTag, LoopMark } from "@/components/app/bits"
import { LinkButton } from "@/components/link-button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, getOrbit } from "@/lib/data"
import {
  acceptAnswer,
  createAnswer,
  deleteAnswer,
  listAnswers,
  listQuestions,
  useSession,
  type Answer,
  type Question,
  type ThreadRef,
} from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

export function MemberAvatar({ name, size = "default" }: { name?: string; size?: "default" | "sm" | "lg" }) {
  return (
    <Avatar size={size}>
      <AvatarFallback>{initials(name ?? "You").toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

/** Where a question is in its loop, from what members have done with it so far. */
export function questionStage(q: Pick<Question, "answerCount" | "acceptedAnswerId">) {
  return q.answerCount > 0 || q.acceptedAnswerId ? "answered" : "asked"
}

export function QuestionRow({ question, showOrbit = true }: { question: Question; showOrbit?: boolean }) {
  const orbit = getOrbit(question.orbit)
  return (
    <li>
      <Link
        href={`/threads/${question.id}`}
        className="-mx-3 flex flex-col gap-2 rounded-md px-3 py-4 transition-colors duration-150 hover:bg-card"
      >
        <span lang={question.lang} className="text-lg leading-snug font-medium">
          {question.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-muted-foreground">
          <LoopMark stage={questionStage(question)} />
          {showOrbit && orbit && <span>{orbit.name}</span>}
          <span>{question.local ? "You, on this device" : (question.author?.name ?? "A member")}</span>
          <LangTag lang={question.lang} />
          <span className="tabular">
            {question.answerCount} {question.answerCount === 1 ? "reply" : "replies"}
          </span>
          <span className="tabular">{formatDate(question.createdAt)}</span>
        </span>
      </Link>
    </li>
  )
}

/** The newest questions from members. Renders nothing until there is at least one. */
export function MemberQuestions({
  orbit,
  heading = "Asked by members",
  showOrbit = true,
  className,
}: {
  orbit?: string
  heading?: string
  showOrbit?: boolean
  className?: string
}) {
  const [questions, setQuestions] = useState<Question[]>([])

  useEffect(() => {
    let stale = false
    listQuestions({ orbit, limit: 10 })
      .then((qs) => !stale && setQuestions(qs))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [orbit])

  if (questions.length === 0) return null
  return (
    <section aria-labelledby="members-h" className={cn("flex flex-col gap-1", className)}>
      <h2 id="members-h" className="text-lg font-medium">
        {questions.every((q) => q.local) ? "Saved on this device" : heading}
      </h2>
      <ul>
        {questions.map((q) => (
          <QuestionRow key={q.id} question={q} showOrbit={showOrbit} />
        ))}
      </ul>
    </section>
  )
}

/**
 * Members' answers to a thread and the box to write one. On a member's own question the asker can mark
 * the answer that worked.
 */
export function MemberAnswers({
  thread,
  question,
  onChange,
}: {
  thread: ThreadRef
  question?: Question
  onChange?: (answers: Answer[], acceptedId: string | null) => void
}) {
  const { ready, user } = useSession()
  const pathname = usePathname()
  const [answers, setAnswers] = useState<Answer[]>([])
  const [accepted, setAccepted] = useState<string | null>(question?.acceptedAnswerId ?? null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const isAsker = Boolean(question && user && question.author?.id === user.id)

  useEffect(() => {
    let stale = false
    listAnswers(thread)
      .then((a) => !stale && setAnswers(a))
      .catch((e: Error) => !stale && setError(e.message))
    return () => {
      stale = true
    }
  }, [thread.kind, thread.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function update(next: Answer[], nextAccepted = accepted) {
    setAnswers(next)
    setAccepted(nextAccepted)
    onChange?.(next, nextAccepted)
  }

  async function post(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim() || busy) return
    setBusy(true)
    setError("")
    try {
      const a = await createAnswer(thread, draft.trim())
      update([...answers, a])
      setDraft("")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setError("")
    try {
      await deleteAnswer(thread, id)
      update(
        answers.filter((a) => a.id !== id),
        accepted === id ? null : accepted
      )
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function accept(id: string) {
    if (!question) return
    const next = accepted === id ? null : id
    setError("")
    try {
      await acceptAnswer(question.id, next)
      update(answers, next)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const signedOut = live && ready && !user

  return (
    <div className="flex flex-col gap-8">
      {answers.length > 0 && (
        <ol className="flex flex-col gap-2">
          {answers.map((a) => {
            const mine = a.local || (user && a.author?.id === user.id)
            const isAccepted = accepted === a.id
            return (
              <li
                key={a.id}
                className={cn(
                  "flex flex-col gap-3 rounded-md p-5",
                  isAccepted ? "bg-card" : a.local && "ring-1 ring-border ring-inset"
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <MemberAvatar name={a.author?.name} size="sm" />
                  <span className="font-medium">{a.local ? "You" : (a.author?.name ?? "A member")}</span>
                  <span className="text-small text-muted-foreground">{formatDate(a.createdAt)}</span>
                  {a.local && <span className="text-small text-muted-foreground">Saved on this device only</span>}
                  {isAccepted && (
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-0.5 text-small text-background">
                      <CheckIcon aria-hidden className="size-3.5" />
                      Worked for the asker
                    </span>
                  )}
                </div>
                <p className="max-w-[68ch] leading-relaxed whitespace-pre-wrap">{a.body}</p>
                {(isAsker || mine) && (
                  <div className="flex flex-wrap gap-2">
                    {isAsker && (
                      <Button variant="secondary" size="sm" onClick={() => accept(a.id)} aria-pressed={isAccepted}>
                        {isAccepted ? "Unmark" : "This worked for me"}
                      </Button>
                    )}
                    {mine && (
                      <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                        Delete
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {signedOut ? (
        <div className="flex flex-col items-start gap-4 rounded-md bg-card p-5 md:p-6">
          <p className="max-w-[54ch]">Sign in to answer. It takes an email address and nothing else.</p>
          <LinkButton href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in to answer</LinkButton>
        </div>
      ) : (
        <form onSubmit={post} className="rounded-md bg-card p-5 md:p-6">
          <FieldGroup>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="reply">Your answer</FieldLabel>
              <Textarea
                id="reply"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                placeholder="Write in whichever language you think in."
                className="bg-background"
                aria-invalid={error ? true : undefined}
              />
              {error ? (
                <FieldError>{error}</FieldError>
              ) : (
                <FieldDescription>
                  {live
                    ? "Everyone can read answers. Yours appears with your name."
                    : "This copy of Nexverse has no database, so your answer is kept in this browser and nobody else sees it."}
                </FieldDescription>
              )}
            </Field>
            <Button type="submit" className="self-start" disabled={!draft.trim() || busy || (live && !ready)}>
              {busy ? "Posting…" : "Post answer"}
            </Button>
          </FieldGroup>
        </form>
      )}
    </div>
  )
}
