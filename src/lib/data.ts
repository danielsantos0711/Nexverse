/**
 * Sample content for Nexverse.
 *
 * Every person, thread, artifact and news item below is invented so the product can be seen at full
 * density. None of it is real and none of it may be presented as real. Replace this module with a
 * database-backed implementation of the same functions when accounts and storage exist.
 */

export type Material = "chrome" | "titanium" | "pearl" | "champagne"

export type LanguageCode =
  | "en"
  | "pt"
  | "es"
  | "ja"
  | "de"
  | "fr"
  | "yo"
  | "sw"
  | "hi"
  | "sv"

export const LANGUAGES: Record<LanguageCode, { name: string; native: string }> = {
  en: { name: "English", native: "English" },
  pt: { name: "Portuguese", native: "Português" },
  es: { name: "Spanish", native: "Español" },
  ja: { name: "Japanese", native: "日本語" },
  de: { name: "German", native: "Deutsch" },
  fr: { name: "French", native: "Français" },
  yo: { name: "Yoruba", native: "Yorùbá" },
  sw: { name: "Swahili", native: "Kiswahili" },
  hi: { name: "Hindi", native: "हिन्दी" },
  sv: { name: "Swedish", native: "Svenska" },
}

export type Orbit = {
  slug: string
  name: string
  blurb: string
  about: string
  rules: string[]
  material: Material
}

export type Person = {
  handle: string
  name: string
  place: string
  languages: LanguageCode[]
  bio: string
  joined: string
}

/** Where a thread is in its loop: asked, answered, built from, shared back. */
export type LoopStage = "asked" | "answered" | "built" | "shared"

export const LOOP_STAGES: { id: LoopStage; label: string; detail: string }[] = [
  { id: "asked", label: "Asked", detail: "The question is open." },
  { id: "answered", label: "Answered", detail: "Someone who has done it answered." },
  { id: "built", label: "Built", detail: "Someone made something from the answers." },
  { id: "shared", label: "Shared back", detail: "What was built is linked here for everyone." },
]

export type Translation = { title?: string; body: string }

export type Reply = {
  id: string
  author: string
  date: string
  lang: LanguageCode
  body: string
  en?: string
  accepted?: boolean
}

export type Thread = {
  id: string
  orbit: string
  author: string
  date: string
  lang: LanguageCode
  title: string
  body: string
  en?: Translation
  tags: string[]
  stage: LoopStage
  artifact?: string
  replies: Reply[]
}

export type ArtifactKind = "model" | "dataset" | "tool" | "repo" | "prompts"

export const ARTIFACT_KINDS: Record<ArtifactKind, { label: string; plural: string }> = {
  model: { label: "Model", plural: "Models" },
  dataset: { label: "Dataset", plural: "Datasets" },
  tool: { label: "Tool", plural: "Tools" },
  repo: { label: "Repository", plural: "Repositories" },
  prompts: { label: "Prompts", plural: "Prompt sets" },
}

export type Artifact = {
  slug: string
  kind: ArtifactKind
  name: string
  summary: string
  description: string
  author: string
  orbit: string
  license: string
  languages: LanguageCode[]
  updated: string
  fromThread?: string
  facts: { label: string; value: string }[]
}

export type SignalKind = "model" | "paper" | "tool" | "policy" | "event"

export type SignalItem = {
  id: string
  kind: SignalKind
  title: string
  date: string
  source: string
  why: string
  noteBy: string
  thread?: string
}

