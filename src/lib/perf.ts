"use client"

/*
 * Visual quality for heavy effects (WebGL, canvas, big animations). Effects read the tier and scale their
 * particle counts, resolution and frame rate, so slower computers stay smooth without losing the design.
 *
 * Round 9 lead stub: always "high". The hero/performance worker makes it adaptive (hardware hints, measured
 * frame rate, reduced motion, the admin motion setting) without changing the signature.
 */

export type Quality = "high" | "medium" | "low" | "off"

/** The current quality tier for heavy effects. "off" means render the still fallback. */
export function useQuality(): Quality {
  return "high"
}
