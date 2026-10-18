"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { categoryIcon } from "@/components/forum/category-icon"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { categories, LANGUAGES, type LanguageCode } from "@/lib/data"
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
  const [cat, setCat] = useState(params.get("c") ?? "help")
  const [lang, setLang] = useState<LanguageCode>("en")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (live && ready && !user) {
    return (
      <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6">
        <p>Sign in to start a thread. It takes an email address and nothing else.</p>
        <Link href="/sign-in?next=/forum/new" className="pressable inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon)
              return (
                <label
                  key={c.slug}
                  className={cn(
                    "pressable flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    cat === c.slug ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 hover:bg-card"
                  )}
                >
                  <input type="radio" name="cat" value={c.slug} checked={cat === c.slug} onChange={() => setCat(c.slug)} className="sr-only" />
                  <Icon className={cn("size-4", cat === c.slug ? "text-ion" : "text-muted-foreground")} />
                  <span className="font-medium">{c.name}</span>
                </label>
              )
            })}
          </div>
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
