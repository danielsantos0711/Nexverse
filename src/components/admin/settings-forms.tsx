"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { ChoiceCards, Notice, SaveBar, Switch, SwitchRow } from "@/components/admin/controls"
import { AnnouncementLine } from "@/components/moderation/announcement-bar"
import { Gate } from "@/components/moderation/gate"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { moderationReady, NAV_LINKS } from "@/lib/admin"
import {
  accentColors,
  ACCENTS,
  ANNOUNCEMENT_TONES,
  BACKDROPS,
  contrast,
  FONT_SCALES,
  GLASS_LEVELS,
  HEX,
  RADII,
  DEFAULTS,
  FEATURES,
  featureForPath,
  HERO_EFFECTS,
  HOME_SECTIONS,
  isSafeHref,
  MOTION_LEVELS,
  orderedHomeSections,
  saveSiteSetting,
  useSiteSettings,
  type SettingKey,
  type SiteSettings,
} from "@/lib/site-settings"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type Errors = Record<string, string>
type Status = { ok: boolean; text: string } | null

// Whether saving can work here: a database, and the site_settings table on it. Checked once per visit.
let availability: Promise<{ ok: boolean; reason?: string }> | null = null
function useCanSave() {
  const [state, setState] = useState<{ ok: boolean; reason?: string } | null>(live ? null : { ok: false, reason: "browser" })
  useEffect(() => {
    if (!live) return
    availability ??= moderationReady()
    let on = true
    void availability.then((s) => on && setState(s))
    return () => {
      on = false
    }
  }, [])
  return state
}

function SaveNotice({ state }: { state: { ok: boolean; reason?: string } | null }) {
  if (!state || state.ok) return null
  if (state.reason === "browser") {
    return (
      <Notice tone="warn" title="Saving is off in a browser-only copy">
        These are the real forms, but site settings live in the database. Connect Supabase to save them.
      </Notice>
    )
  }
  if (state.reason === "schema") {
    return (
      <Notice tone="warn" title="The settings table is not on this database yet">
        Apply the migration 20261019070000_roles_admin.sql, then reload. Until then the site uses its defaults and nothing here can be saved.
      </Notice>
    )
  }
  return (
    <Notice tone="warn" title="Settings cannot be saved right now">
      {state.reason}
    </Notice>
  )
}

/** One settings section with its form. The frame shows its title, one line about it and the sibling tabs. */
export function SettingsSection({ section }: { section: SettingKey }) {
  const body = <SectionForm section={section} />
  return live ? (
    <Gate role="admin" action="change the site settings">
      {body}
    </Gate>
  ) : (
    body
  )
}

// Validation: each section returns field errors keyed by field name; an empty object means it can be saved.

const len = (s: string, max: number, label: string, min = 0): string | null =>
  s.trim().length < min ? (min === 1 ? `${label} cannot be empty.` : `${label} needs at least ${min} characters.`) : s.length > max ? `${label} can be at most ${max} characters.` : null

function collect(entries: [string, string | null][]): Errors {
  return Object.fromEntries(entries.filter((e): e is [string, string] => Boolean(e[1])))
}

const HREF_HELP = "A page on this site such as /forum, or a full https:// address."

