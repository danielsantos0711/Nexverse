"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { CheckCircle2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { MemberAvatar } from "@/components/forum/forum-ui"
import { Post } from "@/components/forum/thread-parts"
import { ago } from "@/lib/data"
import { acceptAnswer, createAnswer, deleteAnswer, listAnswers, useSession, type Answer, type Question, type ThreadRef } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

// Kept here so existing imports keep working; it lives with the forum's other bits now.
export { MemberAvatar }

/**
 * Members' replies to a thread, and the box to write one. Works for sample threads (by slug) and for
 * members' own threads (by id); on their own thread the author can mark the reply that solved it.
 */
export function ThreadDiscussion({
  threadId,
  question,
  heading = "Replies from members",
  onChange,
  startAt,
}: {
  threadId: string
  question?: Question
  heading?: string
  /** Called when replies load and whenever they change. */
  onChange?: (answers: Answer[], acceptedId: string | null) => void
  /** On forum threads, the post number of the first reply here (posts above it are numbered before). */
  startAt?: number
}) {
  const thread: ThreadRef = { kind: question && !question.local ? "question" : "sample", id: threadId }
  const { ready, user } = useSession()
  const pathname = usePathname()
  const [answers, setAnswers] = useState<Answer[]>([])
  const [accepted, setAccepted] = useState<string | null>(question?.acceptedAnswerId ?? null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const isAuthor = Boolean(question && user && question.author?.id === user.id)

  useEffect(() => {
    let stale = false
    listAnswers(thread)
      .then((a) => {
        if (stale) return
        setAnswers(a)
        onChange?.(a, question?.acceptedAnswerId ?? null)
      })
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
      update([...answers, await createAnswer(thread, draft.trim())])
      setDraft("")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
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
    try {
      await acceptAnswer(question.id, next)
      update(answers, next)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const signedOut = live && ready && !user

  return (
    <section aria-labelledby={`${threadId}-replies`} className="flex flex-col gap-4">
      {(answers.length > 0 || question) && (
        <h2 id={`${threadId}-replies`} className="text-base font-semibold">
          {answers.length ? `${heading} · ${answers.length}` : "No replies yet"}
        </h2>
      )}
      <ol className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {answers.map((a, i) => {
            const mine = a.local || (user && a.author?.id === user.id)
            const isAccepted = accepted === a.id
            const controls = (isAuthor || mine) && (
                  <div className="flex gap-2">
                    {isAuthor && (
                      <Button variant="secondary" size="sm" onClick={() => accept(a.id)} aria-pressed={isAccepted}>
                        {isAccepted ? "Unmark" : "This solved it"}
                      </Button>
                    )}
                    {mine && (
                      <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                        Delete
                      </Button>
                    )}
                  </div>
                )
            return (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, transform: "translateY(10px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0, transform: "scale(0.98)" }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className={startAt === undefined ? cn("flex flex-col gap-3 rounded-xl border p-4", isAccepted ? "border-ok/40 bg-ok/[0.05]" : "border-border bg-card/60") : undefined}
              >
                {startAt !== undefined ? (
                  <Post
                    n={startAt + i}
                    animate={false}
                    poster={{ name: a.local ? "You" : (a.author?.name ?? "A member") }}
                    date={a.createdAt}
                    accepted={isAccepted}
                    note={a.local && <span className="text-xs text-muted-foreground">· saved on this device only</span>}
                    actions={controls}
                  >
                    <p className="max-w-[72ch] text-[15px] leading-relaxed whitespace-pre-wrap">{a.body}</p>
                  </Post>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                      <MemberAvatar name={a.author?.name} size={24} />
                      <span className="font-medium">{a.local ? "You" : (a.author?.name ?? "A member")}</span>
                      <span className="text-xs text-muted-foreground">{ago(a.createdAt)}</span>
                      {a.local && <span className="text-xs text-muted-foreground">· saved on this device only</span>}
                      {isAccepted && (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs text-ok">
                          <CheckCircle2Icon aria-hidden className="size-3.5" /> Solved it
                        </span>
                      )}
                    </div>
                    <p className="max-w-[72ch] text-[15px] leading-relaxed whitespace-pre-wrap">{a.body}</p>
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
        <form onSubmit={post} className="glass rounded-xl p-4">
          <FieldGroup>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={`${threadId}-reply`}>Your reply</FieldLabel>
              <Textarea
                id={`${threadId}-reply`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                placeholder="Write in whichever language you think in."
                className="bg-background/60"
                aria-invalid={error ? true : undefined}
              />
              {error ? (
                <FieldError>{error}</FieldError>
              ) : (
                <FieldDescription>
                  {live ? "Everyone can read replies. Yours appears with your name." : "This copy has no database, so your reply stays in this browser."}
                </FieldDescription>
              )}
            </Field>
            <Button type="submit" className="self-start" disabled={!draft.trim() || busy || (live && !ready)}>
              {busy ? "Posting…" : "Post reply"}
            </Button>
          </FieldGroup>
        </form>
      )}
    </section>
  )
}
