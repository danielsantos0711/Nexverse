"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { ArrowRightIcon, KeyRoundIcon, MailIcon } from "lucide-react"
import { CheckInbox, EMAIL, FormAlert, OrDivider, PasswordInput, SocialButtons } from "@/components/account/auth-ui"
import { safeNext } from "@/components/account/safe-next"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuthSettings } from "@/lib/auth-providers"
import { needsWelcome } from "@/lib/profile"
import { useSiteSettings } from "@/lib/site-settings"
import { AuthFailure, resendConfirmation, signInWithEmail, signInWithPassword, useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Mode = "password" | "link"

/** Sign in with a password, a link by email, or any social account switched on in Supabase. */
export function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get("next"))
  const { ready, user } = useSession()
  const auth = useAuthSettings()
  const open = useSiteSettings().settings.access.signupOpen && !auth.signupDisabled
  const [mode, setMode] = useState<Mode>(params.get("mode") === "link" ? "link" : "password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [sent, setSent] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [field, setField] = useState<"email" | "password" | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  if (!live) {
    return (
      <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">
          This copy of Nexverse is not connected to a database, so there are no accounts. Threads and projects you make are kept in this browser instead.
        </p>
        <LinkButton href="/forum/new">Start a thread</LinkButton>
      </div>
    )
  }

  if (ready && user && !busy) {
    return (
      <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6">
        <p className="text-sm">
          You are signed in as <span className="font-medium break-all">{user.email ?? "a member"}</span>.
        </p>
        <LinkButton href={next}>
          Continue <ArrowRightIcon aria-hidden />
        </LinkButton>
      </div>
    )
  }

  if (sent) {
    return (
      <CheckInbox
        title="Check your inbox"
        email={sent}
        detail="Open the link on this device and you will come straight back, signed in."
        onResend={() => signInWithEmail(sent, next, open)}
        onBack={() => setSent("")}
      />
    )
  }

  function fail(message: string, which: "email" | "password" | null) {
    setError(message)
    setField(which)
    if (which === "email") emailRef.current?.focus()
    if (which === "password") passwordRef.current?.focus()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    setUnconfirmed(false)
    if (!EMAIL.test(address)) return fail("That does not look like an email address.", "email")
    if (mode === "password" && !password) return fail("Enter your password, or get a link by email instead.", "password")
    setBusy(true)
    setError("")
    setField(null)
    try {
      if (mode === "link") {
        await signInWithEmail(address, next, open)
        setSent(address)
        setBusy(false)
        return
      }
      await signInWithPassword(address, password)
      router.replace((await needsWelcome()) ? "/welcome" : next)
    } catch (err) {
      const code = err instanceof AuthFailure ? err.code : undefined
      if (code === "email_not_confirmed") setUnconfirmed(true)
      fail((err as Error).message, code === "invalid_credentials" ? "password" : null)
      setBusy(false)
    }
  }

  async function resend() {
    try {
      await resendConfirmation(email.trim(), next)
      setUnconfirmed(false)
      setSent(email.trim())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SocialButtons next={next} onError={(m) => fail(m, null)} disabled={busy}>
        <OrDivider>or with email</OrDivider>
      </SocialButtons>

      <div role="group" aria-label="How to sign in with email" className="grid grid-cols-2 gap-1 rounded-full border border-border bg-card/40 p-1">
        {(
          [
            ["password", "Password", KeyRoundIcon],
            ["link", "Email me a link", MailIcon],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m)
              setError("")
              setField(null)
            }}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-full text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon aria-hidden className="size-4" /> {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-5">
          <Field data-invalid={field === "email" || undefined}>
            <FieldLabel htmlFor="si-email">Email</FieldLabel>
            <Input
              ref={emailRef}
              id="si-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={field === "email" || undefined}
              aria-describedby={field === "email" ? "si-error" : undefined}
              className="h-12 bg-background/60 text-base"
            />
          </Field>
          {mode === "password" ? (
            <Field data-invalid={field === "password" || undefined}>
              <div className="flex items-baseline justify-between gap-3">
                <FieldLabel htmlFor="si-password">Password</FieldLabel>
                <Link href={`/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`} className="rounded text-sm text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  Forgot password?
                </Link>
              </div>
              <PasswordInput id="si-password" inputRef={passwordRef} value={password} onChange={setPassword} autoComplete="current-password" invalid={field === "password"} describedBy={field === "password" ? "si-error" : undefined} />
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">
              {open ? "We email you a link that signs you in. New here? The same link creates your account." : "We email you a link that signs you in. Joining is closed for now, so this works for existing members only."}
            </p>
          )}
          {error && (
            <FormAlert>
              <FieldError id="si-error" className="text-foreground">
                {error}
              </FieldError>
              {unconfirmed && (
                <Button type="button" size="sm" variant="secondary" onClick={resend}>
                  Send the confirmation again
                </Button>
              )}
            </FormAlert>
          )}
          <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
            {busy ? (mode === "link" ? "Sending…" : "Signing in…") : mode === "link" ? "Send me a link" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {open ? (
          <>
            New to Nexverse?{" "}
            <Link href={`/join${next !== "/you" ? `?next=${encodeURIComponent(next)}` : ""}`} className="rounded font-medium text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              Create an account
            </Link>
          </>
        ) : (
          "Joining is closed for now. Members can still sign in."
        )}
      </p>
    </div>
  )
}
