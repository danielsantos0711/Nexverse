"use client"

import { useState, useSyncExternalStore } from "react"
import { CheckIcon, CircleDotIcon, CopyIcon, ExternalLinkIcon, MailIcon } from "lucide-react"
import { ProviderIcon } from "@/components/account/auth-ui"
import { EMAIL_TEMPLATES } from "@/components/account/email-templates"
import { AdminHeading, Notice } from "@/components/admin/controls"
import { Gate } from "@/components/moderation/gate"
import { Badge } from "@/components/ui/badge"
import { useAuthSettings, type SocialId } from "@/lib/auth-providers"
import { live } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/*
 * /admin/logins: how to switch on each way of signing in, with the exact addresses to paste and the live state
 * read from Supabase's public /auth/v1/settings. Nothing secret is shown or stored here: client secrets are
 * pasted only into the Supabase dashboard.
 */

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")
const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0] || "iiynvihhdjraywvkfkhw"
  } catch {
    return "iiynvihhdjraywvkfkhw"
  }
})()
const CALLBACK = `${SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`}/auth/v1/callback`
const DASHBOARD = `https://supabase.com/dashboard/project/${PROJECT_REF}`
const LINKS = {
  providers: `${DASHBOARD}/auth/providers`,
  urls: `${DASHBOARD}/auth/url-configuration`,
  templates: `${DASHBOARD}/auth/templates`,
  smtp: `${DASHBOARD}/auth/smtp`,
  limits: `${DASHBOARD}/auth/rate-limits`,
}

const noop = () => () => {}

type Guide = {
  id: SocialId
  label: string
  /** The provider's name in Supabase's provider list. */
  supabaseName: string
  console: { label: string; href: string }
  /** Where in the provider's form the callback URL goes. */
  callbackField: string
  steps: React.ReactNode[]
  note?: string
}

