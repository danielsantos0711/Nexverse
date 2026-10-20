"use client"

import { MotionConfig } from "motion/react"
import { useEffect } from "react"
import { accentColors, FONT_SCALES, HEX, RADII, useSiteSettings } from "@/lib/site-settings"

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

/*
 * Glass, background, text size and corners. Glass levels move the Liquid Glass tokens (globals.css, --lg-*);
 * the quality tiers there still win on slower machines (frosted only applies at full quality). Backgrounds
 * are fixed gradients on <body>: painted once, no blur, nothing animated.
 */
const LOOK_CSS = `
:root[data-glass-level="clear"] { --lg-fill: rgb(14 17 24 / 0.38); --lg-fill-strong: rgb(13 15 22 / 0.74); --lg-blur: 8px; }
:root[data-glass-level="frosted"]:not([data-glass="low"]):not([data-glass="medium"]):not([data-glass="off"]) { --lg-fill: rgb(14 17 24 / 0.72); --lg-fill-strong: rgb(13 15 22 / 0.92); --lg-blur: 22px; }
:root[data-glass-level="solid"] .liquid-glass,
:root[data-glass-level="solid"] .liquid-glass-strong,
:root[data-glass-level="solid"] .liquid-glass-pill,
:root[data-glass-level="solid"] .glass {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  background-color: var(--popover) !important;
}
:root[data-backdrop="nebula"] body {
  background-image:
    radial-gradient(60% 45% at 0% 0%, rgb(185 167 255 / 0.10), transparent 70%),
    radial-gradient(50% 40% at 100% 30%, rgb(143 180 255 / 0.08), transparent 70%),
    radial-gradient(60% 50% at 30% 100%, rgb(255 159 198 / 0.05), transparent 70%);
  background-attachment: fixed;
}
:root[data-backdrop="aurora"] body {
  background-image:
    radial-gradient(70% 35% at 50% -5%, rgb(127 224 196 / 0.12), transparent 70%),
    radial-gradient(40% 30% at 85% 0%, rgb(143 180 255 / 0.08), transparent 70%);
  background-attachment: fixed;
}
:root[data-backdrop="deep"] { --background: #000000; }
:root[data-backdrop="deep"] .starfield { opacity: 0.45; }
`

/**
 * Applies the admins' theme to the whole site: the accent colours (through the same --ion and --gold tokens
 * every page already uses), glass, background, text size and corners, the motion level as data-motion on <html>, and the hero effect as data-hero-effect for the
 * home page to read. Wraps the page so animations made with motion/react follow the motion level too.
 */
export function SiteSettingsApplier({ children }: { children: React.ReactNode }) {
  const { settings } = useSiteSettings()
  const { motion, heroEffect } = settings.theme

  const { accent, customAccent, secondary, glass, background, fontScale, radius } = settings.theme

  useEffect(() => {
    const root = document.documentElement
    const isDefault = accent === "ion" || (accent === "custom" && !HEX.test(customAccent))
    if (isDefault) {
      // The stylesheet's own values are the "ion" preset.
      ;["--ion", "--ion-foreground", "--ring"].forEach((v) => root.style.removeProperty(v))
    } else {
      const { color, foreground } = accentColors(settings.theme)
      root.style.setProperty("--ion", color)
      root.style.setProperty("--ion-foreground", foreground)
      root.style.setProperty("--ring", color)
    }
    root.dataset.accent = accent
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the colours depend only on these two fields
  }, [accent, customAccent])

  useEffect(() => {
    const root = document.documentElement
    if (HEX.test(secondary)) root.style.setProperty("--gold", secondary)
    else root.style.removeProperty("--gold")
  }, [secondary])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.glassLevel = glass ?? "standard"
    root.dataset.backdrop = background ?? "space"
    const scale = FONT_SCALES.find((f) => f.id === fontScale)
    if (scale && scale.percent !== 100) root.style.fontSize = `${scale.percent}%`
    else root.style.removeProperty("font-size")
    const r = RADII.find((x) => x.id === radius)
    if (r && r.id !== "standard") root.style.setProperty("--radius", `${r.rem}rem`)
    else root.style.removeProperty("--radius")
  }, [glass, background, fontScale, radius])

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
      <style href="nexverse-look" precedence="default">
        {LOOK_CSS}
      </style>
      {children}
    </MotionConfig>
  )
}
