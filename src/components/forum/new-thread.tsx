"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { BarChart3Icon, LockIcon, XIcon } from "lucide-react"
import { CategoryIcon } from "@/components/forum/category-icon"
import { AiAssistButton } from "@/components/ai/ai-assist-button"
import { MarkdownComposer } from "@/components/forum/markdown-composer"
import { Gate } from "@/components/moderation/gate"
import { PollBuilder } from "@/components/forum/poll"
import { TagInput } from "@/components/forum/tags"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createThread, mentionedMemberIds, normalizeTag, validatePoll, validateThread, type MentionCandidate, type NewPoll } from "@/lib/community"
import { useCaps } from "@/lib/caps"
import { LANGUAGES, type LanguageCode } from "@/lib/data"
import { findCategory, myReputation, postBlock, postBlockText, useForumMap, visibleGroups } from "@/lib/forum-categories"
import { useRole } from "@/lib/roles"
import { useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const EMPTY_POLL: NewPoll = { prompt: "", options: ["", ""], multi: false }

/** Start a forum thread in any language, with Markdown, tags, @mentions and an optional poll. Members only. */
export function NewThread() {
  return (
    <Gate cap="thread.create" action="start a thread">
      <NewThreadForm />
    </Gate>
  )
}

function NewThreadForm() {
  const params = useSearchParams()
  const router = useRouter()
  const reduce = useReducedMotion()
  const { ready, user } = useSession()
  const { isStaff } = useRole()
  const caps = useCaps()
  const map = useForumMap()
  const groups = visibleGroups(map)
  const needsRep = map.categories.some((c) => c.minReputation > 0)
  const [reputation, setReputation] = useState<number | null>(null)
  useEffect(() => {
    if (!needsRep || !user) return
    let on = true
    void myReputation(user.id).then((p) => on && setReputation(p))
    return () => {
      on = false
    }
  }, [needsRep, user])
  // Why a category takes no thread from you (archived, team only, reputation), or null when it does.
  const blockOf = (slug: string) => {
    const c = findCategory(map, slug)
    return c && live ? postBlock(c, { id: user?.id ?? null, isStaff, can: caps.can, reputation }) : c?.archived ? "archived" : null
  }
  const [title, setTitle] = useState((params.get("title") ?? "").slice(0, 300))
  const [body, setBody] = useState((params.get("body") ?? "").slice(0, 20000))
  // Old links may carry a first-version community slug; unknown ones fall back to Help.
  const asked = findCategory(map, params.get("c") ?? "")?.slug
  const [chosenSlug, setCat] = useState<string | null>(null)
  // Until you pick one: the category the link asked for, when you may post there, or Help.
  const cat = chosenSlug ?? (asked && !blockOf(asked) ? asked : (findCategory(map, "help")?.slug ?? map.categories.find((c) => !c.hidden && !blockOf(c.slug))?.slug ?? "help"))
  const chosen = findCategory(map, cat)
  const chosenBlock = blockOf(cat)
  const [lang, setLang] = useState<LanguageCode>("en")
  const [tags, setTags] = useState<string[]>(() => (params.get("tag") ? [normalizeTag(params.get("tag")!)].filter(Boolean) : []))
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [poll, setPoll] = useState<NewPoll | null>(null)
  const [errors, setErrors] = useState<{ title?: string; poll?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (busy) return
    if (chosenBlock && chosen) {
      setErrors({ form: postBlockText(chosenBlock, chosen) })
      return
    }
    const titleError = validateThread({ title, body, tags })
    const pollError = poll ? validatePoll(poll) : null
    setErrors({ title: titleError ?? undefined, poll: pollError ?? undefined })
    if (titleError || pollError) {
      document.getElementById(titleError ? "title" : "poll-section")?.focus()
      return
    }
    setBusy(true)
    try {
      const q = await createThread({ title: title.trim(), body: body.trim(), orbit: cat, lang, tags, mentions: mentionedMemberIds(body, picked) }, poll)
      router.push(`/forum/${q.id}`)
    } catch (err) {
      const threadId = (err as { threadId?: string }).threadId
      if (threadId) {
        router.push(`/forum/${threadId}`)
        return
      }
      setErrors({ form: (err as Error).message })
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-2xl p-5 md:p-7" noValidate>
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">Category</FieldLegend>
          <FieldDescription>Pick the closest fit. You can browse each category on the forum page first.</FieldDescription>
          <div className="flex flex-col gap-4">
            {groups.map(({ group: g, categories }) => (
              <div key={g.slug} role="radiogroup" aria-labelledby={`grp-${g.slug}`} className="flex flex-col gap-2">
                <p id={`grp-${g.slug}`} className="text-xs font-medium text-muted-foreground">
                  {g.name}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {categories.map((c) => {
                    const on = cat === c.slug
                    const block = blockOf(c.slug)
                    const closed = Boolean(block)
                    return (
                      <label
                        key={c.slug}
                        title={block ? postBlockText(block, c) : undefined}
                        className={cn(
                          "pressable flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                          closed ? "cursor-not-allowed border-border/60 text-muted-foreground/60" : "cursor-pointer",
                          on ? "border-ion/60 bg-ion/10 text-foreground" : !closed && "border-border bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"
                        )}
                      >
                        <input type="radio" name="cat" value={c.slug} checked={on} disabled={closed} onChange={() => setCat(c.slug)} className="sr-only" />
                        <CategoryIcon name={c.icon} className={cn("size-4 shrink-0", on ? "text-ion" : "text-muted-foreground")} />
                        <span className="truncate font-medium">{c.name}</span>
                        {closed && (
                          <>
                            <LockIcon aria-hidden className="ml-auto size-3.5 shrink-0" />
                            <span className="sr-only">({block === "staff" ? "team only" : block === "archived" ? "archived" : block === "reputation" ? `needs ${c.minReputation} reputation` : "closed to you"})</span>
                          </>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {chosen && (
            <p aria-live="polite" className="rounded-lg border border-ion/20 bg-ion/[0.06] px-3 py-2 text-sm">
              <span className="font-medium text-ion">{chosen.name}</span>
              <span className="text-muted-foreground"> · {map.groups.find((g) => g.slug === chosen.group)?.name}. </span>
              {chosenBlock ? postBlockText(chosenBlock, chosen) : chosen.blurb}
            </p>
          )}
        </FieldSet>

        <Field data-invalid={errors.title ? true : undefined}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="title">Title</FieldLabel>
            <AiAssistButton value={body} goals={["title"]} translate={false} onAccept={(t) => setTitle(t.slice(0, 300))} />
          </div>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            placeholder="What do you want to know, or show?"
            className="h-11 bg-background/60"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? "title-error" : undefined}
          />
          {errors.title && <FieldError id="title-error">{errors.title}</FieldError>}
        </Field>

        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="body">Details</FieldLabel>
            <AiAssistButton value={body} onAccept={(t) => setBody(t.slice(0, 20000))} />
          </div>
          <MarkdownComposer
            id="body"
            value={body}
            onChange={setBody}
            rows={8}
            placeholder="What you tried, what happened, links, numbers. Type @ to mention someone."
            onMention={(c) => setPicked((p) => (p.some((x) => x.key === c.key) ? p : [...p, c]))}
            onSubmit={() => void submit()}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="tags">Tags</FieldLabel>
          <TagInput id="tags" value={tags} onChange={setTags} describedBy="tags-help" />
          <FieldDescription id="tags-help">Up to 5. They help people find the thread later. Press Enter or comma after each one.</FieldDescription>
        </Field>

        <div id="poll-section" tabIndex={-1} className="flex flex-col gap-3 outline-none">
          {poll ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Poll</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => (setPoll(null), setErrors((x) => ({ ...x, poll: undefined })))}>
                <XIcon aria-hidden /> Remove poll
              </Button>
            </div>
          ) : (
            <Button type="button" variant="secondary" className="self-start" onClick={() => setPoll(EMPTY_POLL)}>
              <BarChart3Icon aria-hidden /> Add a poll
            </Button>
          )}
          <AnimatePresence initial={false}>
            {poll && (
              <motion.div
                key="poll"
                initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                className="overflow-hidden"
              >
                <PollBuilder value={poll} onChange={setPoll} error={errors.poll} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Field>
          <FieldLabel htmlFor="lang">Written in</FieldLabel>
          <select id="lang" value={lang} onChange={(e) => setLang(e.target.value as LanguageCode)} className="h-10 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs">
            {(Object.keys(LANGUAGES) as LanguageCode[]).map((l) => (
              <option key={l} value={l} className="bg-popover">
                {LANGUAGES[l].native} · {LANGUAGES[l].name}
              </option>
            ))}
          </select>
          <FieldDescription>Write in the language you think in. Readers can translate.</FieldDescription>
        </Field>

        {errors.form && <FieldError>{errors.form}</FieldError>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={busy || (live && !ready)}>
            {busy ? "Posting…" : "Post thread"}
          </Button>
          {!live && <span className="text-sm text-muted-foreground">This copy has no database, so the thread stays in this browser.</span>}
        </div>
      </FieldGroup>
    </form>
  )
}
