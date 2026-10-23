/*
 * One error type for every AI route, so handlers can throw and the wrapper turns it into a JSON response
 * with the right status. Messages are written for members and never include secrets or upstream bodies.
 */

export type AiErrorCode =
  | "bad_request"
  | "too_large"
  | "unauthorized"
  | "forbidden"
  | "suspended"
  | "rate_limited"
  | "not_configured"
  | "blocked_url"
  | "fetch_failed"
  | "declined"
  | "upstream"
  | "timeout"
  | "bad_output"

export class AiError extends Error {
  constructor(
    public status: number,
    public code: AiErrorCode,
    message: string
  ) {
    super(message)
  }
}

export const NOT_CONFIGURED = "AI assist is not configured on this site yet."

/**
 * What an admin must do to turn AI on, naming the exact environment variables. Only ever shown to staff
 * (route.ts adds it to "not_configured" errors for moderators and admins); members just see NOT_CONFIGURED.
 */
export const SETUP_HINT =
  "Admin: set at least one free key in the Vercel project's environment variables, GEMINI_API_KEY (best), GROQ_API_KEY, CEREBRAS_API_KEY or OPENROUTER_API_KEY (MISTRAL_API_KEY and CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN also work), then redeploy. /admin/ai shows which keys are set and where to get each one."

/** The message a caller sees for an error: staff get the setup hint on "not_configured". */
export function messageFor(e: AiError, staff: boolean): string {
  return staff && e.code === "not_configured" && !/switched off/.test(e.message) ? `${e.message} ${SETUP_HINT}` : e.message
}
