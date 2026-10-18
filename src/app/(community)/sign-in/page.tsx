import type { Metadata } from "next"
import Image from "next/image"
import { Suspense } from "react"
import { SignInForm } from "@/components/account/sign-in-form"
import { PageTitle } from "@/components/hub/bits"

export const metadata: Metadata = { title: "Sign in" }

export default function SignInPage() {
  return (
    <div className="relative isolate">
      <Image src="/space/horizon.webp" alt="" fill sizes="100vw" className="-z-10 object-cover opacity-30" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/60 to-background" />
      <div className="shell max-w-xl pb-16">
        <PageTitle title="Sign in" lead="Enter your email and we send you a link. No password to remember." />
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  )
}
