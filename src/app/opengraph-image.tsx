import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"

/*
 * The share card every page falls back to when it has no image of its own (a news story's cover, or the
 * admins' SEO image win): Daniel's horizontal logo, unaltered, on the site's graphite.
 */

export const alt = "Nexverse: the open universe for AI builders"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const logo = `data:image/png;base64,${await readFile(join(process.cwd(), "public/brand/horizontal-white.png"), "base64")}`

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#08090d",
          color: "#d4d6dc",
          gap: 44,
        }}
      >
        {/* 1600×328, kept at its own ratio */}
        <img src={logo} width={880} height={180} alt="" />
        <div style={{ fontSize: 34, letterSpacing: 1, color: "#9a9ea8" }}>The open universe for AI builders</div>
      </div>
    ),
    size
  )
}
