"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { CheckCircle2Icon, FlagIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { fileReport, REPORT_REASONS, type ReportReason, type ReportResult } from "@/lib/moderation"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/**
 * "Report" for anything members post. Opens a short form (a reason and optional details) that goes to the
 * moderators' queue. Guests are asked to sign in; browser-only copies have no moderators, so it does not show.
 */
export function ReportButton({
  targetKind,
  targetId,
  targetUrl,
  label = "Report",
  iconOnly = false,
  className,
}: {
  /** What is reported, in the database's words: question, answer, submission, project, event, room_message, crew_post… */
  targetKind: string
  targetId: string
  /** The page where moderators can see it, a path on this site such as /forum/abc. Defaults to the current page. */
  targetUrl?: string
  label?: string
  iconOnly?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  if (!live) return null
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size={iconOnly ? "icon-sm" : "sm"} className={cn("text-muted-foreground hover:text-foreground", className)} aria-label={iconOnly ? label : undefined} />
        }
      >
        <FlagIcon aria-hidden />
        {!iconOnly && label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">{open && <ReportForm targetKind={targetKind} targetId={targetId} targetUrl={targetUrl} />}</DialogContent>
    </Dialog>
  )
}

function ReportForm({ targetKind, targetId, targetUrl }: { targetKind: string; targetId: string; targetUrl?: string }) {
  const { ready, user } = useSession()
  const path = usePathname()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ReportResult | null>(null)

  if (!ready) return <p className="py-6 text-center text-muted-foreground">Checking your account…</p>

  if (!user) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Sign in to report</DialogTitle>
          <DialogDescription>Reports come from members, so the moderators can ask for more if they need it. Signing in takes an email address.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Not now</DialogClose>
          <Button render={<Link href={`/sign-in?next=${encodeURIComponent(path)}`} />} nativeButton={false}>
            Sign in
          </Button>
        </DialogFooter>
      </>
    )
  }

  if (done) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2Icon aria-hidden className="size-5 text-ok" />
            {done === "sent" ? "Thanks, the moderators have it" : "You already reported this"}
          </DialogTitle>
          <DialogDescription>
            {done === "sent" ? "They look at every report. You will not be named to the person who posted it." : "Your first report is in the queue; one is enough."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    )
  }

  const needsDetails = reason === "other" && !details.trim()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!reason) {
      setError("Pick the reason that fits best.")
      document.querySelector<HTMLInputElement>('input[name="report-reason"]')?.focus()
      return
    }
    if (needsDetails) {
      setError("Tell the moderators what is wrong in a few words.")
      document.getElementById("report-details")?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      setDone(await fileReport({ targetKind, targetId, targetUrl: targetUrl ?? path, reason, details }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Report this</DialogTitle>
        <DialogDescription>Something here breaks the rules? Tell the moderators. They decide what happens next.</DialogDescription>
      </DialogHeader>
      <FieldSet>
        <FieldLegend variant="label">Reason</FieldLegend>
        <div role="radiogroup" aria-label="Reason" className="flex flex-col gap-1.5">
          {REPORT_REASONS.map((r) => {
            const on = reason === r.id
            return (
              <label
                key={r.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  on ? "border-ion/60 bg-ion/10" : "border-border bg-card/50 hover:bg-card"
                )}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.id}
                  checked={on}
                  onChange={() => {
                    setReason(r.id)
                    setError(null)
                  }}
                  className="mt-1 size-3.5 accent-(--ion)"
                />
                <span className="flex flex-col">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground">{r.blurb}</span>
                </span>
              </label>
            )
          })}
        </div>
      </FieldSet>
      <Field>
        <FieldLabel htmlFor="report-details">Details {reason === "other" ? "" : <span className="font-normal text-muted-foreground">(optional)</span>}</FieldLabel>
        <Textarea id="report-details" value={details} maxLength={1000} rows={3} onChange={(e) => setDetails(e.target.value)} placeholder="What should the moderators look at?" className="bg-background/60" />
        <FieldDescription>{1000 - details.length} characters left</FieldDescription>
      </Field>
      {error && (
        <FieldError role="alert" className="-mt-2">
          {error}
        </FieldError>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send report"}
        </Button>
      </DialogFooter>
    </form>
  )
}
