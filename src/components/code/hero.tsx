import Link from "next/link"
import { DownloadCloudIcon, FolderGit2Icon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Copy } from "@/components/content/copy"

/** The top of /code: what Nexverse Code is, and the two ways to start. */
export function CodeHero() {
  return (
    <header className="relative isolate flex flex-col gap-5 pt-10 pb-8 md:pt-14">
      <div aria-hidden className="starfield left-1/2 -z-10 w-screen -translate-x-1/2 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]">
        <i />
        <i />
        <i />
      </div>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl border border-repo/25 bg-repo/10 text-repo">
          <FolderGit2Icon aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl"><Copy k="code.hero.nexverse-code">Nexverse Code</Copy></h1>
          <p className="max-w-[68ch] text-sm text-muted-foreground md:text-[15px]">
            <Copy k="code.hero.repositories-with-real-history-commits" multiline>Repositories with real history: commits, branches, tags, releases, issues and pull requests with reviews. Each one can link to the models and datasets it trains or serves, a forum discussion and its launch, and AI explains any file for free.</Copy>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href="/code/new" />}>
          <PlusIcon aria-hidden /> <Copy k="code.hero.new-repository">New repository</Copy>
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/code/import" />}>
          <DownloadCloudIcon aria-hidden /> <Copy k="code.hero.import-from-github">Import from GitHub</Copy>
        </Button>
      </div>
    </header>
  )
}
