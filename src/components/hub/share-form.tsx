"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { CheckCircle2Icon, NewspaperIcon } from "lucide-react"
import { KIND_ICONS } from "@/components/hub/bits"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { KINDS, type ResourceKind } from "@/lib/data"
import { createSubmission, useSession, type Submission, type SubmissionKind } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const OPTIONS: { kind: SubmissionKind; label: string; hint: string }[] = [
  ...(Object.keys(KINDS) as ResourceKind[]).map((k) => ({ kind: k, label: KINDS[k].label, hint: KINDS[k].blurb })),
  { kind: "news", label: "News", hint: "A release, paper, policy change or tutorial worth knowing about." },
]

/** Share a link to anything: a model, dataset, tool, repo or a news story. */
export function ShareForm() {
  const { ready, user } = useSession()
  const [kind, setKind] = useState<SubmissionKind>("model")
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [summary, setSummary] = useState("")
  const [tags, setTags] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Submission | null>(null)

  if (live && ready && !user) {
    return (
      <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6">
        <p>Sign in to share. It takes an email address and nothing else.</p>
        <Link href="/sign-in?next=/share" className="pressable inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
          Sign in
        </Link>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    let parsed: URL | null = null
    try {
      parsed = new URL(url.trim())
    } catch {}
    if (title.trim().length < 3) return setError("Give it a name of at least 3 characters.")
    if (!parsed || parsed.protocol !== "https:") return setError("Use a full link that starts with https://")
    setBusy(true)
    setError("")
    try {
      const s = await createSubmission({
        kind,
        title: title.trim(),
        url: parsed.toString(),
        summary: summary.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
          .filter(Boolean)
          .slice(0, 8),
      })
      setDone(s)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {done ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, transform: "scale(0.96)" }}
          animate={{ opacity: 1, transform: "scale(1)" }}
          transition={{ type: "spring", bounce: 0.25, duration: 0.6 }}
          className="glass flex flex-col items-start gap-4 rounded-2xl p-6 md:p-8"
        >
          <CheckCircle2Icon aria-hidden className="size-8 text-ok" />
          <h2 className="text-2xl font-semibold">{done.title} is in the sky.</h2>
          <p className="text-muted-foreground">{done.local ? "This copy has no database, so it is saved in this browser only." : "Everyone can find it now, in Explore and on your page."}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={done.kind === "news" ? "/news" : KINDS[done.kind as ResourceKind].path} className="pressable inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
              See it listed
            </Link>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setDone(null)
                setTitle("")
                setUrl("")
                setSummary("")
                setTags("")
              }}
            >
              Share another
            </Button>
          </div>
        </motion.div>
      ) : (
        <motion.form key="form" exit={{ opacity: 0 }} onSubmit={submit} className="glass rounded-2xl p-5 md:p-7">
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">What are you sharing?</FieldLegend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {OPTIONS.map((o) => {
                  const Icon = o.kind === "news" ? NewspaperIcon : KIND_ICONS[o.kind]
                  const on = kind === o.kind
                  return (
                    <label
                      key={o.kind}
                      className={cn(
                        "pressable relative flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        on ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 hover:bg-card"
                      )}
                    >
                      <input type="radio" name="kind" value={o.kind} checked={on} onChange={() => setKind(o.kind)} className="sr-only" />
                      <Icon aria-hidden className={cn("size-5", on ? "text-ion" : "text-muted-foreground")} />
                      <span className="font-medium">{o.label}</span>
                    </label>
                  )
                })}
              </div>
              <FieldDescription>{OPTIONS.find((o) => o.kind === kind)?.hint}</FieldDescription>
            </FieldSet>
            <div className="grid gap-6 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="s-title">Name</FieldLabel>
                <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === "news" ? "The headline" : "e.g. tiny-rag"} className="h-11 bg-background/60" />
              </Field>
              <Field data-invalid={error.includes("https") ? true : undefined}>
                <FieldLabel htmlFor="s-url">Link</FieldLabel>
                <Input id="s-url" value={url} onChange={(e) => setUrl(e.target.value)} type="url" inputMode="url" maxLength={500} placeholder="https://" className="h-11 bg-background/60" />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="s-summary">In one or two sentences</FieldLabel>
              <Textarea id="s-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500} rows={3} placeholder={kind === "news" ? "What happened, and why it matters." : "What it does and who it is for."} className="bg-background/60" />
            </Field>
            <Field>
              <FieldLabel htmlFor="s-tags">Tags</FieldLabel>
              <Input id="s-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="rag, portuguese, on-device" className="h-11 bg-background/60" />
              <FieldDescription>Up to eight, separated by commas.</FieldDescription>
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" size="lg" className="self-start" disabled={busy || (live && !ready)}>
              {busy ? "Sharing…" : "Share it"}
            </Button>
          </FieldGroup>
        </motion.form>
      )}
    </AnimatePresence>
  )
}
