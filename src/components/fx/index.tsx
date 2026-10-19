"use client"

import dynamic from "next/dynamic"

/*
 * Nexverse's shared visual effects, for any page. All are decorative (aria-hidden), fill the box you give them
 * (so nothing shifts while they load), load only in the browser, pause offscreen and in hidden tabs, cap the
 * pixel ratio at 1.5 and hold one still frame under reduced motion or `still`.
 *
 *   LoopVideo       the brand loops in public/media (the N in its galaxy; the galaxy alone)   ./loop-video
 *   FilamentFlow    HorizonX "Filament Flow": sheets of gas filaments drifting (WebGL)         ./filament-flow
 *   HalftoneOrbit   HorizonX "Halftone Orbit": a breathing halftone ring (WebGL), keep square  ./halftone-orbit
 *   ParticleSphere  HorizonX "Particle Sphere": a draggable sphere of points (2D canvas)      ./particle-sphere
 *   GlowCard        HorizonX "Border Glow": a lamp on a card's rim near the pointer           @/components/hub/glow-card
 *   VideoEmbed      click-to-load YouTube / Vimeo / file player                               ./video-embed
 *
 * WebGL effects each hold a GPU context: use at most two or three on one screen. (HorizonX "Dust Vortex" lives
 * in @/components/auth-fx/dust-vortex, on an opaque ground, for the sign-in screens.)
 */

export { LoopVideo, LOOPS, type LoopName } from "./loop-video"

export const FilamentFlow = dynamic(() => import("./filament-flow"), { ssr: false })

export const HalftoneOrbit = dynamic(() => import("./halftone-orbit"), { ssr: false })

export const ParticleSphere = dynamic(() => import("./particle-sphere").then((m) => m.ParticleSphere), { ssr: false })
