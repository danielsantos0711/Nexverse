"use client"

import { useSearchParams } from "next/navigation"
import { useState, useSyncExternalStore } from "react"
import { ArrowRightIcon, CheckCircle2Icon } from "lucide-react"
import { CheckInbox, EMAIL, FormAlert } from "@/components/account/auth-ui"
import { NewPasswordForm } from "@/components/account/new-password-form"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authErrorMessage } from "@/lib/auth-providers"
import { sendPasswordReset, useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

const noop = () => () => {}

/** The error Supabase put in the address when a reset link could not be used, from the query or the hash. */
function linkProblem(params: URLSearchParams, rawHash: string): string {
  const hash = new URLSearchParams(rawHash.slice(1))
  const code = params.get("error_code") ?? hash.get("error_code")
  const description = params.get("error_description") ?? hash.get("error_description")
  if (!code && !description && !params.get("error") && !hash.get("error")) return ""
  return code ? authErrorMessage({ code, message: description ?? "" }) : (description ?? "That link could not be used.")
}

/**
 * Two halves of one flow. Without a session it asks for your email and sends a reset link; the link comes
 * back here with a code the database client turns into a short session, and then it asks for the new password.
 */
export function ResetPasswordForm() {
  const params = useSearchParams()
  const { ready, user } = useSession()
  const rawHash = useSyncExternalStore(noop, () => window.location.hash, () => "")
  const [done, setDone] = useState(false)
  const arriving = params.has("code")
  // A code the client could not exchange (expired, used, or opened in another browser) leaves no session.
  const problem = linkProblem(params, rawHash) || (arriving && ready && !user ? authErrorMessage({ code: "flow_state_not_found" }) : "")

  if (!live) {
    return <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">This copy of Nexverse is not connected to a database, so there are no accounts or passwords.</p>
  }

  if (done) {
    return (
      <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6" role="status">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-ok/15 text-ok">
          <CheckCircle2Icon aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Your password is changed</h2>
          <p className="text-sm text-muted-foreground">You are signed in. Next time, use the new password.</p>
        </div>
        <LinkButton href="/you">
          Continue <ArrowRightIcon aria-hidden />
        </LinkButton>
      </div>
    )
  }

  if (!ready) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {arriving ? "Checking your link…" : "Loading…"}
      </p>
    )
  }

  if (user) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          Choosing a new password for <span className="font-medium break-all text-foreground">{user.email}</span>.
        </p>
        <NewPasswordForm personal={[user.email?.split("@")[0] ?? ""]} submitLabel="Save new password" onDone={() => setDone(true)} idPrefix="rp" />
      </div>
    )
  }

  return <RequestReset initialEmail={params.get("email") ?? ""} problem={problem} />
}

function RequestReset({ initialEmail, problem }: { initialEmail: string; problem: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [invalid, setInvalid] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState("")

  if (sent) {
    return (
      <CheckInbox
        title="Check your inbox"
        email={sent}
        detail="If there is an account with that address, the email has a link to choose a new password. Open it in this browser."
        onResend={() => sendPasswordReset(sent)}
        onBack={() => setSent("")}
      />
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
            {busy ? "Sending…" : "Email me a reset link"}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <LinkButton href="/sign-in" variant="link" className="h-auto p-0 align-baseline text-ion">
          Back to sign in
        </LinkButton>
      </p>
    </div>
  )
}
