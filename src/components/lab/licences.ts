/*
 * Plain-language summaries of common model and data licences. Deliberately conservative: where the
 * answer turns on facts (what counts as commercial, whether weights are a "work" under a software
 * licence) it says so instead of guessing. Not legal advice.
 */

export type LicenceId = "apache-2.0" | "mit" | "bsd-3" | "gpl-3.0" | "agpl-3.0" | "cc-by-4.0" | "cc-by-nc-4.0" | "cc-by-sa-4.0" | "openrail-m" | "llama-style" | "cc0"

export type UseId = "commercial" | "research" | "redistribute" | "finetune" | "saas"

export type Verdict = "yes" | "conditions" | "no" | "unclear"

export type Answer = { verdict: Verdict; summary: string; must?: string[]; cant?: string[] }

export type Licence = {
  id: LicenceId
  name: string
  family: "Permissive" | "Copyleft" | "Creative Commons" | "Responsible AI" | "Custom" | "Public domain"
  blurb: string
  /** Obligations that apply whenever you share or use it. */
  must: string[]
  cant: string[]
  answers: Record<UseId, Answer>
  caveat?: string
}

export const USES: { id: UseId; label: string; question: string }[] = [
  { id: "commercial", label: "Commercial product", question: "Use it inside a product or service you sell or that earns money" },
  { id: "research", label: "Research", question: "Use it for research, study or evaluation" },
  { id: "redistribute", label: "Redistribute weights", question: "Share the original weights or data with others" },
  { id: "finetune", label: "Fine-tune and share", question: "Fine-tune or modify it and publish the result" },
  { id: "saas", label: "Offer as SaaS / API", question: "Run it on a server and let others use it over the network" },
]

const NOTICE = "Keep the copyright notice and a copy of the licence"

