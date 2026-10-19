import Link from "next/link"
import { DownloadCloudIcon, FolderGit2Icon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/** The top of /code: what Nexverse Code is, and the two ways to start. */
export function CodeHero() {
  return (
    <header className="relative isolate flex flex-col gap-5 pt-10 pb-8 md:pt-14">
      <div aria-hidden className="starfield left-1/2 -z-10 w-screen -translate-x-1/2 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]">
        <i />
        <i />
        <i />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-72 w-screen -translate-x-1/2 bg-[radial-gradient(45%_70%_at_18%_0%,rgb(143_180_255/0.16),transparent_70%),radial-gradient(30%_55%_at_80%_10%,rgb(211_180_255/0.10),transparent_70%)]"
      />
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl border border-repo/25 bg-repo/10 text-repo">
          <FolderGit2Icon aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Nexverse Code</h1>
          <p className="max-w-[68ch] text-sm text-muted-foreground md:text-[15px]">
            Repositories with real history: commits, branches, tags, releases, issues and pull requests with reviews. Each one can link to the models and datasets it trains or serves, a forum
            discussion and its launch, and AI explains any file for free.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href="/code/new" />}>
          <PlusIcon aria-hidden /> New repository
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/code/import" />}>
          <DownloadCloudIcon aria-hidden /> Import from GitHub
        </Button>
      </div>
    </header>
  )
}
