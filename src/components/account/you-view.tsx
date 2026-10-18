"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ExternalLinkIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { MemberAvatar } from "@/components/forum/discussion"
import { PageTitle } from "@/components/hub/bits"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ago, getCategory } from "@/lib/data"
import { deleteSubmission, listQuestions, listSubmissions, renameMember, signOut, useSession, type Question, type Submission } from "@/lib/store"
import { live } from "@/lib/supabase"

export function YouView() {
  const { ready, user, member } = useSession()
  if (!live) return <Mine lead="This copy of Nexverse has no database, so there are no accounts. What you write stays in this browser." />
  if (!ready) return <PageSkeleton />
  if (!user || !member) {
    return (
      <>
        <PageTitle title="You" lead="Sign in to share, start threads and keep track of what you have written." />
        <Link href="/sign-in?next=/you" className="pressable inline-flex h-11 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
          Sign in
        </Link>
      </>
    )
  }
  return <Signed key={member.id} id={member.id} name={member.name} email={user.email ?? ""} />
}

function Mine({ lead, author, side, title = "You" }: { lead: string; author?: string; side?: React.ReactNode; title?: string }) {
  const [threads, setThreads] = useState<Question[] | null>(null)
  const [shared, setShared] = useState<Submission[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    listQuestions({ author, limit: 50 }).then(setThreads).catch((e: Error) => setError(e.message))
    listSubmissions({ author, limit: 50 }).then(setShared).catch((e: Error) => setError(e.message))
  }, [author])

  async function unshare(id: string) {
    try {
      await deleteSubmission(id)
      setShared((s) => s?.filter((x) => x.id !== id) ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <PageTitle title={title} lead={lead} />
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-10">
          <section aria-labelledby="mine-h" className="flex flex-col gap-2">
            <h2 id="mine-h" className="text-lg font-semibold">
              Your threads
            </h2>
            {threads?.length === 0 && (
              <p className="text-muted-foreground">
                Nothing yet. <Link href="/forum/new" className="text-ion hover:underline">Start a thread</Link>
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {threads?.map((q) => (
                <li key={q.id}>
                  <Link href={`/forum/${q.id}`} className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-4 hover:bg-card">
                    <span lang={q.lang} className="font-medium">
                      {q.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getCategory(q.orbit)?.name} · {ago(q.createdAt)} · {q.answerCount} {q.answerCount === 1 ? "reply" : "replies"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="shared-h" className="flex flex-col gap-2">
            <h2 id="shared-h" className="text-lg font-semibold">
              What you shared
            </h2>
            {shared?.length === 0 && (
              <p className="text-muted-foreground">
                Nothing yet. <Link href="/share" className="text-ion hover:underline">Share something</Link>
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {shared?.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4">
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      {s.title} <ExternalLinkIcon aria-hidden className="size-3.5 text-muted-foreground" />
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {s.kind} · {ago(s.createdAt)} · {new URL(s.url).hostname}
                    </span>
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => unshare(s.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {side}
      </div>
    </>
  )
}

function Signed({ id, name, email }: { id: string; name: string; email: string }) {
  const [draft, setDraft] = useState(name)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const next = draft.trim()
    if (!next || next.length > 60) return setError("Use between 1 and 60 characters.")
    setError("")
    try {
      await renameMember(id, next)
      setStatus("Saved.")
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Mine
      title={name}
      author={id}
      lead={`Signed in as ${email}.`}
      side={
        <div className="flex flex-col gap-4 self-start">
          <form onSubmit={save} className="glass rounded-2xl p-5">
            <FieldGroup>
              <div className="flex items-center gap-3">
                <MemberAvatar name={draft || name} size={44} />
                <span className="text-sm text-muted-foreground">How others see you</span>
              </div>
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
                  className="bg-background/60"
                />
                {error ? <FieldError>{error}</FieldError> : <FieldDescription role="status">{status || "Shown next to what you write."}</FieldDescription>}
              </Field>
              <Button type="submit" className="self-start" disabled={draft.trim() === name}>
                Save name
              </Button>
            </FieldGroup>
          </form>
          <Button variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      }
    />
  )
}