export const LICENCES: Licence[] = [
  {
    id: "apache-2.0",
    name: "Apache 2.0",
    family: "Permissive",
    blurb: "Permissive, with an explicit patent grant. Very common for open model weights and code.",
    must: [NOTICE, "Keep the NOTICE file if there is one", "State significant changes you made in files you share"],
    cant: ["Use the licensor's names or trademarks", "Hold contributors liable", "Keep the patent licence if you sue over patents in the work"],
    answers: {
      commercial: { verdict: "yes", summary: "Allowed, including in closed-source products." },
      research: { verdict: "yes", summary: "Allowed without restriction." },
      redistribute: { verdict: "conditions", summary: "Allowed, as long as the licence and notices travel with it.", must: [NOTICE, "Include the NOTICE file if present"] },
      finetune: { verdict: "conditions", summary: "Allowed. You may release your version under other terms, but keep the original notices.", must: ["Mark that you changed it", NOTICE] },
      saas: { verdict: "yes", summary: "Allowed. Serving it over a network creates no obligation to share anything." },
    },
  },
  {
    id: "mit",
    name: "MIT",
    family: "Permissive",
    blurb: "Short and permissive: do almost anything, keep the notice.",
    must: [NOTICE + " in copies or substantial portions"],
    cant: ["Hold the authors liable"],
    answers: {
      commercial: { verdict: "yes", summary: "Allowed, including in closed-source products." },
      research: { verdict: "yes", summary: "Allowed without restriction." },
      redistribute: { verdict: "conditions", summary: "Allowed with the copyright and licence notice included.", must: [NOTICE] },
      finetune: { verdict: "conditions", summary: "Allowed, under any terms you like for your changes, keeping the original notice.", must: [NOTICE] },
      saas: { verdict: "yes", summary: "Allowed. No obligations from serving it." },
    },
  },
  {
    id: "bsd-3",
    name: "BSD 3-Clause",
    family: "Permissive",
    blurb: "Permissive like MIT, plus a rule against using the authors' names to promote your work.",
    must: [NOTICE, "Reproduce the notice in documentation of binary distributions"],
    cant: ["Use the authors' or contributors' names to endorse or promote your product", "Hold the authors liable"],
    answers: {
      commercial: { verdict: "yes", summary: "Allowed, including in closed-source products." },
      research: { verdict: "yes", summary: "Allowed without restriction." },
      redistribute: { verdict: "conditions", summary: "Allowed with the notice, conditions and disclaimer included.", must: [NOTICE] },
      finetune: { verdict: "conditions", summary: "Allowed under any terms, keeping the notice and not implying endorsement.", must: [NOTICE], cant: ["Imply endorsement by the original authors"] },
      saas: { verdict: "yes", summary: "Allowed. No obligations from serving it." },
    },
  },
  {
    id: "gpl-3.0",
    name: "GPL 3.0",
    family: "Copyleft",
    blurb: "Strong copyleft: anything you distribute that is based on it must be shared under the GPL too.",
    must: ["License derivative works you distribute under GPL-3.0", "Provide the corresponding source (for a model: what is needed to modify it)", NOTICE],
    cant: ["Add further restrictions for recipients", "Distribute derivatives under closed terms"],
    answers: {
      commercial: { verdict: "conditions", summary: "Allowed, but if you ship the work or a derivative to customers, they get it under the GPL with source.", must: ["Offer source under GPL-3.0 to anyone you distribute to"] },
      research: { verdict: "yes", summary: "Allowed. Private use and study carry no obligations." },
      redistribute: { verdict: "conditions", summary: "Allowed under GPL-3.0 only, with source and the licence text.", must: ["Use GPL-3.0", "Provide source", NOTICE] },
      finetune: { verdict: "conditions", summary: "Allowed. A fine-tune you publish is a derivative and must be GPL-3.0 as well.", must: ["Release the fine-tune under GPL-3.0", "Provide what is needed to modify it"] },
      saas: { verdict: "yes", summary: "Allowed. Network use is not distribution under GPL-3.0, so serving it does not trigger copyleft." },
    },
    caveat: "Software licences were not written for model weights, and how copyleft applies to weights and their outputs is legally unsettled.",
  },
  {
    id: "agpl-3.0",
    name: "AGPL 3.0",
    family: "Copyleft",
    blurb: "GPL plus a network clause: offering a modified version over a network counts like distributing it.",
    must: ["License derivatives under AGPL-3.0", "Offer source to users who interact with a modified version over a network", NOTICE],
    cant: ["Run a modified version as a service while keeping the changes private", "Add further restrictions"],
    answers: {
      commercial: { verdict: "conditions", summary: "Allowed, but users of your product (including over the network) must be able to get the source of your modified version.", must: ["Offer complete source of the modified version under AGPL-3.0"] },
      research: { verdict: "yes", summary: "Allowed. Private use with no outside users carries no obligations." },
      redistribute: { verdict: "conditions", summary: "Allowed under AGPL-3.0 only, with source.", must: ["Use AGPL-3.0", "Provide source", NOTICE] },
      finetune: { verdict: "conditions", summary: "Allowed. Your fine-tune must be AGPL-3.0 when you share or serve it.", must: ["Release under AGPL-3.0"] },
      saas: { verdict: "conditions", summary: "Allowed, but if you modified it, people using your service must be offered the source.", must: ["Offer source of your modified version to network users"] },
    },
    caveat: "As with the GPL, applying AGPL terms to weights is legally unsettled.",
  },
  {
    id: "cc-by-4.0",
    name: "CC BY 4.0",
    family: "Creative Commons",
    blurb: "Do anything, including commercially, as long as you give credit. Common for datasets.",
    must: ["Credit the creator", "Link to the licence", "Indicate if you made changes"],
    cant: ["Suggest the creator endorses you", "Add terms or technical measures that stop others using what the licence allows"],
    answers: {
      commercial: { verdict: "conditions", summary: "Allowed with attribution.", must: ["Credit the creator and link the licence"] },
      research: { verdict: "conditions", summary: "Allowed. Cite or credit where you share results that include the material.", must: ["Credit when you share the material"] },
      redistribute: { verdict: "conditions", summary: "Allowed with attribution and a link to the licence.", must: ["Credit", "Link the licence", "Indicate changes"] },
      finetune: { verdict: "conditions", summary: "Allowed. Credit the original and say you changed it; your additions can use other terms.", must: ["Credit", "Indicate changes"] },
      saas: { verdict: "conditions", summary: "Allowed. Give credit where you present the material to users.", must: ["Credit the creator"] },
    },
  },
  {
    id: "cc-by-nc-4.0",
    name: "CC BY-NC 4.0",
    family: "Creative Commons",
    blurb: "Credit required, and only for non-commercial purposes.",
    must: ["Credit the creator", "Link to the licence", "Indicate changes", "Keep all use non-commercial"],
    cant: ["Use it primarily for commercial advantage or money", "Suggest endorsement"],
    answers: {
      commercial: { verdict: "no", summary: "Not allowed. Any use directed at commercial advantage is excluded; ask the rights holder for a separate licence." },
      research: { verdict: "conditions", summary: "Academic and non-profit research is fine. Research inside a company may count as commercial: check before relying on it.", must: ["Credit", "Stay non-commercial"] },
      redistribute: { verdict: "conditions", summary: "Allowed for non-commercial purposes, with attribution.", must: ["Credit", "Link the licence", "Non-commercial only"] },
      finetune: { verdict: "conditions", summary: "Allowed for non-commercial purposes; anything you share must stay non-commercial.", must: ["Credit", "Indicate changes", "Non-commercial only"] },
      saas: { verdict: "no", summary: "Not for a paid or revenue-generating service. A genuinely free, non-commercial service may be fine." },
    },
  },
  {
    id: "cc-by-sa-4.0",
    name: "CC BY-SA 4.0",
    family: "Creative Commons",
    blurb: "Credit required, and adaptations you share must use the same licence (share-alike).",
    must: ["Credit the creator", "Link to the licence", "Indicate changes", "Share adaptations under CC BY-SA 4.0 or a compatible licence"],
    cant: ["Share adaptations under more restrictive terms", "Suggest endorsement"],
    answers: {
      commercial: { verdict: "conditions", summary: "Allowed with attribution; adaptations you share must also be BY-SA.", must: ["Credit", "Share-alike for adaptations you share"] },
      research: { verdict: "conditions", summary: "Allowed. Credit where you share material.", must: ["Credit"] },
      redistribute: { verdict: "conditions", summary: "Allowed with attribution, under the same licence.", must: ["Credit", "Keep CC BY-SA 4.0"] },
      finetune: { verdict: "conditions", summary: "Allowed. If the fine-tune is an adaptation, publish it under CC BY-SA 4.0.", must: ["Credit", "Indicate changes", "License it CC BY-SA 4.0"] },
      saas: { verdict: "conditions", summary: "Allowed with credit. Whether serving outputs counts as sharing an adaptation is unsettled.", must: ["Credit"] },
    },
  },
  {
    id: "openrail-m",
    name: "OpenRAIL-M",
    family: "Responsible AI",
    blurb: "Open and royalty-free, with use-based restrictions (no illegal or harmful uses) that must pass downstream.",
    must: ["Include the use restrictions in any licence you grant downstream", "Give recipients a copy of the licence", "Mark modified files", "Keep notices"],
    cant: ["Use the model for the restricted purposes listed in the licence (e.g. illegal activity, discrimination, harmful medical or legal advice without oversight)", "Drop the use restrictions when you share it"],
    answers: {
      commercial: { verdict: "conditions", summary: "Allowed, as long as the product respects the use restrictions.", must: ["Respect the restricted uses"] },
      research: { verdict: "conditions", summary: "Allowed within the use restrictions.", must: ["Respect the restricted uses"] },
      redistribute: { verdict: "conditions", summary: "Allowed. The restrictions and licence must go with it.", must: ["Pass on the use restrictions", "Include the licence"] },
      finetune: { verdict: "conditions", summary: "Allowed. Your derivative can have its own licence, but it must carry the same use restrictions.", must: ["Carry the use restrictions", "Mark modifications"] },
      saas: { verdict: "conditions", summary: "Allowed. Your terms of service must hold users to the use restrictions.", must: ["Bind users to the restrictions"] },
    },
  },
  {
    id: "llama-style",
    name: "Llama-style community licence",
    family: "Custom",
    blurb: "A custom licence: free for most uses, with an acceptable-use policy, attribution rules and a cap for very large companies.",
    must: ["Follow the acceptable-use policy", "Show the required attribution (e.g. a “Built with …” notice)", "Include the licence when you share", "Follow naming rules for derivatives (often the base name as a prefix)"],
    cant: ["Use it above the licence's monthly-active-user threshold without a separate agreement", "Use it for purposes the acceptable-use policy forbids", "In some versions: use outputs to improve other model families"],
    answers: {
      commercial: { verdict: "conditions", summary: "Allowed for most companies, under the acceptable-use policy, until you pass the user threshold set in the licence.", must: ["Stay under the user threshold", "Follow the acceptable-use policy", "Attribution"] },
      research: { verdict: "conditions", summary: "Allowed under the acceptable-use policy.", must: ["Follow the acceptable-use policy"] },
      redistribute: { verdict: "conditions", summary: "Allowed with the licence, the attribution notice and the use policy included.", must: ["Include the licence", "Attribution notice"] },
      finetune: { verdict: "conditions", summary: "Allowed. Derivatives carry the same licence terms and usually the base model's name.", must: ["Same terms downstream", "Naming rule", "Attribution"] },
      saas: { verdict: "conditions", summary: "Allowed under the use policy and user threshold.", must: ["Follow the acceptable-use policy", "Stay under the user threshold"] },
    },
    caveat: "Versions differ in important details, such as the user threshold and rules on using outputs. Read the exact version attached to the model.",
  },
  {
    id: "cc0",
    name: "CC0 1.0",
    family: "Public domain",
    blurb: "A public-domain dedication: no conditions at all.",
    must: [],
    cant: ["Rely on it for patent or trademark rights (CC0 grants neither)"],
    answers: {
      commercial: { verdict: "yes", summary: "Allowed, with no conditions." },
      research: { verdict: "yes", summary: "Allowed, with no conditions." },
      redistribute: { verdict: "yes", summary: "Allowed, with no conditions. Credit is appreciated but not required." },
      finetune: { verdict: "yes", summary: "Allowed under any terms you choose." },
      saas: { verdict: "yes", summary: "Allowed, with no conditions." },
    },
  },
]

export const getLicence = (id: string) => LICENCES.find((l) => l.id === id) ?? LICENCES[0]

export const VERDICT: Record<Verdict, { label: string; short: string; cls: string; dot: string }> = {
  yes: { label: "Yes, you can", short: "Can", cls: "bg-ok/10 text-ok ring-ok/25", dot: "var(--ok)" },
  conditions: { label: "Yes, if you follow the conditions", short: "Must", cls: "bg-gold/10 text-gold ring-gold/25", dot: "var(--gold)" },
  no: { label: "No, you can't", short: "Can't", cls: "bg-destructive/10 text-destructive ring-destructive/25", dot: "var(--destructive)" },
  unclear: { label: "It depends", short: "Depends", cls: "bg-ion/10 text-ion ring-ion/25", dot: "var(--ion)" },
}
