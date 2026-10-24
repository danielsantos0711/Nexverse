import type { Metadata } from "next"
import { Suspense } from "react"
import { RepoApp, RepoSkeleton } from "@/components/code/repo-app"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/*
 * Every page of a repository: /code/<owner>/<repo>, /tree/<ref>/<path>, /blob/…, /commits/…, /commit/<sha>,
 * /compare, /branches, /tags, /releases, /issues, /pulls, /settings and the rest. One route keeps the repository
 * loaded while you move between its pages; the URLs stay the familiar, shareable ones.
 */

// Repositories live in the database. One sample lets the route be checked at build time (it renders "not found").
export function generateStaticParams() {
  return [{ owner: "nexverse", repo: "welcome", rest: [] }]
}

export async function generateMetadata({ params }: PageProps<"/code/[owner]/[repo]/[[...rest]]">): Promise<Metadata> {
  const { owner, repo } = await params
  const who = decodeURIComponent(owner)
  // an owner without a handle is addressed by id; the title never shows the raw id
  return { title: `${UUID.test(who) ? "" : `${who}/`}${decodeURIComponent(repo)} · Code` }
}

export default function RepoPage({ params }: PageProps<"/code/[owner]/[repo]/[[...rest]]">) {
  return (
    <Suspense fallback={<RepoSkeleton />}>
      <Repo params={params} />
    </Suspense>
  )
}

async function Repo({ params }: { params: PageProps<"/code/[owner]/[repo]/[[...rest]]">["params"] }) {
  const { owner, repo, rest } = await params
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  }
  return <RepoApp owner={dec(owner)} slug={dec(repo)} rest={(rest ?? []).map(dec)} />
}
