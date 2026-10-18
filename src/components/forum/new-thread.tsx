"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { CategoryIcon } from "@/components/forum/category-icon"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { categoriesIn, categoryGroups, getCategory, getCategoryGroup, LANGUAGES, type LanguageCode } from "@/lib/data"
import { createQuestion, useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** Start a forum thread in any language. Threads are stored as members' questions. */
export function NewThread() {
  const params = useSearchParams()
  const router = useRouter()
  const { ready, user } = useSession()
  const [title, setTitle] = useState((params.get("title") ?? "").slice(0, 300))
  const [body, setBody] = useState((params.get("body") ?? "").slice(0, 20000))
  // Old links may carry a first-version community slug; unknown ones fall back to Help.
  const [cat, setCat] = useState(getCategory(params.get("c") ?? "")?.slug ?? "help")
  const chosen = getCategory(cat)
  const [lang, setLang] = useState<LanguageCode>("en")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (live && ready && !user) {
    return (
      <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6">
        <p>Sign in to start a thread. It takes an email address and nothing else.</p>
        <Link href={`/sign-in?next=${encodeURIComponent(`/forum/new?c=${cat}`)}`} className="pressable inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
          Sign in
        </Link>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (title.trim().length < 10) {
      setError("Give the thread a title of at least 10 characters, so people know what it is about.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const q = await createQuestion({ title: title.trim(), body: body.trim(), orbit: cat, lang })
      router.push(`/forum/${q.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-2xl p-5 md:p-7">
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">Category</FieldLegend>
          <FieldDescription>Pick the closest fit. You can browse each category on the forum page first.</FieldDescription>
          <div className="flex flex-col gap-4">
            {categoryGroups.map((g) => (
              <div key={g.slug} role="radiogroup" aria-labelledby={`grp-${g.slug}`} className="flex flex-col gap-2">
                <p id={`grp-${g.slug}`} className="text-xs font-medium text-muted-foreground">
                  {g.name}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {categoriesIn(g.slug).map((c) => {
                    const on = cat === c.slug
                    return (
                      <label
                        key={c.slug}
                        className={cn(
                          "pressable flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                          on ? "border-ion/60 bg-ion/10 text-foreground" : "border-border bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"
                        )}
                      >
                        <input type="radio" name="cat" value={c.slug} checked={on} onChange={() => setCat(c.slug)} className="sr-only" />
                        <CategoryIcon name={c.icon} className={cn("size-4 shrink-0", on ? "text-ion" : "text-muted-foreground")} />
                        <span className="truncate font-medium">{c.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {chosen && (
            <p aria-live="polite" className="rounded-lg border border-ion/20 bg-ion/[0.06] px-3 py-2 text-sm">
              <span className="font-medium text-ion">{chosen.name}</span>
              <span className="text-muted-foreground"> · {getCategoryGroup(chosen.group)?.name}. </span>
              {chosen.blurb}
            </p>
          )}
        </FieldSet>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="What do you want to know, or show?" className="h-11 bg-background/60" aria-invalid={error ? true : undefined} />
        </Field>
        <Field>
          <FieldLabel htmlFor="body">Details</FieldLabel>
          <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="What you tried, what happened, links, numbers." className="bg-background/60" />
        </Field>
        <Field>
          <FieldLabel htmlFor="lang">Written in</FieldLabel>
          <select id="lang" value={lang} onChange={(e) => setLang(e.target.value as LanguageCode)} className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs">
            {(Object.keys(LANGUAGES) as LanguageCode[]).map((l) => (
              <option key={l} value={l} className="bg-popover">
                {LANGUAGES[l].native} · {LANGUAGES[l].name}
              </option>
            ))}
          </select>
          <FieldDescription>Write in the language you think in. Readers can translate.</FieldDescription>
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={busy || (live && !ready)}>
            {busy ? "Posting…" : "Post thread"}
          </Button>
          {!live && <span className="text-sm text-muted-foreground">This copy has no database, so the thread stays in this browser.</span>}
        </div>
      </FieldGroup>
    </form>
  )
}
