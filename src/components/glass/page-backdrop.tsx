/*
 * The light that used to sit behind page titles (two HorizonX shaders, "phosphor" and "warp", over a blue and
 * gold still gradient). Removed in round 12: Daniel saw it as "a strange light" behind /repos, and the house rule
 * is a sober graphite sky with no coloured glows. The component stays so every page header keeps compiling, and
 * renders nothing whatever variant it is given.
 */

export type Backdrop = "phosphor" | "warp" | "none"

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so existing callers still type-check
export function PageBackdrop(_props: { variant?: Backdrop; className?: string }) {
  return null
}
