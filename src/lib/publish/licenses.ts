/**
 * Licences a member can pick for what they publish, by SPDX identifier (spdx.org/licenses). Licences that have no
 * SPDX id (model licences such as Llama's or Gemma's) use the standard "LicenseRef-" prefix. Grouped so the
 * picker can show code, content, data and model licences apart.
 */

export type LicenseGroup = "Permissive" | "Copyleft" | "Content" | "Data" | "AI models" | "Other"

export type License = { id: string; name: string; group: LicenseGroup; short: string; url?: string }

const spdx = (id: string) => `https://spdx.org/licenses/${id}.html`

export const LICENSE_LIST: License[] = [
  { id: "unspecified", name: "No licence chosen yet", group: "Other", short: "Others have no clear right to reuse it." },
  { id: "Apache-2.0", name: "Apache License 2.0", group: "Permissive", short: "Use, change and sell; keep notices; patent grant.", url: spdx("Apache-2.0") },
  { id: "MIT", name: "MIT License", group: "Permissive", short: "Do almost anything; keep the copyright notice.", url: spdx("MIT") },
  { id: "BSD-3-Clause", name: "BSD 3-Clause", group: "Permissive", short: "Like MIT, and no endorsement with your name.", url: spdx("BSD-3-Clause") },
  { id: "BSD-2-Clause", name: "BSD 2-Clause", group: "Permissive", short: "Like MIT, two short conditions.", url: spdx("BSD-2-Clause") },
  { id: "ISC", name: "ISC License", group: "Permissive", short: "MIT in fewer words.", url: spdx("ISC") },
  { id: "0BSD", name: "BSD Zero Clause", group: "Permissive", short: "No conditions at all.", url: spdx("0BSD") },
  { id: "Unlicense", name: "The Unlicense", group: "Permissive", short: "Public domain dedication for code.", url: spdx("Unlicense") },
  { id: "Zlib", name: "zlib License", group: "Permissive", short: "Permissive; altered versions must say so.", url: spdx("Zlib") },
  { id: "BSL-1.0", name: "Boost Software License 1.0", group: "Permissive", short: "Permissive; no notice needed in binaries.", url: spdx("BSL-1.0") },
  { id: "MPL-2.0", name: "Mozilla Public License 2.0", group: "Copyleft", short: "Share changes to these files; mix with anything.", url: spdx("MPL-2.0") },
  { id: "LGPL-3.0-only", name: "GNU LGPL 3.0", group: "Copyleft", short: "Share changes to the library; link from any code.", url: spdx("LGPL-3.0-only") },
  { id: "LGPL-2.1-only", name: "GNU LGPL 2.1", group: "Copyleft", short: "Older LGPL.", url: spdx("LGPL-2.1-only") },
  { id: "GPL-3.0-only", name: "GNU GPL 3.0", group: "Copyleft", short: "Whole work stays GPL when shared.", url: spdx("GPL-3.0-only") },
  { id: "GPL-3.0-or-later", name: "GNU GPL 3.0 or later", group: "Copyleft", short: "GPL 3.0, or any later version.", url: spdx("GPL-3.0-or-later") },
  { id: "GPL-2.0-only", name: "GNU GPL 2.0", group: "Copyleft", short: "Older GPL.", url: spdx("GPL-2.0-only") },
  { id: "AGPL-3.0-only", name: "GNU AGPL 3.0", group: "Copyleft", short: "GPL that also covers use over a network.", url: spdx("AGPL-3.0-only") },
  { id: "EUPL-1.2", name: "European Union Public Licence 1.2", group: "Copyleft", short: "EU copyleft, in every EU language.", url: spdx("EUPL-1.2") },
  { id: "EPL-2.0", name: "Eclipse Public License 2.0", group: "Copyleft", short: "File-level copyleft.", url: spdx("EPL-2.0") },
  { id: "CC-BY-4.0", name: "Creative Commons Attribution 4.0", group: "Content", short: "Reuse for anything; credit the author.", url: spdx("CC-BY-4.0") },
  { id: "CC-BY-SA-4.0", name: "Creative Commons BY-SA 4.0", group: "Content", short: "Credit, and share alike.", url: spdx("CC-BY-SA-4.0") },
  { id: "CC-BY-NC-4.0", name: "Creative Commons BY-NC 4.0", group: "Content", short: "Credit; no commercial use.", url: spdx("CC-BY-NC-4.0") },
  { id: "CC-BY-NC-SA-4.0", name: "Creative Commons BY-NC-SA 4.0", group: "Content", short: "Credit, non-commercial, share alike.", url: spdx("CC-BY-NC-SA-4.0") },
  { id: "CC-BY-ND-4.0", name: "Creative Commons BY-ND 4.0", group: "Content", short: "Credit; no changed versions.", url: spdx("CC-BY-ND-4.0") },
  { id: "CC-BY-NC-ND-4.0", name: "Creative Commons BY-NC-ND 4.0", group: "Content", short: "Credit, non-commercial, unchanged.", url: spdx("CC-BY-NC-ND-4.0") },
  { id: "CC0-1.0", name: "CC0 1.0 (public domain)", group: "Content", short: "No rights reserved.", url: spdx("CC0-1.0") },
  { id: "ODbL-1.0", name: "Open Database License 1.0", group: "Data", short: "Share-alike for databases.", url: spdx("ODbL-1.0") },
  { id: "ODC-By-1.0", name: "Open Data Commons Attribution 1.0", group: "Data", short: "Credit the database.", url: spdx("ODC-By-1.0") },
  { id: "PDDL-1.0", name: "Open Data Commons Public Domain 1.0", group: "Data", short: "Public domain for data.", url: spdx("PDDL-1.0") },
  { id: "CDLA-Permissive-2.0", name: "Community Data License (Permissive) 2.0", group: "Data", short: "Use data and results freely.", url: spdx("CDLA-Permissive-2.0") },
  { id: "CDLA-Sharing-1.0", name: "Community Data License (Sharing) 1.0", group: "Data", short: "Share changes to the data.", url: spdx("CDLA-Sharing-1.0") },
  { id: "OpenRAIL-M", name: "OpenRAIL-M", group: "AI models", short: "Open model use with behavioural limits.", url: "https://www.licenses.ai/" },
  { id: "CreativeML-OpenRAIL-M", name: "CreativeML OpenRAIL-M", group: "AI models", short: "RAIL licence used by image models.", url: spdx("CreativeML-OpenRAIL-M") },
  { id: "LicenseRef-Llama-3.1", name: "Llama 3.1 Community License", group: "AI models", short: "Meta's terms; limits for very large services.", url: "https://www.llama.com/llama3_1/license/" },
  { id: "LicenseRef-Llama-3.3", name: "Llama 3.3 Community License", group: "AI models", short: "Meta's terms for Llama 3.3.", url: "https://www.llama.com/llama3_3/license/" },
  { id: "LicenseRef-Gemma", name: "Gemma Terms of Use", group: "AI models", short: "Google's terms and use policy.", url: "https://ai.google.dev/gemma/terms" },
  { id: "LicenseRef-Llama-community", name: "Llama community licence (other version)", group: "AI models", short: "Name the version in the README.", url: "https://www.llama.com/" },
  { id: "Proprietary", name: "Proprietary / all rights reserved", group: "Other", short: "Nobody may reuse it without asking." },
]

