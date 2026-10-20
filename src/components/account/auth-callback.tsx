"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { CircleAlertIcon } from "lucide-react"
import { safeNext } from "@/components/account/safe-next"
import { LinkButton } from "@/components/link-button"
import { authErrorMessage, isNewUserSaveError, SIGNUP_CLOSED } from "@/lib/auth-providers"
import { useCopy } from "@/lib/content"
import { needsWelcome } from "@/lib/profile"
import { useSiteSettings } from "@/lib/site-settings"
import { finishAuthRedirect, markRecovery, RESET_PATH, useSession } from "@/lib/store"
import { db } from "@/lib/supabase"

/**
 * The page email links and social sign-ins come back to. It waits for the database client to turn the link
 * (a PKCE `?code=`, or an old-style `#access_token=`) into a session, then goes on to `next`, to the welcome
 * steps on a first sign-in, or to the new-password form when the link was a password reset. Errors arrive as
 * `error_code` / `error_description` in the query or the hash, or from the exchange itself, and are said in
 * plain words with the way forward.
 */
export function AuthCallback() {
  const router = useRouter()
  const params = useSearchParams()
  const { ready, user } = useSession()
  const next = safeNext(params.get("next"))
  const toReset = next === RESET_PATH || next.startsWith(`${RESET_PATH}?`)
  const signupOpen = useSiteSettings().settings.access.signupOpen
  const [outcome, setOutcome] = useState<{ error: string; recovery: boolean } | null>(null)

  const title = useCopy("auth.callback.failedTitle", "That did not sign you in")
  const fallback = useCopy("auth.callback.failedBody", "The link may have expired, been used already, or been opened in a different browser from the one you asked in.")
  const working = useCopy("auth.callback.working", "Signing you in…")

  // Read the link once, as the page opens: the client removes the code from the address when it uses it.
  useEffect(() => {
    let stale = false
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const query = new URLSearchParams(window.location.search)
    const code = query.get("error_code") ?? hash.get("error_code")
    const description = query.get("error_description") ?? hash.get("error_description")
    const carriedLink = query.has("code") || hash.has("access_token")
    if (code || description || query.get("error") || hash.get("error")) {
      const message = !signupOpen && isNewUserSaveError(description ?? "") ? SIGNUP_CLOSED : code ? authErrorMessage({ code, message: description ?? "" }) : (description ?? "")
      // Defer the state change so it never happens during the effect's own run.
      queueMicrotask(() => !stale && setOutcome({ error: message, recovery: false }))
      return () => {
        stale = true
      }
    }
    void finishAuthRedirect().then(async (r) => {
      if (stale) return
      if (r.error) return setOutcome({ error: r.error.message, recovery: false })
      // A reset link that came back here is a recovery even if the client's own announcement was missed.
      if (!r.recovery && toReset && carriedLink) {
        const signedIn = (await db()?.auth.getSession())?.data.session?.user
        if (stale) return
        if (signedIn) markRecovery(signedIn.id)
        return setOutcome({ error: "", recovery: Boolean(signedIn) })
      }
      setOutcome({ error: "", recovery: r.recovery })
    })
    return () => {
      stale = true
    }
    // The link is read once, on arrival.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!outcome || outcome.error || !ready || !user) return
    let stale = false
    if (outcome.recovery || toReset) {
      router.replace(RESET_PATH)
      return
    }
    // First sign-in goes through the welcome steps, which then land on the feed.
    void needsWelcome().then((welcome) => !stale && router.replace(welcome ? "/welcome" : next))
    return () => {
      stale = true
    }
  }, [outcome, ready, user, next, toReset, router])

  if (outcome && (outcome.error || (ready && !user))) {
    return (
      <div className="liquid-glass glass flex flex-col items-start gap-5 rounded-2xl p-6 md:p-8" role="alert">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <CircleAlertIcon aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
          <p className="max-w-[54ch] text-sm text-muted-foreground">{outcome.error || fallback}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {toReset ? (
            <LinkButton href={RESET_PATH}>Send a new reset link</LinkButton>
          ) : (
            <LinkButton href={`/sign-in?next=${encodeURIComponent(next)}`}>Back to sign in</LinkButton>
          )}
          {user && (
            <LinkButton href={next} variant="ghost">
              Continue anyway
            </LinkButton>
          )}
        </div>
      </div>
    )
  }

  return (
    <div role="status" className="flex items-center gap-3 text-muted-foreground">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-ion/30 border-t-ion motion-reduce:animate-none" />
      {working}
    </div>
  )
}
