import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthShell } from "@/components/account/auth-ui"
import { JoinForm } from "@/components/account/join-form"

export const metadata: Metadata = { title: "Join", description: "Create your Nexverse account: ask, answer, publish projects and follow the AI work you care about." }

export default function JoinPage() {
  return (
    <AuthShell title="Join Nexverse" lead="One account to ask and answer, publish your projects and follow the AI work you care about. Free." caption="Share what you build with AI, find what others are building, and connect it all into constellations.">
      <Suspense>
        <JoinForm />
      </Suspense>
    </AuthShell>
  )
}
