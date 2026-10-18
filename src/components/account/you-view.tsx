"use client"

import { useEffect, useState } from "react"
import { PageHead } from "@/components/app/bits"
import { MemberQuestions, QuestionRow } from "@/components/app/member"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { listQuestions, renameMember, signOut, useSession, type Question } from "@/lib/store"
import { live } from "@/lib/supabase"

export function YouView() {
  const { ready, user, member } = useSession()

  if (!live) {
    return (
      <>
        <PageHead title="You" lead="This copy of Nexverse has no database, so there are no accounts. What you write stays in this browser." />
        <MemberQuestions />
      </>
    )
  }
  if (!ready) return <PageSkeleton />
  if (!user || !member) {
    return (
      <>
        <PageHead title="You" lead="Sign in to ask, answer and keep track of what you have written." />
        <LinkButton href="/sign-in?next=/you" size="lg">
          Sign in
        </LinkButton>
      </>
    )
  }
  return <Signed key={member.id} id={member.id} name={member.name} email={user.email ?? ""} />
}

function Signed({ id, name, email }: { id: string; name: string; email: string }) {
  const [draft, setDraft] = useState(name)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [questions, setQuestions] = useState<Question[] | null>(null)

  useEffect(() => {
    listQuestions({ author: id, limit: 50 })
      .then(setQuestions)
      .catch((e: Error) => setError(e.message))
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const next = draft.trim()
    if (!next || next.length > 60) {
      setError("Use between 1 and 60 characters.")
      return
    }
    setError("")
    try {
      await renameMember(id, next)
      setStatus("Saved.")
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <>
      <PageHead title={name} lead={`Signed in as ${email}.`}>
        <Button variant="secondary" className="self-start" onClick={() => signOut()}>
          Sign out
        </Button>
      </PageHead>
      <div className="grid gap-14 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="mine-h" className="flex flex-col gap-1">
          <h2 id="mine-h" className="text-lg font-medium">
            Your questions
          </h2>
          {questions === null ? null : questions.length === 0 ? (
            <div className="flex flex-col items-start gap-4 py-4">
              <p className="text-muted-foreground">Nothing asked yet.</p>
              <LinkButton href="/new">Ask a question</LinkButton>
            </div>
          ) : (
            <ul>
              {questions.map((q) => (
                <QuestionRow key={q.id} question={q} />
              ))}
            </ul>
          )}
        </section>
        <form onSubmit={save} className="self-start rounded-md bg-card p-6">
          <FieldGroup>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="name">Your name</FieldLabel>
              <Input
                id="name"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setStatus("")
                }}
                aria-invalid={error ? true : undefined}
                className="bg-background"
              />
              {error ? (
                <FieldError>{error}</FieldError>
              ) : (
                <FieldDescription role="status">{status || "Shown next to what you write."}</FieldDescription>
              )}
            </Field>
            <Button type="submit" className="self-start" disabled={draft.trim() === name}>
              Save name
            </Button>
          </FieldGroup>
        </form>
      </div>
    </>
  )
}
