"use client"

import { useMemo } from "react"
import type { DuelTask } from "@/lib/arena"
import { setBenchmarkList } from "@/lib/benchmarks"
import type { EventKind } from "@/lib/community"
import { useBlock } from "@/lib/content"
import {
  defOf,
  resolveRows,
  toBadgeRules,
  toBadges,
  toBenchmarks,
  toDuelTasks,
  toEventKinds,
  toGhTopics,
  toGpus,
  toKinds,
  toLabShelves,
  toLabTools,
  toLanguages,
  toLevels,
  toMoreTopics,
  toPoints,
  toPrices,
  toRegex,
  toReleaseRepos,
  toTags,
  type ListName,
  type Row,
} from "./registry"

/*
 * The live versions of the curated lists, for client components. Each hook reads its site_content row through
 * useBlock() (the shared editable-content layer), checks it with the same rules the admin editor uses, and
 * returns the same shape as the constant it replaces, so a call site changes from `KINDS` to `useKinds()`.
 * Before anything loads, or when nothing was saved, they return the defaults.
 */

/** One list as checked rows. */
export function useListRows(name: ListName): Row[] {
  const def = defOf(name)
  const saved = useBlock<unknown>(def.key, def.fallback)
  return useMemo(() => resolveRows(def, saved), [def, saved])
}

function useListAs<T>(name: ListName, convert: (rows: Row[]) => T): T {
  const rows = useListRows(name)
  return useMemo(() => convert(rows), [rows, convert])
}

// GitHub

/** The featured GitHub topics (GH_TOPICS). */
export const useGhTopics = () => useListAs("ghTopics", toGhTopics)
/** The smaller topics shown as chips (MORE_GH_TOPICS). */
export const useMoreGhTopics = () => useListAs("moreTopics", toMoreTopics)
/** [owner, name] pairs whose releases are followed (RELEASE_REPOS). */
export const useReleaseRepos = () => useListAs("releaseRepos", toReleaseRepos)

// Hub

/**
 * The languages members can pick, in the admins' order (LANGUAGES). For showing a tag already on a post, look
 * it up here first and in LANGUAGES second: a language removed from the pickers keeps its name on old posts.
 */
export const useLanguages = () => useListAs("languages", toLanguages)
/** Names and descriptions of the four hub kinds (KINDS). */
export const useKinds = () => useListAs("kinds", toKinds)

// Arena and benchmarks

/** The duel tasks with their names (DUEL_TASKS), plus `enabled`: whether new duels may use it. */
export const useDuelTasks = () => useListAs("duelTasks", toDuelTasks)
/** Only the tasks new duels may use, in order. */
export function useOpenDuelTasks(): DuelTask[] {
  const tasks = useDuelTasks()
  return useMemo(() => (Object.keys(tasks) as DuelTask[]).filter((t) => tasks[t].enabled), [tasks])
}

/**
 * The benchmarks (BENCHMARKS), retired ones included (`retired: true`: readable, closed to new results).
 * Also makes getBenchmark() answer from this list, so lookups by slug anywhere on the page see the changes.
 */
export function useBenchmarks() {
  const list = useListAs("benchmarks", toBenchmarks)
  setBenchmarkList(list)
  return list
}

// Community

/** Points per contribution (POINTS); the database counts with the same values. */
export const usePoints = () => useListAs("points", toPoints)
/** The orbits (LEVELS), lowest first. Pass them to levelFor(points, levels). */
export const useLevels = () => useListAs("levels", toLevels)
/** The constellations (BADGES), each with its earned() check. */
export const useBadges = () => useListAs("badges", toBadges)
/** The badges as editable rules. */
export const useBadgeRules = () => useListAs("badges", toBadgeRules)
/** Event kinds with their names (EVENT_KINDS), plus `enabled`: whether new events may use it. */
export const useEventKinds = () => useListAs("eventKinds", toEventKinds)
/** Only the kinds new events may use, in order. */
export function useOpenEventKinds(): EventKind[] {
  const kinds = useEventKinds()
  return useMemo(() => (Object.keys(kinds) as EventKind[]).filter((k) => kinds[k].enabled), [kinds])
}
/** Tag suggestions (KNOWN_TAGS). */
export const useKnownTags = () => useListAs("tags", toTags)

// Lab

const shownTools = (rows: Row[]) => toLabTools(rows).filter((t) => t.enabled !== false)

/** The Lab's tools that are switched on, in the admins' order, with their names (LAB_TOOLS). */
export const useLabTools = () => useListAs("labTools", shownTools)
/** Every Lab tool, switched-off ones included (enabled: false). */
export const useAllLabTools = () => useListAs("labTools", toLabTools)
/** The Lab's shelves (CATEGORIES). */
export const useLabShelves = () => useListAs("labShelves", toLabShelves)
/** Price presets for the inference cost tool (PRICE_PRESETS). */
export const usePricePresets = () => useListAs("labPrices", toPrices)
/** GPUs for the fine-tuning calculator (GPUS). */
export const useGpus = () => useListAs("labGpus", toGpus)
/** The regex tester's pattern library (LIBRARY). */
export const useRegexLibrary = () => useListAs("labRegex", toRegex)
