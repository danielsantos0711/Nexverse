"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useId, useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { BellIcon, CheckCircle2Icon, ImageUpIcon, LogOutIcon, KeyboardIcon, ShieldCheckIcon, SparklesIcon, Trash2Icon, UserIcon, type LucideIcon } from "lucide-react"
import { GlassKeys } from "@/components/glass/glass-keys"
import { saveShortcuts, useUiPrefs } from "@/components/settings/ui-prefs"
import { GO_KEYS } from "@/components/site/shortcuts"
import { toast } from "@/components/site/toaster"
import { InterestPicker } from "@/components/settings/interest-picker"
import { ProfileAvatar } from "@/components/settings/profile-avatar"
import { SecuritySection } from "@/components/settings/security-section"
import { ConfirmDialog, SignInPrompt, StudioHead } from "@/components/studio/ui"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { formatDate } from "@/lib/data"
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  canUploadAvatar,
  clearLocalData,
  handleAvailable,
  NOTIFY_OPTIONS,
  PROFILE_LIMITS,
  removeAvatar,
  requestAccountDeletion,
  updateProfile,
  uploadAvatar,
  useProfile,
  validateProfile,
  type NotifyKind,
  type Profile,
  type ProfileErrors,
} from "@/lib/profile"
import { signOut, useSession } from "@/lib/store"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "interests", label: "Interests", icon: SparklesIcon },
  { id: "notifications", label: "Notifications", icon: BellIcon },
  { id: "keyboard", label: "Keyboard", icon: KeyboardIcon },
  { id: "security", label: "Security", icon: ShieldCheckIcon },
  { id: "account", label: "Account", icon: LogOutIcon },
]

/** Settings: profile, interests, notification switches, sign-in security and the account itself. */
export function SettingsView() {
  const session = useSession()
  const { ready, profile, error } = useProfile()

  if (live && session.ready && !session.user) {
    return (
      <>
        <StudioHead title="Settings" lead="Your profile, what you are interested in and how Nexverse reaches you." />
        <SignInPrompt title="Sign in to change your settings" detail="Your profile, interests, notifications and sign-in security live here." next="/settings" />
      </>
    )
  }
  if (!ready || (live && !session.ready)) return <SettingsSkeleton />
  if (error || !profile) {
    return (
      <>
        <StudioHead title="Settings" />
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Your profile could not be loaded{error ? `: ${error}` : "."} Reload the page to try again.
        </p>
      </>
    )
  }
  return <Settings key={profile.id} profile={profile} user={session.user} />
}

