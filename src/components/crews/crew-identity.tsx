"use client"

import { useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react"
import { EmojiPicker } from "@/components/chat/emoji-picker"
import { CrewBanner } from "@/components/crews/crew-banner"
import { CrewEmblem } from "@/components/crews/emblem"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { HOME_LABEL, HOME_SECTIONS, homeOf, updateCrewIdentity, type Crew, type HomeSection } from "@/lib/crews"
import { imageProblem, uploadImage } from "@/lib/editor/media"
import { cn } from "@/lib/utils"

/** Accent colours that read well on the dark sky, as exact values (the database keeps a #hex). */
const ACCENTS = ["#8fb4ff", "#7cc7ff", "#5fd3c6", "#7ee0a1", "#ffd36b", "#ffb86b", "#ff8fb1", "#ff6b6b", "#b49cff", "#e2e8f0"]

/**
 * The crew's identity, for its captain and officers: a banner picture, an emoji sigil, an accent colour, a motto,
 * the crew code, and which sections its home shows in what order. Saved to the crew (row level security checks
 * that you are an officer); the banner goes to the public post-media storage under your own folder.
 */
export function CrewIdentity({ crew, onSaved }: { crew: Crew; onSaved: (c: Crew) => void }) {
  const [banner, setBanner] = useState(crew.banner)
  const [sigil, setSigil] = useState(crew.sigil ?? "")
  const [accent, setAccent] = useState<string | null>(crew.accent)
  const [motto, setMotto] = useState(crew.motto)
  const [rules, setRules] = useState(crew.rules)
  const [sections, setSections] = useState<HomeSection[]>(homeOf(crew))
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const tint = accent ?? undefined

  async function upload(f: File) {
    const problem = imageProblem(f)
    if (problem) return setError(problem)
    setUploading(true)
    setError("")
    try {
      setBanner(await uploadImage(f))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  function moveSection(s: HomeSection, by: number) {
    setSections((list) => {
      const i = list.indexOf(s)
      const j = i + by
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function save() {
    setBusy(true)
    setError("")
    setSaved(false)
    try {
      const c = await updateCrewIdentity(crew, { banner, sigil: sigil || null, accent, motto, rules, homeSections: sections })
      onSaved(c)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const hidden = HOME_SECTIONS.filter((s) => !sections.includes(s))

  return (
    <section aria-labelledby="crew-identity-h" className="flex flex-col gap-4">
      <h2 id="crew-identity-h" className="font-sans text-base font-semibold tracking-normal">
        Look and home
      </h2>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <CrewBanner banner={banner} tint={tint ?? "var(--ion)"} seed={crew.slug} className="h-32 sm:h-40">
          <div className="absolute right-2 bottom-2 flex gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => file.current?.click()} disabled={uploading}>
              {uploading ? <Loader2Icon aria-hidden className="animate-spin" /> : <ImagePlusIcon aria-hidden />} {banner ? "Change banner" : "Upload a banner"}
            </Button>
            {banner && (
              <Button size="icon-xs" variant="secondary" aria-label="Remove the banner" onClick={() => setBanner(null)}>
                <XIcon aria-hidden />
              </Button>
            )}
          </div>
        </CrewBanner>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ""
          }}
        />
        <div className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Sigil</span>
            <EmojiPicker
              side="bottom"
              align="start"
              label="Pick the crew's sigil"
              onPick={setSigil}
              trigger={
                <button type="button" aria-label="Pick the crew's sigil" className="grid size-12 place-items-center rounded-2xl border border-border bg-background/60 text-2xl hover:border-white/25">
                  {sigil || <CrewEmblem icon={crew.icon} color={crew.color} size={40} />}
                </button>
              }
            />
            {sigil && (
              <Button size="xs" variant="ghost" onClick={() => setSigil("")}>
                Use the emblem
              </Button>
            )}
          </div>
          <fieldset className="flex flex-wrap items-center gap-1.5">
            <legend className="sr-only">Accent colour</legend>
            <span aria-hidden className="mr-1 text-sm font-medium">
              Accent
            </span>
            <button
              type="button"
              aria-pressed={accent === null}
              onClick={() => setAccent(null)}
              className={cn("h-7 rounded-full border px-2.5 text-xs", accent === null ? "border-foreground" : "border-border text-muted-foreground")}
            >
              Crew colour
            </button>
            {ACCENTS.map((a) => (
              <button key={a} type="button" aria-label={a} aria-pressed={accent === a} onClick={() => setAccent(a)} className={cn("size-7 rounded-full ring-offset-2 ring-offset-card", accent === a && "ring-2 ring-foreground")} style={{ background: a }} />
            ))}
          </fieldset>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Motto
        <Input value={motto} maxLength={140} onChange={(e) => setMotto(e.target.value)} placeholder="Ship small, ship often." />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Crew code
        <Textarea value={rules} maxLength={2000} rows={4} onChange={(e) => setRules(e.target.value)} placeholder="How this crew works together: what to post where, how to ask for help, what is off limits." />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Home sections</legend>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {sections.map((s, i) => (
            <li key={s} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="w-5 text-xs text-muted-foreground tabular">{i + 1}</span>
              <span className="flex-1">{HOME_LABEL[s]}</span>
              <Button size="icon-xs" variant="ghost" aria-label={`Move ${HOME_LABEL[s]} up`} disabled={i === 0} onClick={() => moveSection(s, -1)}>
                <ArrowUpIcon aria-hidden />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`Move ${HOME_LABEL[s]} down`} disabled={i === sections.length - 1} onClick={() => moveSection(s, 1)}>
                <ArrowDownIcon aria-hidden />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`Hide ${HOME_LABEL[s]}`} disabled={sections.length === 1} onClick={() => setSections((l) => l.filter((x) => x !== s))}>
                <EyeOffIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        {hidden.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((s) => (
              <Button key={s} size="xs" variant="ghost" onClick={() => setSections((l) => [...l, s])}>
                <EyeIcon aria-hidden /> {HOME_LABEL[s]}
              </Button>
            ))}
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || uploading}>
          {busy ? "Saving…" : "Save the look"}
        </Button>
        {saved && (
          <span role="status" className="text-sm text-ok">
            Saved
          </span>
        )}
      </div>
    </section>
  )
}
