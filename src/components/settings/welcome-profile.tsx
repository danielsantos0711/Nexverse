"use client"

import { useEffect, useRef, useState } from "react"
import { CheckIcon, ImageUpIcon, LoaderIcon, XIcon } from "lucide-react"
import { ProfileAvatar } from "@/components/settings/profile-avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AVATAR_MAX_BYTES, AVATAR_TYPES, canUploadAvatar, HANDLE, handleAvailable, PROFILE_LIMITS, uploadAvatar, type Profile } from "@/lib/profile"
import { cn } from "@/lib/utils"

export type ProfileDraft = { name: string; handle: string; bio: string }
export type HandleState = "idle" | "checking" | "free" | "taken" | "invalid" | "error"

/** A handle made from a name: "Ada Lovelace" becomes "ada_lovelace". */
export function suggestHandle(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30)
}

/**
 * Whether a handle is free, checked as you type (after a short pause). Your own current handle counts as
 * free. The database's unique index is the final word when the profile is saved.
 */
export function useHandleCheck(handle: string, current: string | null): HandleState {
  const [result, setResult] = useState<{ handle: string; state: HandleState }>({ handle: "", state: "idle" })
  const valid = HANDLE.test(handle)
  const mine = Boolean(current) && handle === current
  useEffect(() => {
    if (!handle || !valid || mine) return
    let stale = false
    const t = setTimeout(() => {
      handleAvailable(handle)
        .then((free) => !stale && setResult({ handle, state: free ? "free" : "taken" }))
        .catch(() => !stale && setResult({ handle, state: "error" }))
    }, 350)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [handle, valid, mine])
  if (!handle) return "idle"
  if (!valid) return "invalid"
  if (mine) return "free"
  return result.handle === handle ? result.state : "checking"
}

const HANDLE_TEXT: Record<HandleState, string> = {
  idle: "3 to 30 lowercase letters, numbers or underscores. Others can find you by it.",
  checking: "Checking…",
  free: "That handle is free.",
  taken: "That handle is taken. Try another one.",
  invalid: "Use 3 to 30 lowercase letters, numbers or underscores.",
  error: "We could not check it right now. It is checked again when you save.",
}

/** The first onboarding step: how other members will see you. Everything here is optional. */
export function WelcomeProfile({ profile, draft, onChange, handleState }: { profile: Profile; draft: ProfileDraft; onChange: (d: ProfileDraft) => void; handleState: HandleState }) {
  const bad = handleState === "taken" || handleState === "invalid"
  return (
    <div className="flex flex-col gap-6">
      <AvatarPicker profile={profile} name={draft.name} />
      <FieldGroup className="gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="wl-name">Display name</FieldLabel>
            <Input id="wl-name" autoComplete="name" value={draft.name} maxLength={PROFILE_LIMITS.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} className="h-11 bg-background/60" />
          </Field>
          <Field data-invalid={bad || undefined}>
            <FieldLabel htmlFor="wl-handle">Handle</FieldLabel>
            <div className="flex h-11 items-center rounded-lg border border-input bg-background/60 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:bg-input/30">
              <span aria-hidden className="pl-3 text-muted-foreground">
                @
              </span>
              <input
                id="wl-handle"
                value={draft.handle}
                onChange={(e) => onChange({ ...draft, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30) })}
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="none"
                aria-invalid={bad || undefined}
                aria-describedby="wl-handle-status"
                className="h-full min-w-0 flex-1 bg-transparent px-1 text-base outline-none md:text-sm"
              />
              <span aria-hidden className="pr-3">
                {handleState === "checking" && <LoaderIcon className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" />}
                {handleState === "free" && <CheckIcon className="size-4 text-ok" />}
                {bad && <XIcon className="size-4 text-destructive" />}
              </span>
            </div>
            {bad ? (
              <FieldError id="wl-handle-status">{HANDLE_TEXT[handleState]}</FieldError>
            ) : (
              <FieldDescription id="wl-handle-status" aria-live="polite" className={cn(handleState === "free" && "text-ok")}>
                {HANDLE_TEXT[handleState]}
              </FieldDescription>
            )}
          </Field>
        </div>
        <Field>
          <div className="flex items-baseline justify-between gap-3">
            <FieldLabel htmlFor="wl-bio">Short bio</FieldLabel>
            <span className={cn("text-xs tabular", draft.bio.length > PROFILE_LIMITS.bio ? "text-destructive" : "text-muted-foreground")}>
              {draft.bio.length}/{PROFILE_LIMITS.bio}
            </span>
          </div>
          <Textarea id="wl-bio" value={draft.bio} rows={3} maxLength={PROFILE_LIMITS.bio} placeholder="What you work on, in a sentence or two." onChange={(e) => onChange({ ...draft, bio: e.target.value })} className="bg-background/60" />
        </Field>
      </FieldGroup>
    </div>
  )
}

/** Upload or change the picture right away; the rest of the step saves when you continue. */
function AvatarPicker({ profile, name }: { profile: Profile; name: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [url, setUrl] = useState(profile.avatarUrl)
  const uploads = canUploadAvatar() && !profile.local

  async function pick(file: File | undefined) {
    if (!file) return
    if (!AVATAR_TYPES.includes(file.type)) return setNote("Pick a PNG, JPEG, WebP or GIF image.")
    if (file.size > AVATAR_MAX_BYTES) return setNote("That image is over 2 MB.")
    setBusy(true)
    setNote("")
    try {
      setUrl(await uploadAvatar(file))
      setNote("Picture saved.")
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <ProfileAvatar name={name || profile.name} seed={profile.id} url={url} size={72} />
        {busy && <span aria-hidden className="absolute inset-0 animate-pulse rounded-full ring-2 ring-ion motion-reduce:animate-none" />}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        {uploads ? (
          <>
            <input ref={input} id="wl-avatar" type="file" accept={AVATAR_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
            <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={busy}>
              <ImageUpIcon aria-hidden /> {busy ? "Uploading…" : url ? "Change picture" : "Add a picture"}
            </Button>
            <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF, up to 2 MB. Without one, your initials stand in.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Your initials stand in for a picture. Uploading one needs a database connected to this copy of Nexverse.</p>
        )}
        {note && (
          <p role="status" className="text-xs text-muted-foreground">
            {note}
          </p>
        )}
      </div>
    </div>
  )
}
