import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthConfirm } from "@/components/account/auth-confirm"

export const metadata: Metadata = { title: "Confirm", robots: { index: false } }

/** Email links with a token hash (password reset, sign-up, sign-in, email change) land here. */
export default function AuthConfirmPage() {
  return (
    <div className="shell pt-20 pb-16">
      <div className="mx-auto max-w-xl">
        <Suspense>
          <AuthConfirm />
        </Suspense>
      </div>
    </div>
  )
}
