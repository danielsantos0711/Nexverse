"use client"

import dynamic from "next/dynamic"

/*
 * The home page's HorizonX effects, loaded only in the browser (they draw on canvas or measure fonts) and
 * only when the section that holds them renders. Each is decorative and paused offscreen; see the files in ./fx.
 */

/** Comets falling through the Signal band: news arriving. */
export const CometStreaks = dynamic(() => import("./fx/comet-streaks"), { ssr: false })

/** Words turning around a circle, around the briefing's date. */
export const TextRing = dynamic(() => import("./fx/text-ring"), { ssr: false })

/** A field of pixels that grows from the pointer on the card it sits in. */
export const PixelField = dynamic(() => import("./fx/pixel-field"), { ssr: false })

/** HorizonX "Plasma Orb": a glass orb with a plasma core, the world waiting in the closing band. Keep square. */
export const PlasmaOrb = dynamic(() => import("./fx/plasma-orb"), { ssr: false })