export const orbits: Orbit[] = [
  {
    slug: "small-models",
    name: "Small models",
    blurb: "Training, tuning and running models that fit on one GPU or a laptop.",
    about:
      "For people who would rather understand a 3B model completely than rent a frontier one. Fine-tuning recipes, distillation, quantisation and honest numbers from real hardware.",
    rules: [
      "Post the hardware you used. Results without it are rumours.",
      "Share configs as text, not screenshots.",
      "Credit the base model and its licence.",
    ],
    material: "chrome",
  },
  {
    slug: "agents",
    name: "Agents and tools",
    blurb: "Agent loops, tool use, budgets and the ways they break.",
    about:
      "Building systems that call tools and act on their own. We care about loops you can read, stop conditions that work, and failure stories as much as demos.",
    rules: [
      "Show the trace when you ask for help with a loop.",
      "Demos are welcome; failure write-ups are more welcome.",
      "No posts that only link to a product page.",
    ],
    material: "titanium",
  },
  {
    slug: "every-language",
    name: "Every language",
    blurb: "Language technology beyond English, built with the people who speak it.",
    about:
      "Datasets, tokenisers, speech and evaluation for the world's languages. Post in the language you think in; everyone reads it in theirs.",
    rules: [
      "Data about a community is collected with its consent.",
      "Name the variety: European or Brazilian Portuguese, not just Portuguese.",
      "Keep the original text next to any translation.",
    ],
    material: "champagne",
  },
  {
    slug: "local-first",
    name: "Local first",
    blurb: "On-device and home-lab AI: privacy, offline use and old hardware.",
    about:
      "Running models where your data already lives. Laptops, phones, single-board computers and the small servers under desks.",
    rules: [
      "Benchmarks include the exact machine and settings.",
      "Be kind about old hardware. That is the point.",
    ],
    material: "pearl",
  },
  {
    slug: "evals",
    name: "Evals and benchmarks",
    blurb: "Measuring models honestly, including the parts that are hard to measure.",
    about:
      "How we know what a model can do. Building eval sets, checking for leaks, reading leaderboards critically and designing tests for real tasks.",
    rules: [
      "Publish the eval set or explain why you cannot.",
      "A single number is a claim. Show the spread.",
    ],
    material: "titanium",
  },
  {
    slug: "image-audio",
    name: "Image, audio and video",
    blurb: "Generative media, restoration and the artists who work with them.",
    about:
      "Models that see, hear and make pictures and sound, and the practice around them: restoration, accessibility, and working fairly with artists.",
    rules: [
      "Credit the artists whose work you discuss.",
      "No requests to imitate a living artist without their consent.",
    ],
    material: "champagne",
  },
  {
    slug: "in-practice",
    name: "In practice",
    blurb: "Teachers, clinicians, lawyers and others using AI at work.",
    about:
      "What happens when AI meets a real job. Where it helps, where it fails and what people in the profession wish builders knew.",
    rules: [
      "Never post personal data about students, patients or clients.",
      "Say what your job is, so answers can fit it.",
    ],
    material: "pearl",
  },
  {
    slug: "safety-policy",
    name: "Safety and policy",
    blurb: "Alignment, regulation and what the rules mean for builders.",
    about:
      "Careful discussion of risk, regulation and governance. Legal questions get answers from people who have read the text, with sources.",
    rules: [
      "Link the source when you quote a law or a paper.",
      "Discuss ideas, not people.",
    ],
    material: "chrome",
  },
]

export const people: Person[] = [
  {
    handle: "ines",
    name: "Inês Carvalho",
    place: "Porto",
    languages: ["pt", "en"],
    bio: "Tunes small models for European Portuguese. Thinks tokenisers owe us an apology.",
    joined: "2026-03-02",
  },
  {
    handle: "tunde",
    name: "Babatunde Adeyemi",
    place: "Lagos",
    languages: ["yo", "en"],
    bio: "Collects speech with consent and builds recognisers for Yoruba.",
    joined: "2026-03-11",
  },
  {
    handle: "mei",
    name: "Mei Tanaka",
    place: "Osaka",
    languages: ["ja", "en"],
    bio: "Builds evaluation sets and checks that nobody trained on them.",
    joined: "2026-04-01",
  },
  {
    handle: "rafa",
    name: "Rafael Ortiz",
    place: "Bogotá",
    languages: ["es", "en"],
    bio: "Writes agent loops for a logistics company and failure stories for everyone else.",
    joined: "2026-04-09",
  },
  {
    handle: "priya",
    name: "Priya Raman",
    place: "Bengaluru",
    languages: ["hi", "en"],
    bio: "Runs models on whatever hardware is lying around. Keeps the receipts.",
    joined: "2026-04-15",
  },
  {
    handle: "jonas",
    name: "Jonas Weber",
    place: "Berlin",
    languages: ["de", "en"],
    bio: "Reads regulation so open-source maintainers do not have to.",
    joined: "2026-05-03",
  },
  {
    handle: "amara",
    name: "Amara Okafor",
    place: "Nairobi",
    languages: ["sw", "en"],
    bio: "Secondary-school teacher. Tests AI on real lesson plans, in two languages.",
    joined: "2026-05-20",
  },
  {
    handle: "leo",
    name: "Léo Martin",
    place: "Lyon",
    languages: ["fr", "en"],
    bio: "Restores old radio recordings with source separation and patience.",
    joined: "2026-06-06",
  },
  {
    handle: "sofia",
    name: "Sofía Benítez",
    place: "Montevideo",
    languages: ["es"],
    bio: "Illustrator. Uses image models carefully and asks others to do the same.",
    joined: "2026-06-21",
  },
  {
    handle: "kai",
    name: "Kai Lindqvist",
    place: "Malmö",
    languages: ["sv", "en"],
    bio: "Distils big models into small ones and writes down what was lost.",
    joined: "2026-07-08",
  },
]

