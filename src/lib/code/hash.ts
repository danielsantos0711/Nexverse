/*
 * Content addressing. A blob's name is the SHA-256 of its bytes, written as 64 lowercase hex characters, so the
 * same file is stored once per repository however many commits use it. WebCrypto does the hashing in the
 * browser and on the server (Node 20+ has `crypto.subtle` on globalThis), so there is no extra dependency.
 */

export const SHA = /^[0-9a-f]{64}$/

function hex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  let s = ""
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0")
  return s
}

/** SHA-256 of bytes (or of a string's UTF-8 bytes) as hex. */
export async function sha256Hex(data: Uint8Array | ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data)
  // Copy into a fresh ArrayBuffer: subtle.digest rejects views over SharedArrayBuffer and some typed-array subclasses.
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return hex(await crypto.subtle.digest("SHA-256", copy.buffer))
}

/** The short form shown in lists, like git's. */
export const shortSha = (sha: string) => sha.slice(0, 7)
