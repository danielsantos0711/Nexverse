import type { Metadata } from "next"
import { FilmIcon } from "lucide-react"
import { ForumHeader } from "@/components/forum/forum-header"
import { VideoGallery } from "@/components/video/video-gallery"
import { VideoNav, WhereToGenerate } from "@/components/video/video-bits"

export const metadata: Metadata = {
  title: "Video lab",
  description: "AI videos members made, with the prompts, models and shot settings behind them. Copy a prompt, remix it in the shot builder, or share your own.",
}

export default function VideoPage() {
  return (
    <div className="shell max-w-6xl pb-16">
      <ForumHeader
        title="Video lab"
        lead="AI videos members made, with the prompt, model and settings behind each one. Copy a prompt, remix it in the shot builder, or share your own."
        icon={
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-ion/20 bg-ion/10 text-ion">
            <FilmIcon aria-hidden className="size-5" />
          </span>
        }
      />
      <VideoNav className="mb-6" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <VideoGallery />
        </div>
        <WhereToGenerate className="self-start" />
      </div>
    </div>
  )
}
