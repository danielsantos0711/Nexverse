"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import { safeNext } from "@/components/account/safe-next"
import { LinkButton } from "@/components/link-button"
import { needsWelcome } from "@/lib/profile"
import { useSession } from "@/lib/store"

/** The page a sign-in link opens. The database client reads the code from the address and starts the session. */
export function AuthCallback() {
  const router = useRouter()
  const params = useSearchParams()
  const { ready, user } = useSession()
  const next = safeNext(params.get("next"))
  const problem = params.get("error_description")

  useEffect(() => {
    if (!ready || !user) return
    let stale = false
    // First sign-in goes through the welcome steps, which then land on the feed.
    void needsWelcome().then((welcome) => !stale && router.replace(welcome ? "/welcome" : next))
    return () => {
      stale = true
    }
  }, [ready, user, next, router])

  if (problem || (ready && !user)) {
    return (
      <div className="flex flex-col items-start gap-5" role="alert">
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">That link did not sign you in</h1>
        <p className="max-w-[54ch] text-muted-foreground">
          {problem ?? "It may have expired or been opened in a different browser."} Ask for a new one and open it
          on this device.
        </p>
        <LinkButton href={`/sign-in?next=${encodeURIComponent(next)}`}>Get a new link</LinkButton>
      </div>
    )
  }

  return (
    <p role="status" className="text-lg text-muted-foreground">
      Signing you in…
    </p>
  )
}
