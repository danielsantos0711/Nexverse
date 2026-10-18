"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { LoopMark } from "@/components/app/bits"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getArtifact, getOrbit, LANGUAGES, orbits, threadTitle, type LanguageCode } from "@/lib/data"
import { route } from "@/lib/search"

type Saved = { id: string; title: string; body: string; orbit: string; lang: LanguageCode; date: string }
const KEY = "nexverse-questions"

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
  const params = useSearchParams()
  const about = params.get("about") ? getArtifact(params.get("about")!) : undefined
  const [title, setTitle] = useState(params.get("q") ?? (about ? `Question about ${about.name}: ` : ""))
  const [body, setBody] = useState("")
  const [orbit, setOrbit] = useState(params.get("orbit") ?? "")
  const [lang, setLang] = useState<LanguageCode>("en")
  const [langTouched, setLangTouched] = useState(false)
  const [saved, setSaved] = useState<Saved[]>([])
  const [justSaved, setJustSaved] = useState<Saved | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY)
      // Reading from storage after mount keeps the server and client render identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s) setSaved(JSON.parse(s))
    } catch {}
  }, [])

  const routed = route(`${title} ${body}`)
  const suggestedOrbit = routed.orbit?.item
  const chosenOrbit = orbit || suggestedOrbit?.slug || ""
  const guessed = guessLanguage(`${title} ${body}`)
  const shownLang = langTouched ? lang : (guessed ?? lang)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (title.trim().length < 10) {
      setError("Write the question as a full sentence, so people know what you are asking.")
      return
    }
    setError("")
    const item: Saved = {
      id: crypto.randomUUID(),
      title: title.trim(),
      body: body.trim(),
      orbit: chosenOrbit || orbits[0].slug,
      lang: shownLang,
      date: new Date().toISOString().slice(0, 10),
    }
    const next = [item, ...saved]
    setSaved(next)
    setJustSaved(item)
    setTitle("")
    setBody("")
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {}
  }

  if (justSaved) {
    const o = getOrbit(justSaved.orbit)
    return (
      <div className="flex flex-col gap-8 rounded-md bg-card p-6 md:p-10" role="status">
        <LoopMark stage="asked" />
        <h2 className="font-wide text-[clamp(1.6rem,1.1rem+1.6vw,2.6rem)] leading-tight font-semibold tracking-[-0.03em] text-balance">
          {justSaved.title}
        </h2>
        <p className="max-w-[60ch] text-muted-foreground">
          Saved on this device for {o?.name}. Accounts are not open yet, so nobody else can see it. It will be
          here when you come back, and it can be posted for real once sign-up opens.
        </p>
        {routed.thread && (
          <p>
            Something close was asked before:{" "}
            <Link href={`/threads/${routed.thread.item.id}`} className="underline">
              {threadTitle(routed.thread.item)}
            </Link>
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setJustSaved(null)}>Ask another</Button>
          <LinkButton href={`/orbits/${justSaved.orbit}`} variant="secondary">
            Read {o?.name}
          </LinkButton>
        </div>
      </div>
    )
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
          <Button type="submit" size="lg" className="self-start">
            Save question
          </Button>
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
                  <span className="text-[15px] leading-snug">{s.title}</span>
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
