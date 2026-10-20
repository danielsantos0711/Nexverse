import { cn } from "@/lib/utils"

/**
 * A crew's banner: the picture its captain uploaded, or a nebula painted from the crew's colour. The stars are a
 * fixed pattern derived from the crew's slug, so each crew's sky is its own and never changes between visits.
 */
export function CrewBanner({ banner, tint, seed, className, children }: { banner: string | null; tint: string; seed: string; className?: string; children?: React.ReactNode }) {
  const stars = starsFor(seed)
  return (
    <div className={cn("relative overflow-hidden bg-[#070a14]", className)}>
      {banner ? (
        // eslint-disable-next-line @next/next/no-img-element -- a member upload from storage, any size
        <img src={banner} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <>
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `radial-gradient(60% 90% at ${stars.cx}% 10%, color-mix(in oklab, ${tint} 42%, transparent), transparent 70%), radial-gradient(50% 80% at ${100 - stars.cx}% 100%, color-mix(in oklab, ${tint} 22%, transparent), transparent 70%), linear-gradient(180deg, #0b1020, #070a14)`,
            }}
          />
          <svg aria-hidden className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 100 40">
            {stars.list.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.o} />
            ))}
          </svg>
        </>
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      {children}
    </div>
  )
}

function starsFor(seed: string) {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
  const list = Array.from({ length: 28 }, () => ({ x: rand() * 100, y: rand() * 40, r: 0.12 + rand() * 0.28, o: 0.25 + rand() * 0.6 }))
  return { list, cx: 15 + Math.round(rand() * 70) }
}
