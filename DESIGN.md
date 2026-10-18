# Design

The visual world of Nexverse. Product truth lives in `PRODUCT.md`.

## Idea

The N is one ribbon folded over itself: a surface with no inside and no outside. The product's unit is the
same shape, a loop: a question, its answers, what was built from them, and that thing shared back to the
question. On the home page the N sits inside the sentence "Ask out loud, … build it back." and a reel passes
through it: the N, a question asked in Portuguese, the model built from its answers, the N again.

## Grounds and colour

Two themes, picked by the visitor or their system, never by category.

| Role | Graphite (dark) | Pearl (light) |
| --- | --- | --- |
| Ground `--background` | `#08090d` (matches the chrome, titanium and champagne studies) | `#f1f3f4` (matches the pearl study) |
| Surface step `--card` | `#111318` | `#e7eaec` |
| Raised step `--raised` | `#1a1d23` | `#dde1e4` |
| Ink `--foreground` | `#eceef1` | `#0f1115` |
| Soft ink `--muted-foreground` | `#a3a9b2` | `#4b515a` |
| Field `--field` | `#cdbb97` champagne, ink `#17130c` | same |

- Surfaces are separated by a step in tone, never by lines or shadows at rest.
- Champagne is the one warm field: what was built (artifact frames, the "built" stage, the shared-back stage).
- The N image always sits on a ground that matches its own background, so it never shows a box.

## Type

Archivo, one variable family, two widths.

- Display: `font-wide` (wdth 125), weight 500–600, tracking −0.03 to −0.045em, leading 0.92–1.05. It echoes
  the wide letters of the wordmark.
- Text: Archivo at normal width, 16–17px, leading 1.55.
- Steps: `--step-small` 14px, body, `--step-lead`, `--step-statement` (36px max), `--step-head` (84px max).
- Japanese and other scripts fall back to the system's own fonts.

## Shape

- Buttons are fully round. Frames and panels use a 6px radius. Avatars are round.
- One pair of side margins everywhere: `--gutter` (16–32px).

## Motion (GSAP)

- Signature: the pinned hero reel (`src/components/home/hero.tsx`), scroll-scrubbed with snapping, desktop only.
- Entrances: `Reveal` staggers each section's `[data-reveal]` parts once (rise 24px, `expo.out`).
- Moving picture: `Drift` slowly scales the titanium N as it passes.
- Feedback: `pressable` and buttons scale to 0.97 on press, 160ms.
- Reduced motion keeps fades and drops travel and pinning.

## House rules carried from the build

No eyebrow labels, no monospace outside code, no index numbers, no gradients, no glass, no shadows at rest,
no icon-card grids. Headlines stay within two lines at every width.

## Assets

`public/brand/` holds the logo lockups and wordmarks from the brief, and square crops of the four material
studies (`n-chrome`, `n-titanium`, `n-pearl`, `n-champagne`, each with a `-sm` version). The SVGs in the brief
were provisional and are not used.
