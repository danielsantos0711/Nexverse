"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowRightIcon, CheckCircle2Icon, KeyRoundIcon } from "lucide-react"
import { AuthConfirm } from "@/components/account/auth-confirm"
import { CheckInbox, EMAIL, FormAlert } from "@/components/account/auth-ui"
import { NewPasswordForm } from "@/components/account/new-password-form"
import { Copy } from "@/components/content/copy"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authErrorMessage } from "@/lib/auth-providers"
import { useCopy } from "@/lib/content"
import { finishAuthRedirect, sendPasswordReset, useSession, verifyRecoveryCode } from "@/lib/store"
import { live } from "@/lib/supabase"

/** Whether the address carries a link to finish (a PKCE code, an old-style hash) or an error from Supabase. */
function readArrival() {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const code = query.get("error_code") ?? hash.get("error_code")
  const description = query.get("error_description") ?? hash.get("error_description")
  const problem = code || description || query.get("error") || hash.get("error") ? (code ? authErrorMessage({ code, message: description ?? "" }) : (description ?? "That link could not be used.")) : ""
  return { link: query.has("code") || hash.has("access_token"), problem }
}

/**
 * The whole password reset, in one place:
 * - a guest asks for a reset email (a link, plus a code they can type here instead);
 * - the link or code gives this tab a short "recovery" session, and only then is the new password asked for;
 * - a signed-in member who comes here on purpose can change their password too, after choosing to;
 * - once saved, you are signed in and taken on.
 * Links work in any browser when the email uses the token-hash template (see docs); a PKCE link opened in a
 * different browser explains itself and offers a new email.
 */
export function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()
  const { ready, user, recovery } = useSession()
  const [arrival, setArrival] = useState<{ checking: boolean; problem: string }>({ checking: true, problem: "" })
  const [changing, setChanging] = useState(false)
  const [done, setDone] = useState(false)
  const tokenHash = params.get("token_hash")

  // Finish a link that came straight here (older emails, or a template that points at this page).
  useEffect(() => {
    if (!live) return
    let stale = false
    const { link, problem } = readArrival()
    if (problem || !link) {
      queueMicrotask(() => !stale && setArrival({ checking: false, problem }))
    } else {
      void finishAuthRedirect().then((r) => !stale && setArrival({ checking: false, problem: r.error?.message ?? "" }))
    }
    return () => {
      stale = true
    }
  }, [])

  // After a reset, carry on to your page on your own after a moment.
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => router.replace("/you"), 2500)
    return () => clearTimeout(t)
  }, [done, router])

  const checking = useCopy("auth.reset.checking", "Checking your link…")

  if (!live) {
    return <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">This copy of Nexverse is not connected to a database, so there are no accounts or passwords.</p>
  }

  if (tokenHash && !user) return <AuthConfirm />

  if (done) {
    return (
      <div className="liquid-glass glass flex flex-col items-start gap-4 rounded-2xl p-6" role="status">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-ok/15 text-ok">
          <CheckCircle2Icon aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <Copy k="auth.reset.done.title" as="h2" className="text-lg font-semibold">
            Your password is changed
          </Copy>
          <Copy k="auth.reset.done.body" as="p" className="text-sm text-muted-foreground">
            You are signed in. Taking you to your page…
          </Copy>
        </div>
        <LinkButton href="/you">
          Continue <ArrowRightIcon aria-hidden />
        </LinkButton>
      </div>
    )
  }

  if (!ready || arrival.checking) {
    return (
      <p role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-ion/30 border-t-ion motion-reduce:animate-none" />
        {checking}
      </p>
    )
  }

  const personal = [user?.email?.split("@")[0] ?? ""]

  if (user && recovery) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          <Copy k="auth.reset.recovery.lead">Choose a new password for</Copy> <span className="font-medium break-all text-foreground">{user.email}</span>.
        </p>
        <NewPasswordForm personal={personal} submitLabel="Save and sign in" onDone={() => setDone(true)} idPrefix="rp" />
      </div>
    )
  }

  if (user) {
    return (
      <div className="flex flex-col gap-5">
        {arrival.problem && (
          <FormAlert>
            <p>{arrival.problem}</p>
          </FormAlert>
        )}
        <div className="liquid-glass glass flex flex-col gap-4 rounded-2xl p-5">
          <p className="text-sm text-muted-foreground">
            <Copy k="auth.reset.signedIn.lead">You are signed in as</Copy> <span className="font-medium break-all text-foreground">{user.email}</span>.{" "}
            <Copy k="auth.reset.signedIn.body">You can change your password here. If Supabase asks for proof, we email you a code first.</Copy>
          </p>
          {changing ? (
            <NewPasswordForm personal={personal} submitLabel="Save new password" onDone={() => setDone(true)} idPrefix="rp" />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setChanging(true)}>
                <KeyRoundIcon aria-hidden /> Change my password
              </Button>
              <LinkButton href="/you" variant="ghost">
                Keep my password
              </LinkButton>
            </div>
          )}
        </div>
      </div>
    )
  }

  return <RequestReset initialEmail={params.get("email") ?? ""} problem={arrival.problem} />
}

