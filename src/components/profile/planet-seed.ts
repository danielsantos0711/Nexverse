import { seeded } from "@/components/hub/bits"
import { PLANET_WORLDS, type PlanetWorld } from "@/lib/profile"

/**
 * MemberPlanet picks its world from the handle (the first draw of seeded("planet:<handle>") over its seven
 * palettes). To show the world a member chose, find the nearest seed, "<handle>~n", that lands on that world.
 * Cheap (the generator is a few multiplications) and the same in the server and the browser.
 */
export function planetSeed(handle: string, world: PlanetWorld | null): string {
  if (!world) return handle
  const want = PLANET_WORLDS.findIndex((w) => w.id === world)
  if (want < 0) return handle
  for (let n = 0; n < 400; n++) {
    const s = n === 0 ? handle : `${handle}~${n}`
    if (Math.floor(seeded(`planet:${s.toLowerCase()}`)() * PLANET_WORLDS.length) === want) return s
  }
  return handle
}
