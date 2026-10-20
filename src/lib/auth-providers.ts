import type { Provider } from "@supabase/supabase-js"
import { useEffect, useSyncExternalStore } from "react"
import { live } from "@/lib/supabase"

/**
 * Which ways of signing in this copy of Nexverse offers. Supabase publishes its switches at
 * `/auth/v1/settings` (a public endpoint that only needs the publishable key), so a social button
 * appears only once its provider is switched on in the Supabase dashboard. Nothing here is secret.
 */

export type SocialId = "google" | "github" | "discord" | "apple" | "azure" | "x"

export type SocialProvider = { id: SocialId; label: string }

/** The order the buttons appear in. "azure" is how Supabase names Microsoft sign-in. */
export const SOCIAL_PROVIDERS: SocialProvider[] = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "discord", label: "Discord" },
  { id: "apple", label: "Apple" },
  { id: "azure", label: "Microsoft" },
  { id: "x", label: "X" },
]

export type AuthSettings = {
  /** False until the settings have been read (or could not be). */
  ready: boolean
  /** Social providers switched on, in display order. */
  social: SocialProvider[]
  /** Email sign-in (password and link) is switched on. */
  email: boolean
  /** Supabase itself refuses new accounts (separate from the admins' "joining is open" switch). */
  signupDisabled: boolean
  /** New email accounts must confirm their address before they can sign in. */
  confirmEmail: boolean
  /** The settings could not be read, so only email is offered. */
  failed: boolean
}

type Raw = { external?: Record<string, boolean>; disable_signup?: boolean; mailer_autoconfirm?: boolean }

const FALLBACK: AuthSettings = { ready: false, social: [], email: true, signupDisabled: false, confirmEmail: true, failed: false }
let state: AuthSettings = FALLBACK
let started = false
const listeners = new Set<() => void>()

/** The Supabase id to call for a provider. X can be switched on as OAuth 2.0 ("x") or the legacy OAuth 1.0a ("twitter"). */
const providerKey = new Map<SocialId, Provider>()

export function oauthProviderId(id: SocialId): Provider {
  return providerKey.get(id) ?? id
}

export function parseAuthSettings(raw: Raw): AuthSettings {
  const ext = raw.external ?? {}
  const social = SOCIAL_PROVIDERS.filter((p) => {
    if (p.id === "x") {
      if (ext.x) providerKey.set("x", "x")
      else if (ext.twitter) providerKey.set("x", "twitter")
      return Boolean(ext.x || ext.twitter)
    }
    return Boolean(ext[p.id])
  })
  return {
    ready: true,
    social,
    email: ext.email !== false,
    signupDisabled: Boolean(raw.disable_signup),
    confirmEmail: !raw.mailer_autoconfirm,
    failed: false,
  }
}

async function load() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } })
    if (!res.ok) throw new Error(String(res.status))
    state = parseAuthSettings((await res.json()) as Raw)
  } catch {
    state = { ...FALLBACK, ready: true, failed: true }
  }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The sign-in methods switched on, read once per visit and shared by every form that asks. */
export function useAuthSettings(): AuthSettings {
  useEffect(() => {
    if (started || !live) return
    started = true
    void load()
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => FALLBACK
  )
}

// ─── Password strength ──────────────────────────────────────────────────────────────────────────────────────

/** What a new password must have. Supabase may ask for more; its answer is shown when it does. */
export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { id: "mixed", label: "Upper and lower case letters", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: "digit", label: "A number", test: (p: string) => /\d/.test(p) },
  { id: "symbol", label: "A symbol, like ! or #", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const

// Passwords people pick first. A match (ignoring case, digits and symbols at the ends) caps the score.
const COMMON = new Set(
  "password passw0rd letmein welcome qwerty qwertyuiop asdfgh asdfghjkl zxcvbn iloveyou admin administrator login abc123 monkey dragon master sunshine princess football baseball shadow superman batman trustno1 starwars whatever freedom secret nexverse changeme default access hello charlie donald michael jordan liverpool benfica sporting porto lisboa portugal"
    .split(" ")
)
const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm", "01234567890"]

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; hint: string }

/**
 * A small, dependency-free estimate in the spirit of zxcvbn: character-set entropy, with penalties for
 * repeats, keyboard or alphabet runs, common passwords and the person's own name or email inside it.
 */
export function passwordStrength(password: string, personal: string[] = []): Strength {
  if (!password) return { score: 0, label: "", hint: "" }
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/\d/.test(password)) pool += 10
  if (/[^A-Za-z0-9]/.test(password)) pool += 33
  // Count each run of the same character once, so "aaaaaaaa" is worth about one letter.
  const collapsed = password.replace(/(.)\1+/g, "$1")
  let bits = collapsed.length * Math.log2(Math.max(pool, 1))
  const lower = password.toLowerCase()
  let hint = ""

  for (const seq of SEQUENCES) {
    for (let i = 0; i + 4 <= seq.length; i++) {
      const run = seq.slice(i, i + 4)
      if (lower.includes(run) || lower.includes([...run].reverse().join(""))) {
        bits -= 12
        hint = "Avoid runs like abcd, 1234 or qwer."
        break
      }
    }
  }
  const core = lower.replace(/^[^a-z]+|[^a-z]+$/g, "")
  if (COMMON.has(core) || COMMON.has(lower)) {
    bits = Math.min(bits, 20)
    hint = "That is one of the first passwords people try."
  }
  for (const word of personal.map((w) => w.toLowerCase()).filter((w) => w.length >= 3)) {
    if (lower.includes(word)) {
      bits -= 18
      hint = "Leave your name and email out of it."
    }
  }
  if (/^(19|20)\d{2}$/.test(password.slice(-4)) && !hint) hint = "A year at the end is easy to guess."

  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 56 ? 2 : bits < 72 ? 3 : 4
  const label = ["Too weak", "Weak", "Fair", "Strong", "Very strong"][score]
  if (!hint) hint = score < 3 ? "Longer is better: three or four unrelated words work well." : ""
  return { score: score as Strength["score"], label, hint }
}

