"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowUpRightIcon, CameraIcon, EyeIcon, EyeOffIcon, FilmIcon, Trash2Icon } from "lucide-react"
import { Breadcrumbs, MemberAvatar } from "@/components/forum/forum-ui"
import { ExternalLink } from "@/components/live/bits"
import { TimeAgo } from "@/components/live/time"
import { Skeleton } from "@/components/ui/skeleton"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { canonicalUrl, deleteVideo, getVideo, moderateVideo, remixHref, settingRows, sourceLabel, type VideoPost } from "@/lib/video"
import { LitePlayer } from "./lite-player"
import { CopyText, VideoLikeButton } from "./video-bits"

const pill = "pressable inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/60 px-3.5 text-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

/** One shared video: the player (loads on play), the prompt with copy and remix, settings, likes and author. */
export function VideoDetail({ id }: { id: string }) {
  const router = useRouter()
  const { ready, user } = useSession()
  const role = useRole()
  const [post, setPost] = useState<VideoPost | null | undefined>(undefined)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (live && !ready) return
    let stale = false
    getVideo(id)
      .then((p) => !stale && setPost(p))
      .catch((e: Error) => {
        if (stale) return
        setError(e.message)
        setPost(null)
      })
    return () => {
      stale = true
    }
  }, [id, ready, user?.id])

  if (post === undefined) {
    return (
      <div aria-busy="true" aria-label="Loading the video" className="flex flex-col gap-4 pt-8">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="aspect-video w-full rounded-2xl" />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="flex flex-col items-start gap-3 pt-10">
        <Breadcrumbs items={[{ label: "Video lab", href: "/video" }, { label: "Not found" }]} />
        <h1 className="text-2xl font-semibold">This video is not here</h1>
        <p className="text-sm text-muted-foreground">{error || "It may have been deleted, or the link is wrong."}</p>
        <Link href="/video" className="text-sm text-ion hover:underline">
          Back to the gallery
        </Link>
      </div>
    )
  }

  const rows = settingRows(post.settings)
  const canDelete = post.mine || role.isStaff

  async function remove() {
    if (!post || !window.confirm(post.mine ? "Delete this video post? This cannot be undone." : "Remove this member's post? It is logged in the moderation log.")) return
    setBusy(true)
    try {
      if (post.mine) await deleteVideo(post)
      else await moderateVideo(post.id, "remove")
      router.push("/video")
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.")
      setBusy(false)
    }
  }

  async function toggleHidden() {
    if (!post) return
    setBusy(true)
    try {
      await moderateVideo(post.id, post.hidden ? "unhide" : "hide")
      setPost({ ...post, hidden: !post.hidden })
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="flex flex-col gap-6 pt-8">
      <Breadcrumbs items={[{ label: "Video lab", href: "/video" }, { label: post.title }]} />
      {post.status === "draft" && (
        <p className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
          This is your draft; only you can see it.{" "}
          <Link href={`/video/share?draft=${post.id}`} className="underline">
            Add the video to share it
          </Link>
          .
        </p>
      )}
      {post.hidden && <p className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">Hidden by staff. Only its author and staff can see it.</p>}
      <header className="flex flex-col gap-3">
        <h1 className="max-w-[40ch] text-2xl leading-tight font-semibold tracking-[-0.02em] md:text-3xl">{post.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <MemberAvatar name={post.author.name} size={24} />
            <span className="text-foreground/90">{post.mine ? "You" : post.author.name}</span>
          </span>
          <TimeAgo date={post.createdAt} />
          {post.tags.map((t) => (
            <Link key={t} href={`/video?tag=${t}`} className="text-ion hover:underline">
              #{t}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <LitePlayer source={post.source} poster={post.posterUrl} title={post.title} />
          <div className="flex flex-wrap items-center gap-2">
            {post.status === "published" && <VideoLikeButton post={post} />}
            <Link href={remixHref(post.settings, post.prompt) as `/video/builder`} className={pill}>
              <CameraIcon aria-hidden className="size-4" /> Remix this prompt
            </Link>
            {post.source && post.source.kind !== "file" && (
              <ExternalLink href={canonicalUrl(post.source)} className={pill}>
                <ArrowUpRightIcon aria-hidden className="size-4" /> Open on {sourceLabel(post.source)}
              </ExternalLink>
            )}
          </div>
          <section aria-labelledby="prompt-h" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 id="prompt-h" className="text-base font-semibold">
                Prompt
              </h2>
              {post.prompt && <CopyText text={post.prompt} />}
            </div>
            {post.prompt ? (
              <p className="rounded-2xl border border-border bg-card/60 p-4 font-mono text-[13px] leading-relaxed whitespace-pre-line text-foreground/90">{post.prompt}</p>
            ) : (
              <p className="text-sm text-muted-foreground">The author did not share the prompt.</p>
            )}
          </section>
        </div>
        <aside className="flex flex-col gap-4">
          <section className="glass flex flex-col gap-2 rounded-2xl p-5 text-sm">
            <h2 className="text-sm font-semibold">How it was made</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">Model</dt>
              <dd className="truncate">
                {post.model ? (
                  <Link href={`/video?model=${encodeURIComponent(post.model)}`} className="text-ion hover:underline">
                    {post.model}
                  </Link>
                ) : (
                  "Not given"
                )}
              </dd>
              <dt className="text-muted-foreground">Tool</dt>
              <dd className="truncate">{post.tool || "Not given"}</dd>
              {rows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="truncate">{r.value}</dd>
                </div>
              ))}
              {post.source && (
                <>
                  <dt className="text-muted-foreground">Hosted on</dt>
                  <dd>{sourceLabel(post.source)}</dd>
                </>
              )}
            </dl>
          </section>
          {(canDelete || role.isStaff) && (
            <section className="flex flex-wrap gap-2">
              {role.isStaff && !post.mine && (
                <button type="button" onClick={toggleHidden} disabled={busy} className={pill}>
                  {post.hidden ? <EyeIcon aria-hidden className="size-4" /> : <EyeOffIcon aria-hidden className="size-4" />}
                  {post.hidden ? "Unhide" : "Hide"}
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={remove} disabled={busy} className={`${pill} text-destructive`}>
                  <Trash2Icon aria-hidden className="size-4" /> {post.mine ? "Delete" : "Remove"}
                </button>
              )}
            </section>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Link href="/video" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <FilmIcon aria-hidden className="size-4" /> More in the gallery
          </Link>
        </aside>
      </div>
    </article>
  )
}