/** Old ids saved before SPDX ids were used. */
const LEGACY: Record<string, string> = { "GPL-3.0": "GPL-3.0-only", "AGPL-3.0": "AGPL-3.0-only", "LGPL-3.0": "LGPL-3.0-only", "Llama-community": "LicenseRef-Llama-community" }

export const normalizeLicense = (id: string | null | undefined) => (id ? (LEGACY[id] ?? id) : "unspecified")

export const findLicense = (id: string) => LICENSE_LIST.find((l) => l.id === normalizeLicense(id))

export const licenseName = (id: string) => findLicense(id)?.name ?? id

/** Ids the older "license" column accepts; anything else is stored there as "unspecified". */
export const LEGACY_IDS = new Set(["unspecified", "Apache-2.0", "MIT", "BSD-3-Clause", "GPL-3.0", "AGPL-3.0", "LGPL-3.0", "MPL-2.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC0-1.0", "OpenRAIL-M", "Llama-community", "Proprietary"])

export function legacyLicense(id: string) {
  if (LEGACY_IDS.has(id)) return id
  const back = Object.entries(LEGACY).find(([, v]) => v === id)?.[0]
  return back ?? "unspecified"
}

export const LICENSE_ID = /^(LicenseRef-)?[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/

export const LICENSE_GROUPS: LicenseGroup[] = ["Permissive", "Copyleft", "Content", "Data", "AI models", "Other"]
