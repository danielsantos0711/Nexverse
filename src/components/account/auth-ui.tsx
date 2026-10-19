"use client"

import { motion, useReducedMotion } from "motion/react"
import { useEffect, useId, useState } from "react"
import { CheckIcon, CircleAlertIcon, EyeIcon, EyeOffIcon, MailCheckIcon } from "lucide-react"
import { AuthScene } from "@/components/auth-fx/auth-scene"
import { Button } from "@/components/ui/button"
import { oauthProviderId, PASSWORD_RULES, passwordStrength, useAuthSettings, type SocialId } from "@/lib/auth-providers"
import { signInWithProvider } from "@/lib/store"
import { cn } from "@/lib/utils"

/** The split screen every sign-in page uses: the form on one side, the living space visual on the other. */
export function AuthShell({ title, lead, caption, children }: { title: string; lead: React.ReactNode; caption: string; children: React.ReactNode }) {
  return (
    <div className="shell grid gap-6 pt-4 pb-16 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10 lg:pt-6 lg:pb-6">
      <div className="order-2 flex flex-col justify-center lg:order-1 lg:py-8">
        <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">{title}</h1>
            <div className="text-sm text-muted-foreground md:text-base">{lead}</div>
          </div>
          {children}
        </div>
      </div>
      <AuthScene caption={caption} className="order-1 h-44 sm:h-56 lg:sticky lg:top-22 lg:order-2 lg:h-[calc(100dvh-7rem)]" />
    </div>
  )
}

// ─── Social sign-in ─────────────────────────────────────────────────────────────────────────────────────────

/** Brand marks drawn small and flat, so each button names its provider at a glance. */
export function ProviderIcon({ id, className }: { id: SocialId; className?: string }) {
  const c = cn("size-[18px] shrink-0", className)
  switch (id) {
    case "google":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={c}>
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
        </svg>
      )
    case "github":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={c} fill="currentColor">
          <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5Z" />
        </svg>
      )
    case "discord":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={c} fill="#5865F2">
          <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5A20.3 20.3 0 0 0 .2 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.1 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.3-.9-9.9-3.6-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
        </svg>
      )
    case "apple":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={c} fill="currentColor">
          <path d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.5 1.3-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.5.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-4.1ZM13.9 5.2c.7-.8 1.2-2 1-3.2-1 .1-2.2.7-3 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.3-.5 3-1.3Z" />
        </svg>
      )
    case "azure":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={c}>
          <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
          <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
          <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
          <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
        </svg>
      )
    case "x":
      return (
        <svg viewBox="0 0 24 24" aria-hidden className={c} fill="currentColor">
          <path d="M17.8 2h3.4l-7.4 8.5L22.5 22h-6.8l-5.3-7-6.1 7H.9l7.9-9.1L.5 2h7l4.8 6.4L17.8 2Zm-1.2 18h1.9L6.5 3.9H4.5L16.6 20Z" />
        </svg>
      )
  }
}

/**
 * One button per social provider switched on in Supabase. Renders nothing while none is, so there is never
 * a button that leads nowhere. `children` (usually a divider) shows only when at least one button does.
 */
