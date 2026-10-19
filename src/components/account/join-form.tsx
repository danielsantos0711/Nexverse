"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { ArrowRightIcon, LockIcon } from "lucide-react"
import { CheckInbox, EMAIL, FormAlert, OrDivider, PasswordInput, PasswordStrength, passwordAcceptable, SocialButtons } from "@/components/account/auth-ui"
import { safeNext } from "@/components/account/safe-next"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthSettings } from "@/lib/auth-providers"
import { PROFILE_LIMITS } from "@/lib/profile"
import { useSiteSettings } from "@/lib/site-settings"
import { AuthFailure, resendConfirmation, signUpWithPassword, useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

type Errors = Partial<Record<"name" | "email" | "password", string>>

/** Create an account: a social account, or a name, email and password confirmed by email. */
export function JoinForm() {
  const router = useRouter()
  const next = safeNext(useSearchParams().get("next"))
  const { ready, user } = useSession()
  const site = useSiteSettings()
  const auth = useAuthSettings()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState("")
  const [exists, setExists] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const personal = [name, ...name.split(/\s+/), email.split("@")[0] ?? ""]

  if (!live) {
    return (
      <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6">
        <p className="text-sm text-muted-foreground">This copy of Nexverse is not connected to a database, so there are no accounts to create. What you make is kept in this browser.</p>
        <LinkButton href="/forum/new">Start a thread</LinkButton>
      </div>
    )
  }

  if (!site.ready || !auth.ready) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    )
  }

  if (ready && user && !busy) {
    return (
      <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6">
        <p className="text-sm">
          You already have an account and are signed in as <span className="font-medium break-all">{user.email ?? "a member"}</span>.
        </p>
        <LinkButton href={next}>
          Continue <ArrowRightIcon aria-hidden />
        </LinkButton>
      </div>
    )
  }

  if (!site.settings.access.signupOpen || auth.signupDisabled) {
    return (
      <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6" role="status">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <LockIcon aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">Joining is closed for now</h2>
          <p className="text-sm text-muted-foreground">The Nexverse team has paused new accounts. Members can still sign in, and everything stays open to read.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in</LinkButton>
          <LinkButton href="/" variant="ghost">
            Explore Nexverse
          </LinkButton>
        </div>
      </div>
    )
  }

  if (sent) {
    return (
      <CheckInbox
        title="Confirm your email"
        email={sent}
        detail="Open the link in it to switch your account on. You will land on a short welcome to set up your profile."
        onResend={() => resendConfirmation(sent, next)}
        onBack={() => {
          setSent("")
          setPassword("")
        }}
        back="Wrong address? Start again"
      />
    )
  }

  function check(): Errors {
    const e: Errors = {}
    const n = name.trim()
    if (!n) e.name = "Tell us what to call you."
    else if (n.length > PROFILE_LIMITS.name) e.name = "Use up to 60 characters."
    if (!EMAIL.test(email.trim())) e.email = "That does not look like an email address."
    if (!passwordAcceptable(password, personal)) e.password = password.length < 8 ? "Use at least 8 characters." : "Make it a little stronger: longer, or mix in numbers and symbols."
    return e
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    const found = check()
    setErrors(found)
    setError("")
    setExists(false)
    const first = (["name", "email", "password"] as const).find((k) => found[k])
    if (first) {
      const target = { name: nameRef, email: emailRef, password: passwordRef }[first]
      target.current?.focus()
      return
    }
    setBusy(true)
    try {
      const address = email.trim()
      const result = await signUpWithPassword({ email: address, password, name: name.trim(), next })
      if (result === "signed-in") {
        router.replace("/welcome")
        return
      }
      setSent(address)
    } catch (err) {
      const code = err instanceof AuthFailure ? err.code : undefined
      if (code === "weak_password") {
        setErrors({ password: (err as Error).message })
        passwordRef.current?.focus()
      } else {
        setExists(code === "user_already_exists" || code === "email_exists")
        setError((err as Error).message)
      }
    } finally {
      setBusy(false)
    }
  }

  const clear = (k: keyof Errors) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined }))

  return (
    <div className="flex flex-col gap-6">
      <SocialButtons next="/welcome" verb="Join" disabled={busy} onError={setError}>
        <OrDivider>or with email</OrDivider>
      </SocialButtons>

      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-5">
          <Field data-invalid={errors.name ? true : undefined}>
            <FieldLabel htmlFor="jn-name">Your name</FieldLabel>
            <Input
              ref={nameRef}
              id="jn-name"
              autoComplete="name"
              value={name}
              maxLength={PROFILE_LIMITS.name + 10}
              onChange={(e) => {
                setName(e.target.value)
                clear("name")
              }}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "jn-name-error" : "jn-name-hint"}
              className="h-12 bg-background/60 text-base"
            />
            {errors.name ? <FieldError id="jn-name-error">{errors.name}</FieldError> : <FieldDescription id="jn-name-hint">Shown next to what you write. You can change it later.</FieldDescription>}
          </Field>
          <Field data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor="jn-email">Email</FieldLabel>
            <Input
              ref={emailRef}
              id="jn-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clear("email")
              }}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "jn-email-error" : undefined}
              className="h-12 bg-background/60 text-base"
            />
            {errors.email && <FieldError id="jn-email-error">{errors.email}</FieldError>}
          </Field>
          <Field data-invalid={errors.password ? true : undefined}>
            <FieldLabel htmlFor="jn-password">Password</FieldLabel>
            <PasswordInput
              id="jn-password"
              inputRef={passwordRef}
              value={password}
              onChange={(v) => {
                setPassword(v)
                clear("password")
              }}
              autoComplete="new-password"
              invalid={Boolean(errors.password)}
              describedBy={errors.password ? "jn-password-error jn-strength" : "jn-strength"}
            />
            {errors.password && <FieldError id="jn-password-error">{errors.password}</FieldError>}
            <PasswordStrength id="jn-strength" password={password} personal={personal} />
          </Field>
          {error && (
            <FormAlert>
              <p>{error}</p>
              {exists && (
                <div className="flex flex-wrap gap-2">
                  <LinkButton href={`/sign-in?next=${encodeURIComponent(next)}`} size="sm" variant="secondary">
                    Sign in
                  </LinkButton>
                  <LinkButton href={`/reset-password?email=${encodeURIComponent(email.trim())}`} size="sm" variant="ghost">
                    Reset password
                  </LinkButton>
                </div>
              )}
            </FormAlert>
          )}
          <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
            {busy ? "Creating your account…" : "Create account"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {auth.confirmEmail ? "We send one email to confirm the address is yours. No newsletters." : "Your account is ready as soon as you create it."} Prefer no password?{" "}
            <Link href={`/sign-in?mode=link&next=${encodeURIComponent(next)}`} className="rounded text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              Get a sign-in link instead
            </Link>
            .
          </p>
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already a member?{" "}
        <Link href={`/sign-in${next !== "/you" ? `?next=${encodeURIComponent(next)}` : ""}`} className="rounded font-medium text-ion hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Sign in
        </Link>
      </p>
    </div>
  )
}
