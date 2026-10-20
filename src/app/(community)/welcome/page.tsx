import type { Metadata } from "next"
import { StudioHead } from "@/components/studio/ui"
import { WelcomeFlow } from "@/components/settings/welcome-flow"
import { seoMetadata } from "@/lib/content-server"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/welcome", { title: "Welcome", description: "Set up your Nexverse: your profile, interests, categories and people to follow.", robots: { index: false } })
}

export default function WelcomePage() {
  return (
    <div className="shell max-w-3xl pb-16">
      <StudioHead eyebrow="Welcome to Nexverse" title="Make it yours" lead="Four quick steps, all of them skippable: how people see you, then what For you should show." />
      <WelcomeFlow />
    </div>
  )
}
