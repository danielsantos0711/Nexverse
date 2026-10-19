"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useSyncExternalStore } from "react"
import { CircleAlertIcon } from "lucide-react"
import { safeNext } from "@/components/account/safe-next"
import { LinkButton } from "@/components/link-button"
import { authErrorMessage, isNewUserSaveError, SIGNUP_CLOSED } from "@/lib/auth-providers"
import { useSiteSettings } from "@/lib/site-settings"
import { needsWelcome } from "@/lib/profile"
import { useSession } from "@/lib/store"

const noop = () => () => {}

/**
 * The page email links and social sign-ins come back to. The database client reads the PKCE `code` from the
 * address and starts the session by itself; this page waits for it, then goes on to `next` (or to the
 * welcome steps on a first sign-in). Errors arrive as `error_code` / `error_description`, in the query or
 * the hash depending on the flow, and are shown in plain words.
 */
export function AuthCallback() {
  const router = useRouter()
  const params = useSearchParams()
  const { ready, user } = useSession()
  const rawHash = useSyncExternalStore(noop, () => window.location.hash, () => "")
  const hash = new URLSearchParams(rawHash.slice(1))
  const next = safeNext(params.get("next"))
  const code = params.get("error_code") ?? hash.get("error_code")
  const description = params.get("error_description") ?? hash.get("error_description")
  const failed = Boolean(code || description || params.get("error") || hash.get("error"))
  const signupOpen = useSiteSettings().settings.access.signupOpen
  const problem = !failed
    ? ""
    : !signupOpen && isNewUserSaveError(description ?? "")
      ? SIGNUP_CLOSED
      : code
        ? authErrorMessage({ code, message: description ?? "" })
        : (description ?? "Something went wrong on the way back.")

  useEffect(() => {
    if (!ready || !user || failed) return
    let stale = false
    // First sign-in goes through the welcome steps, which then land on the feed.
    void needsWelcome().then((welcome) => !stale && router.replace(welcome ? "/welcome" : next))
    return () => {
      stale = true
    }
  }, [ready, user, next, router, failed])

  if (failed || (ready && !user)) {
    return (
      <div className="glass flex flex-col items-start gap-5 rounded-2xl p-6 md:p-8" role="alert">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <CircleAlertIcon aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">That did not sign you in</h1>
          <p className="max-w-[54ch] text-sm text-muted-foreground">
            {problem || "The link may have expired, been used already, or been opened in a different browser from the one you asked in."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/sign-in?next=${encodeURIComponent(next)}`}>Back to sign in</LinkButton>
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
      Signing you in…
    </div>
  )
}