export function SocialButtons({ next, verb = "Continue", disabled, onError, children }: { next: string; verb?: string; disabled?: boolean; onError: (message: string) => void; children?: React.ReactNode }) {
  const { social } = useAuthSettings()
  const [busy, setBusy] = useState<SocialId | null>(null)
  if (!social.length) return null

  async function go(id: SocialId) {
    setBusy(id)
    onError("")
    try {
      await signInWithProvider(oauthProviderId(id), next)
      // The browser is now leaving for the provider; keep the button busy until it does.
    } catch (e) {
      onError((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <>
      <div className={cn("grid gap-2", social.length > 1 && "sm:grid-cols-2")}>
        {social.map((p) => (
          <Button key={p.id} type="button" variant="outline" size="lg" className="h-11 justify-center gap-2.5 bg-card/40" disabled={disabled || busy !== null} onClick={() => go(p.id)}>
            <ProviderIcon id={p.id} />
            {busy === p.id ? "Opening…" : `${verb} with ${p.label}`}
          </Button>
        ))}
      </div>
      {children}
    </>
  )
}

export function OrDivider({ children = "or" }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

// ─── Passwords ──────────────────────────────────────────────────────────────────────────────────────────────

/** A password input with a show/hide button inside it. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  describedBy,
  inputRef,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: "current-password" | "new-password"
  invalid?: boolean
  describedBy?: string
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="flex h-12 items-center rounded-lg border border-input bg-background/60 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:bg-input/30">
      <input
        ref={inputRef}
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        spellCheck={false}
        autoCapitalize="none"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={id}
        className="mr-1 inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {shown ? <EyeOffIcon aria-hidden className="size-4.5" /> : <EyeIcon aria-hidden className="size-4.5" />}
      </button>
    </div>
  )
}

const BAR = ["bg-destructive", "bg-destructive", "bg-amber-400", "bg-ok", "bg-ok"]

/** How strong a new password is, and the rules it meets so far. `id` labels it for the input's aria-describedby. */
export function PasswordStrength({ id, password, personal }: { id: string; password: string; personal: string[] }) {
  const reduce = useReducedMotion()
  const s = passwordStrength(password, personal)
  const filled = password ? s.score + 1 : 0
  return (
    <div id={id} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-5 gap-1" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <motion.span
                className={cn("block h-full origin-left rounded-full", BAR[s.score])}
                initial={false}
                animate={{ scaleX: i < filled ? 1 : 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.25, ease: [0.23, 1, 0.32, 1], delay: i * 0.03 }}
              />
            </span>
          ))}
        </div>
        <span className="min-w-[5.5rem] text-right text-xs font-medium" aria-live="polite">
          {s.label}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(password)
          return (
            <li key={r.id} className={cn("flex items-center gap-1.5 transition-colors", ok ? "text-ok" : "text-muted-foreground")}>
              {ok ? <CheckIcon aria-hidden className="size-3.5" /> : <span aria-hidden className="mx-[5px] size-1 rounded-full bg-current" />}
              {r.label}
              <span className="sr-only">{ok ? "(done)" : "(not yet)"}</span>
            </li>
          )
        })}
      </ul>
      {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
    </div>
  )
}

/** True when a new password is good enough to send: the length rule and at least a "Fair" score. */
export function passwordAcceptable(password: string, personal: string[]) {
  return password.length >= 8 && passwordStrength(password, personal).score >= 2
}

// ─── Messages ───────────────────────────────────────────────────────────────────────────────────────────────

export function FormAlert({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm">
      <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-col items-start gap-2">{children}</div>
    </div>
  )
}

/** "Check your inbox", with a resend button that waits a minute between sends. */
export function CheckInbox({ title, email, detail, onResend, onBack, back = "Use another address" }: { title: string; email: string; detail: string; onResend?: () => Promise<void>; onBack: () => void; back?: string }) {
  const [wait, setWait] = useCooldown(60)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const head = useId()

  async function resend() {
    if (!onResend) return
    setBusy(true)
    setNote("")
    try {
      await onResend()
      setWait()
      setNote("Sent again. It can take a minute to arrive.")
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={head} className="glass flex flex-col items-start gap-4 rounded-2xl p-6" role="status">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-ion/15 text-ion">
        <MailCheckIcon aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 id={head} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          We sent it to <span className="font-medium break-all text-foreground">{email}</span>. {detail}
        </p>
        <p className="text-xs text-muted-foreground">Nothing after a few minutes? Look in spam or promotions.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onResend && (
          <Button variant="secondary" onClick={resend} disabled={busy || wait > 0}>
            {busy ? "Sending…" : wait > 0 ? `Send again in ${wait}s` : "Send again"}
          </Button>
        )}
        <Button variant="ghost" onClick={onBack}>
          {back}
        </Button>
      </div>
      {note && (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  )
}

/** Seconds left before an action may run again, and a function that starts the wait. */
export function useCooldown(seconds: number): [number, () => void] {
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!until) return
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= until) {
        setUntil(0)
        clearInterval(t)
      }
    }, 500)
    return () => clearInterval(t)
  }, [until])
  const left = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
  return [
    left,
    () => {
      const n = Date.now()
      setNow(n)
      setUntil(n + seconds * 1000)
    },
  ]
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
