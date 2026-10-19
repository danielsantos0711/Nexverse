import { credentials } from "./config"
import { modelById, type AiJob, type ModelInfo } from "./models"
import { chainFor } from "./settings"
import { loadAiSettings } from "./store"

/*
 * What members may pick from and what the status route reports. A model is offered only when its provider
 * has a key, the admin has not switched it off, and AI is on.
 */

export type PublicModel = { id: string; label: string; provider: string; context: number; notes: string }

/** Models offered in the Lab playground, in the admin's order. Empty when AI is off or no key is set. */
export async function listModels(): Promise<PublicModel[]> {
  const s = await loadAiSettings()
  if (!s.enabled) return []
  return chainFor("playground", s)
    .map(modelById)
    .filter((m): m is ModelInfo => Boolean(m && m.playground && credentials(m.provider)))
    .map((m) => ({ id: m.id, label: m.label, provider: m.provider, context: m.context, notes: m.notes }))
}

/** Whether a job has at least one model it can use right now (ignoring today's caps). */
export async function jobsReady(): Promise<{ enabled: boolean; jobs: Record<AiJob, boolean> }> {
  const s = await loadAiSettings()
  const jobs = {} as Record<AiJob, boolean>
  for (const job of ["news", "summary", "moderation", "rewrite", "translate", "code", "playground"] as AiJob[]) {
    jobs[job] = s.enabled && chainFor(job, s).some((id) => {
      const m = modelById(id)
      return Boolean(m && credentials(m.provider) && (job !== "playground" || m.playground))
    })
  }
  return { enabled: s.enabled && Object.values(jobs).some(Boolean), jobs }
}
