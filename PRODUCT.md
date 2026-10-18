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

Not a model hub with comments bolted on, and not an enterprise SaaS or dashboard. The unit of Nexverse is
the loop: a question, the answers, the thing someone built from them, and that thing shared back and linked to
the question that started it. Every language is first class: posts keep their original language and are
readable in yours.

## Operating Context

Long reading sessions on desktop, quick checks on a phone, at any hour in any time zone. Threads, model and
dataset pages, a news digest with community notes, and profiles that show who helped whom.

## Capabilities and Constraints

- Built so far: public pages for home, explore, orbits (communities), threads, artifacts, signal (news),
  people, and a composer.
- Undecided: accounts and sign-in, database and hosting, moderation tooling, translation provider, domain.
- Posting is stored on the visitor's device until a backend exists.

## Brand Commitments

- The name **Nexverse**.
- The fluid, metallic **N** symbol from the chosen references, adapted per context but never replaced. The X
  must not become the main symbol.
- Liquid metal, silver and graphite express Daniel's taste; they are not a required palette or scene.
- Logo assets in `public/brand/` come from the brief. The SVGs in the brief are provisional and were not used.

## Evidence on Hand

- Logo PNGs, app icons and four material studies of the N (chrome, titanium, pearl, champagne).
- No real members, posts, statistics, partners, prices or press. All people, threads, artifacts and news in
  `src/lib/data.ts` are sample content and must not be presented as real.

## Product Principles

1. The question and what it became stay linked forever.
2. Every language is first class; the original is never hidden.
3. Credit follows the work: profiles show help given and received, not follower counts.
4. Public and readable without an account.
5. Calm surfaces, so the people and their work carry the page.

## Accessibility & Inclusion

WCAG 2.1 AA as the floor. Mixed scripts (Latin, Japanese, and more) must render well. Reduced motion is
respected everywhere.
