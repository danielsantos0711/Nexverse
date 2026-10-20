/** Storage keys allow a narrow alphabet; the real name is kept in the table. */
export function storageName(name: string) {
  const dot = name.lastIndexOf(".")
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12) : ""
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120)
  return (base || "file") + ext
}
