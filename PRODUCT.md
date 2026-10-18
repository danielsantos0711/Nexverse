# Product

<!-- impeccable:product-schema 1 -->

> Written from Daniel's brief (`NEXVERSE_Claude_Liberdade_Criativa.zip`, October 2026), which hands creative,
> product and development direction to Claude. Facts marked _(inferred)_ come from reading the brief and
> should be confirmed.

## Platform

web

## Stack

Delegated: Next.js (App Router) with Tailwind CSS v4, shadcn/ui on Base UI, and GSAP for motion. Chosen
because a community needs real routes, client state and, later, accounts and a database.

## Users

People around the world who build with AI or use it seriously in their work: researchers, hobbyists running
models at home, engineers shipping agents, teachers and doctors trying tools in practice. Many do not write
English first _(inferred from "comunidade pública internacional")_.

## Product Purpose

Nexverse is a public international community about AI: people, forums, conversations, news, tools,
repositories, models and shared knowledge. Success is a place where a question asked today turns into
something built and shared back, and where the person who asked becomes the person who answers.

## Positioning

Daniel's direction (2026-10-18): a Hugging Face-style hub, but more complete and unmistakably its own.
Models, datasets, tools and repos are first-class, next to a real forum, news and people. What only Nexverse
has: constellations (stacks that connect resources into a working whole), a forum where every language is
first class and translation is one click, and a cinematic deep-space design with a real 3D chrome N.

## Operating Context

Long reading sessions on desktop, quick checks on a phone, at any hour in any time zone. Threads, model and
dataset pages, a news digest with community notes, and profiles that show who helped whom.

## Capabilities and Constraints

- Built so far: home, explore, models/datasets/tools/repos with detail pages, forum, news, constellations,
  people, share, sign-in and your page, plus a ⌘K palette.
- Chosen: Supabase for accounts and storage, Vercel for hosting. Undecided: moderation tooling, translation provider, domain.
- Members sign in with an emailed link and post to Supabase; without a database connected, posting stays on the visitor's device and says so.

## Brand Commitments

- The name **Nexverse**.
- The fluid, metallic **N** symbol from the chosen references, adapted per context but never replaced. The X
  must not become the main symbol.
- Liquid metal, silver and graphite express Daniel's taste; they are not a required palette or scene.
- Logo assets in `public/brand/` come from the brief. The SVGs in the brief are provisional and were not used.

## Evidence on Hand

- Logo PNGs, app icons and four material studies of the N (chrome, titanium, pearl, champagne).
- No real members, posts, statistics, partners, prices or press. All people, resources, threads and news in
  `src/lib/data.ts` are sample content and must not be presented as real.

## Product Principles

1. The question and what it became stay linked forever.
2. Every language is first class; the original is never hidden.
3. Credit follows the work: profiles show what someone built and who they helped.
4. Public and readable without an account.
5. Dense and fast to scan, with motion that rewards attention but never blocks reading.

## Accessibility & Inclusion

WCAG 2.1 AA as the floor. Mixed scripts (Latin, Japanese, and more) must render well. Reduced motion is
respected everywhere.
