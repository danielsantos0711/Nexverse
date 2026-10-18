"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getArtifact, getOrbit, LANGUAGES, orbits, threadTitle, type LanguageCode } from "@/lib/data"
import { route } from "@/lib/search"
import { createQuestion, listQuestions, useSession, type Question } from "@/lib/store"
import { live } from "@/lib/supabase"

// A draft survives the trip to the sign-in page and back.
const DRAFT_KEY = "nexverse-draft"
type Draft = { title: string; body: string; orbit: string }

/** A rough guess at the language being typed, so the picker follows the writer instead of the other way round. */
function guessLanguage(text: string): LanguageCode | undefined {
  if (/[぀-ヿ一-龯]/.test(text)) return "ja"
  if (/[ऀ-ॿ]/.test(text)) return "hi"
  if (/[ãõ]|ção|ções|\bnão\b|\bvocê\b/i.test(text)) return "pt"
  if (/[ñ¿¡]|\bcómo\b|\bqué\b/i.test(text)) return "es"
  if (/[äöüß]|\bwas\b.*\bist\b|\bich\b/i.test(text)) return "de"
  if (/[ẹọṣ]/i.test(text)) return "yo"
  if (/\bcomment\b|\bpourquoi\b|[àâêîôûç]/i.test(text)) return "fr"
  return undefined
}

export function Composer() {
  const router = useRouter()
  const params = useSearchParams()
  const { ready, user } = useSession()
  const about = params.get("about") ? getArtifact(params.get("about")!) : undefined
  const [title, setTitle] = useState(params.get("q") ?? (about ? `Question about ${about.name}: ` : ""))
  const [body, setBody] = useState("")
  const [orbit, setOrbit] = useState(params.get("orbit") ?? "")
  const [lang, setLang] = useState<LanguageCode>("en")
  const [langTouched, setLangTouched] = useState(false)
  const [saved, setSaved] = useState<Question[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [failure, setFailure] = useState("")

  useEffect(() => {
    // Reading from storage after mount keeps the server and client render identical.
    try {
      const d = sessionStorage.getItem(DRAFT_KEY)
      if (d) {
        const draft = JSON.parse(d) as Draft
        /* eslint-disable react-hooks/set-state-in-effect */
        setTitle(draft.title)
        setBody(draft.body)
        setOrbit(draft.orbit)
        /* eslint-enable react-hooks/set-state-in-effect */
        sessionStorage.removeItem(DRAFT_KEY)
      }
    } catch {}
    if (!live) listQuestions({ limit: 8 }).then(setSaved)
  }, [])

  const routed = route(`${title} ${body}`)
  const suggestedOrbit = routed.orbit?.item
  const chosenOrbit = orbit || suggestedOrbit?.slug || ""
  const guessed = guessLanguage(`${title} ${body}`)
  const shownLang = langTouched ? lang : (guessed ?? lang)
  const needsSignIn = live && ready && !user

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (title.trim().length < 10) {
      setError("Write the question as a full sentence, so people know what you are asking.")
      return
    }
    setError("")
    if (needsSignIn) {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, body, orbit } satisfies Draft))
      } catch {}
      router.push("/sign-in?next=/new")
      return
    }
    setBusy(true)
    setFailure("")
    try {
      const q = await createQuestion({
        title: title.trim(),
        body: body.trim(),
        orbit: chosenOrbit || orbits[0].slug,
        lang: shownLang,
      })
      router.push(`/threads/${q.id}`)
    } catch (err) {
      setFailure((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-14 lg:grid-cols-[1fr_20rem]">
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="q-title">Your question</FieldLabel>
            <Input
              id="q-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby="q-title-help"
              placeholder="How do I…"
              className="h-12 text-base"
            />
            <FieldDescription id="q-title-help">{error || "One sentence that ends in a question mark works best."}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="q-body">What you have tried</FieldLabel>
            <Textarea
              id="q-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              placeholder="Your hardware, your data, what happened, what you expected."
            />
          </Field>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="q-orbit">Orbit</FieldLabel>
              <select
                id="q-orbit"
                value={chosenOrbit}
                onChange={(e) => setOrbit(e.target.value)}
                className="h-10 rounded-md border border-input bg-transparent px-3 text-base"
              >
                <option value="" disabled>
                  Choose an orbit
                </option>
                {orbits.map((o) => (
                  <option key={o.slug} value={o.slug}>
                    {o.name}
                  </option>
                ))}
              </select>
              {!orbit && suggestedOrbit && (
                <FieldDescription>Suggested from your question. Change it if it fits better elsewhere.</FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="q-lang">Written in</FieldLabel>
              <select
                id="q-lang"
                value={shownLang}
                onChange={(e) => {
                  setLang(e.target.value as LanguageCode)
                  setLangTouched(true)
                }}
                className="h-10 rounded-md border border-input bg-transparent px-3 text-base"
              >
                {(Object.keys(LANGUAGES) as LanguageCode[]).map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGES[l].native}
                  </option>
                ))}
              </select>
              {!langTouched && guessed && <FieldDescription>Detected from what you wrote.</FieldDescription>}
            </Field>
          </div>
          {failure && <FieldError>{failure}</FieldError>}
          <div className="flex flex-col items-start gap-3">
            <Button type="submit" size="lg" disabled={busy || (live && !ready)}>
              {busy ? "Posting…" : needsSignIn ? "Sign in to post" : live ? "Post question" : "Save question"}
            </Button>
            <p className="text-small text-muted-foreground">
              {!live
                ? "This copy of Nexverse has no database, so the question stays in this browser."
                : needsSignIn
                  ? "Your draft is kept while you sign in."
                  : "Everyone can read it. It appears with your name."}
            </p>
          </div>
        </FieldGroup>
      </form>

      <aside className="flex flex-col gap-8">
        {(routed.thread || routed.artifact) && title.length > 3 && (
          <section aria-labelledby="similar-h" className="flex flex-col gap-3 rounded-md bg-card p-6">
            <h2 id="similar-h" className="font-medium">
              Before you ask
            </h2>
            {routed.thread && (
              <Link href={`/threads/${routed.thread.item.id}`} className="text-[15px] leading-snug hover:underline">
                {threadTitle(routed.thread.item)}
              </Link>
            )}
            {routed.artifact && (
              <Link href={`/artifacts/${routed.artifact.item.slug}`} className="text-[15px] text-muted-foreground hover:text-foreground">
                Already built: <span className="text-foreground">{routed.artifact.item.name}</span>
              </Link>
            )}
          </section>
        )}
        {saved.length > 0 && (
          <section aria-labelledby="saved-h" className="flex flex-col gap-3">
            <h2 id="saved-h" className="font-medium">
              Saved on this device
            </h2>
            <ul className="flex flex-col gap-3">
              {saved.map((s) => (
                <li key={s.id} className="flex flex-col gap-1">
                  <Link href={`/threads/${s.id}`} className="text-[15px] leading-snug hover:underline">
                    {s.title}
                  </Link>
                  <span className="text-small text-muted-foreground">
                    {getOrbit(s.orbit)?.name} · {LANGUAGES[s.lang].native}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  )
}
