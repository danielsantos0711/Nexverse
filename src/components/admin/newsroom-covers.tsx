"use client"

import { useState } from "react"
import { CheckIcon, ImageIcon, SearchIcon, SparklesIcon } from "lucide-react"
import { StatusLine } from "@/components/admin/controls"
import { GeneratedCoverPreview } from "@/components/news/bits"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { searchCovers, type CoverCandidate, type CoverCredit, type CoverKind, type NewsCategory } from "@/lib/newsroom"
import { cn } from "@/lib/utils"

/*
 * The cover gallery in the story editor. It shows the cover the finder chose and every other candidate it
 * kept (the sources' own images, free-licensed photos with their credit, the generated Nexverse cover).
 * Editors pick one, search Openverse and Wikimedia Commons for other words, or use an image of their own
 * with its credit. The choice is saved with the story.
 */

export type CoverChoice = { url: string; kind: CoverKind | null; credit: CoverCredit | null; alt: string }

const KIND_LABEL: Record<CoverKind, string> = {
  source: "Source image",
  openverse: "Openverse",
  wikimedia: "Wikimedia Commons",
  generated: "Nexverse cover",
  editor: "Your image",
}

const EMPTY_CREDIT: CoverCredit = { creator: "", creatorUrl: "", license: "", licenseUrl: "", landing: "", provider: "" }

export function CoverGallery({
  storyId,
  title,
  category,
  value,
  candidates,
  onChange,
  onCandidates,
  error,
}: {
  storyId: string | null
  title: string
  category: NewsCategory
  value: CoverChoice
  candidates: CoverCandidate[]
  onChange: (c: CoverChoice) => void
  onCandidates: (c: CoverCandidate[]) => void
  error?: string
}) {
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [own, setOwn] = useState(value.kind === "editor")

  const list = candidates.some((c) => c.kind === "generated") ? candidates : [...candidates, { url: "", kind: "generated" as const, width: 1200, height: 630, alt: "", credit: null }]
  const isChosen = (c: CoverCandidate) => (c.kind === "generated" ? !value.url : value.url === c.url)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!storyId) return
    setBusy(true)
    setStatus({ ok: true, text: "Searching the sources, Openverse and Wikimedia Commons… up to half a minute." })
    try {
      const r = await searchCovers(storyId, query)
      onCandidates(r.candidates)
      const n = r.candidates.filter((c) => c.kind !== "generated").length
      setStatus({ ok: true, text: `${n} image${n === 1 ? "" : "s"} for “${r.query}”, each checked to load.${r.errors.length ? ` Not reached: ${r.errors.slice(0, 2).join("; ")}.` : ""}` })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const credit = value.credit ?? EMPTY_CREDIT
  const setCredit = (patch: Partial<CoverCredit>) => onChange({ ...value, credit: { ...credit, ...patch } })

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((c) => {
          const on = isChosen(c)
          return (
            <li key={c.kind === "generated" ? "generated" : c.url}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setOwn(false)
                  onChange({ url: c.kind === "generated" ? "" : c.url, kind: c.kind, credit: c.credit, alt: c.alt })
                }}
                className={cn(
                  "group relative flex w-full flex-col overflow-hidden rounded-xl border text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "border-ion ring-1 ring-ion" : "border-border hover:border-white/30"
                )}
              >
                <span className="relative block aspect-[16/9] w-full overflow-hidden bg-black">
                  {c.kind === "generated" ? (
                    <GeneratedCoverPreview title={title} category={category} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- candidates live on many hosts
                    <img src={c.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                  )}
                  {on && (
                    <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-ion text-ion-foreground">
                      <CheckIcon aria-hidden className="size-3.5" />
                    </span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5 p-2 text-xs">
                  <span className="font-medium">{KIND_LABEL[c.kind]}</span>
                  <span className="truncate text-muted-foreground">
                    {c.kind === "generated" ? "Drawn by the site" : [c.width && c.height ? `${c.width}×${c.height}` : "", c.credit?.license, c.credit?.creator].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="sr-only">{on ? "Chosen cover" : "Use this cover"}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {storyId ? (
        <form onSubmit={search} className="flex flex-wrap items-end gap-2">
          <Field className="min-w-[12rem] flex-1">
            <FieldLabel htmlFor="nr-cover-q" className="text-xs">
              Find more images
            </FieldLabel>
            <Input id="nr-cover-q" value={query} maxLength={60} onChange={(e) => setQuery(e.target.value)} placeholder="Plain words, e.g. data center, robot arm (empty: from the headline)" className="h-9" />
          </Field>
          <Button type="submit" size="sm" variant="outline" disabled={busy} className="h-9">
            <SearchIcon aria-hidden /> {busy ? "Searching…" : "Search"}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Save the draft once to search the sources and the free image libraries.</p>
      )}
      <StatusLine status={status} />

      <details open={own} onToggle={(e) => setOwn((e.target as HTMLDetailsElement).open)} className="rounded-xl border border-border bg-background/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">
          <ImageIcon aria-hidden className="mr-1.5 inline size-4 align-[-3px] text-ion" />
          Use an image of your own
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="nr-cover" className="text-xs">
              Image address
            </FieldLabel>
            <Input
              id="nr-cover"
              type="url"
              value={value.kind === "editor" || (value.url && !candidates.some((c) => c.url === value.url)) ? value.url : ""}
              onChange={(e) => onChange({ url: e.target.value, kind: "editor", credit: value.kind === "editor" ? value.credit : null, alt: value.alt })}
              placeholder="https://… an image you have the right to use"
              className="h-9"
            />
            <FieldDescription>Press images the publisher offers, your own photos, or free-licensed images with their credit below.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="nr-cr-who" className="text-xs">
              Credit: creator
            </FieldLabel>
            <Input id="nr-cr-who" value={credit.creator} maxLength={160} onChange={(e) => setCredit({ creator: e.target.value })} className="h-9" />
          </Field>
          <Field>
            <FieldLabel htmlFor="nr-cr-lic" className="text-xs">
              Licence
            </FieldLabel>
            <Input id="nr-cr-lic" value={credit.license} maxLength={60} onChange={(e) => setCredit({ license: e.target.value })} placeholder="CC BY 4.0, Press image…" className="h-9" />
          </Field>
          <Field>
            <FieldLabel htmlFor="nr-cr-lurl" className="text-xs">
              Licence link
            </FieldLabel>
            <Input id="nr-cr-lurl" type="url" value={credit.licenseUrl} onChange={(e) => setCredit({ licenseUrl: e.target.value })} placeholder="https://…" className="h-9" />
          </Field>
          <Field>
            <FieldLabel htmlFor="nr-cr-land" className="text-xs">
              Where it comes from
            </FieldLabel>
            <Input id="nr-cr-land" type="url" value={credit.landing} onChange={(e) => setCredit({ landing: e.target.value })} placeholder="https://… the image's page" className="h-9" />
          </Field>
        </div>
      </details>

      <Field>
        <FieldLabel htmlFor="nr-cover-alt" className="text-xs">
          Image description (alt text)
        </FieldLabel>
        <Input id="nr-cover-alt" value={value.alt} maxLength={300} onChange={(e) => onChange({ ...value, alt: e.target.value })} placeholder="What the image shows, for people who cannot see it" className="h-9" />
        <FieldDescription>
          <SparklesIcon aria-hidden className="mr-1 inline size-3 align-[-1px]" />
          Describe what is in the picture, not the story. Leave empty only for the generated cover.
        </FieldDescription>
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
