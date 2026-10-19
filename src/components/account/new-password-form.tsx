"use client"

import { useRef, useState } from "react"
import { FormAlert, PasswordInput, PasswordStrength, passwordAcceptable } from "@/components/account/auth-ui"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AuthFailure, sendReauthentication, updatePassword } from "@/lib/store"

/**
 * Sets a new password for the signed-in account. When Supabase wants proof it is you (its "secure password
 * change" switch), it emails a code and this form asks for it before trying again.
 */
export function NewPasswordForm({ personal, submitLabel, onDone, idPrefix = "np" }: { personal: string[]; submitLabel: string; onDone: () => void; idPrefix?: string }) {
  const [password, setPassword] = useState("")
  const [nonce, setNonce] = useState("")
  const [needsCode, setNeedsCode] = useState(false)
  const [fieldError, setFieldError] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const id = (s: string) => `${idPrefix}-${s}`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!passwordAcceptable(password, personal)) {
      setFieldError(password.length < 8 ? "Use at least 8 characters." : "Make it a little stronger: longer, or mix in numbers and symbols.")
      input.current?.focus()
      return
    }
    if (needsCode && !/^\d{6,10}$/.test(nonce.trim())) {
      setError("Enter the code from the email we just sent.")
      return
    }
    setBusy(true)
    try {
      await updatePassword(password, needsCode ? nonce.trim() : undefined)
      setPassword("")
      setNonce("")
      setNeedsCode(false)
      onDone()
    } catch (err) {
      const code = err instanceof AuthFailure ? err.code : undefined
      if (code === "reauthentication_needed") {
        try {
          await sendReauthentication()
          setNeedsCode(true)
        } catch (sendErr) {
          setError((sendErr as Error).message)
          return
        }
      }
      if (code === "weak_password" || code === "same_password") {
        setFieldError((err as Error).message)
        input.current?.focus()
      } else setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup className="gap-5">
        <Field data-invalid={fieldError ? true : undefined}>
          <FieldLabel htmlFor={id("password")}>New password</FieldLabel>
          <PasswordInput
            id={id("password")}
            inputRef={input}
            value={password}
            onChange={(v) => {
              setPassword(v)
              setFieldError("")
            }}
            autoComplete="new-password"
            invalid={Boolean(fieldError)}
            describedBy={fieldError ? `${id("error")} ${id("strength")}` : id("strength")}
          />
          {fieldError && <FieldError id={id("error")}>{fieldError}</FieldError>}
          <PasswordStrength id={id("strength")} password={password} personal={personal} />
        </Field>
        {needsCode && (
          <Field>
            <FieldLabel htmlFor={id("nonce")}>Code from your email</FieldLabel>
            <Input id={id("nonce")} inputMode="numeric" autoComplete="one-time-code" value={nonce} onChange={(e) => setNonce(e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-12 max-w-48 bg-background/60 text-base tracking-[0.2em] tabular" />
            <FieldDescription>We sent it to confirm it is you. It works once and expires soon.</FieldDescription>
          </Field>
        )}
        {error && (
          <FormAlert>
            <p>{error}</p>
          </FormAlert>
        )}
        <Button type="submit" size="lg" className="h-12 self-start" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </FieldGroup>
    </form>
  )
}