const VALIDATE: { [K in SettingKey]: (v: SiteSettings[K]) => Errors } = {
  brand: (v) => collect([["name", len(v.name, 40, "The name", 1)], ["tagline", len(v.tagline, 80, "The tagline")], ["description", len(v.description, 240, "The description")]]),
  announcement: (v) =>
    collect([
      ["text", v.enabled && !v.text.trim() ? "Write the announcement, or switch it off." : len(v.text, 160, "The announcement")],
      ["href", v.href.trim() && !isSafeHref(v.href) ? `That link will not work. ${HREF_HELP}` : null],
    ]),
  theme: (v) =>
    collect([
      ["customAccent", v.accent === "custom" && !HEX.test(v.customAccent) ? "Write the colour as #rrggbb, for example #8fb4ff." : null],
      ["secondary", v.secondary && !HEX.test(v.secondary) ? "Write the colour as #rrggbb, or leave it empty." : null],
    ]),
  experience: () => ({}),
  hero: (v) =>
    collect([
      ["badge", len(v.badge, 80, "The badge")],
      ["title", len(v.title, 90, "The headline")],
      ["subtitle", len(v.subtitle, 220, "The subtitle")],
      ["primaryLabel", len(v.primaryLabel, 30, "The button label", 1)],
      ["primaryHref", !v.primaryHref.trim() ? "The button needs somewhere to go." : !isSafeHref(v.primaryHref) ? `That link will not work. ${HREF_HELP}` : null],
    ]),
  home: (v): Errors => (v.sections.some((s) => s.visible) ? {} : { sections: "Keep at least one section visible, or the home page is empty below the hero." }),
  nav: () => ({}),
  features: () => ({}),
  footer: (v) =>
    collect([
      ["note", len(v.note, 200, "The note")],
      ...v.links.flatMap((l, i): [string, string | null][] => [
        [`label-${i}`, len(l.label, 30, "The label", 1)],
        [`href-${i}`, !l.href.trim() ? "Add where the link goes." : !isSafeHref(l.href) ? `That link will not work. ${HREF_HELP}` : null],
      ]),
      ["links", v.links.length > 8 ? "Up to 8 links." : null],
    ]),
  access: () => ({}),
}

