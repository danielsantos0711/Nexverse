"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { PageHead } from "@/components/site/page-head"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/** A page heading at reading size: the studio, settings and editor are tools, not landing pages. */
export function StudioHead({ title, lead, eyebrow, children }: { title: string; lead?: React.ReactNode; eyebrow?: React.ReactNode; children?: React.ReactNode }) {
  return <PageHead title={title} lead={lead} crumbs={eyebrow ? <div className="text-sm text-muted-foreground">{eyebrow}</div> : undefined} actions={children} />
}

/** Shown in place of a members-only tool to visitors who are not signed in. */
export function SignInPrompt({ title, detail, next }: { title: string; detail: string; next?: string }) {
  const pathname = usePathname()
  return (
    <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <Link
        href={`/sign-in?next=${encodeURIComponent(next ?? pathname)}`}
        className="pressable inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Sign in
      </Link>
    </div>
  )
}

/** "Are you sure?" with the destructive action named on the button. Resolves once `onConfirm` settles. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirm: string
  onConfirm: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function run() {
    setBusy(true)
    setError("")
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          setError("")
          onOpenChange(o)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={busy} />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={run} disabled={busy}>
            {busy ? "Working…" : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A quiet status pill: Draft / Published / On this device. */
export function StatusPill({ tone, children, className }: { tone: "draft" | "live" | "local"; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
        tone === "live" && "border-ok/40 bg-ok/10 text-ok",
        tone === "draft" && "border-gold/40 bg-gold/10 text-gold",
        tone === "local" && "border-border bg-secondary/60 text-muted-foreground",
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone === "live" ? "bg-ok" : tone === "draft" ? "bg-gold" : "bg-muted-foreground")} />
      {children}
    </span>
  )
}
