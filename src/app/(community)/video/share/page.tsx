import type { Metadata } from "next"
import { UploadIcon } from "lucide-react"
import { ForumHeader } from "@/components/forum/forum-header"
import { ShareVideoForm } from "@/components/video/share-form"
import { VideoNav } from "@/components/video/video-bits"

export const metadata: Metadata = {
  title: "Share a video",
  description: "Share an AI video you made with the prompt, model and settings behind it.",
}

export default function SharePage() {
  return (
    <div className="shell max-w-6xl pb-16">
      <ForumHeader
        title="Share a video"
        lead="Link a YouTube or Vimeo video, or upload a short clip, and add the prompt and model you used so others can learn from it."
        crumbs={[{ label: "Video lab", href: "/video" }, { label: "Share" }]}
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <UploadIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <VideoNav className="mb-6" />
      <ShareVideoForm />
    </div>
  )
}
