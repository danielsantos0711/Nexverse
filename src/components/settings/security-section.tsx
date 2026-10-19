"use client"

import type { User, UserIdentity } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { KeyRoundIcon, LinkIcon, MailIcon, MonitorSmartphoneIcon, UnlinkIcon } from "lucide-react"
import { EMAIL, FormAlert, ProviderIcon } from "@/components/account/auth-ui"
import { NewPasswordForm } from "@/components/account/new-password-form"
import { ConfirmDialog } from "@/components/studio/ui"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { oauthProviderId, SOCIAL_PROVIDERS, useAuthSettings, type SocialId } from "@/lib/auth-providers"
import { formatDate } from "@/lib/data"
import { linkProvider, listIdentities, signOut, unlinkIdentity, updateEmail } from "@/lib/store"

/** Supabase's identity names, mapped to the provider buttons ("twitter" and "x" are both X). */
function socialOf(provider: string): SocialId | null {
  if (provider === "twitter") return "x"
  return SOCIAL_PROVIDERS.some((p) => p.id === provider) ? (provider as SocialId) : null
}

function Block({ icon: Icon, title, lead, children }: { icon: typeof MailIcon; title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-sm text-muted-foreground">{lead}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:pl-7">{children}</div>
    </div>
  )
}

function Note({ text, bad }: { text: string; bad?: boolean }) {
  if (!text) return null
  return (
    <p role="status" aria-live="polite" className={bad ? "text-sm text-destructive" : "text-sm text-ok"}>
      {text}
    </p>
  )
}

/** Email, password, linked sign-ins and other devices: everything about how you get into your account. */
export function SecuritySection({ user, name }: { user: User; name: string }) {
  return (
    <div className="flex flex-col gap-5">
      <EmailBlock user={user} />
      <PasswordBlock user={user} name={name} />
      <IdentitiesBlock />
      <SessionsBlock />
    </div>
  )
}

function EmailBlock({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [invalid, setInvalid] = useState("")
  const [note, setNote] = useState<{ text: string; bad?: boolean }>({ text: "" })
  const [busy, setBusy] = useState(false)
  const pending = user.new_email

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!EMAIL.test(address)) return setInvalid("That does not look like an email address.")
    if (address.toLowerCase() === user.email?.toLowerCase()) return setInvalid("That is already your email.")
    setBusy(true)
    setNote({ text: "" })
    try {
      await updateEmail(address)
      setOpen(false)
      setEmail("")
      setNote({ text: `Check ${address} for a confirmation link. If Supabase asks, your current address gets one too. The change happens once you confirm.` })
    } catch (err) {
      setNote({ text: (err as Error).message, bad: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Block icon={MailIcon} title="Email" lead={user.email ? `You sign in and get mail at ${user.email}.` : "Your account has no email address yet."}>
      {pending && (
        <p className="rounded-lg border border-border bg-card/50 p-3 text-sm">
          Waiting for you to confirm <span className="font-medium break-all">{pending}</span>. Open the link we sent to finish the change.
        </p>
      )}
      {open ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <Field data-invalid={invalid ? true : undefined}>
            <FieldLabel htmlFor="sec-email">New email</FieldLabel>
            <Input
              id="sec-email"
              type="email"
              autoComplete="email"
              value={email}
              autoFocus
              onChange={(e) => {
                setEmail(e.target.value)
                setInvalid("")
              }}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={invalid ? "sec-email-error" : undefined}
              className="h-11 max-w-md bg-background/60"
            />
            {invalid && <FieldError id="sec-email-error">{invalid}</FieldError>}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send confirmation"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
          Change email
        </Button>
      )}
      <Note {...note} />
    </Block>
  )
}

function PasswordBlock({ user, name }: { user: User; name: string }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const viaEmail = (user.identities ?? []).some((i) => i.provider === "email")
  return (
    <Block
      icon={KeyRoundIcon}
      title="Password"
      lead={viaEmail ? "Set a new password. If you have only signed in with email links so far, this sets your first one." : "Add a password so you can also sign in with your email, not only your social account."}
    >
      {open ? (
        <div className="max-w-md">
          <NewPasswordForm
            idPrefix="sec-pw"
            personal={[name, user.email?.split("@")[0] ?? ""]}
            submitLabel="Save password"
            onDone={() => {
              setOpen(false)
              setNote("Password saved. Use it next time you sign in.")
            }}
          />
          <Button variant="ghost" className="mt-2" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setOpen(true)
            setNote("")
          }}
        >
          Set a new password
        </Button>
      )}
      <Note text={note} />
    </Block>
  )
}