export const threads: Thread[] = [
  {
    id: "fine-tune-3b-european-portuguese",
    orbit: "small-models",
    author: "ines",
    date: "2026-09-14",
    lang: "pt",
    title: "Como afinar um modelo de 3B para português europeu com uma só GPU?",
    body: "Tenho uma GPU de 24 GB e cerca de 40 mil pares de instruções em português europeu, muitos escritos à mão por colegas. Os modelos abertos que testei respondem quase sempre em português do Brasil. Vale a pena LoRA ou devo fazer afinação completa? E como avalio se o resultado soa mesmo a Portugal?",
    en: {
      title: "How do I fine-tune a 3B model for European Portuguese on a single GPU?",
      body: "I have a 24 GB GPU and about 40 thousand instruction pairs in European Portuguese, many written by hand by colleagues. The open models I tried almost always answer in Brazilian Portuguese. Is LoRA worth it or should I do a full fine-tune? And how do I check that the result really sounds like Portugal?",
    },
    tags: ["fine-tuning", "lora", "portuguese"],
    stage: "shared",
    artifact: "tagus-3b-pt",
    replies: [
      {
        id: "r1",
        author: "kai",
        date: "2026-09-14",
        lang: "en",
        body: "LoRA first, rank 32 on all linear layers. With 40k pairs a full fine-tune mostly buys you forgetting. Keep 5% of the pairs aside and never look at them until the end.",
        accepted: true,
      },
      {
        id: "r2",
        author: "mei",
        date: "2026-09-15",
        lang: "en",
        body: "For the 'does it sound like Portugal' part: write 200 prompts where the two varieties clearly differ (você vs tu, gerúndio, vocabulary like autocarro/ônibus) and score which variety the answer uses. A small classifier does this well.",
      },
      {
        id: "r3",
        author: "ines",
        date: "2026-09-29",
        lang: "pt",
        body: "Obrigada aos dois. Fiz LoRA com rank 32 e o teste de variedade da Mei. Passou de 18% para 91% de respostas em português europeu. Publiquei o modelo e o conjunto de teste.",
        en: "Thank you both. I did LoRA at rank 32 and Mei's variety test. It went from 18% to 91% of answers in European Portuguese. I published the model and the test set.",
      },
    ],
  },
  {
    id: "agent-repeats-same-tool",
    orbit: "agents",
    author: "rafa",
    date: "2026-10-02",
    lang: "es",
    title: "¿Cómo evitar que un agente repita la misma herramienta en bucle?",
    body: "Nuestro agente de inventario llama a buscar_pedido con los mismos argumentos cinco o seis veces antes de rendirse. Ya le dije en el prompt que no lo haga. ¿Alguien tiene un patrón que funcione de verdad?",
    en: {
      title: "How do I stop an agent calling the same tool in a loop?",
      body: "Our inventory agent calls find_order with the same arguments five or six times before giving up. I already told it not to in the prompt. Does anyone have a pattern that actually works?",
    },
    tags: ["agents", "tool-use", "loops"],
    stage: "built",
    artifact: "loop-guard",
    replies: [
      {
        id: "r1",
        author: "priya",
        date: "2026-10-02",
        lang: "en",
        body: "Don't fix it in the prompt, fix it in the loop. Hash (tool, args). On the second identical call, return the cached result plus a note: 'You already called this; here is what it returned.' On the third, stop and ask the user.",
        accepted: true,
      },
      {
        id: "r2",
        author: "rafa",
        date: "2026-10-06",
        lang: "es",
        body: "Funcionó. Lo convertí en un middleware pequeño y lo publiqué como loop-guard.",
        en: "It worked. I turned it into a small middleware and published it as loop-guard.",
      },
    ],
  },
  {
    id: "yoruba-speech-with-consent",
    orbit: "every-language",
    author: "tunde",
    date: "2026-08-21",
    lang: "en",
    title: "Collecting Yoruba speech with consent: what worked for us",
    body: "We recorded speakers in three cities over four months. Paying per hour rather than per clip, recording in people's own homes, and letting every speaker withdraw their clips at any time made the biggest difference. Here is the consent form and the pipeline we used, and what we would change.",
    tags: ["speech", "datasets", "consent", "yoruba"],
    stage: "shared",
    artifact: "yoruba-voices",
    replies: [
      {
        id: "r1",
        author: "amara",
        date: "2026-08-22",
        lang: "en",
        body: "The withdrawal promise is the part people skip. How do you honour it once the data is in someone else's training run?",
      },
      {
        id: "r2",
        author: "tunde",
        date: "2026-08-22",
        lang: "en",
        body: "We can't recall it from a finished model, so the licence requires users to re-download the current version before each new training run. Withdrawn clips are gone from that version.",
        accepted: true,
      },
    ],
  },
  {
    id: "check-eval-leak",
    orbit: "evals",
    author: "mei",
    date: "2026-09-03",
    lang: "ja",
    title: "評価セットが学習データに漏れていないか確認する方法",
    body: "日本語の読解評価セットを公開する予定です。公開後に誰かの学習データに混ざったかどうか、どうやって確かめればいいでしょうか。完全一致だけでなく、言い換えも検出したいです。",
    en: {
      title: "How do you check an eval set hasn't leaked into training data?",
      body: "I'm about to publish a Japanese reading-comprehension eval set. After release, how can I tell whether it ended up in someone's training data? I want to catch paraphrases, not only exact copies.",
    },
    tags: ["evals", "contamination", "japanese"],
    stage: "shared",
    artifact: "leakcheck",
    replies: [
      {
        id: "r1",
        author: "kai",
        date: "2026-09-04",
        lang: "en",
        body: "Plant canaries: a few unique, meaningless strings inside the set. If a model can complete them, it saw the set. For paraphrases, compare embeddings of your items against the corpus and flag anything above a threshold you calibrate on known paraphrases.",
        accepted: true,
      },
      {
        id: "r2",
        author: "mei",
        date: "2026-09-18",
        lang: "ja",
        body: "カナリア文字列と埋め込み比較の両方を実装して、leakcheck として公開しました。",
        en: "I implemented both the canary strings and the embedding comparison and published them as leakcheck.",
      },
    ],
  },
  {
    id: "7b-on-a-2019-laptop",
    orbit: "local-first",
    author: "priya",
    date: "2026-09-25",
    lang: "en",
    title: "Running a 7B model on a 2019 laptop: what actually worked",
    body: "Sixteen gigabytes of RAM, no discrete GPU. With 4-bit weights and a 2k context it is usable for drafting and summarising, painful for long documents. Settings, timings and the mistakes I made are below. What are you running on old machines?",
    tags: ["quantisation", "laptop", "offline"],
    stage: "shared",
    artifact: "pocket-models-guide",
    replies: [
      {
        id: "r1",
        author: "leo",
        date: "2026-09-26",
        lang: "fr",
        body: "Même expérience sur un ThinkPad de 2018. Fermer le navigateur fait plus de différence que n'importe quel réglage.",
        en: "Same experience on a 2018 ThinkPad. Closing the browser makes more difference than any setting.",
      },
    ],
  },
  {
    id: "ai-act-open-source-model",
    orbit: "safety-policy",
    author: "jonas",
    date: "2026-10-09",
    lang: "de",
    title: "Was bedeutet der AI Act konkret für ein Open-Source-Modell?",
    body: "Ich betreue ein kleines offenes Sprachmodell. Welche Pflichten gelten, wenn es frei verfügbar ist, und ab wann gilt es als Modell mit allgemeinem Verwendungszweck? Bitte nur Antworten mit Verweis auf den Text.",
    en: {
      title: "What does the AI Act actually mean for an open-source model?",
      body: "I maintain a small open language model. Which obligations apply when it is freely available, and when does it count as a general-purpose model? Please only answer with a reference to the text.",
    },
    tags: ["regulation", "eu", "open-source"],
    stage: "asked",
    replies: [],
  },
  {
    id: "swahili-lesson-plans",
    orbit: "in-practice",
    author: "amara",
    date: "2026-09-30",
    lang: "en",
    title: "Drafting lesson plans in Swahili with a model: where it fails",
    body: "I teach chemistry to fifteen-year-olds. In English the drafts are fine. In Swahili the model invents technical terms instead of using the ones in our national syllabus, and the examples are set in places my students have never been. I made a prompt set that fixes most of this.",
    tags: ["education", "swahili", "prompts"],
    stage: "shared",
    artifact: "darasa-prompts",
    replies: [
      {
        id: "r1",
        author: "tunde",
        date: "2026-10-01",
        lang: "en",
        body: "Putting the syllabus glossary in the prompt is the trick we also use for Yoruba. Did you try asking for local examples explicitly?",
      },
      {
        id: "r2",
        author: "amara",
        date: "2026-10-01",
        lang: "en",
        body: "Yes. 'Use a market in Kisumu' works far better than 'use a local example'. It is in the prompt set.",
        accepted: true,
      },
    ],
  },
  {
    id: "separate-voice-old-recordings",
    orbit: "image-audio",
    author: "leo",
    date: "2026-08-12",
    lang: "fr",
    title: "Séparer la voix et la musique sur des enregistrements anciens",
    body: "J'ai des émissions de radio des années 1950 numérisées depuis des bandes. Les modèles de séparation modernes traitent le souffle comme un instrument. Quelqu'un a-t-il une chaîne de traitement qui marche sur ce genre de sources ?",
    en: {
      title: "Separating voice from music in old recordings",
      body: "I have 1950s radio broadcasts digitised from tape. Modern separation models treat the hiss as an instrument. Does anyone have a pipeline that works on this kind of source?",
    },
    tags: ["audio", "restoration", "separation"],
    stage: "shared",
    artifact: "cleanroom-audio",
    replies: [
      {
        id: "r1",
        author: "sofia",
        date: "2026-08-13",
        lang: "es",
        body: "Primero reducción de ruido clásica, después separación. Al revés, el modelo aprende el ruido.",
        en: "Classic noise reduction first, then separation. The other way round, the model learns the noise.",
        accepted: true,
      },
    ],
  },
  {
    id: "distillation-below-1b",
    orbit: "small-models",
    author: "kai",
    date: "2026-10-11",
    lang: "en",
    title: "Is distillation worth it below 1B parameters?",
    body: "I distilled a 7B teacher into a 600M student. It is better than training the 600M from scratch on reasoning tasks, worse on factual recall, and the gap closes with more data. Has anyone found the point where it stops paying off?",
    tags: ["distillation", "training"],
    stage: "answered",
    replies: [
      {
        id: "r1",
        author: "ines",
        date: "2026-10-12",
        lang: "en",
        body: "Same shape here at 1B. Mixing 20% of the original pre-training data back in recovered most of the recall for us.",
        accepted: true,
      },
    ],
  },
  {
    id: "minimal-agent-loop",
    orbit: "agents",
    author: "priya",
    date: "2026-07-30",
    lang: "en",
    title: "A minimal agent loop you can read in one sitting",
    body: "Most agent frameworks hide the loop. Here is one in about two hundred lines: a tool budget, a step limit, a stop condition, and a trace you can read. Tear it apart.",
    tags: ["agents", "teaching"],
    stage: "shared",
    artifact: "tiny-loop",
    replies: [
      {
        id: "r1",
        author: "rafa",
        date: "2026-07-31",
        lang: "es",
        body: "Lo usamos para formar al equipo nuevo. Leer el bucle completo cambió cómo depuran.",
        en: "We use it to train the new team. Reading the whole loop changed how they debug.",
      },
    ],
  },
  {
    id: "prompts-respect-illustrators",
    orbit: "image-audio",
    author: "sofia",
    date: "2026-10-14",
    lang: "es",
    title: "Prompts que respetan a los ilustradores en lugar de copiarlos",
    body: "Quiero describir un estilo por sus rasgos (trazo, paleta, composición) en vez de por el nombre de un artista vivo. ¿Alguien ha hecho una guía de vocabulario visual para esto?",
    en: {
      title: "Prompts that respect illustrators instead of copying them",
      body: "I want to describe a style by its traits (line, palette, composition) instead of a living artist's name. Has anyone made a visual vocabulary guide for this?",
    },
    tags: ["image", "ethics", "prompts"],
    stage: "asked",
    replies: [],
  },
  {
    id: "tokenizers-unfair-to-portuguese",
    orbit: "every-language",
    author: "ines",
    date: "2026-07-18",
    lang: "en",
    title: "Tokenisers charge Portuguese more than English: measuring it",
    body: "The same paragraph costs noticeably more tokens in Portuguese than in English with most open tokenisers, which means slower answers and higher bills for us. I measured it on parallel text for every language I could find. Results and data inside.",
    tags: ["tokenisers", "fairness", "multilingual"],
    stage: "shared",
    artifact: "token-tax",
    replies: [
      {
        id: "r1",
        author: "tunde",
        date: "2026-07-19",
        lang: "en",
        body: "Please add Yoruba with diacritics and without. The gap between them is a story in itself.",
      },
      {
        id: "r2",
        author: "ines",
        date: "2026-07-24",
        lang: "en",
        body: "Added both. You were right.",
      },
    ],
  },
]