function guides(origin: string): Guide[] {
  return [
    {
      id: "google",
      label: "Google",
      supabaseName: "Google",
      console: { label: "Google Cloud Console", href: "https://console.cloud.google.com/apis/credentials" },
      callbackField: "Authorized redirect URIs",
      steps: [
        <>Create or pick a project, for example “Nexverse”.</>,
        <>
          <b>APIs &amp; Services → OAuth consent screen</b> (or Google Auth Platform → Branding): type External, app name “Nexverse”, a support email, the domain <Code>{host(origin)}</Code>. Add the scopes <Code>openid</Code>, <Code>userinfo.email</Code> and <Code>userinfo.profile</Code>, then <b>Publish app</b> so it leaves testing mode.
        </>,
        <>
          <b>Credentials → Create credentials → OAuth client ID</b>, type Web application. Authorized JavaScript origins: <Code>{origin}</Code>. Authorized redirect URIs: the callback URL above.
        </>,
        <>Create, then copy the Client ID and Client secret.</>,
        <>
          In Supabase, open <b>Google</b>, switch on <b>Enable Sign in with Google</b>, paste the Client ID (under “Client IDs”) and the secret, and save.
        </>,
      ],
    },
    {
      id: "github",
      label: "GitHub",
      supabaseName: "GitHub",
      console: { label: "New GitHub OAuth App", href: "https://github.com/settings/applications/new" },
      callbackField: "Authorization callback URL",
      steps: [
        <>
          GitHub → Settings → Developer settings → <b>OAuth Apps → New OAuth App</b> (or the same under your organization’s settings).
        </>,
        <>
          Application name “Nexverse”, Homepage URL <Code>{origin}</Code>, Authorization callback URL: the callback URL above.
        </>,
        <>
          <b>Register application</b>, copy the Client ID, then <b>Generate a new client secret</b> and copy it at once (GitHub shows it only once).
        </>,
        <>In Supabase, open <b>GitHub</b>, enable it, paste both values and save.</>,
      ],
    },
    {
      id: "discord",
      label: "Discord",
      supabaseName: "Discord",
      console: { label: "Discord Developer Portal", href: "https://discord.com/developers/applications" },
      callbackField: "OAuth2 → Redirects",
      steps: [
        <>
          <b>New Application</b>, name it “Nexverse”, create.
        </>,
        <>
          Open <b>OAuth2</b>: copy the Client ID; under Client Secret press <b>Reset Secret</b> and copy it.
        </>,
        <>
          Still in OAuth2, <b>Redirects → Add Redirect</b>: the callback URL above, then <b>Save Changes</b>.
        </>,
        <>In Supabase, open <b>Discord</b>, enable it, paste both values and save.</>,
      ],
    },
    {
      id: "apple",
      label: "Apple",
      supabaseName: "Apple",
      console: { label: "Apple Developer identifiers", href: "https://developer.apple.com/account/resources/identifiers/list" },
      callbackField: "Services ID → Return URLs",
      note: "Needs a paid Apple Developer account. Apple requires a new secret every 6 months: set a calendar reminder, or Apple sign-in stops working.",
      steps: [
        <>Note your Team ID (10 characters, top right of the developer site).</>,
        <>
          <b>Identifiers → + → App IDs</b>: create an App ID with <b>Sign in with Apple</b> switched on.
        </>,
        <>
          <b>Identifiers → + → Services IDs</b>: create a Services ID (for example <Code>com.yourname.nexverse.web</Code>). This is the Client ID for the web.
        </>,
        <>
          Open the Services ID, switch on Sign in with Apple → <b>Configure</b>: Primary App ID as above, Domains <Code>{host(SUPABASE_URL) || `${PROJECT_REF}.supabase.co`}</Code>, Return URLs: the callback URL above. Save.
        </>,
        <>
          <b>Keys → +</b>: switch on Sign in with Apple, pick the App ID, register, download the <Code>.p8</Code> file (only once) and note the Key ID.
        </>,
        <>
          In Supabase, open <b>Apple</b>, enable it, paste the Services ID under “Client IDs”, generate the secret with the tool Supabase links to (Team ID, Key ID, Services ID and the .p8) and save.
        </>,
      ],
    },
    {
      id: "azure",
      label: "Microsoft",
      supabaseName: "Azure",
      console: { label: "Azure app registrations", href: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" },
      callbackField: "Redirect URI (platform Web)",
      note: "Client secrets in Azure expire. Note the date you chose and make a new one before then.",
      steps: [
        <>
          Microsoft Entra ID → <b>App registrations → New registration</b>.
        </>,
        <>
          Name “Nexverse”; Supported account types: <b>any organizational directory and personal Microsoft accounts</b>; Redirect URI: platform Web, the callback URL above. Register.
        </>,
        <>Copy the Application (client) ID.</>,
        <>
          <b>Certificates &amp; secrets → New client secret</b>, then copy its <b>Value</b> (not the Secret ID).
        </>,
        <>
          Recommended: <b>Token configuration → Add optional claim → ID</b>, add <Code>email</Code> and <Code>xms_edov</Code> so Supabase knows the email is verified.
        </>,
        <>
          In Supabase, open <b>Azure</b>, enable it, paste the client ID and the secret, leave Azure Tenant URL empty (any Microsoft account) and save. The site already asks Microsoft for the email scope.
        </>,
      ],
    },
    {
      id: "x",
      label: "X",
      supabaseName: "X / Twitter (OAuth 2.0)",
      console: { label: "X Developer Portal", href: "https://developer.x.com/en/portal/dashboard" },
      callbackField: "Callback URI / Redirect URL",
      note: "Use the OAuth 2.0 provider. The older “Twitter (OAuth 1.0a)” one still works on this site but is being retired.",
      steps: [
        <>Create a project and an app inside it.</>,
        <>
          In the app, <b>User authentication settings → Set up</b>: permissions Read with <b>Request email from users</b> on; type “Web App, Automated App or Bot”; Callback URI: the callback URL above; Website URL <Code>{origin}</Code>; add your terms and privacy links (X needs them to share the email). Save.
        </>,
        <>
          <b>Keys and tokens</b>: copy the OAuth 2.0 Client ID, then <b>Client Secret → Regenerate</b> and copy it.
        </>,
        <>
          In Supabase, open <b>X / Twitter (OAuth 2.0)</b>, enable it, paste both values and save.
        </>,
      ],
    },
  ]
}

function host(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function LoginsGuide() {
  return live ? (
    <Gate role="admin" action="set up sign-in methods">
      <Guide />
    </Gate>
  ) : (
    <Guide />
  )
}

function Guide() {
  const auth = useAuthSettings()
  // The site's own address, as this browser sees it: the values to paste must match where the site runs.
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => ""
  )
  const list = guides(origin || "https://your-site")
  const enabled = new Set(auth.social.map((p) => p.id))

  return (
    <div className="flex flex-col gap-8">
      <AdminHeading
        title="Sign-in methods"
        lead="Switch on Google, GitHub, Discord, Apple, Microsoft and X. Each button appears on the sign-in page by itself once its provider is on in Supabase: no code and no deploy."
      />

      <Notice title="Secrets stay in Supabase">
        Client IDs and secrets go only into the Supabase dashboard. Never paste them into this site, Vercel or the repository.
      </Notice>

      <section aria-labelledby="logins-status" className="flex flex-col gap-3">
        <h2 id="logins-status" className="text-base font-semibold">
          Live status
        </h2>
        {!live ? (
          <p className="text-sm text-muted-foreground">This copy is not connected to Supabase, so no sign-in method is on.</p>
        ) : !auth.ready ? (
          <p role="status" className="text-sm text-muted-foreground">
            Reading the switches from Supabase…
          </p>
        ) : auth.failed ? (
          <p className="text-sm text-destructive">Supabase’s settings could not be read just now. Reload the page to try again.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            <StatusPill on={auth.email} label="Email and password" icon={<MailIcon aria-hidden className="size-4" />} />
            {list.map((g) => (
              <StatusPill key={g.id} on={enabled.has(g.id)} label={g.label} icon={<ProviderIcon id={g.id} className="size-4" />} />
            ))}
            <StatusPill on={!auth.signupDisabled} label="New accounts" icon={<CircleDotIcon aria-hidden className="size-4" />} />
            <StatusPill on={auth.confirmEmail} label="Email confirmation" icon={<CheckIcon aria-hidden className="size-4" />} />
          </ul>
        )}
      </section>

      <Step n={1} title="Site URL and Redirect URLs (do this first)" href={LINKS.urls} hrefLabel="Open URL Configuration">
        <p className="text-sm text-muted-foreground">
          Without these, email links and social sign-ins come back to the wrong page or are refused. In Supabase → Authentication → URL Configuration:
        </p>
        <CopyField label="Site URL" value={origin} />
        <p className="text-sm text-muted-foreground">Redirect URLs: press “Add URL” for each. The first covers every page; the others name the three that links return to.</p>
        <CopyField label="Redirect URL (whole site)" value={origin && `${origin}/**`} />
        <CopyField label="Redirect URL (sign-in links)" value={origin && `${origin}/auth/callback`} />
        <CopyField label="Redirect URL (email links)" value={origin && `${origin}/auth/confirm`} />
        <CopyField label="Redirect URL (password reset)" value={origin && `${origin}/reset-password`} />
        <p className="text-xs text-muted-foreground">Testing on your computer too? Also add http://localhost:3000/**.</p>
      </Step>

      <Step n={2} title="The callback URL for every provider" href={LINKS.providers} hrefLabel="Open Auth Providers">
        <p className="text-sm text-muted-foreground">Every provider below asks for the same address. Supabase also shows it inside each provider as “Callback URL (for OAuth)”.</p>
        <CopyField label="Callback URL" value={CALLBACK} />
      </Step>

      <section aria-labelledby="logins-providers" className="flex flex-col gap-4">
        <h2 id="logins-providers" className="text-base font-semibold">
          Step 3 · Each provider
        </h2>
        {list.map((g) => (
          <ProviderGuide key={g.id} guide={g} on={live && auth.ready && enabled.has(g.id)} known={live && auth.ready && !auth.failed} />
        ))}
      </section>

      <Step n={4} title="Password reset email" href={LINKS.templates} hrefLabel="Open Email Templates">
        <p className="text-sm text-muted-foreground">
          In Supabase → Authentication → Emails → Templates → <b>Reset password</b>, paste this subject and body. Its link works in any browser and on any device, and the code is a way in when the link cannot be opened.
        </p>
        <TemplateBlock id="recovery" />
        <details className="group rounded-xl border border-border bg-background/30 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">The other templates (sign-up, magic link, email change, invite, reauthentication)</summary>
          <div className="mt-4 flex flex-col gap-6">
            {EMAIL_TEMPLATES.filter((t) => t.id !== "recovery").map((t) => (
              <TemplateBlock key={t.id} id={t.id} />
            ))}
          </div>
        </details>
      </Step>

      <Step n={5} title="Real email delivery" href={LINKS.smtp} hrefLabel="Open SMTP settings">
        <p className="text-sm text-muted-foreground">
          Supabase’s built-in mailer sends only to your Supabase team’s addresses, a few per hour. For members to receive sign-up, sign-in and reset emails, connect your own SMTP service (Resend, Postmark, Amazon SES or Brevo all have free plans) under Authentication → Emails → SMTP Settings, then raise the email limit under{" "}
          <a href={LINKS.limits} target="_blank" rel="noreferrer" className="text-ion underline-offset-4 hover:underline">
            Rate Limits
          </a>
          .
        </p>
      </Step>

      <Step n={6} title="Check it works">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>Open {origin ? `${origin}/sign-in` : "/sign-in"} in a private window: each provider you switched on shows a “Continue with …” button.</li>
          <li>Sign in with it. You come back signed in; the first time, the welcome steps open.</li>
          <li>Settings → Security lists the provider under sign-in methods.</li>
          <li>On /reset-password, ask for a reset email, open it on another device, and set a new password.</li>
        </ol>
      </Step>
    </div>
  )
}

function StatusPill({ on, label, icon }: { on: boolean; label: string; icon: React.ReactNode }) {
  return (
    <li className={cn("inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm", on ? "border-ok/40 bg-ok/10 text-foreground" : "border-border bg-background/30 text-muted-foreground")}>
      {icon}
      {label}
      <span className={cn("text-xs font-medium", on ? "text-ok" : "text-muted-foreground")}>{on ? "On" : "Off"}</span>
    </li>
  )
}

function Step({ n, title, href, hrefLabel, children }: { n: number; title: string; href?: string; hrefLabel?: string; children: React.ReactNode }) {
  const id = `logins-step-${n}`
  return (
    <section aria-labelledby={id} className="liquid-glass glass flex flex-col gap-4 rounded-2xl p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2.5 text-base font-semibold">
          <span className="grid size-7 place-items-center rounded-full bg-ion/15 text-sm text-ion tabular">{n}</span>
          {title}
        </h2>
        {href && <ExternalButton href={href}>{hrefLabel}</ExternalButton>}
      </div>
      {children}
    </section>
  )
}

function ProviderGuide({ guide, on, known }: { guide: Guide; on: boolean; known: boolean }) {
  return (
    <details className="group liquid-glass glass rounded-2xl">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:p-5 [&::-webkit-details-marker]:hidden">
        <span className="grid size-9 place-items-center rounded-xl border border-border bg-background/40">
          <ProviderIcon id={guide.id} />
        </span>
        <span className="min-w-0 flex-1 font-medium">
          {guide.label}
          {guide.supabaseName !== guide.label && <span className="ml-2 text-xs font-normal text-muted-foreground">“{guide.supabaseName}” in Supabase</span>}
        </span>
        {known && <Badge variant={on ? "default" : "outline"}>{on ? "On" : "Off"}</Badge>}
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-4 md:p-5">
        <div className="flex flex-wrap gap-2">
          <ExternalButton href={guide.console.href}>{guide.console.label}</ExternalButton>
          <ExternalButton href={LINKS.providers}>Supabase · Auth Providers</ExternalButton>
          <ExternalButton href={LINKS.urls}>Supabase · URL Configuration</ExternalButton>
        </div>
        <CopyField label={`Callback URL · paste into “${guide.callbackField}”`} value={CALLBACK} />
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground marker:text-foreground/60">
          {guide.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {guide.note && <Notice tone="warn" title="Keep in mind">{guide.note}</Notice>}
      </div>
    </details>
  )
}

function TemplateBlock({ id }: { id: string }) {
  const t = EMAIL_TEMPLATES.find((x) => x.id === id)
  if (!t) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t.name}</p>
      <CopyField label="Subject" value={t.subject} />
      <CopyField label="Body (HTML)" value={t.html} multiline />
    </div>
  )
}

function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className={cn("flex gap-2", multiline ? "flex-col" : "items-center")}>
        {multiline ? (
          <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{value}</pre>
        ) : (
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-xs" title={value}>
            {value || "…"}
          </code>
        )}
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          aria-label={`Copy ${label}`}
          className={cn(
            "pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
            multiline && "self-start"
          )}
        >
          {copied ? <CheckIcon aria-hidden className="size-3.5 text-ok" /> : <CopyIcon aria-hidden className="size-3.5" />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  )
}

function ExternalButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="pressable inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background/30 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
      <ExternalLinkIcon aria-hidden className="size-3" />
    </a>
  )
}


function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.85em] break-all text-foreground">{children}</code>
}
