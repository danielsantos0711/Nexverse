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
| `/sign-in`, `/auth/callback` | Sign in with an emailed link. The same link creates the account. |
| `/you` | Your name and the questions you asked. |

The orbits, people, threads, artifacts and news that ship with the app are **sample data** in
`src/lib/data.ts`. Members' questions and answers live in Supabase.

## Accounts and storage

Members sign in with an emailed link and write questions and answers to a Supabase Postgres database. The
browser talks to Supabase directly; row level security (in `supabase/migrations/`) makes everything readable
by anyone and lets members write, change and delete only their own rows. An asker can mark the answer that
worked for them.

Without the two environment variables below the app still runs: sign-in is hidden and what people write is
kept in their browser, labelled that way.

### Connect a database

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/20261018150000_members.sql` in the project's SQL editor, or `supabase db push`
   with the Supabase CLI.
3. In Authentication → URL Configuration, set the Site URL to where the app runs and add
   `<site url>/auth/callback` to the redirect URLs (and `http://localhost:3000/auth/callback` for
   development).
4. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key from
   Project Settings → API.

### Host it

Import the repository in [Vercel](https://vercel.com/new), add the same two environment variables, and
deploy. Supabase's built-in email sender is rate limited; connect your own SMTP in Authentication → Emails
before opening sign-up widely.

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

- `src/lib/data.ts`: types, sample content and lookup functions.
- `src/lib/store.ts`: members' questions, answers and session, against Supabase or the browser.
- `src/lib/supabase.ts`: the database client, and whether this copy is connected.
- `supabase/migrations/`: the database schema and its security rules.
- `src/lib/search.ts`: the small matcher behind the ask box, explore and the composer.
- `src/components/home/`: home page sections.
- `src/components/app/`: shared community UI (thread rows, loop marks, the thread view, the composer).
- `PRODUCT.md` and `DESIGN.md`: product truth and the visual system.

## Not built yet

Real translation, moderation and reporting, notifications, member profiles on `/people`, editing a question
after posting, and publishing artifact files.
