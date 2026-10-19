"use client"

/*
 * Editable site content. Every piece of copy or curated list on a page goes through these hooks with a key
 * and the default the code ships with; an admin can then change it from the site editor or in place on the
 * page, without a deploy. Keys are dotted and stable: "<page>.<section>.<field>", e.g. "home.hero.title".
 *
 * Round 9 lead stub: returns the fallback. The CMS worker replaces the internals (storage, live updates,
 * inline edit mode) without changing these signatures.
 */

export type ContentKey = string

/** A piece of editable text. */
export function useCopy(key: ContentKey, fallback: string): string {
  void key
  return fallback
}

/**
 * An editable structured value: a list of items or a small config object. The fallback's shape is the
 * schema the admin editor shows (strings, numbers, booleans, arrays of flat objects).
 */
export function useBlock<T>(key: ContentKey, fallback: T): T {
  void key
  return fallback
}
