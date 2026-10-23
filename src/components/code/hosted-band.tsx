"use client"

import Link from "next/link"
import { ArrowRightIcon, CodeXmlIcon, PlusIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { CodeUnavailable, listRepos } from "@/lib/code/api"
import { RepoCard } from "./repo-card"
import { useLoad } from "./ui"
import { Copy } from "@/components/content/copy"

/** On /repos: code hosted on Nexverse itself, above the repositories members shared from elsewhere. */
export function HostedBand() {
  const list = useLoad(() => listRepos({ sort: "stars", limit: 6 }), [])
  const off = list.error instanceof CodeUnavailable
  return (
    <section aria-labelledby="hosted-title" className="shell pt-8">
      <div className="relative overflow-hidden rounded-2xl bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-ion uppercase">
              <CodeXmlIcon aria-hidden className="size-3.5" /> <Copy k="code.hosted-band.nexverse-code">Nexverse Code</Copy>
            </p>
            <h2 id="hosted-title" className="mt-1 text-lg font-semibold">
              <Copy k="code.hosted-band.hosted-on-nexverse">Hosted on Nexverse</Copy>
            </h2>
            <p className="text-sm text-muted-foreground"><Copy k="code.hosted-band.browse-fork-open-issues-and" multiline>Browse, fork, open issues and send pull requests without leaving Nexverse. Shared links from GitHub and elsewhere are below.</Copy></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/code/new" className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              <PlusIcon aria-hidden className="size-4" /> <Copy k="code.hosted-band.new-repository">New repository</Copy>
            </Link>
            <Link href="/code" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm hover:border-ion/40">
              Explore code <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
        {off ? (
          <p className="mt-4 text-sm text-muted-foreground">{list.error?.message}</p>
        ) : list.error ? null : !list.data ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : list.data.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.data.map((r, i) => (
              <RepoCard key={r.id} repo={r} style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground"><Copy k="code.hosted-band.no-public-repositories-yet-yours">No public repositories yet. Yours could be the first.</Copy></p>
        )}
      </div>
    </section>
  )
}
