# Nexverse

A public, international community for people who build with AI. Ask in your own language, get answers from
people who have done it, and share back the models, datasets and tools you make, linked forever to the
question that started them.

## What is here

| Route | What it does |
| --- | --- |
| `/` | Home: the N reel, a live ask box that routes a question to an orbit, a past thread and something already built, the loop, news, and a closing ask. |
| `/explore` | Search threads and artifacts in any language; filter by kind, unanswered, and orbit. Filters live in the URL. |
| `/orbits`, `/orbits/[slug]` | Communities, each with threads, what was built there, people and house rules. |
| `/threads/[id]` | A discussion, readable in English or its original language, with the loop's current stage, what it became, and a reply box. |
| `/artifacts/[slug]` | A model, dataset, tool, repository or prompt set, with the question it came from. |
| `/signal` | News with a member's note on why it matters. |
| `/people/[handle]` | Profiles that show who someone helped and who helped them, not follower counts. |
| `/new` | The composer: suggests an orbit and detects the language as you type. |

All content is **sample data** in `src/lib/data.ts`. There is no backend yet: questions and replies written in
the app are stored in the visitor's browser and labelled that way.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint
```

Node 22 or newer.

## Stack

- Next.js 16 (App Router, Cache Components) and React 19
- Tailwind CSS v4 with tokens in `src/app/globals.css`
- shadcn/ui on Base UI (`src/components/ui`)
- GSAP with `@gsap/react` for the pinned reel, entrances and scroll drift

## Where things live

- `src/lib/data.ts`: types, sample content and lookup functions. Replace these functions with database
  queries when storage exists; pages only call the functions.
- `src/lib/search.ts`: the small matcher behind the ask box, explore and the composer.
- `src/components/home/`: home page sections.
- `src/components/app/`: shared community UI (thread rows, loop marks, the thread view, the composer).
- `PRODUCT.md` and `DESIGN.md`: product truth and the visual system.

## Not built yet

Accounts and sign-in, a database, real translation, moderation, notifications and publishing of artifact files.
