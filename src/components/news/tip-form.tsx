"use client"

import { useState } from "react"
import { CheckCircle2Icon, SendIcon } from "lucide-react"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { sendTip } from "@/lib/newsroom"
import { live } from "@/lib/supabase"

/**
 * "Send a tip": a link and a note for the editors. Tips go to the newsroom's inbox, never straight to the
 * page; editors check them against official sources first. Needs news.tip (the database checks too).
 */
export function TipForm() {
  if (!live) {
    return <p className="rounded-xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">Tips need accounts, and this copy of Nexverse is not connected to a database.</p>
  }
  return (
    <Gate cap="news.tip" action="send the newsroom a tip">
      <Form />
    </Gate>
  )
}

function Form() {
  const [url, setUrl] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await sendTip({ url, note })
      setSent(true)
      setUrl("")
      setNote("")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-2xl border border-ok/30 bg-ok/[0.06] p-5">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2Icon aria-hidden className="size-5 text-ok" /> Thanks, the editors have your tip
        </p>
        <p className="text-sm text-muted-foreground">They check every tip against official sources before anything is written. If it becomes a story, it will be on this page.</p>
        <Button variant="outline" size="sm" onClick={() => setSent(false)}>
          Send another tip
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="tip-url">
          Link <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input id="tip-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… an official post, changelog or filing" className="h-10 bg-background/60" />
        <FieldDescription>Official sources are best. Posts on other community sites are not used.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="tip-note">What should the editors know?</FieldLabel>
        <Textarea id="tip-note" value={note} rows={4} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="What happened, and how you know. Rumours are fine: tell us where you heard it." className="bg-background/60" />
        <FieldDescription>{2000 - note.length} characters left. Editors see your name; readers do not.</FieldDescription>
      </Field>
      {error && <FieldError role="alert">{error}</FieldError>}
      <Button type="submit" disabled={busy} className="self-start">
        <SendIcon aria-hidden />
        {busy ? "Sending…" : "Send the tip"}
      </Button>
    </form>
  )
}
