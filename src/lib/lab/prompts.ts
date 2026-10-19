"use client"

import { db } from "@/lib/supabase"

/*
 * Saved Prompt Playground prompts (table lab_prompts, see supabase/migrations/…_lab.sql). Private to the
 * owner until shared; a shared prompt opens for anyone at /lab/prompt/<id>. Without a database, or before the
 * migration is applied, every call fails with a plain message and the playground keeps working locally.
 */

export type LabPrompt = {
  id: string
  ownerId: string
  ownerName: string | null
  title: string
  system: string
  prompt: string
  variables: Record<string, string>
  models: string[]
  temperature: number | null
  shared: boolean
  createdAt: string
  updatedAt: string
}

export type PromptDraft = Pick<LabPrompt, "title" | "system" | "prompt" | "variables" | "models" | "temperature" | "shared">

type Row = {
  id: string
  owner_id: string
  title: string
  system: string
  prompt: string
  variables: Record<string, string> | null
  models: string[] | null
  temperature: number | null
  shared: boolean
  created_at: string
  updated_at: string
}

const COLS = "id, owner_id, title, system, prompt, variables, models, temperature, shared, created_at, updated_at"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isPromptId = (s: string) => UUID.test(s)

function friendly(message: string) {
  if (/schema cache|does not exist|relation/.test(message)) return "Saving prompts is not switched on for this site yet."
  if (/row-level security/.test(message)) return "You can only change your own prompts, and saving needs an account in good standing."
  if (/JWT|not authenticated/i.test(message)) return "Your session ran out. Sign in again."
  if (/check constraint/.test(message)) return "Something is too long: titles up to 120 characters, prompts up to 20,000."
  return message
}

const toPrompt = (r: Row, ownerName: string | null = null): LabPrompt => ({
  id: r.id,
  ownerId: r.owner_id,
  ownerName,
  title: r.title,
  system: r.system,
  prompt: r.prompt,
  variables: r.variables ?? {},
  models: r.models ?? [],
  temperature: r.temperature,
  shared: r.shared,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

function client() {
  const c = db()
  if (!c) throw new Error("Saving prompts needs an account, and accounts are not available on this copy of the site.")
  return c
}

export async function myId(): Promise<string | null> {
  const c = db()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session?.user.id ?? null
}

export async function listMyPrompts(): Promise<LabPrompt[]> {
  const c = client()
  const id = await myId()
  if (!id) return []
  const { data, error } = await c.from("lab_prompts").select(COLS).eq("owner_id", id).order("updated_at", { ascending: false }).limit(50)
  if (error) throw new Error(friendly(error.message))
  return (data as Row[]).map((r) => toPrompt(r))
}

/** One prompt: shared ones for anyone, private ones for their owner. Null when missing or not visible. */
export async function getPrompt(id: string): Promise<LabPrompt | null> {
  if (!isPromptId(id)) return null
  const c = client()
  const { data, error } = await c.from("lab_prompts").select(COLS).eq("id", id).maybeSingle()
  if (error) throw new Error(friendly(error.message))
  if (!data) return null
  const row = data as Row
  const { data: p } = await c.from("profiles").select("name").eq("id", row.owner_id).maybeSingle()
  return toPrompt(row, (p as { name?: string } | null)?.name ?? null)
}

export async function savePrompt(draft: PromptDraft, id?: string | null): Promise<LabPrompt> {
  const c = client()
  const me = await myId()
  if (!me) throw new Error("Sign in to save prompts.")
  const body = {
    title: draft.title.trim().slice(0, 120) || "Untitled prompt",
    system: draft.system.slice(0, 8000),
    prompt: draft.prompt.slice(0, 20000),
    variables: draft.variables,
    models: draft.models.slice(0, 3),
    temperature: draft.temperature,
    shared: draft.shared,
  }
  const q = id && isPromptId(id) ? c.from("lab_prompts").update(body).eq("id", id).eq("owner_id", me) : c.from("lab_prompts").insert({ ...body, owner_id: me })
  const { data, error } = await q.select(COLS).single()
  if (error) throw new Error(friendly(error.message))
  return toPrompt(data as Row)
}

export async function deletePrompt(id: string): Promise<void> {
  const c = client()
  const { error } = await c.from("lab_prompts").delete().eq("id", id)
  if (error) throw new Error(friendly(error.message))
}

export const promptPath = (id: string) => `/lab/prompt/${id}`
