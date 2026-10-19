import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthCallback } from "@/components/account/auth-callback"

export const metadata: Metadata = { title: "Signing in", robots: { index: false } }

export default function AuthCallbackPage() {
  return (
    <div className="shell pt-20 pb-16">
      <div className="mx-auto max-w-xl">
        <Suspense>
          <AuthCallback />
        </Suspense>
      </div>
    </div>
  )
}