function Settings({ profile, user }: { profile: Profile; user: User | null }) {
  const email = user?.email ?? null
  return (
    <>
      <StudioHead title="Settings" lead={profile.local ? "This copy of Nexverse has no database, so your settings are kept in this browser." : `Signed in as ${email ?? profile.name}.`} />
      <div className="grid grid-cols-1 gap-8 pb-16 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:sticky lg:top-20 lg:flex-col lg:self-start">
          {SECTIONS.filter((s) => s.id !== "security" || (user && !profile.local)).map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <s.icon aria-hidden className="size-4" /> {s.label}
            </a>
          ))}
          <Link href="/you" className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-ion hover:bg-secondary lg:mt-2">
            <Copy k="settings.settings-view.your-studio">Your page →</Copy>
          </Link>
        </nav>
        <div className="flex min-w-0 flex-col gap-8">
          <ProfileSection profile={profile} />
          <InterestsSection profile={profile} />
          <NotificationsSection profile={profile} />
          <KeyboardSection userId={profile.local ? null : (user?.id ?? null)} />
          {user && !profile.local && (
            <Section id="security" title="Security" lead="How you sign in, and the devices that are signed in.">
              <SecuritySection user={user} name={profile.name} />
            </Section>
          )}
          <AccountSection profile={profile} email={email} />
        </div>
      </div>
    </>
  )
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="glass scroll-mt-24 flex flex-col gap-5 rounded-2xl p-5 md:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-h`} className="text-base font-semibold">
          {title}
        </h2>
        {lead && <p className="text-sm text-muted-foreground">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

function Saved({ text }: { text: string }) {
  const reduce = useReducedMotion()
  return (
    <span role="status" aria-live="polite" className="min-h-5 text-sm">
      <AnimatePresence>
        {text && (
          <motion.span
            key={text}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn("inline-flex items-center gap-1.5", text.startsWith("Could not") ? "text-destructive" : "text-ok")}
          >
            {!text.startsWith("Could not") && <CheckCircle2Icon aria-hidden className="size-4" />} {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

// ─── Profile ────────────────────────────────────────────────────────────────────────────────────────────────

type ProfileForm = { name: string; handle: string; bio: string; website: string; github: string; location: string }
const formOf = (p: Profile): ProfileForm => ({ name: p.name, handle: p.handle ?? "", bio: p.bio, website: p.website, github: p.github, location: p.location })

function ProfileSection({ profile }: { profile: Profile }) {
  const [saved, setSaved] = useState<ProfileForm>(() => formOf(profile))
  const [form, setForm] = useState<ProfileForm>(saved)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  function set<K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setNote("")
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  async function checkHandle() {
    if (!form.handle || form.handle === saved.handle || errors.handle) return
    const e = validateProfile({ handle: form.handle })
    if (e.handle) return setErrors((x) => ({ ...x, handle: e.handle }))
    try {
      if (!(await handleAvailable(form.handle))) setErrors((x) => ({ ...x, handle: "That handle is taken. Try another one." }))
    } catch {}
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const patch = { ...form, name: form.name.trim(), github: form.github.trim().replace(/^@/, "") }
    const found = validateProfile(patch)
    setErrors(found)
    const first = (Object.keys(found) as (keyof ProfileErrors)[]).find((k) => found[k])
    if (first) {
      document.getElementById(`pf-${first}`)?.focus()
      return
    }
    setBusy(true)
    try {
      await updateProfile({ ...patch, handle: patch.handle || null })
      setSaved(patch)
      setForm(patch)
      setNote("Profile saved.")
    } catch (err) {
      const message = (err as Error).message
      if (/handle/i.test(message)) setErrors((x) => ({ ...x, handle: message }))
      else setNote(`Could not save: ${message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="profile" title="Profile" lead="How other members see you next to what you write and publish.">
      <AvatarField profile={profile} name={form.name} />
      <form onSubmit={save} noValidate>
        <FieldGroup>
          <div className="grid gap-6 md:grid-cols-2">
            <TextField id="pf-name" label="Display name" value={form.name} onChange={(v) => set("name", v)} error={errors.name} maxLength={PROFILE_LIMITS.name} autoComplete="name" />
            <Field data-invalid={errors.handle ? true : undefined}>
              <FieldLabel htmlFor="pf-handle"><Copy k="settings.settings-view.handle">Handle</Copy></FieldLabel>
              <div className="flex h-11 items-center rounded-lg border border-input bg-background/60 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20">
                <span aria-hidden className="pl-2.5 text-muted-foreground">
                  @
                </span>
                <input
                  id="pf-handle"
                  value={form.handle}
                  onChange={(e) => set("handle", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))}
                  onBlur={checkHandle}
                  autoComplete="username"
                  spellCheck={false}
                  placeholder="your_handle"
                  aria-invalid={errors.handle ? true : undefined}
                  aria-describedby={errors.handle ? "pf-handle-error" : "pf-handle-hint"}
                  className="h-full min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
                />
              </div>
              {errors.handle ? <FieldError id="pf-handle-error">{errors.handle}</FieldError> : <FieldDescription id="pf-handle-hint"><Copy k="settings.settings-view.3-to-30-lowercase-letters">3 to 30 lowercase letters, numbers or underscores.</Copy></FieldDescription>}
            </Field>
          </div>
          <Field data-invalid={errors.bio ? true : undefined}>
            <div className="flex items-baseline justify-between gap-3">
              <FieldLabel htmlFor="pf-bio"><Copy k="settings.settings-view.bio">Bio</Copy></FieldLabel>
              <span className={cn("text-xs tabular", form.bio.length > PROFILE_LIMITS.bio ? "text-destructive" : "text-muted-foreground")}>
                {form.bio.length}/{PROFILE_LIMITS.bio}
              </span>
            </div>
            <Textarea
              id="pf-bio"
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
              maxLength={PROFILE_LIMITS.bio + 50}
              rows={3}
              placeholder="What you work on, in a sentence or two."
              aria-invalid={errors.bio ? true : undefined}
              aria-describedby={errors.bio ? "pf-bio-error" : undefined}
              className="bg-background/60"
            />
            {errors.bio && <FieldError id="pf-bio-error">{errors.bio}</FieldError>}
          </Field>
          <div className="grid gap-6 md:grid-cols-3">
            <TextField id="pf-website" label="Website" type="url" value={form.website} onChange={(v) => set("website", v)} error={errors.website} placeholder="https://" maxLength={PROFILE_LIMITS.website} autoComplete="url" />
            <TextField id="pf-github" label="GitHub username" value={form.github} onChange={(v) => set("github", v)} error={errors.github} placeholder="octocat" maxLength={40} autoComplete="off" />
            <TextField id="pf-location" label="Location" value={form.location} onChange={(v) => set("location", v)} error={errors.location} placeholder="Lisbon" maxLength={PROFILE_LIMITS.location} autoComplete="address-level2" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !dirty}>
              {busy ? "Saving…" : <Copy k="settings.settings-view.save-profile">Save profile</Copy>}
            </Button>
            {dirty && !busy && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setForm(saved)
                  setErrors({})
                }}
              >
                <Copy k="settings.settings-view.discard-changes">Discard changes</Copy>
              </Button>
            )}
            <Saved text={note} />
          </div>
        </FieldGroup>
      </form>
    </Section>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  maxLength,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  type?: string
  placeholder?: string
  maxLength?: number
  autoComplete?: string
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 bg-background/60"
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}

function AvatarField({ profile, name }: { profile: Profile; name: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null)
  const [note, setNote] = useState("")
  const [preview, setPreview] = useState<string | null>(null)
  const hint = useId()
  const uploads = canUploadAvatar() && !profile.local

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  async function pick(file: File | undefined) {
    if (!file) return
    if (!AVATAR_TYPES.includes(file.type)) return setNote("Could not use that file: pick a PNG, JPEG, WebP or GIF image.")
    if (file.size > AVATAR_MAX_BYTES) return setNote("Could not use that file: it is over 2 MB.")
    setPreview(URL.createObjectURL(file))
    setBusy("upload")
    setNote("")
    try {
      await uploadAvatar(file)
      setNote("Picture updated.")
    } catch (e) {
      setNote(`Could not upload: ${(e as Error).message}`)
    } finally {
      setPreview(null)
      setBusy(null)
      if (input.current) input.current.value = ""
    }
  }

  async function clear() {
    setBusy("remove")
    setNote("")
    try {
      await removeAvatar()
      setNote("Picture removed.")
    } catch (e) {
      setNote(`Could not remove: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview of the file being uploaded
          <img src={preview} alt="" width={72} height={72} className="size-[72px] rounded-full object-cover opacity-70 ring-1 ring-white/15" />
        ) : (
          <ProfileAvatar name={name || profile.name} seed={profile.id} url={profile.avatarUrl} size={72} />
        )}
        {busy === "upload" && <span aria-hidden className="absolute inset-0 animate-pulse rounded-full ring-2 ring-ion motion-reduce:animate-none" />}
      </div>
      <div className="flex flex-col gap-2">
        {uploads ? (
          <>
            <div className="flex flex-wrap gap-2">
              <input ref={input} type="file" accept={AVATAR_TYPES.join(",")} className="sr-only" id="pf-avatar" aria-describedby={hint} onChange={(e) => pick(e.target.files?.[0])} />
              <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={busy !== null}>
                <ImageUpIcon aria-hidden /> {busy === "upload" ? "Uploading…" : profile.avatarUrl ? "Change picture" : "Upload a picture"}
              </Button>
              {profile.avatarUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={busy !== null}>
                  {busy === "remove" ? "Removing…" : "Remove"}
                </Button>
              )}
            </div>
            <p id={hint} className="text-xs text-muted-foreground">
              <Copy k="settings.settings-view.png-jpeg-webp-or-gif">PNG, JPEG, WebP or GIF, up to 2 MB. Without one, your initials stand in.</Copy>
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground"><Copy k="settings.settings-view.your-picture-is-drawn-from" multiline>Your picture is drawn from your initials. Uploading one needs a database connected to this copy of Nexverse.</Copy></p>
        )}
        <Saved text={note} />
      </div>
    </div>
  )
}

// ─── Interests ──────────────────────────────────────────────────────────────────────────────────────────────

function InterestsSection({ profile }: { profile: Profile }) {
  const [saved, setSaved] = useState(profile.interests)
  const [value, setValue] = useState(profile.interests)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const dirty = [...value].sort().join() !== [...saved].sort().join()

  async function save() {
    setBusy(true)
    setNote("")
    try {
      await updateProfile({ interests: value })
      setSaved(value)
      setNote("Interests saved.")
    } catch (e) {
      setNote(`Could not save: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="interests" title="Interests" lead="What you care about. It shapes For you and what Nexverse suggests.">
      <InterestPicker
        value={value}
        onChange={(v) => {
          setValue(v)
          setNote("")
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : <Copy k="settings.settings-view.save-interests">Save interests</Copy>}
        </Button>
        <span className="text-sm text-muted-foreground tabular">{value.length} picked</span>
        <Saved text={note} />
      </div>
    </Section>
  )
}

// ─── Notifications ──────────────────────────────────────────────────────────────────────────────────────────

function NotificationsSection({ profile }: { profile: Profile }) {
  const [prefs, setPrefs] = useState(profile.notify)
  const [note, setNote] = useState("")
  const off = profile.local

  async function toggle(kind: NotifyKind) {
    const before = prefs
    const next = { ...prefs, [kind]: !prefs[kind] }
    setPrefs(next)
    setNote("")
    try {
      await updateProfile({ notify: next })
      setNote("Saved.")
    } catch (e) {
      setPrefs(before)
      setNote(`Could not save: ${(e as Error).message}`)
    }
  }

  return (
    <Section id="notifications" title="Notifications" lead={off ? "Notifications need a database connected to this copy of Nexverse." : "Choose what reaches your bell. Changes save as you switch them."}>
      <ul className="flex flex-col divide-y divide-border">
        {NOTIFY_OPTIONS.filter((o) => o.kind !== "digest").map((o) => (
          <li key={o.kind} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-col">
              <span id={`nt-${o.kind}`} className="text-sm font-medium">
                {o.label}
              </span>
              <span id={`nt-${o.kind}-hint`} className="text-sm text-muted-foreground">
                {o.hint}
              </span>
            </div>
            <Switch on={prefs[o.kind]} onClick={() => toggle(o.kind)} disabled={off} labelledBy={`nt-${o.kind}`} describedBy={`nt-${o.kind}-hint`} />
          </li>
        ))}
      </ul>
      <Saved text={note} />
    </Section>
  )
}

// ─── Keyboard ───────────────────────────────────────────────────────────────────────────────────────────────

/*
 * Round 12b: how Nexverse looks and moves (scrolling, motion, background, stars, header, accent colour) is set by
 * the admins for everyone, so members have no look settings here. The one personal choice left is single-key
 * shortcuts. A device's own reduced-motion setting is always respected.
 */
function KeyboardSection({ userId }: { userId: string | null }) {
  const p = useUiPrefs()
  async function toggle() {
    try {
      await saveShortcuts(!p.shortcuts, userId)
      toast(userId ? "Saved to your account." : "Saved in this browser.")
    } catch (e) {
      toast((e as Error).message, { tone: "error" })
    }
  }
  return (
    <Section id="keyboard" title="Keyboard" lead="The look of Nexverse is the same for everyone. If your device asks for reduced motion, Nexverse moves less for you.">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span id="ux-keys" className="text-sm font-medium">Keyboard shortcuts</span>
          <span id="ux-keys-hint" className="text-sm text-muted-foreground">Single keys anywhere: / search, C create, J and K move through lists, G then a letter to jump.</span>
        </div>
        <Switch on={p.shortcuts} onClick={() => void toggle()} labelledBy="ux-keys" describedBy="ux-keys-hint" />
      </div>
      {p.shortcuts && (
        <ul className="nx-fade grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GO_KEYS.map((k) => (
            <li key={k.key} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs text-muted-foreground">
              <GlassKeys keys={["G", k.key.toUpperCase()]} live={false} /> {k.label}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Switch({ on, onClick, disabled, labelledBy, describedBy }: { on: boolean; onClick: () => void; disabled?: boolean; labelledBy: string; describedBy: string }) {
  const reduce = useReducedMotion()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
        on ? "justify-end border-ion/60 bg-ion" : "justify-start border-border bg-secondary"
      )}
    >
      <motion.span layout={!reduce} transition={{ type: "spring", stiffness: 600, damping: 34 }} className={cn("block size-[18px] rounded-full shadow", on ? "bg-ion-foreground" : "bg-muted-foreground")} />
    </button>
  )
}

// ─── Account ────────────────────────────────────────────────────────────────────────────────────────────────

function AccountSection({ profile, email }: { profile: Profile; email: string | null }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState<"delete" | "clear" | null>(null)
  const [requested, setRequested] = useState(profile.deletionRequestedAt)
  const [note, setNote] = useState("")
  const [signingOut, setSigningOut] = useState(false)

  async function out() {
    setSigningOut(true)
    try {
      await signOut()
      router.push("/")
    } catch (e) {
      setNote(`Could not sign out: ${(e as Error).message}`)
      setSigningOut(false)
    }
  }

  async function withdraw() {
    try {
      setRequested(await requestAccountDeletion(false))
      setNote("Deletion request withdrawn.")
    } catch (e) {
      setNote(`Could not withdraw: ${(e as Error).message}`)
    }
  }

  if (profile.local) {
    return (
      <Section id="account" title="Data on this device" lead="Without a database there is no account. Everything you made is kept in this browser.">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground"><Copy k="settings.settings-view.remove-your-local-projects-threads" multiline>Remove your local projects, threads, replies, bookmarks, likes and profile from this browser.</Copy></p>
          <Button variant="destructive" onClick={() => setConfirm("clear")}>
            <Trash2Icon aria-hidden /> <Copy k="settings.settings-view.clear-this-browser">Clear this browser</Copy>
          </Button>
        </div>
        <Saved text={note} />
        <ConfirmDialog
          open={confirm === "clear"}
          onOpenChange={(o) => !o && setConfirm(null)}
          title="Clear everything on this device?"
          description="Your local projects, threads, replies, bookmarks, likes and profile are removed from this browser. This cannot be undone."
          confirm="Clear this browser"
          onConfirm={() => {
            clearLocalData()
            setNote("This browser is clear.")
          }}
        />
      </Section>
    )
  }

  return (
    <Section id="account" title="Account" lead={email ? `You sign in with ${email}.` : undefined}>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground"><Copy k="settings.settings-view.sign-out-on-this-device">Sign out on this device. Your work stays in your account.</Copy></p>
        <Button variant="secondary" onClick={out} disabled={signingOut}>
          <LogOutIcon aria-hidden /> {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <h3 className="text-sm font-medium"><Copy k="settings.settings-view.delete-your-account">Delete your account</Copy></h3>
        {requested ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              You asked for your account to be deleted on {formatDate(requested)}. The Nexverse team will remove it and everything you wrote. Changed your mind before then?
            </p>
            <Button variant="secondary" size="sm" onClick={withdraw}>
              <Copy k="settings.settings-view.keep-my-account">Keep my account</Copy>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground"><Copy k="settings.settings-view.the-nexverse-team-removes-your" multiline>The Nexverse team removes your profile, projects, threads, replies, likes, follows and pictures. You can withdraw the request until it is done.</Copy></p>
            <Button variant="destructive" onClick={() => setConfirm("delete")}>
              <Trash2Icon aria-hidden /> <Copy k="settings.settings-view.request-deletion">Request deletion</Copy>
            </Button>
          </div>
        )}
      </div>
      <Saved text={note} />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete your account?"
        description="The Nexverse team will delete your account and everything you wrote. Until it is done you can come back here and keep it."
        confirm="Request deletion"
        onConfirm={async () => {
          setRequested(await requestAccountDeletion(true))
          setNote("Deletion requested.")
        }}
      />
    </Section>
  )
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6 pt-10" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  )
}
