"use client"

import { useEffect, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { AdminHeading, ChoiceCards, Notice, StatusLine, SwitchRow, when } from "@/components/admin/controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useCaps } from "@/lib/caps"
import {
  COVER_SOURCES,
  DEFAULT_SECTIONS,
  DEPTH_WORDS,
  DEPTHS,
  listRuns,
  loadNewsroomSettings,
  NEWS_CATEGORIES,
  readNewsroomSettings,
  refreshPublicNews,
  saveNewsroomSettings,
  TONES,
  type NewsroomSettings,
  type Run,
} from "@/lib/newsroom"
import { cn } from "@/lib/utils"

const RUN_TONE: Record<Run["status"], string> = { ok: "text-ok", partial: "text-gold", failed: "text-destructive", running: "text-ion" }
const RUN_LABEL: Record<Run["status"], string> = { ok: "Done", partial: "Done, with errors", failed: "Failed", running: "Running or stopped" }
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const move = <T,>(list: T[], i: number, by: number) => {
  const j = i + by
  if (j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div id={id}>
        <AdminHeading title={title} lead={lead} />
      </div>
      {children}
    </section>
  )
}

function OrderButtons({ label, i, n, onMove, disabled }: { label: string; i: number; n: number; onMove: (by: number) => void; disabled?: boolean }) {
  return (
    <span className="flex shrink-0 gap-1">
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${label} up`} disabled={disabled || i === 0} onClick={() => onMove(-1)}>
        <ArrowUpIcon aria-hidden />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${label} down`} disabled={disabled || i === n - 1} onClick={() => onMove(1)}>
        <ArrowDownIcon aria-hidden />
      </Button>
    </span>
  )
}

/**
 * Everything the newsroom does, in the editors' hands: how deep and long the AI researches and writes, the
 * sections and tone, the categories readers see, when the daily run writes, what is published without
 * review, where covers come from, and the log of what the last runs did.
 */