export const artifacts: Artifact[] = [
  {
    slug: "tagus-3b-pt",
    kind: "model",
    name: "tagus-3b-pt",
    summary: "A 3B instruction model that answers in European Portuguese.",
    description:
      "LoRA fine-tune of an open 3B base on hand-written European Portuguese instructions. Includes the variety test from the thread that started it, so you can check the result yourself.",
    author: "ines",
    orbit: "small-models",
    license: "Apache-2.0",
    languages: ["pt"],
    updated: "2026-09-29",
    fromThread: "fine-tune-3b-european-portuguese",
    facts: [
      { label: "Parameters", value: "3B" },
      { label: "Method", value: "LoRA, rank 32" },
      { label: "Trained on", value: "One 24 GB GPU" },
    ],
  },
  {
    slug: "loop-guard",
    kind: "tool",
    name: "loop-guard",
    summary: "Middleware that stops agents repeating the same tool call.",
    description:
      "Hashes each tool call with its arguments. The second identical call gets the cached result and a note; the third ends the loop and hands control back to a person.",
    author: "rafa",
    orbit: "agents",
    license: "Apache-2.0",
    languages: ["es", "en"],
    updated: "2026-10-06",
    fromThread: "agent-repeats-same-tool",
    facts: [
      { label: "Works with", value: "Any loop that logs tool calls" },
      { label: "Behaviour", value: "Cache, warn, then stop" },
    ],
  },
  {
    slug: "yoruba-voices",
    kind: "dataset",
    name: "yoruba-voices",
    summary: "Consented Yoruba speech with transcripts, from three cities.",
    description:
      "Speech recorded in speakers' homes with per-hour payment. Speakers can withdraw clips at any time; every new training run must use the current version.",
    author: "tunde",
    orbit: "every-language",
    license: "CC BY 4.0 with withdrawal clause",
    languages: ["yo"],
    updated: "2026-08-21",
    fromThread: "yoruba-speech-with-consent",
    facts: [
      { label: "Recorded in", value: "Lagos, Ibadan, Abeokuta" },
      { label: "Includes", value: "Consent form and pipeline" },
    ],
  },
  {
    slug: "leakcheck",
    kind: "tool",
    name: "leakcheck",
    summary: "Finds out whether your eval set leaked into a training corpus.",
    description:
      "Plants canary strings in an eval set and compares item embeddings against a corpus to catch paraphrased copies, not only exact ones.",
    author: "mei",
    orbit: "evals",
    license: "MIT",
    languages: ["ja", "en"],
    updated: "2026-09-18",
    fromThread: "check-eval-leak",
    facts: [
      { label: "Checks", value: "Canaries and paraphrases" },
      { label: "Input", value: "An eval set and a corpus sample" },
    ],
  },
  {
    slug: "pocket-models-guide",
    kind: "repo",
    name: "pocket-models-guide",
    summary: "Settings that make 7B models usable on old laptops.",
    description:
      "A living guide with exact settings per machine, contributed by members running models on hardware they already own.",
    author: "priya",
    orbit: "local-first",
    license: "CC BY 4.0",
    languages: ["en"],
    updated: "2026-10-03",
    fromThread: "7b-on-a-2019-laptop",
    facts: [
      { label: "Covers", value: "Laptops without a GPU" },
      { label: "Format", value: "One page per machine" },
    ],
  },
  {
    slug: "darasa-prompts",
    kind: "prompts",
    name: "darasa-prompts",
    summary: "Lesson-plan prompts in Swahili and English that use the national syllabus terms.",
    description:
      "Prompts for chemistry and biology lesson plans that carry the syllabus glossary and ask for examples set in named local places.",
    author: "amara",
    orbit: "in-practice",
    license: "CC BY 4.0",
    languages: ["sw", "en"],
    updated: "2026-10-01",
    fromThread: "swahili-lesson-plans",
    facts: [
      { label: "Subjects", value: "Chemistry, biology" },
      { label: "Level", value: "Secondary school" },
    ],
  },
  {
    slug: "cleanroom-audio",
    kind: "tool",
    name: "cleanroom-audio",
    summary: "Separates voice from music in hissy archival recordings.",
    description:
      "Runs classic noise reduction before source separation so the model never learns the tape hiss. Tuned on mid-century radio.",
    author: "leo",
    orbit: "image-audio",
    license: "MIT",
    languages: ["fr", "en"],
    updated: "2026-08-30",
    fromThread: "separate-voice-old-recordings",
    facts: [
      { label: "Input", value: "Mono or stereo WAV" },
      { label: "Order", value: "Denoise, then separate" },
    ],
  },
  {
    slug: "tiny-loop",
    kind: "repo",
    name: "tiny-loop",
    summary: "An agent loop in about two hundred readable lines.",
    description:
      "A tool budget, a step limit, a stop condition and a readable trace. Meant to be read before it is used.",
    author: "priya",
    orbit: "agents",
    license: "MIT",
    languages: ["en"],
    updated: "2026-07-30",
    fromThread: "minimal-agent-loop",
    facts: [
      { label: "Size", value: "About 200 lines" },
      { label: "Dependencies", value: "None beyond an API client" },
    ],
  },
  {
    slug: "token-tax",
    kind: "dataset",
    name: "token-tax",
    summary: "How many tokens the same text costs in each language.",
    description:
      "Parallel paragraphs counted with common open tokenisers, including Yoruba with and without diacritics.",
    author: "ines",
    orbit: "every-language",
    license: "CC BY 4.0",
    languages: ["pt", "en", "yo", "es", "sw", "hi", "ja"],
    updated: "2026-07-24",
    fromThread: "tokenizers-unfair-to-portuguese",
    facts: [
      { label: "Measures", value: "Tokens per sentence, per language" },
      { label: "Text", value: "Parallel paragraphs" },
    ],
  },
  {
    slug: "kansai-reading-eval",
    kind: "dataset",
    name: "kansai-reading-eval",
    summary: "Japanese reading comprehension questions with canaries planted.",
    description:
      "Short passages with questions written by teachers, published with leakcheck canaries so contamination can be detected later.",
    author: "mei",
    orbit: "evals",
    license: "CC BY-NC 4.0",
    languages: ["ja"],
    updated: "2026-09-20",
    facts: [
      { label: "Written by", value: "Secondary-school teachers" },
      { label: "Protected by", value: "leakcheck canaries" },
    ],
  },
]

