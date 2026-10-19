import type { Metadata } from "next"
import { CameraIcon } from "lucide-react"
import { ForumHeader } from "@/components/forum/forum-header"
import { ShotBuilder } from "@/components/video/shot-builder"
import { VideoNav } from "@/components/video/video-bits"

export const metadata: Metadata = {
  title: "Shot builder",
  description: "Compose a text-to-video prompt shot by shot: subject, action, setting, camera move, lens, lighting, mood, duration and aspect ratio.",
}

export default function BuilderPage() {
  return (
    <div className="shell max-w-6xl pb-16">
      <ForumHeader
        title="Shot builder"
        lead="Describe the scene, then pick how it is filmed. The prompt writes itself as you choose; copy it into any video model, or save it and share the result."
        crumbs={[{ label: "Video lab", href: "/video" }, { label: "Shot builder" }]}
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <CameraIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <VideoNav className="mb-6" />
      <ShotBuilder />
    </div>
  )
}
