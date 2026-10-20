"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { CircleAlertIcon, KeyRoundIcon, MailCheckIcon, SparklesIcon, UserPlusIcon } from "lucide-react"
import { safeNext } from "@/components/account/safe-next"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { useCopy } from "@/lib/content"
import { needsWelcome } from "@/lib/profile"
import { EMAIL_LINK_TYPES, RESET_PATH, verifyEmailLink, type EmailLinkType } from "@/lib/store"
import { live } from "@/lib/supabase"

/**
 * Where a "token hash" email link lands: `/auth/confirm?token_hash=…&type=…&next=/path`. The hash works in
 * any browser on any device (nothing from the request is needed), so a reset asked for on a laptop can be
 * finished on a phone. The link is used only when the person presses the button: mail scanners that open
 * every link in an email would otherwise spend it before the person ever saw it.
 */

/** Where to go afterwards: `next`, or the `next` inside a `redirect_to` the email template passed along. */
function destination(params: URLSearchParams): string {
  const direct = params.get("next")
  if (direct) return safeNext(direct)
  const redirect = params.get("redirect_to")
  if (!redirect) return "/you"
  try {
    const url = new URL(redirect, window.location.origin)
    if (url.origin !== window.location.origin) return "/you"
    return safeNext(url.pathname === "/auth/callback" ? url.searchParams.get("next") : url.pathname + url.search)
  } catch {
    return "/you"
  }
}

const COPY: Record<EmailLinkType, { title: string; lead: string; action: string; icon: typeof KeyRoundIcon }> = {
  recovery: { title: "Choose a new password", lead: "Your reset link is ready. Continue to set a new password; you will be signed in.", action: "Continue to new password", icon: KeyRoundIcon },
  signup: { title: "Confirm your email", lead: "One tap and your account is ready. Welcome to the universe.", action: "Confirm my email", icon: MailCheckIcon },
  email: { title: "Confirm your email", lead: "One tap and you are signed in.", action: "Confirm and sign in", icon: MailCheckIcon },
  magiclink: { title: "Sign in to Nexverse", lead: "Your sign-in link is ready.", action: "Sign me in", icon: SparklesIcon },
  invite: { title: "You are invited", lead: "Accept the invitation to create your Nexverse account.", action: "Accept invitation", icon: UserPlusIcon },
  email_change: { title: "Confirm your new email", lead: "Confirm the change so your account uses this address from now on.", action: "Confirm new email", icon: MailCheckIcon },
}

export function AuthConfirm() {
  const router = useRouter()
  const params = useSearchParams()
  const tokenHash = params.get("token_hash") ?? ""
  const rawType = params.get("type") ?? ""
  const type = (EMAIL_LINK_TYPES as readonly string[]).includes(rawType) ? (rawType as EmailLinkType) : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const copy = type ? COPY[type] : null
  const title = useCopy(`auth.confirm.${type ?? "unknown"}.title`, copy?.title ?? "This link is not complete")
  const lead = useCopy(`auth.confirm.${type ?? "unknown"}.lead`, copy?.lead ?? "Part of the link is missing. Copy the whole link from the email, or ask for a new one.")
  const action = useCopy(`auth.confirm.${type ?? "unknown"}.action`, copy?.action ?? "Continue")

  async function confirm() {
    if (!type || !tokenHash) return
    setBusy(true)
    setError("")
    try {
      const user = await verifyEmailLink(tokenHash, type)
      if (type === "recovery") return router.replace(RESET_PATH)
      const next = type === "email_change" ? "/settings#security" : destination(params)
      const welcome = user && (type === "signup" || type === "email" || type === "invite") ? await needsWelcome() : false
      router.replace(welcome ? "/welcome" : next)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const Icon = error || !copy ? CircleAlertIcon : copy.icon
  const again = type === "recovery" ? RESET_PATH : "/sign-in"

  return (
    <div className="liquid-glass glass flex flex-col items-start gap-5 rounded-2xl p-6 md:p-8">
      <span className={error || !copy ? "inline-flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive" : "inline-flex size-11 items-center justify-center rounded-full bg-ion/15 text-ion"}>
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="max-w-[54ch] text-sm text-muted-foreground">{lead}</p>
      </div>
      {error && (
        <p role="alert" className="max-w-[54ch] text-sm text-destructive">
          {error}
        </p>
      )}
      {!live ? (
        <p className="text-sm text-muted-foreground">This copy of Nexverse is not connected to a database, so there are no accounts.</p>
      ) : copy && tokenHash && !error ? (
        <Button size="lg" className="h-12" onClick={confirm} disabled={busy}>
          {busy ? "One moment…" : action}
        </Button>
      ) : (
        <LinkButton href={again}>{type === "recovery" ? "Send a new reset link" : "Back to sign in"}</LinkButton>
      )}
    </div>
  )
}