// ─── Errors ─────────────────────────────────────────────────────────────────────────────────────────────────

type AuthErrorLike = { message?: string; code?: string; status?: number; reasons?: string[] }

/** Turns a Supabase Auth error into one plain sentence that says what to do next. */
/** Shown when the database refused a new account because an admin closed registration (handle_new_user). */
export const SIGNUP_CLOSED = "Joining Nexverse is closed right now, so no new account was made. If you already have one, sign in the way you did before."

/**
 * Supabase reports any failure inside the new-user trigger as this generic message, so it only means "registration
 * is closed" when the site settings say so; otherwise it is a real error and is shown as one.
 */
export const isNewUserSaveError = (message: string) => /database error saving new user/i.test(message)

export function authErrorMessage(error: unknown): string {
  const e = (error ?? {}) as AuthErrorLike
  const message = e.message ?? ""
  if (/joining nexverse is closed/i.test(message)) return SIGNUP_CLOSED
  switch (e.code) {
    case "invalid_credentials":
      return "That email and password do not match. Check both, or reset your password."
    case "email_not_confirmed":
      return "Confirm your email first. Open the link we sent you, or send a new one below."
    case "user_already_exists":
    case "email_exists":
      return "There is already an account with that email. Sign in instead, or reset the password."
    case "weak_password":
      return e.reasons?.includes("pwned")
        ? "That password has appeared in a data leak. Pick a different one."
        : "That password is too weak. Make it longer and mix letters, numbers and symbols."
    case "same_password":
      return "That is your current password. Pick a new one."
    case "signup_disabled":
      return "New accounts are switched off for now."
    case "email_provider_disabled":
      return "Signing in with email is switched off for now."
    case "provider_disabled":
    case "oauth_provider_not_supported":
      return "That sign-in option is not switched on yet."
    case "over_email_send_rate_limit":
      return "Too many emails were sent in a short time. Wait a few minutes and try again."
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute and try again."
    case "email_address_invalid":
      return "That email address cannot receive mail. Check it, or use another one."
    case "email_address_not_authorized":
      return "Our email service cannot send to that address yet. Try a social sign-in, or ask the team."
    case "otp_expired":
      return "That link has expired or was already used. Ask for a new one."
    case "otp_disabled":
      return "Email links are switched off for now. Sign in with your password instead."
    case "flow_state_not_found":
    case "flow_state_expired":
    case "bad_code_verifier":
    case "pkce_code_verifier_not_found":
      return "This link was opened in a different browser from the one you asked in, or it is too old. Ask for a new one."
    case "user_banned":
      return "This account is suspended."
    case "identity_already_exists":
      return "That account is already linked to another Nexverse member."
    case "single_identity_not_deletable":
      return "This is your only way to sign in, so it cannot be removed. Add a password or another account first."
    case "email_conflict_identity_not_deletable":
      return "Removing this would leave your email without a way in. Change your email first."
    case "manual_linking_disabled":
      return "Linking more accounts is not switched on for this site yet."
    case "reauthentication_needed":
      return "For your safety we need to confirm it is you. We sent a code to your email."
    case "reauthentication_not_valid":
      return "That code is not right or has expired. Ask for a new one."
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return "Your session has ended. Sign in again."
    case "captcha_failed":
      return "The robot check failed. Reload the page and try again."
    case "validation_failed":
      return /email/i.test(message) ? "That does not look like an email address." : message || "Something in the form is not valid."
  }
  if (e.status === 429) return "Too many attempts. Wait a minute and try again."
  if (/fetch|network/i.test(message)) return "We could not reach the sign-in service. Check your connection and try again."
  return message || "Something went wrong. Try again."
}
