"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { CheckIcon, ChevronDownIcon, CodeIcon, DownloadIcon, GitBranchIcon, InfoIcon, LoaderCircleIcon, PlusIcon, TagIcon } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { createRef } from "@/lib/code/api"
import { shortSha } from "@/lib/code/hash"
import { VALID_REF, type Tree } from "@/lib/code/tree"
import { downloadZip } from "@/lib/code/download"
import { cn } from "@/lib/utils"
import { useRepo } from "./repo-context"
import { href, inputCls } from "./ui"

/**
 * Switch branch or tag. Typing a name that does not exist offers to create a branch from the current ref (for
 * people who can write). `to(ref)` builds the address of the same page at another ref.
 */
export function RefPicker({ current, commit, to }: { current: string; commit: string | null; to: (ref: string) => string }) {
  const { refs, writable, repo, reloadRefs } = useRepo()
  const router = useRouter()
  const [q, setQ] = useState("")
  const [tab, setTab] = useState<"branch" | "tag">("branch")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useMemo(() => refs.filter((r) => r.kind === tab && r.name.toLowerCase().includes(q.toLowerCase())), [refs, tab, q])
  const isRef = refs.some((r) => r.name === current)
  const exact = refs.some((r) => r.kind === "branch" && r.name === q.trim())
  const canCreate = writable && tab === "branch" && q.trim() && !exact && VALID_REF.test(q.trim()) && commit

  const create = async () => {
    if (!commit) return
    setBusy(true)
    setError(null)
    try {
      await createRef(repo.id, "branch", q.trim(), commit)
      await reloadRefs()
      router.push(href(to(q.trim())))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 max-w-[14rem] gap-1.5 rounded-full px-3 font-mono text-[13px]" aria-label={`Switch branch or tag, now ${current}`} />}>
        {refs.find((r) => r.name === current)?.kind === "tag" ? <TagIcon aria-hidden /> : <GitBranchIcon aria-hidden />}
        <span className="truncate">{isRef ? current : shortSha(current)}</span>
        <ChevronDownIcon aria-hidden className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 p-0">
        <div className="flex flex-col gap-2 border-b border-border p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={tab === "branch" ? (writable ? "Find or create a branch" : "Find a branch") : "Find a tag"}
            aria-label="Filter refs"
            className={cn(inputCls, "h-8 font-mono text-[13px]")}
          />
          <div className="flex gap-1" role="tablist">
            {(["branch", "tag"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-7 flex-1 rounded-md text-xs", tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t === "branch" ? "Branches" : "Tags"}
              </button>
            ))}
          </div>
        </div>
        <ul className="max-h-72 overflow-y-auto p-1">
          {list.map((r) => (
            <li key={`${r.kind}:${r.name}`}>
              <Link href={href(to(r.name))} className="flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-[13px] hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none">
                <CheckIcon aria-hidden className={cn("size-3.5 shrink-0", r.name === current ? "text-ion" : "invisible")} />
                <span className="truncate">{r.name}</span>
                {r.kind === "branch" && r.name === repo.defaultBranch && <span className="ml-auto rounded-full border border-border px-1.5 font-sans text-[10px] text-muted-foreground">default</span>}
              </Link>
            </li>
          ))}
          {!list.length && !canCreate && <li className="px-2 py-3 text-center text-xs text-muted-foreground">Nothing found.</li>}
          {canCreate && (
            <li>
              <button onClick={create} disabled={busy} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-secondary">
                {busy ? <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin" /> : <PlusIcon aria-hidden className="size-3.5 text-ion" />}
                <span className="min-w-0 truncate">
                  Create branch <span className="font-mono text-ion">{q.trim()}</span> from {isRef ? current : shortSha(current)}
                </span>
              </button>
            </li>
          )}
          {error && <li className="px-2 py-1 text-xs text-destructive">{error}</li>}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The "Code" menu: download this snapshot as a zip, and an honest note about git. */
export function CodeMenu({ refName, tree, at }: { refName: string; tree: Tree; at: string }) {
  const { repo } = useRepo()
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const zip = async () => {
    setError(null)
    setProgress([0, Object.keys(tree).length])
    try {
      await downloadZip(repo.id, repo.slug, refName, tree, at, (d, t) => setProgress([d, t]))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProgress(null)
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" className="h-8 gap-1.5 rounded-full px-3 text-[13px]" />}>
        {progress ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <CodeIcon aria-hidden />}
        {progress ? `${progress[0]}/${progress[1]}` : "Code"}
        <ChevronDownIcon aria-hidden className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-3">
        <div className="flex flex-col gap-3 text-sm">
          <Button onClick={zip} disabled={Boolean(progress)} className="justify-start">
            <DownloadIcon aria-hidden /> Download ZIP of {refName.length > 20 ? shortSha(refName) : refName}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
            <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <p>
              <span className="font-mono">git clone</span> and <span className="font-mono">git push</span> are not supported yet: Nexverse stores repositories without a git server. Work here in the browser, download a zip, or{" "}
              <Link href="/code/import" className="text-ion hover:underline">
                import from GitHub
              </Link>
              .
            </p>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
