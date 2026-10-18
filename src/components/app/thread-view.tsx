"use client"

import { useEffect, useState } from "react"
import { CheckIcon, LanguagesIcon } from "lucide-react"
import { LangTag, PersonAvatar, PersonLink } from "@/components/app/bits"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, getPerson, LANGUAGES, type Thread } from "@/lib/data"
import { cn } from "@/lib/utils"

type LocalReply = { id: string; body: string; date: string }

/**
 * A thread, readable in its original language or in English, with replies. Replies written here are
 * kept on this device until accounts exist.
 */
export function ThreadView({ thread }: { thread: Thread }) {
  const translatable = thread.lang !== "en" || thread.replies.some((r) => r.lang !== "en")
  const [english, setEnglish] = useState(true)
  const [local, setLocal] = useState<LocalReply[]>([])
  const [draft, setDraft] = useState("")
  const key = `nexverse-replies:${thread.id}`

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key)
      // Reading from storage after mount keeps the server and client render identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setLocal(JSON.parse(saved))
    } catch {}
  }, [key])

  function post(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    const next = [...local, { id: crypto.randomUUID(), body: draft.trim(), date: new Date().toISOString().slice(0, 10) }]
    setLocal(next)
    setDraft("")
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {}
  }

  const showEnglish = english && thread.lang !== "en" && thread.en
  const author = getPerson(thread.author)!

  return (
    <article className="flex flex-col gap-12">
      <header className="flex flex-col gap-6">
        <h1
          lang={showEnglish ? "en" : thread.lang}
          className="font-wide text-[clamp(1.9rem,1.2rem+2.6vw,3.6rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance"
        >
          {showEnglish ? thread.en!.title : thread.title}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            <PersonAvatar handle={author.handle} />
            <span className="flex flex-col leading-tight">
              <PersonLink handle={author.handle} />
              <span className="text-small text-muted-foreground">
                {author.place} · {formatDate(thread.date)}
              </span>
            </span>
          </span>
          {translatable && (
            <Button variant="secondary" onClick={() => setEnglish((v) => !v)} aria-pressed={!english}>
              <LanguagesIcon data-icon="inline-start" />
              {english ? `Show original (${LANGUAGES[thread.lang].native})` : "Read in English"}
            </Button>
          )}
        </div>
        {showEnglish && (
          <p className="text-small text-muted-foreground">
            Written in {LANGUAGES[thread.lang].native}, shown in English. The original is one tap away.
          </p>
        )}
        <p lang={showEnglish ? "en" : thread.lang} className="max-w-[68ch] text-lg leading-relaxed">
          {showEnglish ? thread.en!.body : thread.body}
        </p>
        <ul className="flex flex-wrap gap-2">
          {thread.tags.map((t) => (
            <li key={t} className="rounded-full bg-card px-3 py-1 text-small text-muted-foreground">
              {t}
            </li>
          ))}
        </ul>
      </header>

      <section aria-labelledby="replies-h" className="flex flex-col gap-2">
        <h2 id="replies-h" className="mb-2 text-lg font-medium">
          {thread.replies.length === 0
            ? "No answers yet"
            : `${thread.replies.length} ${thread.replies.length === 1 ? "answer" : "answers"}`}
        </h2>
        {thread.replies.length === 0 && (
          <p className="max-w-[60ch] text-muted-foreground">
            This question is still open. If you have done this, your answer is the start of the loop.
          </p>
        )}
        <ol className="flex flex-col gap-2">
          {thread.replies.map((r) => {
            const en = english && r.lang !== "en" && r.en
            return (
              <li
                key={r.id}
                className={cn("flex flex-col gap-3 rounded-md p-5", r.accepted ? "bg-card" : "bg-transparent")}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <PersonAvatar handle={r.author} size="sm" />
                  <PersonLink handle={r.author} />
                  <span className="text-small text-muted-foreground">{formatDate(r.date)}</span>
                  {r.lang !== "en" && <LangTag lang={r.lang} className="text-muted-foreground" />}
                  {r.accepted && (
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-0.5 text-small text-background">
                      <CheckIcon aria-hidden className="size-3.5" />
                      Worked for the asker
                    </span>
                  )}
                </div>
                <p lang={en ? "en" : r.lang} className="max-w-[68ch] leading-relaxed">
                  {en ? r.en : r.body}
                </p>
              </li>
            )
          })}
          {local.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-md p-5 ring-1 ring-border ring-inset">
              <div className="flex flex-wrap items-center gap-x-3 text-small text-muted-foreground">
                <span className="font-medium text-foreground">You</span>
                <span>{formatDate(r.date)}</span>
                <span>Saved on this device only</span>
              </div>
              <p className="max-w-[68ch] leading-relaxed whitespace-pre-wrap">{r.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <form onSubmit={post} className="rounded-md bg-card p-5 md:p-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reply">Your answer</FieldLabel>
            <Textarea
              id="reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              placeholder="Write in whichever language you think in."
              className="bg-background"
            />
            <FieldDescription>
              Accounts are not open yet, so your answer is kept in this browser and nobody else sees it.
            </FieldDescription>
          </Field>
          <Button type="submit" className="self-start" disabled={!draft.trim()}>
            Post answer
          </Button>
        </FieldGroup>
      </form>
    </article>
  )
}
