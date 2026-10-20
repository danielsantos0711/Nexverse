"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { CalendarClockIcon, ExternalLinkIcon, FileTextIcon, FolderGit2Icon, LinkIcon, LockIcon, MonitorPlayIcon, PencilIcon, ScaleIcon, StarIcon, TagIcon, UsersIcon } from "lucide-react"
import { DownloadsPanel } from "@/components/downloads/downloads-panel"
import { Gallery } from "@/components/studio/gallery"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { ThreadDiscussion } from "@/components/forum/discussion"
import { Chip, Cover, KIND_ICONS, KindTag, LangTag } from "@/components/hub/bits"
import { CompareButton } from "@/components/hub/compare"
import { LikeButton } from "@/components/hub/like-button"
import { ModMenu, ReportButton } from "@/components/moderation"
import { Markdown } from "@/components/live/markdown"
import { TimeAgo } from "@/components/live/time"
import { ProfileAvatar } from "@/components/settings/profile-avatar"
import { DiscussButton } from "@/components/social/discuss-button"
import { FollowButton } from "@/components/social/follow-button"
import { SaveButton } from "@/components/social/save-button"
import { StatusPill } from "@/components/studio/ui"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { formatDate, KINDS, LANGUAGES } from "@/lib/data"
import { canEditProject, getProject, isScheduled, licenseLabel, projectPath, projectTarget, projectThreadId, pub, type Project } from "@/lib/projects"
import { findLicense } from "@/lib/publish/licenses"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"

const DISCUSS_CATEGORY = { model: "models", dataset: "data", tool: "show", repo: "show" } as const

/** A member's project page, loaded in the browser (drafts are visible to their owner only). */
export function ProjectView({ id }: { id: string }) {
  const { ready, user } = useSession()
  const [state, setState] = useState<{ project: Project | null; error: string } | null>(null)

  useEffect(() => {
    // Drafts are readable by their owner only, so wait for the session before asking.
    if (live && !ready) return
    let stale = false
    getProject(id)
      .then((project) => {
        if (stale) return
        setState({ project, error: "" })
        if (project) document.title = `${project.name} · Nexverse`
      })
      .catch((e: Error) => !stale && setState({ project: null, error: e.message }))
    return () => {
      stale = true
    }
  }, [id, ready, user?.id])

  if (!state) return <PageSkeleton />
  if (state.error) return <Missing title="This project could not be loaded" detail={state.error} />
  if (!state.project)
    return (
      <Missing
        title="This project is not here"
        detail={
          user
            ? "It may have been deleted or unpublished by its owner, or the address is wrong."
            : "It may be for signed-in members only, not published yet, or deleted. Sign in to check."
        }
        signIn={!user && live}
      />
    )
  return <Page p={state.project} mine={canEditProject(state.project, user?.id)} owner={state.project.local || Boolean(user && state.project.ownerId === user.id)} />
}

