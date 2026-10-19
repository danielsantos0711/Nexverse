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
