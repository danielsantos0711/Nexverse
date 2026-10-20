"use client"

import { useRouter } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { CheckIcon, LoaderCircleIcon } from "lucide-react"
import { Gate } from "@/components/moderation"
import { Button } from "@/components/ui/button"
import { accessToken, type Visibility } from "@/lib/code/api"
import { cn } from "@/lib/utils"
import { FormError, href, inputCls } from "./ui"
import { Copy } from "@/components/content/copy"

const STEPS = ["Reading the repository on GitHub", "Downloading its files", "Hashing and uploading", "Writing the first commit"]

export function ImportRepo() {
  return (
    <Gate cap="repo.create" action="import a repository">
      <ImportForm />
    </Gate>
  )
}

function ImportForm() {
  const id = useId()
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")
  const [visibility, setVisibility] = useState<Visibility>("public")
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // The server does the work in one request; the steps advance on a timer so the wait reads as progress, and stop
  // at the last one until the answer arrives.
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500)
    return () => clearInterval(t)
  }, [busy])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const token = await accessToken()
    if (!token) {
      setError("Sign in first.")
      return
    }
    setBusy(true)
    setStep(0)
    try {
      const res = await fetch("/api/code/import", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, name: name || undefined, visibility }),
      })
      const json = (await res.json().catch(() => null)) as { data?: { owner: string; slug: string }; error?: { message: string } } | null
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "The import failed. Try again.")
      router.push(href(`/code/${json.data.owner}/${json.data.slug}`))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-busy={busy}>
      <div className="grid gap-2">
        <label htmlFor={`${id}-url`} className="text-sm font-medium">
          GitHub repository
        </label>
        <input id={`${id}-url`} value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://github.com/owner/repo" inputMode="url" autoFocus className={cn(inputCls, "font-mono")} />
        <p className="text-xs text-muted-foreground"><Copy k="code-import.import-repo.public-repositories-only-add-tree" multiline>Public repositories only. Add /tree/branch-name to import a branch other than the default one.</Copy></p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            Name on Nexverse <span className="font-normal text-muted-foreground"><Copy k="code-import.import-repo.optional">(optional)</Copy></span>
          </label>
          <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Same as on GitHub" className={inputCls} />
        </div>
        <div className="grid gap-2">
          <label htmlFor={`${id}-vis`} className="text-sm font-medium">
            Visibility
          </label>
          <select id={`${id}-vis`} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className={inputCls}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
        <p className="mb-2 font-medium text-foreground"><Copy k="code-import.import-repo.what-gets-imported">What gets imported</Copy></p>
        <ul className="list-disc space-y-1 pl-5">
          <li><Copy k="code-import.import-repo.the-files-of-one-branch" multiline>The files of one branch, as they are now, in a single commit that names the GitHub commit it came from.</Copy></li>
          <li><Copy k="code-import.import-repo.the-description-topics-and-licence">The description, topics and licence. Git history, issues and pull requests stay on GitHub.</Copy></li>
          <li>Up to 3,000 files and 80 MB; files over 25 MB are left out, and the commit message says how many.</li>
        </ul>
      </div>

      {busy && (
        <ol className="flex flex-col gap-2" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-2 text-sm transition-colors", i < step ? "text-foreground/80" : i === step ? "text-foreground" : "text-muted-foreground/60")}>
              {i < step ? <CheckIcon aria-hidden className="size-4 text-ok" /> : i === step ? <LoaderCircleIcon aria-hidden className="size-4 animate-spin text-ion" /> : <span aria-hidden className="size-4 rounded-full border border-border" />}
              {s}
            </li>
          ))}
        </ol>
      )}

      <FormError message={error} />
      <div>
        <Button type="submit" disabled={busy || !url.trim()}>
          {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          {busy ? "Importing…" : "Import repository"}
        </Button>
      </div>
    </form>
  )
}