export function NewsroomSettingsPanel() {
  const caps = useCaps()
  const canEdit = caps.can("news.publish")
  const [s, setS] = useState<NewsroomSettings | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState<{ runs: Run[]; error: string | null } | null>(null)

  useEffect(() => {
    let on = true
    void loadNewsroomSettings().then((v) => on && setS(v))
    void listRuns().then((r) => on && setRuns(r))
    return () => {
      on = false
    }
  }, [])

  async function save() {
    if (!s) return
    setBusy(true)
    setStatus(null)
    try {
      const clean = readNewsroomSettings(s)
      await saveNewsroomSettings(clean)
      setS(clean)
      refreshPublicNews()
      setStatus({ ok: true, text: "Saved. The next run and the news pages use these settings." })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const band = s ? DEPTH_WORDS[s.depth] : DEPTH_WORDS.deep

  return (
    <div className="flex flex-col gap-12">
      {!canEdit && <Notice title="Only editors with publishing rights change these">You can read them.</Notice>}
      {!s ? (
        <Skeleton className="h-[40rem] w-full rounded-2xl" />
      ) : (
        <fieldset disabled={!canEdit} className="flex flex-col gap-12">
          <Section id="nr-writing" title="Writing" lead="How much the AI reads and writes for each story. Deep stories cost three to five free AI calls each, short ones one.">
            <ChoiceCards
              name="nr-depth"
              label="Depth"
              value={s.depth}
              options={DEPTHS}
              onChange={(depth) => setS({ ...s, depth, targetWords: DEPTH_WORDS[depth].target })}
            />
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="nr-words">Target length: {s.targetWords} words</FieldLabel>
                <input
                  id="nr-words"
                  type="range"
                  min={band.min}
                  max={band.max}
                  step={50}
                  value={s.targetWords}
                  onChange={(e) => setS({ ...s, targetWords: Number(e.target.value) })}
                  className="h-2 w-full cursor-pointer accent-(--ion)"
                />
                <FieldDescription>
                  {band.min} to {band.max} words at this depth. About {Math.max(1, Math.round(s.targetWords / 230))} min to read.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="nr-deep-run">Researched stories per run</FieldLabel>
                <Input id="nr-deep-run" type="number" min={0} max={3} value={s.deepPerRun} onChange={(e) => setS({ ...s, deepPerRun: Number(e.target.value) })} className="h-10 w-28" />
                <FieldDescription>The first stories of each run get this depth; the rest are written short, to save the free AI quota.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="nr-related">Related official pages</FieldLabel>
                <Input id="nr-related" type="number" min={0} max={4} value={s.relatedSources} onChange={(e) => setS({ ...s, relatedSources: Number(e.target.value) })} className="h-10 w-28" />
                <FieldDescription>Read besides the main page: other reports of the same event, the docs, the GitHub release, the paper.</FieldDescription>
              </Field>
            </div>
            <SwitchRow
              id="nr-check"
              label="Fact-check every story in a second pass"
              description="Reads the draft against the quoted source passages and removes anything they do not support. One more AI call per story."
              checked={s.factCheck}
              onChange={(factCheck) => setS({ ...s, factCheck })}
            />
            <ChoiceCards name="nr-tone" label="Tone" value={s.tone} options={TONES} onChange={(tone) => setS({ ...s, tone })} columns={2} />
            <Field>
              <FieldLabel htmlFor="nr-style">House style note</FieldLabel>
              <Textarea id="nr-style" rows={3} maxLength={400} value={s.styleNote} onChange={(e) => setS({ ...s, styleNote: e.target.value })} placeholder="For example: spell out acronyms the first time; prefer British spelling; end the builders section with concrete next steps." />
              <FieldDescription>Given to the writer with every story. {400 - s.styleNote.length} characters left.</FieldDescription>
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Sections of a researched story</legend>
              <p className="-mt-1 text-sm text-muted-foreground">In order. The AI leaves a section out when the sources have nothing for it, and never invents material to fill one.</p>
              <ol className="flex flex-col gap-2">
                {s.sections.map((h, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-5 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <Input aria-label={`Section ${i + 1}`} value={h} maxLength={60} onChange={(e) => setS({ ...s, sections: s.sections.map((x, j) => (j === i ? e.target.value : x)) })} className="h-9" />
                    <OrderButtons label={h || `section ${i + 1}`} i={i} n={s.sections.length} onMove={(by) => setS({ ...s, sections: move(s.sections, i, by) })} />
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${h || `section ${i + 1}`}`} disabled={s.sections.length <= 2} onClick={() => setS({ ...s, sections: s.sections.filter((_, j) => j !== i) })}>
                      <Trash2Icon aria-hidden />
                    </Button>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                {s.sections.length < 8 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setS({ ...s, sections: [...s.sections, ""] })}>
                    <PlusIcon aria-hidden /> Add a section
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => setS({ ...s, sections: DEFAULT_SECTIONS })}>
                  <RotateCcwIcon aria-hidden /> Default sections
                </Button>
              </div>
            </fieldset>
          </Section>

          <Section id="nr-cats" title="Categories" lead="The six kinds of story the newsroom files. Rename them, describe them, order the tabs on /news, or hide a tab. Rumours stay labelled unconfirmed whatever they are called.">
            <ol className="flex flex-col gap-3">
              {s.categories.map((c, i) => (
                <li key={c.id} className={cn("grid gap-3 rounded-2xl border border-border bg-card/40 p-4 md:grid-cols-[10rem_8rem_minmax(0,1fr)_auto]", c.hidden && "opacity-60")}>
                  <Field>
                    <FieldLabel htmlFor={`nr-cat-l-${c.id}`} className="text-xs">
                      Tab name
                    </FieldLabel>
                    <Input id={`nr-cat-l-${c.id}`} value={c.label} maxLength={40} onChange={(e) => setS({ ...s, categories: s.categories.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)) })} className="h-9" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`nr-cat-o-${c.id}`} className="text-xs">
                      On a story
                    </FieldLabel>
                    <Input id={`nr-cat-o-${c.id}`} value={c.one} maxLength={30} onChange={(e) => setS({ ...s, categories: s.categories.map((x) => (x.id === c.id ? { ...x, one: e.target.value } : x)) })} className="h-9" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`nr-cat-b-${c.id}`} className="text-xs">
                      Description
                    </FieldLabel>
                    <Input id={`nr-cat-b-${c.id}`} value={c.blurb} maxLength={200} onChange={(e) => setS({ ...s, categories: s.categories.map((x) => (x.id === c.id ? { ...x, blurb: e.target.value } : x)) })} className="h-9" />
                  </Field>
                  <div className="flex items-end gap-1">
                    <OrderButtons label={c.label} i={i} n={s.categories.length} onMove={(by) => setS({ ...s, categories: move(s.categories, i, by) })} />
                    <Button type="button" size="sm" variant="ghost" aria-pressed={c.hidden} onClick={() => setS({ ...s, categories: s.categories.map((x) => (x.id === c.id ? { ...x, hidden: !x.hidden } : x)) })}>
                      {c.hidden ? "Show tab" : "Hide tab"}
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => setS({ ...s, categories: NEWS_CATEGORIES.map((c) => ({ id: c.id, label: c.label, one: c.one, blurb: c.blurb, hidden: false })) })}
            >
              <RotateCcwIcon aria-hidden /> Default names
            </Button>
          </Section>

          <Section id="nr-schedule" title="Schedule" lead="The daily run starts at 07:00 UTC. It always collects signals; on the days below it also writes stories. Collect now works any day.">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Writing days</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => {
                  const on = s.days.includes(i)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setS({ ...s, days: on ? s.days.filter((x) => x !== i) : [...s.days, i].sort() })}
                      className={cn(
                        "pressable h-9 min-w-14 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
                        on ? "border-ion/60 bg-ion/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nr-cap">AI stories per day</FieldLabel>
                <Input id="nr-cap" type="number" min={0} max={30} value={s.dailyCap} onChange={(e) => setS({ ...s, dailyCap: Number(e.target.value) })} className="h-10 w-28" />
                <FieldDescription>Drafts included, counted per UTC day. 0 collects signals but writes nothing.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="nr-run">Stories per run</FieldLabel>
                <Input id="nr-run" type="number" min={1} max={6} value={s.perRun} onChange={(e) => setS({ ...s, perRun: Number(e.target.value) })} className="h-10 w-28" />
                <FieldDescription>Keeps one run inside the server&apos;s five-minute limit.</FieldDescription>
              </Field>
            </div>
            <SwitchRow id="nr-paused" label="Pause the daily run" description="The cron skips its run entirely. Collect now still works." checked={s.paused} onChange={(paused) => setS({ ...s, paused })} />
          </Section>

          <Section id="nr-publish" title="Review and publishing" lead="Every AI story waits for an editor unless you switch auto-publish on for its category. Rumours and leaks are always reviewed.">
            <SwitchRow
              id="nr-needs-check"
              label="Auto-publish only fact-checked stories"
              description="Stories whose second-pass check did not run (short ones, or when it failed) wait for an editor even in auto-publish categories."
              checked={s.autoPublishNeedsCheck}
              onChange={(autoPublishNeedsCheck) => setS({ ...s, autoPublishNeedsCheck })}
            />
            {s.categories.map((c) =>
              c.id === "rumor" ? (
                <SwitchRow key={c.id} id="ap-rumor" label={`Auto-publish ${c.label.toLowerCase()}`} description="Always off: an editor checks every rumour and leak before it goes out." checked={false} onChange={() => {}} disabled />
              ) : (
                <SwitchRow
                  key={c.id}
                  id={`ap-${c.id}`}
                  label={`Auto-publish ${c.label.toLowerCase()}`}
                  description={c.blurb}
                  checked={s.autoPublish[c.id]}
                  onChange={(on) => setS({ ...s, autoPublish: { ...s.autoPublish, [c.id]: on } })}
                />
              )
            )}
          </Section>

          <Section id="nr-covers" title="Covers" lead="Where the finder looks for a story's cover, in this order. Every image is fetched to prove it loads and to measure it. The generated Nexverse cover is always the last resort.">
            <ol className="flex flex-col gap-2">
              {s.cover.order.map((t, i) => {
                const info = COVER_SOURCES.find((x) => x.id === t)!
                const fixed = t === "generated"
                return (
                  <li key={t} className="flex items-center gap-3 rounded-xl border border-border bg-card/50 px-4 py-3">
                    <span className="w-5 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{info.label}</span>
                      <span className="text-sm text-muted-foreground">{info.blurb}</span>
                    </span>
                    {!fixed && (
                      <>
                        <OrderButtons label={info.label} i={i} n={s.cover.order.length - 1} onMove={(by) => setS({ ...s, cover: { ...s.cover, order: [...move(s.cover.order.slice(0, -1), i, by), "generated"] } })} />
                        <Button type="button" size="sm" variant="ghost" onClick={() => setS({ ...s, cover: { ...s.cover, order: s.cover.order.filter((x) => x !== t) } })}>
                          Skip
                        </Button>
                      </>
                    )}
                    {fixed && <Badge variant="outline">Always last</Badge>}
                  </li>
                )
              })}
            </ol>
            {COVER_SOURCES.filter((c) => c.id !== "generated" && !s.cover.order.includes(c.id)).map((c) => (
              <Button key={c.id} type="button" size="sm" variant="outline" className="self-start" onClick={() => setS({ ...s, cover: { ...s.cover, order: [...s.cover.order.slice(0, -1), c.id, "generated"] } })}>
                <PlusIcon aria-hidden /> Use {c.label.toLowerCase()} again
              </Button>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="nr-minw">Sharp from: {s.cover.minWidth} px wide</FieldLabel>
                <input id="nr-minw" type="range" min={600} max={2000} step={100} value={s.cover.minWidth} onChange={(e) => setS({ ...s, cover: { ...s.cover, minWidth: Number(e.target.value) } })} className="h-2 w-full cursor-pointer accent-(--ion)" />
                <FieldDescription>Images at least this wide win. Below 600 px an image is never used.</FieldDescription>
              </Field>
              <SwitchRow id="nr-wide" label="Prefer wide images" description="16:9 to 2:1 over square and tall pictures (logos, portraits)." checked={s.cover.preferWide} onChange={(preferWide) => setS({ ...s, cover: { ...s.cover, preferWide } })} />
            </div>
          </Section>
        </fieldset>
      )}

      {s && canEdit && (
        <div className="liquid-glass sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
          <StatusLine status={status} />
        </div>
      )}

      <Section id="nr-runs" title="Recent runs" lead="The daily run and every Collect now: what was checked, collected and written, and what went wrong.">
        {!runs ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : runs.error ? (
          <Notice tone="warn" title="The run log could not load">
            {runs.error}
          </Notice>
        ) : !runs.runs.length ? (
          <p className="rounded-xl border border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">No runs yet. Press Collect now, or wait for the daily run.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {runs.runs.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card/50 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={cn("font-medium", RUN_TONE[r.status])}>{RUN_LABEL[r.status]}</span>
                  <Badge variant="outline">{r.trigger === "cron" ? "Daily run" : `Collect now${r.actor ? ` by ${r.actor.name}` : ""}`}</Badge>
                  <span className="text-muted-foreground">{when(r.startedAt)}</span>
                </div>
                <p className="text-muted-foreground">
                  {r.sourcesChecked} sources checked · {r.signalsNew} new signals · {r.drafts} drafts · {r.published} published{r.deep ? ` · ${r.deep} researched` : ""}
                  {r.rejected ? ` · ${r.rejected} not saved` : ""}
                </p>
                {r.note && <p>{r.note}</p>}
                {r.errors.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      {r.errors.length} problem{r.errors.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {r.errors.map((e, i) => (
                        <li key={i}>
                          <span className="font-medium">{e.where}:</span> <span className="text-muted-foreground">{e.error}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}
