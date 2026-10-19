"use client"

import type { PostgrestError } from "@supabase/supabase-js"
import { db } from "@/lib/supabase"

/*
 * Reports and moderation actions. Members report what breaks the rules; staff hide, remove or feature content
 * through public.moderate_content, which checks the caller's role and writes the moderation log. Every message
 * here is meant to be shown to a person, so database errors are turned into plain sentences.
 */

/** Content that staff can act on, as the database names it. */
export type ContentKind = "question" | "answer" | "submission" | "project" | "event" | "room_message"
export type ModAction = "hide" | "unhide" | "feature" | "unfeature" | "remove"
export type ReportReason = "spam" | "abuse" | "harassment" | "illegal" | "misleading" | "off_topic" | "other"
export type ReportStatus = "open" | "resolved" | "dismissed"

export const CONTENT_KINDS: Record<ContentKind, { label: string; table: string }> = {
  question: { label: "Thread", table: "questions" },
  answer: { label: "Reply", table: "answers" },
  submission: { label: "Link", table: "submissions" },
  project: { label: "Project", table: "projects" },
  event: { label: "Event", table: "events" },
  room_message: { label: "Chat message", table: "room_messages" },
}

export const isContentKind = (s: string): s is ContentKind => s in CONTENT_KINDS

export const REPORT_REASONS: { id: ReportReason; label: string; blurb: string }[] = [
  { id: "spam", label: "Spam", blurb: "Ads, scams or the same thing posted again and again" },
  { id: "abuse", label: "Abuse", blurb: "Insults, slurs or threats" },
  { id: "harassment", label: "Harassment", blurb: "Targets a person, shares private details" },
  { id: "illegal", label: "Illegal", blurb: "Pirated weights or data, malware, other illegal content" },
  { id: "misleading", label: "Misleading", blurb: "Fake benchmarks, false claims, impersonation" },
  { id: "off_topic", label: "Off topic", blurb: "Does not belong in this place" },
  { id: "other", label: "Something else", blurb: "Tell the moderators in the details" },
]

export const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.id === r)?.label ?? r

export const ACTION_LABELS: Record<string, string> = {
  hide: "Hid",
  unhide: "Unhid",
  feature: "Featured",
  unfeature: "Unfeatured",
  remove: "Removed",
  role: "Changed role",
  suspend: "Suspended",
  unsuspend: "Lifted suspension",
  resolve: "Resolved report",
  dismiss: "Dismissed report",
}

/** True when an error means the roles migration has not reached this database yet. */
export function isMissingSchema(error: Pick<PostgrestError, "code" | "message"> | null | undefined) {
  if (!error) return false
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(error.code) || /does not exist|schema cache/i.test(error.message)
}

/** A database error as a sentence a person can act on. */
export function explain(error: Pick<PostgrestError, "code" | "message"> | null | undefined, fallback = "That did not work. Try again in a moment.") {
  if (!error) return fallback
  if (isMissingSchema(error)) return "Moderation is not set up on this database yet. The roles migration needs to be applied."
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) return "Your account is not allowed to do this."
  if (error.code === "P0001" && error.message) return error.message.endsWith(".") ? error.message : `${error.message}.`
  return error.message || fallback
}

/** Hides, unhides, features, unfeatures or removes one piece of content. Staff only; the database checks. */
export async function moderate(kind: ContentKind, id: string, act: ModAction, note = "") {
  const c = db()
  if (!c) throw new Error("Moderation needs the database. This copy of Nexverse runs in the browser only.")
  const { error } = await c.rpc("moderate_content", { kind, target: id, act, note: note.slice(0, 500) })
  if (error) throw new Error(explain(error))
}

export type NewReport = { targetKind: string; targetId: string; targetUrl?: string; reason: ReportReason; details: string }

/** What happened to a report: sent, or this member had already reported the same thing. */
export type ReportResult = "sent" | "duplicate"

/** Files a report as the signed-in member. Reporting the same thing twice is not an error: the first report stands. */
export async function fileReport(r: NewReport): Promise<ReportResult> {
  const c = db()
  if (!c) throw new Error("Reports need the database. This copy of Nexverse runs in the browser only.")
  const url = r.targetUrl && /^\/(?!\/)[A-Za-z0-9/_.%?=&#-]{0,300}$/.test(r.targetUrl) ? r.targetUrl : null
  const { error } = await c.from("reports").insert({
    target_kind: r.targetKind,
    target_id: r.targetId.slice(0, 200),
    target_url: url,
    reason: r.reason,
    details: r.details.trim().slice(0, 1000),
  })
  if (!error) return "sent"
  if (error.code === "23505") return "duplicate"
  if (/too many reports/i.test(error.message)) throw new Error("You have sent a lot of reports in the last hour. Try again later; the moderators are on it.")
  throw new Error(explain(error))
}

/** Closes a report as resolved (action taken) or dismissed (nothing wrong), and notes it in the log. */
export async function closeReport(id: string, status: Exclude<ReportStatus, "open">, by: string, note = "") {
  const c = db()
  if (!c) throw new Error("Reports need the database.")
  const { error } = await c.from("reports").update({ status, resolved_by: by, resolved_at: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error(explain(error))
  // The log entry is a courtesy for the rest of the team; the report row already records who closed it.
  await c.rpc("log_moderation", { action: status === "resolved" ? "resolve" : "dismiss", target_kind: "report", target_id: id, note: note.slice(0, 500) })
}

/** Reopens a closed report, for a mistaken dismissal. */
export async function reopenReport(id: string) {
  const c = db()
  if (!c) throw new Error("Reports need the database.")
  const { error } = await c.from("reports").update({ status: "open", resolved_by: null, resolved_at: null }).eq("id", id)
  if (error) throw new Error(explain(error))
}