export const signal: SignalItem[] = [
  {
    id: "s1",
    kind: "model",
    title: "An open 3B model holds its own against far larger ones on a multilingual reading test",
    date: "2026-10-15",
    source: "Model release",
    why: "If small models are this close on reading, the case for running locally in your own language gets much stronger.",
    noteBy: "ines",
    thread: "distillation-below-1b",
  },
  {
    id: "s2",
    kind: "paper",
    title: "Preprint: most benchmark contamination comes from paraphrases, not copies",
    date: "2026-10-14",
    source: "Preprint",
    why: "Exact-match checks miss most leaks. Anyone publishing an eval set should check for paraphrases too.",
    noteBy: "mei",
    thread: "check-eval-leak",
  },
  {
    id: "s3",
    kind: "policy",
    title: "Draft guidance on obligations for general-purpose models opens for comment",
    date: "2026-10-13",
    source: "Regulator consultation",
    why: "Maintainers of open models can still comment. Read the open-source exemptions before the window closes.",
    noteBy: "jonas",
    thread: "ai-act-open-source-model",
  },
  {
    id: "s4",
    kind: "tool",
    title: "Offline speech recognition now runs on mid-range phones",
    date: "2026-10-12",
    source: "Open-source release",
    why: "Good news for languages with patchy connectivity, if the training data includes them.",
    noteBy: "tunde",
    thread: "yoruba-speech-with-consent",
  },
  {
    id: "s5",
    kind: "event",
    title: "Online workshop: evaluating agents without leaderboards, 14 November",
    date: "2026-10-11",
    source: "Community event",
    why: "Practical sessions on writing task-based evals. Bring a trace you are stuck on.",
    noteBy: "rafa",
  },
  {
    id: "s6",
    kind: "model",
    title: "A real-time audio model splits speech and music on a laptop",
    date: "2026-10-09",
    source: "Model release",
    why: "Fast enough for live radio. Test it on hissy sources before trusting it; most models fail there.",
    noteBy: "leo",
    thread: "separate-voice-old-recordings",
  },
  {
    id: "s7",
    kind: "paper",
    title: "Paper: small models trained on curated textbooks match web-scale ones on reasoning",
    date: "2026-10-07",
    source: "Paper",
    why: "Curation beats volume again. The interesting question is who writes the textbooks in other languages.",
    noteBy: "kai",
  },
  {
    id: "s8",
    kind: "tool",
    title: "Browser-based inference reaches usable speed for 1B models",
    date: "2026-10-05",
    source: "Open-source release",
    why: "No install, no server. For classrooms this could matter more than any new frontier model.",
    noteBy: "amara",
  },
]

