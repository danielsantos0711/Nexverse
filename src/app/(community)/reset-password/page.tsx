import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthShell } from "@/components/account/auth-ui"
import { ResetPasswordForm } from "@/components/account/reset-password-form"

export const metadata: Metadata = { title: "Reset password", description: "Choose a new password for your Nexverse account.", robots: { index: false } }

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Reset your password" lead="We email you a link, and the link brings you back here to choose a new one." caption="Your account, your work and your follows stay exactly as they are.">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  )
}
