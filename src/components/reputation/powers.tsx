"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { CheckIcon, LockIcon, SparklesIcon } from "lucide-react"
import { RoleBadge } from "@/components/reputation/role-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CAP_GROUPS, CAP_INFO, CAPS, REPUTATION_HELP, useCaps, type Cap } from "@/lib/caps"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

// The member-facing powers; the ones that run the site are listed only for those who hold them.
const RUN_SITE = new Set<Cap>(["news.write", "news.publish", "pages.edit", "menus.edit", "forum.manage", "chat.manage", "moderate", "members.manage", "roles.manage", "settings.manage"])

/**
 * "Your powers": what the signed-in member can do on Nexverse, which roles they hold, their reputation tier
 * and what the next tier unlocks. For /you or the settings page.
 */
export function Powers({ className }: { className?: string }) {
  const caps = useCaps()
  const me = useRole()
  const { user } = useSession()
  const reduce = useReducedMotion()

  if (!caps.ready) {
    return (
      <div className={cn("glass flex flex-col gap-3 rounded-2xl p-5", className)} aria-busy="true" aria-label="Loading your powers">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (live && me.role === "guest") {
    return (
      <section className={cn("glass flex flex-col gap-2 rounded-2xl p-5", className)}>
        <h2 className="font-sans text-sm font-semibold tracking-normal">Your powers</h2>
        <p className="text-sm text-muted-foreground">Anyone can read Nexverse. Sign in to post, reply, chat and build a reputation that unlocks more.</p>
      </section>
    )
  }

  const visible = CAPS.filter((c) => !RUN_SITE.has(c) || caps.can(c))
  const have = visible.filter((c) => caps.can(c))
  const { tier, next } = caps
  const span = next && tier ? next.minPoints - tier.minPoints : 0
  const progress = next && tier && span > 0 ? Math.min(1, Math.max(0, (caps.points - tier.minPoints) / span)) : 1

  return (
    <section aria-labelledby="powers-h" className={cn("glass flex flex-col gap-5 rounded-2xl p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="powers-h" className="font-sans text-sm font-semibold tracking-normal">
            Your powers
          </h2>
          <p className="text-sm text-muted-foreground">
            {me.suspended
              ? "Posting is paused on your account, so these are on hold until the pause ends."
              : `You can do ${have.length} of ${visible.length} things here${tier ? `, as ${tier.label}` : ""}.`}
          </p>
        </div>
        {user && <RoleBadge member={{ id: user.id, role: me.role }} all />}
      </div>

      {live && next && !me.isAdmin && (
        <div className="flex flex-col gap-2 rounded-xl border border-ion/20 bg-ion/[0.05] p-3.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <p className="font-medium">
              <SparklesIcon aria-hidden className="mr-1.5 inline size-4 align-[-3px] text-ion" />
              Next: {next.label} at {next.minPoints.toLocaleString("en")}
            </p>
            <p className="shrink-0 text-xs text-muted-foreground tabular">
              {caps.points.toLocaleString("en")} / {next.minPoints.toLocaleString("en")}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label={`Progress to ${next.label}`}
            aria-valuemin={tier?.minPoints ?? 0}
            aria-valuemax={next.minPoints}
            aria-valuenow={caps.points}
            className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
          >
            <motion.div
              className="h-full origin-left rounded-full bg-ion"
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {caps.unlocksNext.length
              ? `Unlocks: ${caps.unlocksNext.map((c) => CAP_INFO[c].label.toLowerCase()).join(", ")}.`
              : next.grantsRole
                ? `Makes you ${caps.roles.find((r) => r.key === next.grantsRole)?.label ?? "a contributor"}.`
                : "A new level on your profile."}{" "}
            <Link href={REPUTATION_HELP} className="text-ion hover:underline">
              How reputation works
            </Link>
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {CAP_GROUPS.map((g) => {
          const list = visible.filter((c) => CAP_INFO[c].group === g)
          if (!list.length) return null
          return (
            <div key={g} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g}</h3>
              <ul className="flex flex-col gap-1">
                {list.map((c) => {
                  const ok = caps.can(c)
                  const why = ok ? null : caps.why(c)
                  const hint = why && !why.ok ? (why.reason === "reputation" ? `at ${why.need.toLocaleString("en")}` : why.reason === "role" ? why.roles[0] : null) : null
                  return (
                    <li key={c} className={cn("flex items-center gap-2 text-sm", !ok && "text-muted-foreground")}>
                      {ok ? <CheckIcon aria-hidden className="size-3.5 shrink-0 text-ok" /> : <LockIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />}
                      <span className="min-w-0 flex-1">{CAP_INFO[c].label}</span>
                      <span className="sr-only">{ok ? "Yes" : "Not yet"}</span>
                      {hint && <span className="shrink-0 text-xs tabular opacity-80">{hint}</span>}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
