import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthShell } from "@/components/account/auth-ui"
import { SignInForm } from "@/components/account/sign-in-form"

export const metadata: Metadata = { title: "Sign in", description: "Sign in to Nexverse with a password, an email link or a social account." }

export default function SignInPage() {
  return (
    <AuthShell title="Welcome back" lead="Sign in to post, reply, publish projects and follow what you care about." caption="Models, datasets, tools, repos and a forum in every language, from the people building with AI.">
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthShell>
  )
}