/** Normalises what is about to be saved: trimmed text, no duplicate or unknown entries. */
function clean<K extends SettingKey>(key: K, v: SiteSettings[K]): SiteSettings[K] {
  const t = (s: string) => s.trim()
  switch (key) {
    case "brand": {
      const b = v as SiteSettings["brand"]
      return { name: t(b.name), tagline: t(b.tagline), description: t(b.description) } as SiteSettings[K]
    }
    case "announcement": {
      const a = v as SiteSettings["announcement"]
      return { ...a, text: t(a.text), href: t(a.href) } as SiteSettings[K]
    }
    case "hero": {
      const h = v as SiteSettings["hero"]
      return { badge: t(h.badge), title: t(h.title), subtitle: t(h.subtitle), primaryLabel: t(h.primaryLabel), primaryHref: t(h.primaryHref) } as SiteSettings[K]
    }
    case "nav": {
      const n = v as SiteSettings["nav"]
      return { hidden: [...new Set(n.hidden)].filter((h) => NAV_LINKS.some((l) => l.href === h)) } as SiteSettings[K]
    }
    case "footer": {
      const f = v as SiteSettings["footer"]
      return { note: t(f.note), links: f.links.slice(0, 8).map((l) => ({ label: t(l.label), href: t(l.href) })) } as SiteSettings[K]
    }
    default:
      return v
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function SectionForm({ section }: { section: SettingKey }) {
  const { settings, ready } = useSiteSettings()
  const canSave = useCanSave()
  // The saved value, normalised the same way the site reads it (home sections in order, new ones appended).
  const saved = section === "home" ? { sections: orderedHomeSections(settings) } : settings[section]
  const [draft, setDraft] = useState<SiteSettings[SettingKey] | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  const value = (draft ?? saved) as SiteSettings[SettingKey]
  const dirty = draft !== null && !same(draft, saved)
  const isDefault = same(value, DEFAULTS[section])

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function change(next: SiteSettings[SettingKey]) {
    setDraft(next)
    setStatus(null)
    // Errors clear as soon as the field is fixed, but new ones wait for Save.
    if (Object.keys(errors).length) {
      const now = (VALIDATE[section] as (v: SiteSettings[SettingKey]) => Errors)(next)
      setErrors(Object.fromEntries(Object.entries(errors).filter(([k]) => now[k])))
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !dirty) return
    const found = (VALIDATE[section] as (v: SiteSettings[SettingKey]) => Errors)(value)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      document.getElementById(`f-${first}`)?.focus()
      setStatus({ ok: false, text: Object.keys(found).length === 1 ? "One field needs a fix before saving." : `${Object.keys(found).length} fields need a fix before saving.` })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      await saveSiteSetting(section, clean(section, value) as never)
      setDraft(null)
      setStatus({ ok: true, text: "Saved. Every open page picks it up within a few seconds." })
    } catch (err) {
      const msg = (err as Error).message
      setStatus({ ok: false, text: /schema cache|does not exist/i.test(msg) ? "The settings table is not on this database yet. Apply the roles migration first." : /row-level security|permission/i.test(msg) ? "Only admins can save site settings." : msg })
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <Skeleton className="h-96 w-full rounded-2xl" />

  const fields = { value, change, errors } as FieldsProps<SettingKey>
  const disabledSave = !canSave?.ok

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      <SaveNotice state={canSave} />
      <div className="rounded-xl bg-card p-4 md:p-6">
        {section === "brand" && <BrandFields {...(fields as FieldsProps<"brand">)} />}
        {section === "announcement" && <AnnouncementFields {...(fields as FieldsProps<"announcement">)} />}
        {section === "theme" && <ThemeFields {...(fields as FieldsProps<"theme">)} />}
        {section === "experience" && <ExperienceFields {...(fields as FieldsProps<"experience">)} />}
        {section === "hero" && <HeroFields {...(fields as FieldsProps<"hero">)} />}
        {section === "home" && <HomeFields {...(fields as FieldsProps<"home">)} />}
        {section === "nav" && <NavFields {...(fields as FieldsProps<"nav">)} features={settings.features} />}
        {section === "features" && <FeatureFields {...(fields as FieldsProps<"features">)} />}
        {section === "footer" && <FooterFields {...(fields as FieldsProps<"footer">)} />}
        {section === "access" && <AccessFields {...(fields as FieldsProps<"access">)} />}
      </div>

      <SaveBar
        dirty={dirty}
        busy={busy}
        status={status}
        disabled={disabledSave}
        onDiscard={() => {
          setDraft(null)
          setErrors({})
          setStatus(null)
        }}
      >
        <Button type="button" variant="ghost" size="sm" disabled={isDefault} onClick={() => change(structuredClone(DEFAULTS[section]))} title="Fills the form with the defaults. Save to apply them.">
          Reset to defaults
        </Button>
      </SaveBar>
    </form>
  )
}

type FieldsProps<K extends SettingKey> = { value: SiteSettings[K]; change: (v: SiteSettings[K]) => void; errors: Errors }

/** A text field with its label, help, error and a character count. */
function TextField({
  id,
  label,
  value,
  onChange,
  max,
  error,
  help,
  placeholder,
  multiline,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  max: number
  error?: string
  help?: React.ReactNode
  placeholder?: string
  multiline?: boolean
}) {
  const a11y = { "aria-invalid": error ? true : undefined, "aria-describedby": `f-${id}-help${error ? ` f-${id}-error` : ""}` } as const
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={`f-${id}`}>{label}</FieldLabel>
      {multiline ? (
        <Textarea id={`f-${id}`} value={value} rows={3} maxLength={max + 20} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="bg-background/60" {...a11y} />
      ) : (
        <Input id={`f-${id}`} value={value} maxLength={max + 20} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-10 bg-background/60" {...a11y} />
      )}
      <FieldDescription id={`f-${id}-help`} className="flex justify-between gap-3">
        <span>{help}</span>
        <span className={cn("shrink-0 tabular-nums", value.length > max && "text-destructive")}>
          {value.length}/{max}
        </span>
      </FieldDescription>
      {error && <FieldError id={`f-${id}-error`}>{error}</FieldError>}
    </Field>
  )
}

function BrandFields({ value, change, errors }: FieldsProps<"brand">) {
  return (
    <FieldGroup>
      <TextField id="name" label="Site name" value={value.name} max={40} error={errors.name} onChange={(name) => change({ ...value, name })} help="Shown in sign-in walls, notices and anywhere the site names itself." />
      <TextField id="tagline" label="Tagline" value={value.tagline} max={80} error={errors.tagline} onChange={(tagline) => change({ ...value, tagline })} help="A few words under the name." />
      <TextField
        id="description"
        label="Description"
        value={value.description}
        max={240}
        multiline
        error={errors.description}
        onChange={(description) => change({ ...value, description })}
        help="One or two sentences on what the site is for, used in the footer and for search engines."
      />
    </FieldGroup>
  )
}

function AnnouncementFields({ value, change, errors }: FieldsProps<"announcement">) {
  return (
    <FieldGroup>
      <SwitchRow id="f-enabled" label="Show the announcement" description="A line above the header on every page. Visitors can dismiss it; a new text shows again." checked={value.enabled} onChange={(enabled) => change({ ...value, enabled })} />
      <TextField id="text" label="Text" value={value.text} max={160} error={errors.text} onChange={(text) => change({ ...value, text })} placeholder="Paper club this Thursday: Mixture of depths" help="Plain text, one line on most screens." />
      <TextField id="href" label="Link (optional)" value={value.href} max={300} error={errors.href} onChange={(href) => change({ ...value, href })} placeholder="/events" help={HREF_HELP} />
      <ChoiceCards name="tone" label="Tone" value={value.tone} options={ANNOUNCEMENT_TONES} onChange={(tone) => change({ ...value, tone })} />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium" id="ann-preview">
          Preview
        </p>
        <div aria-labelledby="ann-preview" className="overflow-hidden rounded-xl border border-border bg-background">
          {value.text.trim() ? (
            <AnnouncementLine a={{ ...value, text: value.text.trim() }} preview />
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">Write a text to see the announcement.</p>
          )}
        </div>
        {!value.enabled && value.text.trim() && <p className="text-xs text-muted-foreground">Switched off: visitors will not see it until you switch it on and save.</p>}
      </div>
    </FieldGroup>
  )
}

function ThemeFields({ value, change, errors }: FieldsProps<"theme">) {
  const accent = accentColors(value)
  const secondary = HEX.test(value.secondary) ? value.secondary : "#d8c59e"
  const accentContrast = contrast(accent.color, "#05060a")
  const options = [...ACCENTS, { id: "custom" as const, label: "Your colour", blurb: "Any colour you pick", color: HEX.test(value.customAccent) ? value.customAccent : "#8fb4ff", foreground: "" }]
  return (
    <FieldGroup>
      <ChoiceCards name="accent" label="Accent colour" columns={3} value={value.accent} options={options} swatch={(id) => options.find((a) => a.id === id)!.color} onChange={(a) => change({ ...value, accent: a })} />
      {value.accent === "custom" && (
        <ColorField
          id="customAccent"
          label="Your accent"
          value={value.customAccent}
          error={errors.customAccent}
          onChange={(customAccent) => change({ ...value, customAccent })}
          help={HEX.test(value.customAccent) ? (accentContrast < 4.5 ? `Contrast on the dark ground is ${accentContrast.toFixed(1)}:1. Pick a lighter colour so links stay readable (4.5:1 or more).` : `Contrast on the dark ground: ${accentContrast.toFixed(1)}:1.`) : "A colour as #rrggbb."}
        />
      )}
      <ColorField
        id="secondary"
        label="Second colour (optional)"
        value={value.secondary}
        error={errors.secondary}
        allowEmpty
        base="#d8c59e"
        onChange={(s) => change({ ...value, secondary: s })}
        help="The warm colour of highlights and badges. Leave empty for the built-in champagne."
      />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/50 px-4 py-3 text-sm" style={{ ["--preview" as string]: accent.color, ["--preview-2" as string]: secondary }}>
        <span className="text-muted-foreground">Preview:</span>
        <span className="font-medium text-(--preview)">A link in the accent</span>
        <span className="inline-flex h-7 items-center rounded-full px-3 text-xs font-medium" style={{ background: "var(--preview)", color: accent.foreground }}>
          Live
        </span>
        <span className="inline-flex h-7 items-center rounded-full border border-(--preview) px-3 text-xs">Focus ring</span>
        <span className="inline-flex h-7 items-center rounded-full px-3 text-xs font-medium text-(--preview-2) ring-1 ring-(--preview-2)/40">Highlight</span>
      </div>
      <ChoiceCards name="glass" label="Glass" columns={2} value={value.glass} options={GLASS_LEVELS} onChange={(glass) => change({ ...value, glass })} />
      <p className="-mt-3 text-xs text-muted-foreground">Slower computers automatically get lighter glass, whatever is chosen here.</p>
      <ChoiceCards name="background" label="Background" columns={2} value={value.background} options={BACKDROPS} onChange={(background) => change({ ...value, background })} />
      <ChoiceCards name="motion" label="Motion" value={value.motion} options={MOTION_LEVELS} onChange={(motion) => change({ ...value, motion })} />
      <p className="-mt-3 text-xs text-muted-foreground">Visitors who ask their device for reduced motion always get less, whatever is chosen here.</p>
      <ChoiceCards name="hero" label="Home page backdrop" value={value.heroEffect} options={HERO_EFFECTS} onChange={(heroEffect) => change({ ...value, heroEffect })} />
      <ChoiceCards name="fontScale" label="Text size" columns={2} value={value.fontScale} options={FONT_SCALES} onChange={(fontScale) => change({ ...value, fontScale })} />
      <ChoiceCards name="radius" label="Corners" value={value.radius} options={RADII} onChange={(radius) => change({ ...value, radius })} />
    </FieldGroup>
  )
}

type Feel = SiteSettings["experience"]
type FeelKey = Feel["locked"][number]
const FEEL_FIELDS: { key: FeelKey; label: string; options: { id: string; label: string; blurb: string }[] }[] = [
  { key: "scroll", label: "Scrolling", options: [
    { id: "smooth", label: "Smooth", blurb: "Each wheel step eases into place" },
    { id: "silk", label: "Silk", blurb: "A longer, softer glide" },
    { id: "native", label: "Native", blurb: "The browser's own scrolling" },
  ] },
  { key: "scrollFx", label: "Motion while scrolling", options: [
    { id: "subtle", label: "Subtle", blurb: "Small, quiet movements" },
    { id: "lively", label: "Lively", blurb: "Clear entrances and parallax" },
    { id: "cinematic", label: "Cinematic", blurb: "Deep parallax, big entrances" },
  ] },
  { key: "backdrop", label: "Background", options: [
    { id: "nebula", label: "Graphite sky", blurb: "Dark graphite with faint light and stars" },
    { id: "starfield", label: "Starfield", blurb: "Mostly stars" },
    { id: "deep", label: "Deep space", blurb: "Darker and calmer" },
  ] },
  { key: "density", label: "Stars", options: [
    { id: "sparse", label: "Few", blurb: "A quiet sky" },
    { id: "normal", label: "Some", blurb: "Balanced" },
    { id: "dense", label: "Many", blurb: "A crowded galaxy" },
  ] },
  { key: "header", label: "Header on scroll", options: [
    { id: "auto", label: "Steps aside", blurb: "Hides while reading down, back on scroll up" },
    { id: "pinned", label: "Always there", blurb: "Stays at the top" },
  ] },
]

function ExperienceFields({ value, change }: FieldsProps<"experience">) {
  const locked = new Set(value.locked ?? [])
  return (
    <FieldGroup>
      <p className="text-sm text-muted-foreground">
        What every visitor gets. Members can change each one in Settings › Your experience, unless you lock it. Visitors who ask their device for reduced motion always get less.
      </p>
      {FEEL_FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-2">
          <ChoiceCards
            name={f.key}
            label={f.label}
            columns={f.options.length === 2 ? 2 : 3}
            value={value[f.key] as string}
            options={f.options}
            onChange={(v) => change({ ...value, [f.key]: v } as Feel)}
          />
          <label className="-mt-1 inline-flex items-center gap-2 self-start text-sm text-muted-foreground">
            <Switch
              checked={locked.has(f.key)}
              onCheckedChange={(on) => change({ ...value, locked: on ? [...locked, f.key] : [...locked].filter((k) => k !== f.key) })}
            />
            Lock it: members cannot change this
          </label>
        </div>
      ))}
    </FieldGroup>
  )
}

