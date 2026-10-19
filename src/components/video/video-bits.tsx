"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRightIcon, CameraIcon, CheckIcon, ClapperboardIcon, CopyIcon, EyeOffIcon, FilmIcon, HeartIcon, PlayIcon, UploadIcon } from "lucide-react"
import { MemberAvatar } from "@/components/forum/forum-ui"
import { ExternalLink } from "@/components/live/bits"
import { TimeAgo } from "@/components/live/time"
import { compact } from "@/lib/data"
import { ghHref } from "@/lib/live/ids"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { GENERATORS, setVideoLike, type VideoPost } from "@/lib/video"
import { PosterFallback } from "./lite-player"

// ─── Section navigation ─────────────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { href: "/video", label: "Gallery", icon: FilmIcon },
  { href: "/video/builder", label: "Shot builder", icon: CameraIcon },
  { href: "/video/share", label: "Share a video", icon: UploadIcon },
] as const

/** Gallery · Shot builder · Share: the three places of the video lab, as links. */
export function VideoNav({ className }: { className?: string }) {
  const path = usePathname()
  const reduce = useReducedMotion()
  return (
    <nav aria-label="Video lab" className={cn("glass flex w-fit max-w-full self-start overflow-x-auto rounded-full p-1 [scrollbar-width:none]", className)}>
      <ul className="flex">
        {SECTIONS.map(({ href, label, icon: Icon }) => {
          const on = href === "/video" ? path === "/video" : path.startsWith(href)
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {on && (
                  <motion.span
                    layoutId="video-nav-pill"
                    transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.35, bounce: 0.15 }}
                    className="absolute inset-0 -z-10 rounded-full bg-primary"
                  />
                )}
                <Icon aria-hidden className="size-3.5" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ─── Likes ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Like a member's video. Your own posts show the count without a button. */
export function VideoLikeButton({ post, onChange, className }: { post: VideoPost; onChange?: (likes: number, liked: boolean) => void; className?: string }) {
  const { user } = useSession()
  const router = useRouter()
  const [state, setState] = useState({ count: post.likes, mine: post.liked })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  if (post.mine) {
    return (
      <span className={cn("inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/40 px-3.5 text-sm text-muted-foreground", className)}>
        <HeartIcon aria-hidden className="size-4" />
        <span className="tabular">{compact(state.count)}</span>
        <span className="sr-only">likes</span>
      </span>
    )
  }

  async function toggle() {
    if (!live) return
    if (!user) {
      router.push(`/sign-in?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    const on = !state.mine
    const next = { count: Math.max(0, state.count + (on ? 1 : -1)), mine: on }
    setState(next)
    setBusy(true)
    setError("")
    try {
      await setVideoLike(post.id, on)
      onChange?.(next.count, next.mine)
    } catch (e) {
      setState(state)
      setError(e instanceof Error ? e.message : "That did not work. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || !live}
        aria-pressed={state.mine}
        title={live ? undefined : "Likes need member accounts, which are not switched on for this copy of Nexverse."}
        className={cn(
          "pressable inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-70",
          state.mine ? "border-ion/50 bg-ion/10 text-ion" : "border-border bg-secondary/60 text-foreground hover:bg-secondary",
          className
        )}
      >
        <HeartIcon aria-hidden className={cn("size-4 transition-transform duration-200", state.mine && "scale-110 fill-current")} />
        Like
        <span className="text-muted-foreground tabular">{compact(state.count)}</span>
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}

// ─── Copy ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Copies text and says so (for prompts). */
export function CopyText({ text, label = "Copy prompt", className }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle")
  return (
    <button
      type="button"
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setState("done")
        } catch {
          setState("failed")
        }
        setTimeout(() => setState("idle"), 1800)
      }}
      className={cn(
        "pressable inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary/60 px-3.5 text-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
        className
      )}
    >
      {state === "done" ? <CheckIcon aria-hidden className="size-4 text-ok" /> : <CopyIcon aria-hidden className="size-4" />}
      <span aria-live="polite">{state === "done" ? "Copied" : state === "failed" ? "Select and copy it by hand" : label}</span>
    </button>
  )
}

// ─── Cards ──────────────────────────────────────────────────────────────────────────────────────────────────

/** One shared video in the gallery: poster, title, model and tool, author and likes. Opens its page. */
export function VideoCard({ post, selected, onSelect, className }: { post: VideoPost; selected?: boolean; onSelect?: () => void; className?: string }) {
  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card/70 transition-colors hover:bg-card", selected && "border-ion/60 ring-1 ring-ion/40", className)}>
      <div className="relative aspect-video overflow-hidden bg-black">
        {post.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnails from YouTube, Vimeo or Supabase Storage; hosts are checked in lib/video
          <img src={post.posterUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none" />
        ) : (
          <PosterFallback seed={post.title} />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <span aria-hidden className="absolute bottom-2.5 left-2.5 grid size-9 place-items-center rounded-full border border-white/20 bg-black/55 text-white">
          <PlayIcon className="ml-0.5 size-4 fill-current" />
        </span>
        {post.hidden && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-gold">
            <EyeOffIcon aria-hidden className="size-3" /> Hidden by staff
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <h3 className="line-clamp-2 text-[15px] leading-snug font-medium">
          <Link href={`/video/${post.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {post.title}
          </Link>
        </h3>
        {(post.model || post.tool) && (
          <p className="flex flex-wrap gap-1.5 text-xs">
            {post.model && <span className="rounded-full border border-ion/25 bg-ion/10 px-2 py-0.5 text-ion">{post.model}</span>}
            {post.tool && <span className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-muted-foreground">{post.tool}</span>}
          </p>
        )}
        {post.prompt && <p className="line-clamp-2 text-[13px] text-muted-foreground">{post.prompt}</p>}
        <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <MemberAvatar name={post.author.name} size={20} />
          <span className="min-w-0 truncate">{post.mine ? "You" : post.author.name}</span>
          <span aria-hidden>·</span>
          <TimeAgo date={post.createdAt} />
          <span className="ml-auto inline-flex items-center gap-1 tabular" title={`${post.likes} likes`}>
            <HeartIcon aria-hidden className={cn("size-3.5", post.liked && "fill-current text-ion")} />
            {compact(post.likes)}
            <span className="sr-only">likes</span>
          </span>
        </div>
      </div>
      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={cn(
            "absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs backdrop-blur-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            selected ? "border-ion/60 bg-ion text-ion-foreground" : "border-white/20 bg-black/55 text-white/90 hover:bg-black/75"
          )}
        >
          {selected && <CheckIcon aria-hidden className="size-3" />}
          Compare
        </button>
      )}
    </article>
  )
}

// ─── Where to generate ──────────────────────────────────────────────────────────────────────────────────────

/** Official homes of the major video models. Open models open their repository page on Nexverse. */
export function WhereToGenerate({ className }: { className?: string }) {
  return (
    <section aria-labelledby="where-h" className={cn("glass flex flex-col gap-3 rounded-2xl p-5", className)}>
      <div className="flex items-center gap-2">
        <ClapperboardIcon aria-hidden className="size-4 text-gold" />
        <h2 id="where-h" className="text-base font-semibold">
          Where to generate
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">Official sites of well-known video models. Open-weight models link to their code, which you can run yourself.</p>
      <ul className="grid gap-1">
        {GENERATORS.map((g) => {
          const body = (
            <>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{g.name}</span>
                <span className="truncate text-xs text-muted-foreground">{g.maker}</span>
              </span>
              {g.open && <span className="ml-auto shrink-0 rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[11px] text-ok">Open weights</span>}
              <ArrowUpRightIcon aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground", !g.open && "ml-auto")} />
            </>
          )
          const row = "flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          return (
            <li key={g.name}>
              {g.github ? (
                <Link href={ghHref(g.github[0], g.github[1])} className={row}>
                  {body}
                </Link>
              ) : (
                <ExternalLink href={g.href} className={row}>
                  {body}
                </ExternalLink>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground/80">Listed for convenience, not endorsed. Check each one&apos;s pricing and terms before you use it.</p>
    </section>
  )
}
