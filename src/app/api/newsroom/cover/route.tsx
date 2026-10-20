import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import type { NewsCategory } from "@/lib/newsroom"
import { newsCategoryNames, storyByKey } from "@/lib/newsroom/public"

/*
 * The generated Nexverse cover for a published story (the last resort of the cover finder, and the share
 * image of stories without a photo): the headline over a star field with two orbits in the category's
 * colour and the official NEXVERSE lockup, scaled uniformly from its own file. Drawn with next/og.
 *
 *   /api/newsroom/cover?id=<story id>            1200 × 630, with the headline (hero and share image)
 *   /api/newsroom/cover?id=<story id>&v=art      1200 × 630, the sky and the N only (cards beside the headline)
 *
 * Only published stories are drawn (read with the public key), so drafts never leak through it.
 */

const W = 1200
const H = 630

const TINT: Record<NewsCategory, [number, number, number]> = {
  launch: [143, 180, 255],
  research: [159, 227, 207],
  policy: [216, 197, 158],
  industry: [211, 180, 255],
  tools: [233, 199, 154],
  rumor: [240, 163, 163],
}

/** A small deterministic random sequence from the story id, so a story's sky never changes. */
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

async function asset(path: string, origin: string): Promise<string | null> {
  const toData = (buf: ArrayBuffer | Buffer) => `data:image/png;base64,${Buffer.from(buf as ArrayBuffer).toString("base64")}`
  try {
    return toData(await readFile(join(process.cwd(), "public", path)))
  } catch {
    try {
      const res = await fetch(new URL(`/${path}`, origin), { signal: AbortSignal.timeout(4_000) })
      return res.ok ? toData(await res.arrayBuffer()) : null
    } catch {
      return null
    }
  }
}

let soraFont: Promise<ArrayBuffer | null> | null = null
/** Sora SemiBold (the site's display face) from Google Fonts, once per server; the built-in font otherwise. */
function sora(): Promise<ArrayBuffer | null> {
  soraFont ??= (async () => {
    try {
      const css = await fetch("https://fonts.googleapis.com/css2?family=Sora:wght@600", { signal: AbortSignal.timeout(4_000) }).then((r) => r.text())
      const url = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/)?.[1]
      if (!url) return null
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      return res.ok ? await res.arrayBuffer() : null
    } catch {
      return null
    }
  })()
  return soraFont.then((f) => {
    if (!f) soraFont = null
    return f
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const id = url.searchParams.get("id") ?? ""
  const art = url.searchParams.get("v") === "art"
  if (!UUID.test(id)) return new Response("Not found", { status: 404 })
  const [{ story }, names] = await Promise.all([storyByKey(id), newsCategoryNames()])
  if (!story) return new Response("Not found", { status: 404 })

  const [lockup, mark, font] = await Promise.all([art ? Promise.resolve(null) : asset("brand/horizontal-white.png", url.origin), art ? asset("brand/n-symbol.png", url.origin) : Promise.resolve(null), sora()])
  const [r, g, b] = TINT[story.category]
  const rgb = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`
  const rnd = seeded(story.id)
  const cx = 62 + rnd() * 26
  const cy = 22 + rnd() * 30
  const tilt = -24 + rnd() * 30
  const stars = Array.from({ length: 90 }, () => ({ x: rnd() * W, y: rnd() * H, s: rnd() < 0.08 ? 3 : rnd() < 0.3 ? 2 : 1, o: 0.25 + rnd() * 0.65 }))
  const title = story.title
  const size = title.length > 96 ? 50 : title.length > 70 ? 56 : 64
  const date = story.publishedAt ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(story.publishedAt)) : ""

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: "#05060a", fontFamily: font ? "Sora" : undefined, color: "#f4f6fb" }}>
        {/* the nebula: the category's colour, off-centre, fading into deep space */}
        <div style={{ position: "absolute", inset: 0, display: "flex", backgroundImage: `radial-gradient(circle at ${cx}% ${cy}%, ${rgb(0.42)} 0%, ${rgb(0.12)} 28%, rgba(5,6,10,0) 60%)` }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", backgroundImage: "radial-gradient(circle at 12% 110%, rgba(143,180,255,0.14) 0%, rgba(5,6,10,0) 45%)" }} />
        {stars.map((s, i) => (
          <div key={i} style={{ position: "absolute", left: s.x, top: s.y, width: s.s, height: s.s, borderRadius: 9, backgroundColor: `rgba(255,255,255,${s.o})`, display: "flex" }} />
        ))}
        {/* two orbits around the light */}
        <div
          style={{
            position: "absolute",
            left: `${cx}%`,
            top: `${cy}%`,
            width: 900,
            height: 280,
            marginLeft: -450,
            marginTop: -140,
            borderRadius: 9999,
            border: `1.5px solid ${rgb(0.32)}`,
            transform: `rotate(${tilt}deg)`,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${cx}%`,
            top: `${cy}%`,
            width: 540,
            height: 170,
            marginLeft: -270,
            marginTop: -85,
            borderRadius: 9999,
            border: "1px solid rgba(255,255,255,0.18)",
            transform: `rotate(${tilt + 14}deg)`,
            display: "flex",
          }}
        />
        <div style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`, width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 99, backgroundColor: "#ffffff", boxShadow: `0 0 40px 14px ${rgb(0.55)}`, display: "flex" }} />

        {art && mark ? (
          // The N alone, uniformly scaled from its 564 × 504 file, resting in the light.
          // eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img>
          <img src={mark} width={282} height={252} alt="" style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`, marginLeft: -141, marginTop: -126, opacity: 0.92 }} />
        ) : null}

        <div style={{ position: "absolute", left: 72, right: 72, top: 64, bottom: 60, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* The official lockup, 1600 × 328, at 230 × 47.15: scaled, never stretched. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img> */}
            {art ? <div style={{ display: "flex" }} /> : lockup ? <img src={lockup} width={230} height={47.15} alt="" /> : <div style={{ display: "flex", fontSize: 28, letterSpacing: 8 }}>NEXVERSE</div>}
            <div style={{ display: "flex", fontSize: 20, letterSpacing: 4, textTransform: "uppercase", color: rgb(1) }}>{names[story.category].one}</div>
          </div>
          {art ? (
            <div style={{ display: "flex" }} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 940 }}>
              <div style={{ display: "flex", fontSize: size, lineHeight: 1.12, letterSpacing: -1.5, fontWeight: 600 }}>{title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, color: "rgba(244,246,251,0.62)" }}>
                <div style={{ display: "flex", width: 34, height: 2, backgroundColor: rgb(0.9) }} />
                <div style={{ display: "flex" }}>{`Nexverse News${date ? ` · ${date}` : ""}`}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: font ? [{ name: "Sora", data: font, weight: 600, style: "normal" }] : undefined,
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
    }
  )
}
