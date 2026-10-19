/*
 * A minimal ZIP writer: STORE only (no compression), so it is small, fast and needs no library. Source code is
 * downloaded once and usually re-compressed by the browser's or the disk's own tools, so the missing deflate
 * costs little. Names are UTF-8 (general purpose flag bit 11). Limits: under 4 GiB in total and 65 535 entries,
 * which the code host's own caps keep far away from (no ZIP64 needed).
 *
 * Layout, per entry: local file header, the bytes; then one central directory record per entry and the
 * end-of-central-directory record. CRC-32 is the IEEE polynomial 0xEDB88320, table driven.
 */

let TABLE: Uint32Array | null = null

function table() {
  if (TABLE) return TABLE
  TABLE = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    TABLE[n] = c >>> 0
  }
  return TABLE
}

/** CRC-32 of bytes, as an unsigned 32-bit number. */
export function crc32(data: Uint8Array): number {
  const t = table()
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type ZipEntry = { path: string; data: Uint8Array; date?: Date }

/** MS-DOS time and date fields. ZIP cannot store dates before 1980. */
function dos(d: Date) {
  const year = Math.max(1980, d.getFullYear())
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

/** Builds a .zip archive from files. Folders are implied by the paths. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  if (entries.length > 0xffff) throw new Error("Too many files for one zip.")
  const enc = new TextEncoder()
  const records = entries.map((e) => {
    const name = enc.encode(e.path.replace(/^\/+/, ""))
    return { name, data: e.data, crc: crc32(e.data), ...dos(e.date ?? new Date()) }
  })

  let size = 22
  for (const r of records) size += 30 + r.name.length + r.data.length + 46 + r.name.length
  if (size > 0xffffffff) throw new Error("This download is too big for one zip.")

  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let p = 0
  const u16 = (v: number) => {
    view.setUint16(p, v, true)
    p += 2
  }
  const u32 = (v: number) => {
    view.setUint32(p, v >>> 0, true)
    p += 4
  }

  const offsets: number[] = []
  for (const r of records) {
    offsets.push(p)
    u32(0x04034b50) // local file header
    u16(20) // version needed: 2.0
    u16(0x0800) // UTF-8 names
    u16(0) // method: store
    u16(r.time)
    u16(r.date)
    u32(r.crc)
    u32(r.data.length) // compressed size
    u32(r.data.length) // uncompressed size
    u16(r.name.length)
    u16(0) // extra length
    out.set(r.name, p)
    p += r.name.length
    out.set(r.data, p)
    p += r.data.length
  }

  const cdStart = p
  records.forEach((r, i) => {
    u32(0x02014b50) // central directory header
    u16(0x031e) // made by: Unix, spec 3.0
    u16(20)
    u16(0x0800)
    u16(0)
    u16(r.time)
    u16(r.date)
    u32(r.crc)
    u32(r.data.length)
    u32(r.data.length)
    u16(r.name.length)
    u16(0) // extra
    u16(0) // comment
    u16(0) // disk number
    u16(0) // internal attributes
    u32((0o100644 << 16) >>> 0) // external attributes: regular file, rw-r--r--
    u32(offsets[i])
    out.set(r.name, p)
    p += r.name.length
  })
  const cdSize = p - cdStart

  u32(0x06054b50) // end of central directory
  u16(0)
  u16(0)
  u16(records.length)
  u16(records.length)
  u32(cdSize)
  u32(cdStart)
  u16(0) // comment length
  return out
}
