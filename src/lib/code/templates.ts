/*
 * Starting files for a new repository. Licence texts come from choosealicense.com (github/choosealicense.com,
 * itself public domain) and .gitignore templates from github/gitignore (CC0). They are bundled as JSON and loaded
 * only when someone creates a repository.
 */

export type LicenseTemplate = { key: string; name: string; spdx: string; description: string; body: string }
export type GitignoreTemplate = { name: string; body: string }

/** The licence choices, without their (long) texts, for the form. */
export const LICENSES: { spdx: string; name: string; hint: string }[] = [
  { spdx: "MIT", name: "MIT License", hint: "Short and permissive: keep the notice, do anything else." },
  { spdx: "Apache-2.0", name: "Apache License 2.0", hint: "Permissive, with an explicit patent grant." },
  { spdx: "GPL-3.0", name: "GNU GPL v3", hint: "Copyleft: changed versions must stay open under the GPL." },
  { spdx: "AGPL-3.0", name: "GNU AGPL v3", hint: "Like the GPL, and also covers software used over a network." },
  { spdx: "MPL-2.0", name: "Mozilla Public License 2.0", hint: "Copyleft per file; can be combined with other code." },
  { spdx: "BSD-3-Clause", name: "BSD 3-Clause", hint: "Permissive; no use of your name to promote." },
  { spdx: "BSD-2-Clause", name: "BSD 2-Clause", hint: "Permissive and very short." },
  { spdx: "ISC", name: "ISC License", hint: "Equivalent to MIT, in fewer words." },
  { spdx: "Unlicense", name: "The Unlicense", hint: "Public domain dedication." },
]

export const GITIGNORES = ["Node", "Python", "Rust", "Go", "Java", "C++"] as const

/** The licence text with the year and holder filled in. */
export async function licenseText(spdx: string, holder: string): Promise<string | null> {
  const list = (await import("./licenses.json")).default as LicenseTemplate[]
  const t = list.find((l) => l.spdx === spdx)
  if (!t) return null
  return t.body.replace(/\[year\]/g, String(new Date().getFullYear())).replace(/\[fullname\]/g, holder)
}

export async function gitignoreText(name: string): Promise<string | null> {
  const list = (await import("./gitignore.json")).default as GitignoreTemplate[]
  return list.find((g) => g.name === name)?.body ?? null
}

export function readmeText(name: string, description: string): string {
  return `# ${name}\n${description ? `\n${description}\n` : ""}`
}
