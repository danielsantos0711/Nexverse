"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { BracesIcon, PlayIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getPrompt, type LabPrompt } from "@/lib/lab/prompts"
import { live } from "@/lib/supabase"
import { CopyAction, Panel } from "./ui"
import { Copy } from "@/components/content/copy"

/** Read-only view of a shared prompt, for anyone with the link. "Open in playground" loads it there to run or edit. */
export function SharedPrompt({ id }: { id: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; p: LabPrompt } | { status: "missing" } | { status: "error"; message: string }>({ status: "loading" })

  useEffect(() => {
    let alive = true
    if (!live) {
      void Promise.resolve().then(() => alive && setState({ status: "error", message: "Shared prompts need the site's database, which this copy does not have." }))
      return
    }
    getPrompt(id).then(
      (p) => alive && setState(p ? { status: "ok", p } : { status: "missing" }),
      (e: Error) => alive && setState({ status: "error", message: e.message })
    )
    return () => {
      alive = false
    }
  }, [id])

  if (state.status === "loading")
    return (
      <div className="mt-6 flex flex-col gap-4" aria-busy>
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )

  if (state.status !== "ok")
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
        <BracesIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">{state.status === "missing" ? "This prompt is not shared" : "Could not open this prompt"}</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {state.status === "missing" ? "It may have been deleted, or its owner made it private again." : state.message}
        </p>
        <Button nativeButton={false} className="mt-5" render={<Link href="/lab/prompts" />}>
          <Copy k="lab-prompt.shared-prompt.open-the-playground">Open the playground</Copy>
        </Button>
      </div>
    )

  const p = state.p
  const vars = Object.entries(p.variables)
  const full = (p.system ? `System:\n${p.system}\n\nUser:\n` : "") + p.prompt
  return (
    <div className="mt-4 flex flex-col gap-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{p.title}</h1>
          <p className="text-sm text-muted-foreground">
            Shared by {p.ownerName ?? "a member"} · updated <time dateTime={p.updatedAt}>{new Date(p.updatedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</time>
            {p.temperature != null && ` · temperature ${p.temperature.toFixed(1)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyAction text={full} label="Copy prompt" />
          <Button nativeButton={false} render={<Link href={`/lab/prompts?p=${p.id}`} />}>
            <PlayIcon aria-hidden />
            <Copy k="lab-prompt.shared-prompt.open-in-playground">Open in playground</Copy>
          </Button>
        </div>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {p.system && (
            <Panel title="System prompt">
              <pre className="overflow-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">{p.system}</pre>
            </Panel>
          )}
          <Panel title="User prompt">
            <pre className="overflow-auto rounded-xl border border-border bg-black/30 p-3 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">{p.prompt}</pre>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Variables" description={vars.length ? undefined : "This prompt has no variables."}>
            {vars.length > 0 && (
              <dl className="flex flex-col gap-2.5 text-sm">
                {vars.map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <dt className="font-mono text-[13px] text-ion">{`{{${k}}}`}</dt>
                    <dd className="break-words whitespace-pre-wrap text-foreground/85">{v || <span className="text-muted-foreground"><Copy k="lab-prompt.shared-prompt.empty">empty</Copy></span>}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
          {p.models.length > 0 && (
            <Panel title="Models it was set up for">
              <ul className="flex flex-col gap-1 font-mono text-[13px] text-foreground/85">
                {p.models.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
