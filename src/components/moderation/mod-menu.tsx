"use client"

import { useState } from "react"
import { EyeIcon, EyeOffIcon, ShieldIcon, StarIcon, StarOffIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { CONTENT_KINDS, moderate, type ContentKind, type ModAction } from "@/lib/moderation"
import { useRole } from "@/lib/roles"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const DONE: Record<ModAction, string> = {
  hide: "Hidden from everyone but its author and staff",
  unhide: "Visible again",
  feature: "Featured",
  unfeature: "No longer featured",
  remove: "Removed",
}

/**
 * The staff-only moderation menu for one piece of content: hide, unhide, remove (after a confirmation) and,
 * for shared links, feature. Renders nothing for everyone else. `hidden` and `featured` describe the item's
 * current state when the page knows it, so the menu offers the right action; `onDone` lets the page update.
 */
export function ModMenu({
  kind,
  id,
  hidden,
  featured,
  onDone,
  className,
}: {
  kind: ContentKind
  id: string
  hidden?: boolean
  featured?: boolean
  onDone?: (act: ModAction) => void
  className?: string
}) {
  const me = useRole()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState("")
  if (!live || !me.isStaff) return null

  const what = CONTENT_KINDS[kind].label.toLowerCase()

  async function run(act: ModAction, why = "") {
    setBusy(true)
    setStatus(null)
    try {
      await moderate(kind, id, act, why)
      setStatus({ ok: true, text: DONE[act] })
      setConfirm(false)
      onDone?.(act)
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Moderate this ${what}`} className="text-muted-foreground hover:text-foreground" />}>
          <ShieldIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Moderate {what}</DropdownMenuLabel>
            {hidden !== true && (
              <DropdownMenuItem onClick={() => run("hide")}>
                <EyeOffIcon aria-hidden /> Hide
              </DropdownMenuItem>
            )}
            {hidden !== false && (
              <DropdownMenuItem onClick={() => run("unhide")}>
                <EyeIcon aria-hidden /> Unhide
              </DropdownMenuItem>
            )}
            {kind === "submission" && featured !== true && (
              <DropdownMenuItem onClick={() => run("feature")}>
                <StarIcon aria-hidden /> Feature on the home page
              </DropdownMenuItem>
            )}
            {kind === "submission" && featured !== false && (
              <DropdownMenuItem onClick={() => run("unfeature")}>
                <StarOffIcon aria-hidden /> Stop featuring
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2Icon aria-hidden /> Remove…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" aria-live="polite" className={cn("text-xs", status?.ok ? "text-ok" : "text-destructive", !status && "sr-only")}>
        {status?.text}
      </span>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void run("remove", note)
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>Remove this {what}?</DialogTitle>
              <DialogDescription>It is deleted for everyone, its author included, and cannot be brought back. Hiding keeps it for the author and staff.</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={`mod-note-${id}`}>
                Note for the log <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id={`mod-note-${id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Spam, reported twice" />
            </Field>
            {status && !status.ok && (
              <p role="alert" className="text-sm text-destructive">
                {status.text}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? "Removing…" : "Remove"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </span>
  )
}
