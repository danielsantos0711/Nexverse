/*
 * The scroll and depth system (round 11). Use it on any page:
 *
 *   Site-wide (mounted once in the community layout): <SmoothScroll/>, <AmbientSky/>.
 *   Reveals:      <Reveal variant="rise|clip|mask|fan|tilt|warp|iris" stagger> … </Reveal>, <SplitWords text/>
 *   Scrubbed:     <Parallax speed>, <ScrollProgress> (writes --p 0..1 on itself), <ScrollPortal src alt>
 *   CSS only:     className="sd-rise | sd-zoom | sd-clip | sd-iris | sd-parallax | sd-fan | sd-horizon | sd-shrink"
 *   Sections:     <SkySection tone="ion|gold|aurora|nova|rose" horizon>, <WarpDivider/>
 *   Pointer:      <Tilt>, <Magnetic>, <Ripple>
 *   Numbers:      <RollingNumber value/>
 *   Empty states: <EmptySky title body action/>
 *   Chrome:       useScrollFacts(), usePhoneBar(pinned), smoothScrollTo(y)
 * Everything respects reduced motion, the member's Calm and the device's quality tier.
 */
export { AmbientSky, type SkyTone } from "./ambient-sky"
export { SmoothScroll, smoothScrollTo } from "./smooth-scroll"
export { Reveal, SplitWords, type RevealVariant } from "./reveal"
export { Parallax, ScrollProgress } from "./parallax"
export { Tilt, Magnetic, Ripple } from "./pointer"
export { RollingNumber } from "./rolling-number"
export { SkySection, WarpDivider, ScrollPortal } from "./sections"
export { EmptySky } from "./empty-sky"
export { useScrollFacts, usePhoneBar } from "./scroll-state"