export const SIGNAL_KINDS: Record<SignalKind, string> = {
  model: "Model",
  paper: "Paper",
  tool: "Tool",
  policy: "Policy",
  event: "Event",
}

/* Lookups. Kept as plain functions so a database can replace them without touching pages. */

export function getOrbit(slug: string) {
  return orbits.find((o) => o.slug === slug)
}

export function getPerson(handle: string) {
  return people.find((p) => p.handle === handle)
}

export function getThread(id: string) {
  return threads.find((t) => t.id === id)
}

export function getArtifact(slug: string) {
  return artifacts.find((a) => a.slug === slug)
}

export function threadsIn(orbit: string) {
  return threads.filter((t) => t.orbit === orbit).sort(byDateDesc)
}

export function artifactsIn(orbit: string) {
  return artifacts.filter((a) => a.orbit === orbit)
}

export function peopleIn(orbit: string) {
  const handles = new Set<string>()
  for (const t of threadsIn(orbit)) {
    handles.add(t.author)
    t.replies.forEach((r) => handles.add(r.author))
  }
  return people.filter((p) => handles.has(p.handle))
}

export function threadTitle(t: Thread, readIn: LanguageCode = "en") {
  return t.lang === readIn || !t.en?.title ? t.title : t.en.title
}

export function byDateDesc<T extends { date: string }>(a: T, b: T) {
  return b.date.localeCompare(a.date)
}

/**
 * Who a person helped and who helped them, from replies on each other's threads.
 * This replaces follower counts on profiles.
 */
export function helpGraph(handle: string) {
  const helped = new Map<string, number>()
  const helpedBy = new Map<string, number>()
  for (const t of threads) {
    for (const r of t.replies) {
      if (r.author === t.author) continue
      if (r.author === handle) helped.set(t.author, (helped.get(t.author) ?? 0) + 1)
      if (t.author === handle) helpedBy.set(r.author, (helpedBy.get(r.author) ?? 0) + 1)
    }
  }
  return { helped, helpedBy }
}

export function answersBy(handle: string) {
  return threads.flatMap((t) =>
    t.replies.filter((r) => r.author === handle).map((r) => ({ thread: t, reply: r }))
  )
}

export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${d} ${months[m - 1]} ${y}`
}