function Page({ p, mine, owner }: { p: Project; mine: boolean; owner: boolean }) {
  const o = pub(p)
  const scheduled = isScheduled(p)
  const licence = findLicense(p.license)
  const reduce = useReducedMotion()
  const KindIcon = KIND_ICONS[p.kind]
  const href = projectPath(p.id)
  const ownerName = p.local ? "You" : (p.owner?.name ?? "A member")
  const draft = p.status === "draft"
  const repo = p.links.repo.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/)

  const enter = (delay = 0) => (reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay, ease: [0.23, 1, 0.32, 1] as const } })

  return (
    <>
      <div className="relative isolate overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 opacity-60">
          {o.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- member cover picture
            <img src={o.coverUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            <Cover seed={p.slug + "banner"} kind={p.kind} />
          )}
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/30 via-background/70 to-background" />
        <div className="shell flex flex-col gap-5 pt-8 pb-7 md:pt-10">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Link href={KINDS[p.kind].path} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <KindIcon aria-hidden className="size-4" />
              {KINDS[p.kind].plural}
            </Link>
            <span aria-hidden>/</span>
            <span className="truncate">{ownerName}</span>
          </nav>

          {!draft && !p.local && (scheduled || o.visibility !== "public") && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-2.5 text-sm">
              {scheduled ? <CalendarClockIcon aria-hidden className="size-4 text-gold" /> : o.visibility === "members" ? <LockIcon aria-hidden className="size-4 text-ion" /> : <LinkIcon aria-hidden className="size-4 text-ion" />}
              <span className="text-muted-foreground">
                {scheduled
                  ? `Scheduled: goes live on ${new Date(o.publishAt!).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Until then only its editors see it.`
                  : o.visibility === "members"
                    ? "Members only: visitors who are not signed in cannot open this page."
                    : "Unlisted: it opens from its link but is not shown in lists or search."}
              </span>
            </div>
          )}

          {(draft || p.local) && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-2.5 text-sm">
              {p.local ? <StatusPill tone="local">On this device</StatusPill> : <StatusPill tone="draft">Draft</StatusPill>}
              <span className="text-muted-foreground">
                {p.local ? "This copy of Nexverse has no database, so only you can see this page." : "Only you can see this page until you publish it."}
              </span>
            </div>
          )}

          <motion.div {...enter()} className="flex flex-wrap items-center gap-4">
            <div className="size-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/15 md:size-20">
              <Cover seed={p.slug} kind={p.kind} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {o.featuredAt && (
                <span className="inline-flex items-center gap-1 self-start rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
                  <StarIcon aria-hidden className="size-3" /> Featured
                </span>
              )}
              <h1 className="text-2xl font-semibold tracking-[-0.02em] break-words md:text-3xl">{p.name}</h1>
              <p className="text-muted-foreground">{p.summary}</p>
            </div>
          </motion.div>

          <motion.div {...enter(0.05)} className="flex flex-wrap items-center gap-2">
            {!draft && <LikeButton target={projectTarget(p.id)} />}
            {!draft && <SaveButton target={projectTarget(p.id)} />}
            {!draft && <CompareButton project={{ id: p.id, name: p.name, kind: p.kind }} />}
            {!draft && <DiscussButton title={p.name} href={href} category={DISCUSS_CATEGORY[p.kind]} />}
            {!draft && !mine && <ReportButton targetKind="project" targetId={p.id} targetUrl={href} />}
            {!draft && <ModMenu kind="project" id={p.id} />}
            {mine && (
              <Link
                href={`${href}/edit`}
                className="pressable inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <PencilIcon aria-hidden className="size-4" /> Edit
              </Link>
            )}
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
            <KindTag kind={p.kind} />
            {p.license !== "unspecified" && <Chip className="font-mono">{p.license}</Chip>}
            {p.versions[0] && <Chip className="font-mono">v{p.versions[0].version.replace(/^v/i, "")}</Chip>}
          </motion.div>
        </div>
      </div>

      <div className="shell grid grid-cols-1 gap-10 pt-8 pb-16 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-12">
          <section aria-labelledby="readme-h" className="flex flex-col gap-3">
            <h2 id="readme-h" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileTextIcon aria-hidden className="size-4" /> README
            </h2>
            {p.readme.trim() ? (
              <div className="rounded-2xl border border-border bg-card/40 p-5 md:p-7">
                <Markdown source={p.readme} ctx={{ source: "none" }} embeds />
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                {mine ? (
                  <>
                    No README yet. <Link href={`${href}/edit`} className="text-ion hover:underline">Write one</Link> so people know how to use it.
                  </>
                ) : (
                  "The owner has not written a README yet."
                )}
              </p>
            )}
          </section>

          {o.gallery.length > 0 && <Gallery items={o.gallery} name={p.name} />}

          {!p.local && (
            <DownloadsPanel
              kind="project"
              targetId={p.id}
              canEdit={mine}
              zipName={`${p.slug}${p.versions[0] ? `-${p.versions[0].version}` : ""}`}
              versions={p.versions.map((v) => v.version)}
            />
          )}

          {p.versions.length > 0 && (
            <section aria-labelledby="changelog-h" className="flex flex-col gap-4">
              <h2 id="changelog-h" className="text-base font-semibold">
                Changelog
              </h2>
              <ol className="relative flex flex-col gap-6 border-l border-border pl-5">
                {p.versions.map((v, i) => (
                  <li key={v.id ?? v.version} className="relative flex flex-col gap-1.5">
                    <span aria-hidden className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-background ${i === 0 ? "bg-ion" : "bg-muted-foreground/50"}`} />
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="font-mono text-sm font-semibold">{v.version}</h3>
                      <time dateTime={v.releasedOn} className="text-xs text-muted-foreground">
                        {formatDate(v.releasedOn)}
                      </time>
                      {i === 0 && <span className="rounded-full bg-ion/10 px-2 py-0.5 text-xs text-ion">Latest</span>}
                    </div>
                    {v.notes ? <Markdown source={v.notes} ctx={{ source: "none" }} className="text-sm [&_p]:my-1.5" /> : <p className="text-sm text-muted-foreground">No notes.</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {!draft && (
            <ThreadDiscussion
              threadId={projectThreadId(p.id)}
              heading="Discussion"
              locked={!o.commentsEnabled}
              lockedNote={o.commentsEnabled ? undefined : "The authors closed comments on this project."}
            />
          )}
        </div>

        <aside aria-label="About this project" className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <section aria-label="Details" className="glass flex flex-col gap-3 rounded-2xl p-5 text-sm">
            <Row label="Kind" value={KINDS[p.kind].label} />
            <Row
              label="Licence"
              value={
                licence?.url ? (
                  <a href={licence.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-ion" title={licence.short}>
                    <ScaleIcon aria-hidden className="size-3.5" /> {licenseLabel(p.license)}
                  </a>
                ) : (
                  licenseLabel(p.license)
                )
              }
            />
            {p.versions[0] && <Row label="Latest" value={<span className="font-mono">{p.versions[0].version}</span>} />}
            <Row label="Updated" value={<TimeAgo date={p.updatedAt} />} />
            {p.publishedAt && <Row label="Published" value={<time dateTime={p.publishedAt}>{formatDate(p.publishedAt)}</time>} />}
            {p.langs.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">Languages</span>
                <div className="flex flex-wrap gap-1.5">
                  {p.langs.map((l) => (
                    <span key={l} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-xs">
                      <LangTag lang={l} className="border-0 p-0" /> <span lang={l}>{LANGUAGES[l].native}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {p.tags.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TagIcon aria-hidden className="size-3.5" /> Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <Link key={t} href={`${KINDS[p.kind].path}?q=${encodeURIComponent(t)}`} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                      #{t}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          {(p.links.repo || p.links.paper || p.links.demo || o.extraLinks.length > 0) && (
            <section aria-labelledby="links-h" className="flex flex-col gap-2 rounded-2xl border border-border bg-card/60 p-5 text-sm">
              <h2 id="links-h" className="mb-1 text-xs font-medium text-muted-foreground">
                Links
              </h2>
              {repo && (
                <>
                  <Link href={`/gh/${repo[1]}/${repo[2]}`} className="flex items-center gap-2 hover:text-ion">
                    <FolderGit2Icon aria-hidden className="size-4 shrink-0" />
                    <span className="truncate">
                      {repo[1]}/{repo[2]}
                    </span>
                  </Link>
                  <a href={p.links.repo} target="_blank" rel="noopener noreferrer nofollow ugc" className="ml-6 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    Open on GitHub <ExternalLinkIcon aria-hidden className="size-3" />
                  </a>
                </>
              )}
              {p.links.paper && <External href={p.links.paper} icon={FileTextIcon} label="Paper" />}
              {p.links.demo && <External href={p.links.demo} icon={MonitorPlayIcon} label="Demo" />}
              {o.extraLinks.map((l) => (
                <External key={l.url} href={l.url} icon={LinkIcon} label={l.label} />
              ))}
            </section>
          )}

          <section aria-label="Owner" className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-5">
            <ProfileAvatar name={ownerName} seed={p.owner?.id} url={p.owner?.avatarUrl} size={40} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{ownerName}</span>
              {p.owner?.handle && <span className="truncate text-xs text-muted-foreground">@{p.owner.handle}</span>}
            </div>
            {p.owner && !owner && <FollowButton followee={`member:${p.owner.id}`} name={p.owner.name} showCount={false} />}
          </section>

          {o.coauthors.length > 0 && (
            <section aria-labelledby="coauthors-h" className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-5">
              <h2 id="coauthors-h" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <UsersIcon aria-hidden className="size-3.5" /> Co-authors
              </h2>
              <ul className="flex flex-col gap-2">
                {o.coauthors.map((c) => (
                  <li key={c.id}>
                    <Link href={`/people/${c.handle ?? c.id}`} className="flex items-center gap-2.5 rounded-lg hover:text-ion">
                      <ProfileAvatar name={c.name} seed={c.id} url={c.avatarUrl} size={28} />
                      <span className="min-w-0 truncate text-sm">{c.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}

function External({ href, icon: Icon, label }: { href: string; icon: typeof FileTextIcon; label: string }) {
  let host = href
  try {
    host = new URL(href).hostname.replace(/^www\./, "")
  } catch {}
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center gap-2 hover:text-ion">
      <Icon aria-hidden className="size-4 shrink-0" />
      <span>{label}</span>
      <span className="truncate text-xs text-muted-foreground">{host}</span>
      <ExternalLinkIcon aria-hidden className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
    </a>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function Missing({ title, detail, signIn }: { title: string; detail: string; signIn?: boolean }) {
  const path = usePathname()
  return (
    <Empty className="mx-auto max-w-xl py-24">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {signIn && (
          <Link href={`/sign-in?next=${encodeURIComponent(path)}` as "/sign-in"} className="text-ion hover:underline">
            Sign in
          </Link>
        )}
        <Link href="/explore" className="text-ion hover:underline">
          Explore projects
        </Link>
      </EmptyContent>
    </Empty>
  )
}
