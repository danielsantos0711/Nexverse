import Image from "next/image"
import { LiquidN } from "@/components/liquid-n"
import { cn } from "@/lib/utils"
import "./brand.css"

/*
 * The lockup in liquid metal (round 12b, Daniel: "algo mais liquid metal transparent"). Two of Daniel's own files,
 * only ever scaled uniformly, never redrawn:
 *   n-liquid-512.webp   551 × 512, made from n-chrome-alpha.webp (same outline; grain smoothed out of the shading,
 *                       the dark body turned translucent, edges re-antialiased; master: n-liquid.webp)
 *   wordmark-liquid.png 6384 × 553, the eight glyphs of wordmark-white.png, untouched, a little more air between them
 * The original horizontal-white.png and friends are kept for the newsroom covers and anything else that wants them.
 */
const N_RATIO = 551 / 512
const WORD_RATIO = 6384 / 553
/** The wordmark box against the N's height (the lockup's own proportion, the wordmark a touch larger). */
const WORD_H = 0.46
const GAP = 0.2

/** The N's height in CSS pixels for each size; the whole lockup is about 6.6 times as wide. */
export const LOCKUP_SIZES = {
  /** Mobile header and the menu sheet: about 170 wide */
  sm: 26,
  /** Desktop header: about 220 wide */
  md: 33,
  /** Footer and sign-in screens: about 265 wide */
  lg: 40,
} as const
export type LockupSize = keyof typeof LOCKUP_SIZES

/**
 * The horizontal NEXVERSE lockup (the N and the wordmark) in translucent liquid metal, with a slow light sweep.
 * Callers can resize it with a [--nh:..px] class; display classes (hidden, sm:flex) pass straight through.
 */
export function Lockup({ size = "md", className, priority = false, alt = "Nexverse" }: { size?: LockupSize; className?: string; priority?: boolean; alt?: string }) {
  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      style={{ "--nh": `${LOCKUP_SIZES[size]}px` } as React.CSSProperties}
      className={cn("flex shrink-0 items-center select-none", className)}
    >
      {/* Daniel's N in live liquid metal (LiquidN); the still file shows first and on slow machines */}
      <LiquidN priority={priority} className="nx-logo-n" style={{ height: "var(--nh)", width: `calc(var(--nh) * ${N_RATIO})` }} />
      <span
        aria-hidden
        className="nx-logo-word"
        style={{ height: `calc(var(--nh) * ${WORD_H})`, width: `calc(var(--nh) * ${WORD_H * WORD_RATIO})`, marginLeft: `calc(var(--nh) * ${GAP})` }}
      />
    </span>
  )
}

export type Material = "chrome" | "titanium" | "champagne"

/** The fluid N in one of its material studies, as a still image. The files are square, so any square box shows it whole. */
export function NMark({
  material = "chrome",
  className,
  sizes = "240px",
  small = false,
  priority = false,
}: {
  material?: Material
  className?: string
  sizes?: string
  small?: boolean
  priority?: boolean
}) {
  return (
    <span className={cn("relative block aspect-square overflow-hidden", className)}>
      <Image src={`/brand/n-${material}${small ? "-sm" : ""}.webp`} alt="" fill sizes={sizes} priority={priority} className="object-contain" />
    </span>
  )
}