function RequestReset({ initialEmail, problem }: { initialEmail: string; problem: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [invalid, setInvalid] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState("")
  const submitLabel = useCopy("auth.reset.request.submit", "Email me a reset link")

  if (sent) {
    return (
      <CheckInbox
        title="Check your inbox"
        email={sent}
        detail="If there is an account with that address, the email has a link to choose a new password."
        onResend={() => sendPasswordReset(sent)}
        onBack={() => setSent("")}
      >
        <RecoveryCode email={sent} />
      </CheckInbox>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!EMAIL.test(address)) {
      setInvalid("That does not look like an email address.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await sendPasswordReset(address)
      setSent(address)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {problem && (
        <FormAlert>
          <p>{problem}</p>
          <p className="text-muted-foreground">Enter your email and we will send a fresh link.</p>
        </FormAlert>
      )}
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-5">
          <Field data-invalid={invalid ? true : undefined}>
            <FieldLabel htmlFor="rp-email">Email</FieldLabel>
            <Input
              id="rp-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setInvalid("")
              }}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={invalid ? "rp-email-error" : undefined}
              className="h-12 bg-background/60 text-base"
            />
            {invalid && <FieldError id="rp-email-error">{invalid}</FieldError>}
          </Field>
          {error && (
            <FormAlert>
              <p>{error}</p>
            </FormAlert>
          )}
          <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
            {busy ? "Sending…" : submitLabel}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        <Copy k="auth.reset.request.remembered">Remembered it?</Copy>{" "}
        <LinkButton href="/sign-in" variant="link" className="h-auto p-0 align-baseline text-ion">
          Back to sign in
        </LinkButton>
      </p>
    </div>
  )
}

/** The code printed in the reset email: typing it here works even when the link cannot be opened. */
function RecoveryCode({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <Button variant="link" className="h-auto p-0 text-ion" onClick={() => setOpen(true)}>
        The email has a code? Enter it here
      </Button>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = code.trim()
    if (!/^\d{6,10}$/.test(value)) {
      setError("Enter the code exactly as it is in the email.")
      return
    }
    setBusy(true)
    setError("")
    try {
      // On success the session store switches this page to the new-password form by itself.
      await verifyRecoveryCode(email, value)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <FieldGroup className="gap-3">
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="rp-code">Code from the email</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Input
              id="rp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 10))
                setError("")
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "rp-code-error" : "rp-code-hint"}
              className="h-11 max-w-44 bg-background/60 text-base tracking-[0.2em] tabular"
            />
            <Button type="submit" className="h-11" disabled={busy}>
              {busy ? "Checking…" : "Use code"}
            </Button>
          </div>
          {error ? <FieldError id="rp-code-error">{error}</FieldError> : <FieldDescription id="rp-code-hint">It works once and expires soon.</FieldDescription>}
        </Field>
      </FieldGroup>
    </form>
  )
}
