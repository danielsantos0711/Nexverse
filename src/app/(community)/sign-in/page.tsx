import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHead } from "@/components/app/bits"
import { SignInForm } from "@/components/account/sign-in-form"

export const metadata: Metadata = { title: "Sign in" }

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHead title="Sign in" lead="Enter your email and we send you a link. No password to remember." />
      <Suspense>
        <SignInForm />
      </Suspense>
    </div>
  )
}