/** A colour: a picker and the same value as #rrggbb text. */
function ColorField({ id, label, value, onChange, help, error, allowEmpty, base = "#8fb4ff" }: { id: string; label: string; value: string; onChange: (v: string) => void; help?: string; error?: string; allowEmpty?: boolean; base?: string }) {
  const valid = HEX.test(value)
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={`f-${id}`}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: pick`}
          value={valid ? value.toLowerCase() : base}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
        />
        <Input
          id={`f-${id}`}
          value={value}
          maxLength={7}
          placeholder={allowEmpty ? "Built-in" : "#8fb4ff"}
          onChange={(e) => onChange(e.target.value.trim())}
          className="h-10 max-w-40 bg-background/60 font-mono"
          aria-invalid={error ? true : undefined}
          aria-describedby={`f-${id}-help${error ? ` f-${id}-error` : ""}`}
        />
        {allowEmpty && value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
            Clear
          </Button>
        )}
      </div>
      {help && <FieldDescription id={`f-${id}-help`}>{help}</FieldDescription>}
      {error && <FieldError id={`f-${id}-error`}>{error}</FieldError>}
    </Field>
  )
}

function HeroFields({ value, change, errors }: FieldsProps<"hero">) {
  return (
    <FieldGroup>
      <TextField id="badge" label="Badge" value={value.badge} max={80} error={errors.badge} onChange={(badge) => change({ ...value, badge })} help="The small line above the headline." />
      <TextField id="title" label="Headline" value={value.title} max={90} error={errors.title} onChange={(title) => change({ ...value, title })} help="Leave empty to keep the built-in headline." />
      <TextField id="subtitle" label="Subtitle" value={value.subtitle} max={220} multiline error={errors.subtitle} onChange={(subtitle) => change({ ...value, subtitle })} help="Leave empty to keep the built-in text." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField id="primaryLabel" label="Button label" value={value.primaryLabel} max={30} error={errors.primaryLabel} onChange={(primaryLabel) => change({ ...value, primaryLabel })} />
        <TextField id="primaryHref" label="Button link" value={value.primaryHref} max={300} error={errors.primaryHref} onChange={(primaryHref) => change({ ...value, primaryHref })} help={HREF_HELP} />
      </div>
    </FieldGroup>
  )
}

function HomeFields({ value, change, errors }: FieldsProps<"home">) {
  const [announce, setAnnounce] = useState("")
  const focusAfter = useRef<string | null>(null)
  const rows = value.sections

  useEffect(() => {
    if (!focusAfter.current) return
    document.getElementById(focusAfter.current)?.focus()
    focusAfter.current = null
  })

  function move(i: number, by: -1 | 1, focusId?: string) {
    const j = i + by
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    if (focusId) focusAfter.current = focusId
    change({ sections: next })
    const label = HOME_SECTIONS.find((s) => s.id === rows[i].id)?.label
    setAnnounce(`${label} moved to position ${j + 1} of ${rows.length}.`)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Top to bottom, as they appear under the hero. Focus a handle and use the arrow keys to move a section, or use the buttons.</p>
      <ol className="flex flex-col gap-2" id="f-sections">
        {rows.map((s, i) => {
          const label = HOME_SECTIONS.find((h) => h.id === s.id)?.label ?? s.id
          return (
            <li key={s.id} className={cn("flex items-center gap-2 rounded-xl border border-border bg-card/50 py-2 pr-3 pl-1.5", !s.visible && "opacity-70")}>
              <button
                type="button"
                id={`home-${s.id}`}
                aria-label={`${label}, position ${i + 1} of ${rows.length}. Arrow up or down to move.`}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault()
                    move(i, e.key === "ArrowUp" ? -1 : 1, `home-${s.id}`)
                  }
                }}
                className="grid size-8 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <GripVerticalIcon aria-hidden className="size-4" />
              </button>
              <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpIcon aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${label} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownIcon aria-hidden />
              </Button>
              <Switch
                checked={s.visible}
                aria-label={`Show ${label}`}
                onCheckedChange={(visible) => change({ sections: rows.map((r) => (r.id === s.id ? { ...r, visible } : r)) })}
                className="ml-1"
              />
            </li>
          )
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      {errors.sections && <FieldError>{errors.sections}</FieldError>}
    </div>
  )
}

function NavFields({ value, change, features }: FieldsProps<"nav"> & { features: SiteSettings["features"] }) {
  const groups = [...new Set(NAV_LINKS.map((l) => l.group))]
  const hidden = new Set(value.hidden)
  const toggle = (href: string, show: boolean) => change({ hidden: show ? value.hidden.filter((h) => h !== href) : [...value.hidden, href] })
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">Unticked links leave the header menus, the footer and search. The pages stay reachable by address; to close a whole area, use Features.</p>
      {groups.map((g) => (
        <fieldset key={g} className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{g}</legend>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {NAV_LINKS.filter((l) => l.group === g).map((l) => {
              const feature = featureForPath(l.href)
              const off = feature ? features[feature] === false : false
              return (
                <label key={l.href} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring">
                  <input type="checkbox" checked={!hidden.has(l.href)} onChange={(e) => toggle(l.href, e.target.checked)} className="mt-0.5 size-4 accent-(--ion)" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{l.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {l.href}
                      {off && ` · hidden while ${FEATURES.find((f) => f.key === feature)?.label} is off`}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

function FeatureFields({ value, change }: FieldsProps<"features">) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A switched-off area shows visitors a polite “switched off by the admins” page and leaves the navigation. Nothing is deleted, and admins can still open it. Switch it back on at any time.
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {FEATURES.map((f) => (
          <SwitchRow
            key={f.key}
            id={`f-feature-${f.key}`}
            label={f.label}
            description={f.key === "ai" ? "AI help in composers and settings" : `Everything under ${f.href}`}
            checked={value[f.key] !== false}
            onChange={(on) => change({ ...value, [f.key]: on })}
          />
        ))}
      </div>
    </div>
  )
}

function FooterFields({ value, change, errors }: FieldsProps<"footer">) {
  const links = value.links
  const set = (i: number, patch: Partial<{ label: string; href: string }>) => change({ ...value, links: links.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= links.length) return
    const next = [...links]
    ;[next[i], next[j]] = [next[j], next[i]]
    change({ ...value, links: next })
  }
  return (
    <FieldGroup>
      <TextField id="note" label="Note" value={value.note} max={200} multiline error={errors.note} onChange={(note) => change({ ...value, note })} help="A short line at the bottom of every page, such as a code of conduct reminder." />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Links ({links.length}/8)</legend>
        {links.length === 0 && <p className="text-sm text-muted-foreground">No extra links yet.</p>}
        <ol className="flex flex-col gap-2">
          {links.map((l, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card/50 p-3 sm:flex-row sm:items-start">
              <Field data-invalid={errors[`label-${i}`] ? true : undefined} className="sm:w-48">
                <FieldLabel htmlFor={`f-label-${i}`} className="text-xs">
                  Label
                </FieldLabel>
                <Input id={`f-label-${i}`} value={l.label} maxLength={50} placeholder="Code of conduct" onChange={(e) => set(i, { label: e.target.value })} aria-invalid={errors[`label-${i}`] ? true : undefined} className="h-9 bg-background/60" />
                {errors[`label-${i}`] && <FieldError>{errors[`label-${i}`]}</FieldError>}
              </Field>
              <Field data-invalid={errors[`href-${i}`] ? true : undefined} className="flex-1">
                <FieldLabel htmlFor={`f-href-${i}`} className="text-xs">
                  Link
                </FieldLabel>
                <Input id={`f-href-${i}`} value={l.href} maxLength={320} placeholder="/forum/c/meta" onChange={(e) => set(i, { href: e.target.value })} aria-invalid={errors[`href-${i}`] ? true : undefined} className="h-9 bg-background/60" />
                {errors[`href-${i}`] && <FieldError>{errors[`href-${i}`]}</FieldError>}
              </Field>
              <div className="flex gap-1 sm:pt-5">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move link ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move link ${i + 1} down`} disabled={i === links.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove link ${i + 1}`} onClick={() => change({ ...value, links: links.filter((_, j) => j !== i) })}>
                  <Trash2Icon aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={links.length >= 8}
          onClick={() => {
            change({ ...value, links: [...links, { label: "", href: "" }] })
            requestAnimationFrame(() => document.getElementById(`f-label-${links.length}`)?.focus())
          }}
        >
          <PlusIcon aria-hidden /> Add a link
        </Button>
        <FieldDescription>{HREF_HELP}</FieldDescription>
      </fieldset>
    </FieldGroup>
  )
}

function AccessFields({ value, change }: FieldsProps<"access">) {
  return (
    <div className="flex flex-col gap-3">
      <SwitchRow
        id="f-guests"
        label="Guests can browse"
        description="When off, people who are not signed in see a sign-in wall on every page except the home page, sign-in and welcome."
        checked={value.guestsCanBrowse}
        onChange={(guestsCanBrowse) => change({ ...value, guestsCanBrowse })}
      />
      <SwitchRow
        id="f-signup"
        label="New people can join"
        description="When off, the sign-in page only lets existing members in and says that joining is closed for now."
        checked={value.signupOpen}
        onChange={(signupOpen) => change({ ...value, signupOpen })}
      />
      <Notice title="What these switches do">
        They change what the site shows. Public posts can still be read through the database API by design, so do not rely on them to keep content secret.
      </Notice>
    </div>
  )
}
