"use client"

import { MotionConfig } from "motion/react"
import { useEffect } from "react"
import { ACCENTS, useSiteSettings } from "@/lib/site-settings"

/*
 * Motion levels as CSS. "calm" stops the looping background motion (stars, marquees, breathing dots and auras)
 * and keeps transitions; "off" ends every CSS animation and transition at once, landing on its final frame so
 * nothing stays hidden. JavaScript animation follows through MotionConfig below.
 */
const MOTION_CSS = `
html[data-motion="calm"] .starfield i,
html[data-motion="calm"] .marquee,
html[data-motion="calm"] .pulse-dot::after,
html[data-motion="calm"] .logo-aura,
html[data-motion="calm"] [class*="animate-spin-slow"],
html[data-motion="calm"] [class*="animate-pulse"] {
  animation: none !important;
}
html[data-motion="off"] *,
html[data-motion="off"] *::before,
html[data-motion="off"] *::after {
  animation-duration: 0.01ms !important;
  animation-delay: 0ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  transition-delay: 0ms !important;
  scroll-behavior: auto !important;
}
html[data-motion="off"] ::view-transition-group(*),
html[data-motion="off"] ::view-transition-old(*),
html[data-motion="off"] ::view-transition-new(*) {
  animation: none !important;
}
`

const VARS = ["--ion", "--ion-foreground", "--ring"] as const

/**
 * Applies the admins' theme to the whole site: the accent colour (through the same --ion tokens every page
 * already uses), the motion level as data-motion on <html>, and the hero effect as data-hero-effect for the
 * home page to read. Wraps the page so animations made with motion/react follow the motion level too.
 */
export function SiteSettingsApplier({ children }: { children: React.ReactNode }) {
  const { settings } = useSiteSettings()
  const { accent, motion, heroEffect } = settings.theme

  useEffect(() => {
    const root = document.documentElement
    const preset = ACCENTS.find((a) => a.id === accent)
    if (!preset || preset.id === "ion") {
      // The stylesheet's own values are the "ion" preset.
      VARS.forEach((v) => root.style.removeProperty(v))
    } else {
      root.style.setProperty("--ion", preset.color)
      root.style.setProperty("--ion-foreground", preset.foreground)
      root.style.setProperty("--ring", preset.color)
    }
    root.dataset.accent = preset?.id ?? "ion"
  }, [accent])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.motion = motion
    root.dataset.heroEffect = heroEffect
  }, [motion, heroEffect])

  return (
    <MotionConfig reducedMotion={motion === "off" ? "always" : "user"}>
      <style href="nexverse-motion-levels" precedence="default">
        {MOTION_CSS}
      </style>
      {children}
    </MotionConfig>
  )
}