function IdentitiesBlock() {
  const auth = useAuthSettings()
  const [list, setList] = useState<UserIdentity[] | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<UserIdentity | null>(null)

  const load = useCallback(async () => {
    try {
      setList(await listIdentities())
    } catch (e) {
      setError((e as Error).message)
      setList([])
    }
  }, [])

  useEffect(() => {
    let stale = false
    listIdentities()
      .then((l) => !stale && setList(l))
      .catch((e) => {
        if (stale) return
        setError((e as Error).message)
        setList([])
      })
    return () => {
      stale = true
    }
  }, [])

  const linked = new Set((list ?? []).map((i) => socialOf(i.provider)).filter(Boolean))
  const canLink = auth.social.filter((p) => !linked.has(p.id))

  async function link(id: SocialId) {
    setBusy(id)
    setError("")
    try {
      await linkProvider(oauthProviderId(id))
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <Block icon={LinkIcon} title="Sign-in methods" lead="The ways into this account. Keep at least one.">
      {list === null ? (
        <Skeleton className="h-14 w-full max-w-md rounded-xl" />
      ) : (
        <ul className="flex max-w-xl flex-col gap-2">
          {list.map((i) => {
            const social = socialOf(i.provider)
            const label = social ? SOCIAL_PROVIDERS.find((p) => p.id === social)!.label : i.provider === "email" ? "Email" : i.provider
            const detail = (i.identity_data?.email as string | undefined) ?? (i.identity_data?.user_name as string | undefined) ?? ""
            return (
              <li key={i.identity_id} className="flex items-center gap-3 rounded-xl border border-border bg-card/50 p-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">{social ? <ProviderIcon id={social} /> : <MailIcon aria-hidden className="size-4" />}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {detail}
                    {detail && i.created_at ? " · " : ""}
                    {i.created_at ? `added ${formatDate(i.created_at)}` : ""}
                  </span>
                </div>
                {list.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => setConfirm(i)} disabled={busy !== null} aria-label={`Remove ${label} sign-in`}>
                    <UnlinkIcon aria-hidden /> Remove
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {canLink.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {canLink.map((p) => (
            <Button key={p.id} variant="outline" className="gap-2 bg-card/40" onClick={() => link(p.id)} disabled={busy !== null}>
              <ProviderIcon id={p.id} className="size-4" /> {busy === p.id ? "Opening…" : `Link ${p.label}`}
            </Button>
          ))}
        </div>
      ) : (
        auth.ready &&
        auth.social.length === 0 && <p className="text-sm text-muted-foreground">Signing in with Google, GitHub, Discord, Apple, Microsoft or X is not switched on for this site yet.</p>
      )}
      {error && (
        <FormAlert>
          <p>{error}</p>
        </FormAlert>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Remove this sign-in method?"
        description="You will no longer be able to sign in with it. Your account and everything in it stay as they are."
        confirm="Remove"
        onConfirm={async () => {
          if (!confirm) return
          try {
            await unlinkIdentity(confirm)
            await load()
          } catch (e) {
            setError((e as Error).message)
          }
        }}
      />
    </Block>
  )
}

function SessionsBlock() {
  const router = useRouter()
  const [busy, setBusy] = useState<"others" | "global" | null>(null)
  const [note, setNote] = useState<{ text: string; bad?: boolean }>({ text: "" })

  async function out(scope: "others" | "global") {
    setBusy(scope)
    setNote({ text: "" })
    try {
      await signOut(scope)
      if (scope === "global") {
        router.push("/")
        return
      }
      setNote({ text: "Every other browser and device is signed out. This one stays signed in." })
    } catch (e) {
      setNote({ text: (e as Error).message, bad: true })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Block icon={MonitorSmartphoneIcon} title="Devices" lead="Lost a phone or signed in on a shared computer? End those sessions from here.">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => out("others")} disabled={busy !== null}>
          {busy === "others" ? "Signing out…" : "Sign out other devices"}
        </Button>
        <Button variant="ghost" onClick={() => out("global")} disabled={busy !== null}>
          {busy === "global" ? "Signing out…" : "Sign out everywhere"}
        </Button>
      </div>
      <Note {...note} />
    </Block>
  )
}
