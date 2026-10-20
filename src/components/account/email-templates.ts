/*
 * The Supabase email templates Nexverse expects (Authentication > Emails > Templates). Every link is a
 * "token hash" link to /auth/confirm, which works in any browser and on any device, and is only used when the
 * person presses the button there (mail scanners that open links cannot spend it). The reset email also
 * carries the 6-digit code, which the reset page accepts when the link cannot be opened.
 *
 * Plain data, shown on /admin/logins and in /mnt/project-files/nexverse/auth-email-templates.md.
 * {{ .SiteURL }}, {{ .TokenHash }}, {{ .Token }}, {{ .Email }} and {{ .RedirectTo }} are filled in by Supabase.
 */

export type EmailTemplate = { id: string; name: string; subject: string; html: string }

const wrap = (title: string, body: string) => `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111827;line-height:1.55">
  <p style="margin:0 0 24px;font-size:13px;letter-spacing:.18em;font-weight:600;color:#4b5563">NEXVERSE</p>
  <h1 style="margin:0 0 12px;font-size:22px;font-weight:600">${title}</h1>
${body}
  <p style="margin:32px 0 0;font-size:12px;color:#6b7280">Sent by Nexverse, the open universe for AI makers.</p>
</div>`

const button = (href: string, label: string) =>
  `  <p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${label}</a></p>`

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "recovery",
    name: "Reset password",
    subject: "Reset your Nexverse password",
    html: wrap(
      "Choose a new password",
      `  <p style="margin:0">Someone asked to reset the password for {{ .Email }}. If it was you, continue below; you will be signed in once the new password is saved.</p>
${button("{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password", "Choose a new password")}
  <p style="margin:0">Link not opening? On the reset page, choose "The email has a code?" and enter:</p>
  <p style="margin:12px 0;font-size:24px;font-weight:700;letter-spacing:.2em">{{ .Token }}</p>
  <p style="margin:0;font-size:13px;color:#6b7280">The link and the code work once and expire in one hour. If you did not ask for this, ignore this email: your password stays the same.</p>`
    ),
  },
  {
    id: "confirmation",
    name: "Confirm signup",
    subject: "Confirm your Nexverse account",
    html: wrap(
      "Welcome to the universe",
      `  <p style="margin:0">Confirm {{ .Email }} to finish creating your Nexverse account.</p>
${button("{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}", "Confirm my email")}
  <p style="margin:0;font-size:13px;color:#6b7280">If you did not sign up, ignore this email and no account is made.</p>`
    ),
  },
  {
    id: "magic_link",
    name: "Magic link",
    subject: "Your Nexverse sign-in link",
    html: wrap(
      "Sign in to Nexverse",
      `  <p style="margin:0">Use this link to sign in as {{ .Email }}. It works once and expires in one hour.</p>
${button("{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}", "Sign me in")}
  <p style="margin:0;font-size:13px;color:#6b7280">If you did not ask for this, ignore this email.</p>`
    ),
  },
  {
    id: "email_change",
    name: "Change email address",
    subject: "Confirm your new Nexverse email",
    html: wrap(
      "Confirm your new email",
      `  <p style="margin:0">Confirm that your Nexverse account should use {{ .NewEmail }} from now on.</p>
${button("{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change", "Confirm new email")}
  <p style="margin:0;font-size:13px;color:#6b7280">If you did not ask for this, ignore this email and nothing changes.</p>`
    ),
  },
  {
    id: "invite",
    name: "Invite user",
    subject: "You are invited to Nexverse",
    html: wrap(
      "You are invited",
      `  <p style="margin:0">You have been invited to join Nexverse with {{ .Email }}.</p>
${button("{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/welcome", "Accept invitation")}`
    ),
  },
  {
    id: "reauthentication",
    name: "Reauthentication",
    subject: "Your Nexverse confirmation code",
    html: wrap(
      "Confirm it is you",
      `  <p style="margin:0">Enter this code on Nexverse to confirm your password change:</p>
  <p style="margin:16px 0;font-size:24px;font-weight:700;letter-spacing:.2em">{{ .Token }}</p>
  <p style="margin:0;font-size:13px;color:#6b7280">If you did not ask for this, change your password and sign out of other devices from Settings.</p>`
    ),
  },
]
