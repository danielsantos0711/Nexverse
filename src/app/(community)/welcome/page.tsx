import type { Metadata } from "next"
import { StudioHead } from "@/components/studio/ui"
import { WelcomeFlow } from "@/components/settings/welcome-flow"

export const metadata: Metadata = { title: "Welcome", description: "Set up your Nexverse: interests, categories and people to follow.", robots: { index: false } }

export default function WelcomePage() {
  return (
    <div className="shell max-w-3xl pb-16">
      <StudioHead eyebrow="Welcome to Nexverse" title="Make it yours" lead="Three quick steps so For you shows what you care about." />
      <WelcomeFlow />
    </div>
  )
}
