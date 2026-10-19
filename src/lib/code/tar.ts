/*
 * Reads the regular files out of a .tar archive (GitHub's tarballs: ustar with pax extended headers for long
 * names). Server side only, for importing. Symlinks, folders and other entry types are skipped.
 */

export type TarFile = { path: string; data: Uint8Array; mode: number }

const dec = new TextDecoder()

function str(b: Uint8Array, start: number, len: number) {
  const s = b.subarray(start, start + len)
  const end = s.indexOf(0)
  return dec.decode(end >= 0 ? s.subarray(0, end) : s)
}

function octal(b: Uint8Array, start: number, len: number) {
  const s = str(b, start, len).trim()
  return s ? parseInt(s, 8) : 0
}

/** Parses pax records ("<len> key=value\n") and returns the path, if any. */
function paxPath(data: Uint8Array): string | null {
  const text = dec.decode(data)
  let i = 0
  let path: string | null = null
  while (i < text.length) {
    const sp = text.indexOf(" ", i)
    if (sp < 0) break
    const len = parseInt(text.slice(i, sp), 10)
    if (!Number.isFinite(len) || len <= 0) break
    const rec = text.slice(sp + 1, i + len - 1)
    const eq = rec.indexOf("=")
    if (eq > 0 && rec.slice(0, eq) === "path") path = rec.slice(eq + 1)
    i += len
  }
  return path
}

/** Every regular file in the archive, in order. Throws on a malformed header. */
export function untar(buf: Uint8Array): TarFile[] {
  const files: TarFile[] = []
  let off = 0
  let longName: string | null = null
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512)
    if (h.every((x) => x === 0)) break
    const size = octal(h, 124, 12)
    const type = String.fromCharCode(h[156] || 48)
    const magic = str(h, 257, 6)
    let name = str(h, 0, 100)
    if (magic.startsWith("ustar")) {
      const prefix = str(h, 345, 155)
      if (prefix) name = `${prefix}/${name}`
    }
    const start = off + 512
    if (start + size > buf.length) throw new Error("The archive is cut short.")
    const data = buf.subarray(start, start + size)
    off = start + Math.ceil(size / 512) * 512

    if (type === "x") {
      longName = paxPath(data)
      continue
    }
    if (type === "L") {
      longName = str(data, 0, data.length)
      continue
    }
    if (type === "g") continue
    const path = longName ?? name
    longName = null
    if (type === "0" || type === "\0" || type === "7") files.push({ path, data, mode: octal(h, 100, 8) })
  }
  return files
}
