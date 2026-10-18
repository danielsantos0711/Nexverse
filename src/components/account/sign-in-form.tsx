"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { safeNext } from "@/components/account/safe-next"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { signInWithEmail, useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

export function SignInForm() {
  const next = safeNext(useSearchParams().get("next"))
  const { user } = useSession()
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  if (!live) {
    return (
      <div className="flex flex-col items-start gap-5 rounded-md bg-card p-6 md:p-8">
        <p className="max-w-[54ch]">
          This copy of Nexverse is not connected to a database, so there are no accounts. Questions and answers
          you write are kept in this browser instead.
        </p>
        <LinkButton href="/new">Ask a question</LinkButton>
      </div>
    )
  }

  if (user) {
    return (
      <div className="flex flex-col items-start gap-5 rounded-md bg-card p-6 md:p-8">
        <p>You are signed in as {user.email}.</p>
        <LinkButton href={next}>Continue</LinkButton>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-md bg-card p-6 md:p-8" role="status">
        <h2 className="font-wide text-2xl font-semibold tracking-[-0.03em]">Check your email</h2>
        <p className="max-w-[54ch] text-muted-foreground">
          We sent a sign-in link to <span className="text-foreground">{sent}</span>. Open it on this device and you
          will come straight back here.
        </p>
        <Button variant="secondary" onClick={() => setSent("")}>
          Use another address
        </Button>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("That does not look like an email address.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await signInWithEmail(address, next)
      setSent(address)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-md bg-card p-6 md:p-8">
      <FieldGroup>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            className="h-12 bg-background text-base"
          />
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <FieldDescription>New here? The same link creates your account.</FieldDescription>
          )}
        </Field>
        <Button type="submit" size="lg" className="self-start" disabled={busy}>
          {busy ? "Sending…" : "Send me a link"}
        </Button>
      </FieldGroup>
    </form>
  )
}
