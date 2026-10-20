/* eslint-disable */
// @ts-nocheck
// Vendored from HorizonX "Lumen Rise" (React export). Changes for Nexverse: the cards are the reputation levels
// (`names`, the engraved `digits` and a palette `order` come from props); the wheel never hijacks page scroll;
// devicePixelRatio is capped at 1.5; the carousel is destroyed on unmount (the export only did so on pagehide);
// the host fills its parent; the page's own colours. The engine (WebGL2, springs, faces) is the export's.
import { useLayoutEffect, useRef } from 'react';

const CSS = `
.lr-export-host{width:100%;height:100%}
.lr-export-host .lr-root{width:100%;height:100%;border-radius:0}
.lr-host{width:100%;height:100%}
.lr-frame{display:grid;place-items:center;width:100%;height:100%;overflow:hidden;background:transparent}
.lr-root{position:relative;width:min(100%,var(--lr-width));height:min(100%,var(--lr-height));border-radius:var(--lr-radius);background:var(--lr-bg);color:var(--lr-ink);overflow:hidden;outline:none;container-type:size;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:pan-y;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;transition:background-color .4s ease,color .4s ease}
.lr-root[data-draggable]{cursor:grab;touch-action:none}
.lr-root[data-dragging]{cursor:grabbing}
/* The ring is its own layer: an inset shadow on the root paints under the canvas. */
.lr-root:focus-visible::after{content:'';position:absolute;inset:0;z-index:2;border-radius:inherit;box-shadow:inset 0 0 0 2px var(--lr-ink);pointer-events:none}
.lr-gl{position:absolute;inset:0;pointer-events:none}
.lr-canvas{display:block;width:100%;height:100%}
.lr-still{display:none;position:absolute;left:50%;top:calc(64.5% - min(73cqw,900px,69.8cqh) / 1.586 * .58);width:min(73cqw,900px,69.8cqh);aspect-ratio:1.586;transform:translateX(-50%);border-radius:2.6%/4.1%;background:radial-gradient(120% 70% at 50% 100%,#2a5cd6 0%,#0b1a4a 45%,transparent 75%),linear-gradient(#1a1c28,#0e1424 55%,#08112e);box-shadow:inset 0 1px 0 rgba(255,255,255,.85),0 60px 120px 30px rgba(110,145,235,.55)}
@container (max-width:599px){.lr-still{width:min(82cqw,69.8cqh);top:calc(64.5% - min(82cqw,69.8cqh) / 1.586 * .58)}}
.lr-root[data-lr-fallback] .lr-still{display:block}
.lr-meta{position:absolute;top:26px;left:30px;z-index:1;margin:0;display:flex;align-items:baseline;gap:12px;font-size:12.5px;line-height:16px;letter-spacing:.02em;pointer-events:none}
.lr-name{display:inline-block;font-weight:500;transition:opacity .35s ease,transform .45s cubic-bezier(.2,.8,.2,1),filter .35s ease}
.lr-name.is-leaving{opacity:0;transform:translateY(-8px);filter:blur(4px)}
.lr-name.is-entering{opacity:0;transform:translateY(8px);filter:blur(4px);transition:none}
.lr-count{color:var(--lr-muted);font-variant-numeric:tabular-nums}
.lr-rail{position:absolute;top:50%;right:30px;z-index:1;margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px;transform:translateY(-50%);pointer-events:none}
.lr-rail li{width:14px;height:1.5px;border-radius:1px;background:var(--lr-muted);opacity:.45;transform-origin:right center;transition:opacity .4s ease,transform .5s cubic-bezier(.2,.8,.2,1),background-color .4s ease}
.lr-rail li.is-active{opacity:1;background:var(--lr-ink);transform:scaleX(1.7)}
.lr-hint{position:absolute;top:26px;left:0;right:0;z-index:1;margin:0;text-align:center;font-size:12.5px;line-height:16px;color:var(--lr-muted);pointer-events:none}
.lr-meta[hidden],.lr-rail[hidden],.lr-hint[hidden]{display:none}
.lr-arrow{display:inline-block;width:.8em;height:1.05em;vertical-align:-.2em;fill:none;stroke:currentColor;stroke-width:1.15;stroke-linecap:round;stroke-linejoin:round}
@container (max-width:599px){.lr-meta{top:20px;left:20px}.lr-hint{top:20px;left:auto;right:20px;text-align:right}.lr-rail{right:16px}}
.lr-step{position:absolute;left:50%;z-index:3;display:grid;place-items:center;width:44px;height:44px;margin:0 0 0 -22px;padding:0;border:0;border-radius:50%;background:var(--lr-bg);color:var(--lr-ink);cursor:pointer;clip-path:inset(50%);opacity:0}
.lr-step .lr-arrow{width:12px;height:18px;stroke-width:1.4}
.lr-step:focus-visible{clip-path:none;opacity:1;outline:2px solid var(--lr-ink);outline-offset:2px}
.lr-prev{top:16px}
.lr-next{bottom:16px}
.lr-sr,.lr-live{position:absolute;width:1px;height:1px;margin:0;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.lr-root,.lr-name,.lr-rail li{transition:none}}
`;

export default function LumenRise({ names, digits = [], order, autoplay = 5, label = 'Cards', className = '' }) {
  const __root = useRef(null);

  useLayoutEffect(() => {
    if (!document.querySelector('style[data-lumen-rise]')) {
      const tag = document.createElement('style');
      tag.setAttribute('data-lumen-rise', '');
      tag.textContent = CSS;
      document.head.append(tag);
    }
    const __node = __root.current;
    const __q = (sel) => (__node.matches(sel) ? __node : __node.querySelector(sel));
    /**
     * Lumen Rise engine: a column of cards rising out of a pool of light.
     *
     * The whole stage is one fullscreen WebGL2 triangle. The fragment shader maps
     * every screen row back to a position along a vertical strip of cards. Above
     * the fold line the strip is flat and the cards stay sharp; below it the strip
     * curls toward the viewer, so a short stretch of card covers the rest of the
     * stage and smears into a coloured light. Moving the strip makes the cards
     * rise out of that light.
     *
     * The faces are drawn procedurally on a 2D canvas (no bitmaps) and uploaded as
     * the layers of one texture array: RGB holds the metal face, alpha the etch
     * mask the glass material lights up.
     *
     * Motion is three springs: the cards themselves, the curled part of the strip
     * (which trails the cards like a viscous sheet) and a "swell" that a step
     * kicks, so the light pushes each new card out and rings once before resting.
     */

    const TEX_W = 1280;
    const TEX_H = 807; // ISO/IEC 7810 ID-1 ratio (85.60 x 53.98 mm)
    const CARD_ASPECT = 1.58601;
    // Layout, as fractions measured on the reference (1152 x 1600).
    const FOLD = 0.645001; // the card starts bending toward the light here
    const REST_FLAT = 0.520001; // share of the card height above the fold at rest
    const GAP = 0.160001; // strip between two cards, in card heights
    const BG_DARK = [0, 0, 0];
    const BG_LIGHT = [0.961001, 0.965001, 0.973001]; // #f5f6f8

    const rgb = (r, g, b) => [r / 255, g / 255, b / 255];

    // `face` paints the metal card. `deep/mid/white/light/edge` drive the light
    // the card falls into (sampled from the reference for the first card). The
    // light follows whichever card is sinking into it.
    const BASE_PALETTES = [
      {
        face: ['#1a1c28', '#0e1424', '#08112e'],
        emblem: 'horizon',
        deep: rgb(0, 40, 118), mid: rgb(32, 88, 175), white: rgb(214, 223, 238),
        light: rgb(100, 138, 238), edge: rgb(0, 46, 148)
      },
      {
        face: ['#1d1828', '#130d24', '#120a2c'],
        emblem: 'prism',
        deep: rgb(50, 12, 128), mid: rgb(118, 72, 204), white: rgb(230, 222, 245),
        light: rgb(156, 120, 240), edge: rgb(58, 16, 150)
      },
      {
        face: ['#141f1d', '#0a1814', '#06180f'],
        emblem: 'leaf',
        deep: rgb(0, 78, 52), mid: rgb(28, 150, 106), white: rgb(214, 240, 228),
        light: rgb(78, 198, 150), edge: rgb(0, 88, 60)
      },
      {
        face: ['#251a16', '#1a0e0a', '#1f0a04'],
        emblem: 'spark',
        deep: rgb(118, 28, 2), mid: rgb(212, 92, 34), white: rgb(248, 231, 216),
        light: rgb(240, 142, 82), edge: rgb(138, 36, 6)
      },
      {
        face: ['#15202a', '#0a1822', '#04182a'],
        emblem: 'wave',
        deep: rgb(0, 68, 110), mid: rgb(22, 140, 190), white: rgb(214, 238, 246),
        light: rgb(88, 188, 236), edge: rgb(0, 78, 130)
      },
      {
        face: ['#22242b', '#15161b', '#0f1014'],
        emblem: 'orbit',
        deep: rgb(38, 42, 54), mid: rgb(108, 116, 134), white: rgb(232, 235, 241),
        light: rgb(150, 158, 178), edge: rgb(46, 52, 66)
      }
    ];
    const PALETTES = Array.isArray(order) && order.length === BASE_PALETTES.length ? order.map((i) => BASE_PALETTES[i]) : BASE_PALETTES;

    const wrapIndex = (i, n) => ((i % n) + n) % n;

    const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    function smoothstep(e0, e1, x) {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    }

    /**
     * Damped spring, integrated in small substeps so any frame time is stable.
     * Returns [x, v]. A zeta below 1 overshoots a little, which is what reads as
     * elastic; 1 is critically damped.
     */
    function spring(x, v, to, omega, zeta, dt) {
      const steps = Math.max(1, Math.ceil((dt * omega) / 0.12));
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        v += (-omega * omega * (x - to) - 2 * zeta * omega * v) * h;
        x += v * h;
      }
      return [x, v];
    }

    /**
     * Card and light geometry for a stage of W x H layout pixels. The card is
     * sized by whichever of width and height runs out first, and the light ramp
     * follows the card so tall phones keep the reference proportions.
     */
    function layoutFor(W, H) {
      const cw = Math.min(W * (W < 600 ? 0.819999 : 0.730001), H * 0.440001 * CARD_ASPECT, 900);
      const ch = cw / CARD_ASPECT;
      const fold = H * FOLD;
      return {
        W,
        H,
        cw,
        ch,
        fold,
        top: fold - REST_FLAT * ch - 0.0600001 * ch,
        light: Math.max(Math.min(H - fold, ch * 1.08001), ch * 0.6),
        pitch: ch * (1 + GAP),
        // Strip length the curl shows at rest.
        curlLen: 0.950001 * (H - fold) * (1 - Math.exp(-1 / 0.950001))
      };
    }

    /**
     * How far the curled part of the strip is stretched while it trails the
     * cards: 1 at rest, lower while it lags, and soft-saturating so a fast fling
     * never tears it.
     */
    function curlDrag(trail, pitch, curlLen, elastic = 1) {
      return 1 - 0.34 * Math.min(elastic, 1.7) * Math.tanh((trail * pitch) / Math.max(curlLen, 1e-6));
    }

    /** Where a released drag lands: the nearest card after a bounded fling. */
    function releaseTarget(pos, velocity) {
      return Math.round(pos + Math.max(-1.19999, Math.min(1.20001, velocity * 0.159999)));
    }

    /**
     * Wheel gate: deltas accumulate until they are worth one card, then the gate
     * locks briefly so a single trackpad swipe moves exactly one card. Returns
     * the direction to step (-1, 0 or 1) and mutates `gate`.
     */
    function wheelGate(gate, delta, t) {
      if (t - gate.idle > 220) gate.acc = 0;
      gate.idle = t;
      gate.acc += delta;
      if (t > gate.lock && Math.abs(gate.acc) >= 28) {
        const dir = Math.sign(gate.acc);
        gate.acc = 0;
        gate.lock = t + 420;
        return dir;
      }
      return 0;
    }

    /**
     * Resolution governor. A frame that takes longer than SLOW_FRAME_MS on the
     * real clock counts as slow; SLOW_FRAMES in a row drop the backing store to
     * SLOW_SCALE of the device resolution, once. A GPU-less browser (SwiftShader,
     * llvmpipe) draws a full stage in seconds, and a quarter of the pixels keeps
     * it moving. A capture that steps a virtual clock never trips it, so recorded
     * thumbnails keep full resolution. Returns the new count of slow frames.
     */
    const SLOW_FRAME_MS = 120;
    const SLOW_FRAMES = 3;
    const SLOW_SCALE = 0.5;
    const countSlowFrames = (count, gap) => (gap > SLOW_FRAME_MS ? count + 1 : 0);

    /**
     * The light's colours at strip position `pos`: the palette of the card that
     * is sinking into the light blends into the next one halfway through a step.
     */
    function lightAt(pos, palettes = PALETTES) {
      const n = palettes.length;
      const base = Math.floor(pos);
      const a = palettes[wrapIndex(base, n)];
      const b = palettes[wrapIndex(base + 1, n)];
      const f = smoothstep(0.250001, 0.749999, pos - base);
      const out = {};
      for (const key of ['deep', 'mid', 'white', 'light', 'edge']) out[key] = mix3(a[key], b[key], f);
      return out;
    }

    const cardDigits = (index) => String(digits[index] ?? '');

    const FONT_STACK = "Inter, -apple-system, 'Segoe UI', sans-serif";
    const NAME_FONT = `600 34px ${FONT_STACK}`;
    const DIGIT_FONT = `500 30px ${FONT_STACK}`;
    // The name runs from the left margin to just short of the card number.
    const NAME_X = TEX_W * 0.103999;
    const NAME_MAX = TEX_W * 0.56;

    /** Cuts text that does not fit with an ellipsis. */
    function fitText(ctx, text, maxWidth) {
      const value = String(text ?? '');
      if (!value || ctx.measureText(value).width <= maxWidth) return value;
      let cut = value;
      while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
      return `${cut.trimEnd()}…`;
    }

    // Engraved "glossy tube" stroke, like the chip and logo on the reference card:
    // a dark drop shadow, a bright upper-left lip, a metallic face and a hollow core.
    function engrave(ctx, build, width, face, box) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      build(ctx);
      ctx.lineWidth = width + 2.50001;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.translate(1.59999, 2.20001);
      ctx.stroke();
      ctx.translate(-1.6, -2.20001);

      ctx.translate(-1.1, -1.30001);
      ctx.lineWidth = width;
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.stroke();
      ctx.translate(1.10001, 1.3);

      const g = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
      g.addColorStop(0, 'rgba(226,232,246,0.92)');
      g.addColorStop(0.449999, 'rgba(120,130,156,0.75)');
      g.addColorStop(0.7, 'rgba(208,216,236,0.9)');
      g.addColorStop(1, 'rgba(96,104,128,0.7)');
      ctx.lineWidth = width;
      ctx.strokeStyle = g;
      ctx.stroke();

      ctx.lineWidth = Math.max(1, width - 3.40001);
      ctx.strokeStyle = face;
      ctx.stroke();
      ctx.restore();
    }

    function roundRectPath(ctx, x, y, w, h, r) {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    const EMBLEMS = {
      // Sun on a horizon line.
      horizon(ctx, u) {
        ctx.moveTo(...u(0.159999, 0.599999));
        ctx.arc(...u(0.499999, 0.599999), u.s * 0.340001, Math.PI, 0);
        ctx.moveTo(...u(0.0200001, 0.600001));
        ctx.lineTo(...u(0.98, 0.599999));
        ctx.moveTo(...u(0.180001, 0.750001));
        ctx.lineTo(...u(0.820001, 0.749999));
        ctx.moveTo(...u(0.34, 0.9));
        ctx.lineTo(...u(0.660001, 0.9));
      },
      prism(ctx, u) {
        ctx.moveTo(...u(0.500001, 0.0599999));
        ctx.lineTo(...u(0.939999, 0.880001));
        ctx.lineTo(...u(0.06, 0.88));
        ctx.closePath();
        ctx.moveTo(...u(0.5, 0.0600001));
        ctx.lineTo(...u(0.619999, 0.879999));
      },
      leaf(ctx, u) {
        ctx.moveTo(...u(0.18, 0.920001));
        ctx.bezierCurveTo(...u(0.0600001, 0.46), ...u(0.440001, 0.099999), ...u(0.899999, 0.0600001));
        ctx.bezierCurveTo(...u(0.900001, 0.5), ...u(0.599999, 0.859999), ...u(0.180001, 0.920001));
        ctx.moveTo(...u(0.1, 0.99999));
        ctx.quadraticCurveTo(...u(0.46, 0.56), ...u(0.780001, 0.199999));
      },
      spark(ctx, u) {
        const c = [0.499999, 0.499999];
        const pts = [];
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 === 0 ? 0.460001 : 0.109999;
          pts.push(u(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r));
        }
        ctx.moveTo(...pts[0]);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(...pts[i]);
        ctx.closePath();
      },
      wave(ctx, u) {
        for (let row = 0; row < 3; row += 1) {
          const y0 = 0.300001 + row * 0.200001;
          for (let i = 0; i <= 40; i += 1) {
            const t = i / 40;
            const p = u(0.04 + t * 0.919999, y0 + Math.sin(t * Math.PI * 2 + row * 0.6) * 0.0699999);
            if (i === 0) ctx.moveTo(...p);
            else ctx.lineTo(...p);
          }
        }
      },
      orbit(ctx, u) {
        ctx.moveTo(...u(0.719999, 0.500001));
        ctx.arc(...u(0.500001, 0.500001), u.s * 0.219999, 0, Math.PI * 2);
        const [cx, cy] = u(0.499999, 0.5);
        ctx.moveTo(cx + u.s * 0.480001, cy);
        ctx.ellipse(cx, cy, u.s * 0.480001, u.s * 0.159999, -0.419999, 0, Math.PI * 2);
      }
    };

    // Shared mark geometry, so the metal face and the glass etch line up exactly.
    const chipRect = (W, H) => ({ x: W * 0.104001, y: H * 0.318001, w: W * 0.138999, h: H * 0.197 });

    function chipLines(c, chip) {
      const mx = chip.x + chip.w * 0.500001;
      for (const r of [0.300001, 0.500001, 0.7]) {
        const y = chip.y + chip.h * r;
        c.moveTo(chip.x + 3, y);
        c.lineTo(mx - chip.w * 0.099999, y);
        c.moveTo(mx + chip.w * 0.099999, y);
        c.lineTo(chip.x + chip.w - 3, y);
      }
      c.moveTo(mx - chip.w * 0.100001, chip.y + chip.h * 0.3);
      c.lineTo(mx - chip.w * 0.099999, chip.y + chip.h * 0.700001);
      c.moveTo(mx + chip.w * 0.1, chip.y + chip.h * 0.3);
      c.lineTo(mx + chip.w * 0.099999, chip.y + chip.h * 0.7);
      c.moveTo(mx, chip.y + 3);
      c.lineTo(mx, chip.y + chip.h * 0.300001);
      c.moveTo(mx, chip.y + chip.h * 0.7);
      c.lineTo(mx, chip.y + chip.h - 3);
    }

    function emblemFrame(W, H) {
      const box = { x: W * 0.765001, y: H * 0.099999, w: W * 0.170001, h: H * 0.3 };
      const s = Math.min(box.w, box.h);
      const ox = box.x + (box.w - s) / 2;
      const oy = box.y + (box.h - s) / 2;
      const u = (x, y) => [ox + x * s, oy + y * s];
      u.s = s;
      return { box, u };
    }


    // Glass etch mask: white strokes on black. It is packed into the alpha channel
    // of the texture, where the glass shader reads it as frosted, light-catching lines.
    function drawEtch(ctx, name, palette, index) {
      const W = TEX_W;
      const H = TEX_H;
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = '#fff';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const chip = chipRect(W, H);
      ctx.globalAlpha = 0.160001;
      ctx.beginPath();
      roundRectPath(ctx, chip.x, chip.y, chip.w, chip.h, chip.w * 0.159999);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 5;
      ctx.beginPath();
      roundRectPath(ctx, chip.x, chip.y, chip.w, chip.h, chip.w * 0.159999);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      chipLines(ctx, chip);
      ctx.stroke();

      const { u } = emblemFrame(W, H);
      ctx.lineWidth = 6;
      ctx.beginPath();
      EMBLEMS[palette.emblem](ctx, u);
      ctx.stroke();

      ctx.globalAlpha = 0.749999;
      ctx.font = NAME_FONT;
      ctx.letterSpacing = '6px';
      ctx.fillText(fitText(ctx, name.toUpperCase(), NAME_MAX), NAME_X, H * 0.86);
      ctx.font = DIGIT_FONT;
      ctx.letterSpacing = '5px';
      const digits = cardDigits(index);
      ctx.fillText(digits, W * 0.896 - ctx.measureText(digits).width, H * 0.859999);
      ctx.restore();
    }

    function drawCardFace(ctx, name, palette, index) {
      const W = TEX_W;
      const H = TEX_H;
      ctx.save();

      // Metal face: cool slate at the top, deeper toward the bottom.
      const base = ctx.createLinearGradient(0, 0, 0, H);
      base.addColorStop(0, palette.face[0]);
      base.addColorStop(0.500001, palette.face[1]);
      base.addColorStop(1, palette.face[2]);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);

      // Soft studio sheen from the upper left.
      const sheen = ctx.createRadialGradient(W * 0.28, -H * 0.200001, 0, W * 0.280001, -H * 0.199999, W * 0.900001);
      sheen.addColorStop(0, 'rgba(160,175,210,0.10)');
      sheen.addColorStop(1, 'rgba(160,175,210,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, W, H);

      // Chip: same placement as the reference (left, slightly below the middle).
      const chip = chipRect(W, H);
      const chipFill = ctx.createLinearGradient(chip.x, chip.y, chip.x + chip.w, chip.y + chip.h);
      chipFill.addColorStop(0, 'rgba(255,255,255,0.07)');
      chipFill.addColorStop(1, 'rgba(255,255,255,0.02)');
      ctx.fillStyle = chipFill;
      ctx.beginPath();
      roundRectPath(ctx, chip.x, chip.y, chip.w, chip.h, chip.w * 0.159999);
      ctx.fill();
      const face = palette.face[1];
      engrave(ctx, (c) => roundRectPath(c, chip.x, chip.y, chip.w, chip.h, chip.w * 0.159999), 6, face, chip);
      engrave(ctx, (c) => chipLines(c, chip), 5, face, chip);

      // Emblem: top right, where the reference card carries its logo.
      const { box, u } = emblemFrame(W, H);
      engrave(ctx, (c) => EMBLEMS[palette.emblem](c, u), 7, face, box);

      // Lower half: low-contrast embossed details that surface as the card rises.
      ctx.font = NAME_FONT;
      ctx.letterSpacing = '6px';
      const label = fitText(ctx, name.toUpperCase(), NAME_MAX);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(label, NAME_X + 1.49999, H * 0.859999 + 2);
      ctx.fillStyle = 'rgba(200,210,235,0.32)';
      ctx.fillText(label, NAME_X, H * 0.86);
      ctx.font = DIGIT_FONT;
      ctx.letterSpacing = '5px';
      const digits = cardDigits(index);
      const tw = ctx.measureText(digits).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(digits, W * 0.896001 - tw + 1.49999, H * 0.860001 + 2);
      ctx.fillStyle = 'rgba(200,210,235,0.26)';
      ctx.fillText(digits, W * 0.895999 - tw, H * 0.86);
      ctx.restore();
    }

    // ---------------------------------------------------------------------------
    // Shaders
    // ---------------------------------------------------------------------------

    const VERT = `#version 300 es
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`;

    const FRAG = `#version 300 es
    precision highp float;
    precision highp sampler2DArray;

    uniform sampler2DArray uTex; // rgb: metal face, a: glass etch mask
    uniform vec2 uRes;       // CSS px
    uniform float uDpr;
    uniform vec4 uCard;      // width, height, radius, centre x
    uniform vec4 uBand;      // fold y, top y, light ramp length, pitch
    uniform float uS0;       // strip coordinate under the fold line
    uniform float uDrag;     // curl stretch: below 1 the curled part trails the cards
    uniform float uSwell;    // elastic push of the light: >0 spits a card out, <0 swallows it
    uniform float uCount;
    uniform float uTexPx;    // texture px per CSS px of card
    uniform float uVelBlur;  // motion smear inside the light
    uniform float uTime;
    uniform vec2 uPointer;   // x in -1..1, hover 0..1
    uniform float uPulse;
    uniform vec2 uFlow;      // smoothed strip velocity (slots/s), speed 0..1.2
    uniform float uBlur;
    uniform float uGlass;    // 0 metal, 1 glass
    uniform float uTheme;    // 0 dark page, 1 light page
    uniform vec3 uBg;
    uniform vec3 uDeep, uMid, uWhite, uLight, uEdge;
    out vec4 outColor;

    float sdRound(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), e = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
    }

    void main() {
      vec2 fc = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
      float x = fc.x;
      float y = fc.y;
      float cw = uCard.x, ch = uCard.y, rad = uCard.z, cx = uCard.w;
      float foldY = uBand.x, topY = uBand.y, L = uBand.z, pitch = uBand.w;
      float px = 1.0 / uDpr;

      // Map the screen row to a position along the card strip.
      // Below the fold the strip curls toward the camera: a short stretch of card
      // covers the rest of the screen and smears into light. Above the fold the
      // cards stay sharp; risen cards only fade out toward the top.
      float d = y - foldY;
      float s;
      float w = 1.0;
      float blurX = 0.0;
      float blurS = 0.0;
      float fade = 1.0;
      float span = max(uRes.y - foldY, 1.0); // fold to the bottom of the screen
      float curl = max(d, 0.0) / span;
      if (d >= 0.0) {
        float D = span * 0.95;
        // The curled part lags the flat part like a viscous sheet: while the cards
        // move it stretches out behind them, then eases back when they settle.
        s = uS0 + uDrag * D * (1.0 - exp(-d / D));
        w = 1.0 + 0.5 * pow(curl, 1.7);
        // The mouth of the light pinches as it pushes a card out, then relaxes.
        // Zero at the fold, so the flat card above never changes width.
        w *= 1.0 - 0.6 * uSwell * curl * exp(-4.0 * curl);
        blurX = uBlur * 0.42 * d;
        blurS = max(uVelBlur * smoothstep(0.0, 0.2 * L, d),
          uBlur * (0.03 * ch * smoothstep(0.0, 0.15 * L, d) + 0.5 * (s - uS0)));
      } else {
        s = uS0 + d;
        float du = topY - y;
        if (du > 0.0) {
          float k = du / ch;
          fade = exp(-pow(k / 0.8, 1.6)) * (1.0 - 0.35 * smoothstep(0.0, 0.35, k));
        }
      }

      float xc = (x - cx) / w;
      float hw = cw * 0.5;
      float hh = ch * 0.5;
      float soft = max(px * 1.1, blurX / w);
      // Pick a mip whose footprint covers the sideways blur and the gap between
      // two strip taps, otherwise fast motion shows the tap pattern.
      float footprint = max((blurX / w) * 0.8, blurS * 0.3);
      float lod = log2(max(1.0, footprint * uTexPx));
      float jitter = hash(fc * 1.37 + 7.0) - 0.5;
      bool smear = blurS > 0.5;

      // Up to 17 taps along the strip: the vertical smear of the curl. Dense
      // enough that the smear reads as a smooth gradient, not grain or stripes.
      vec4 sum = vec4(0.0);
      float cov = 0.0;
      float wsum = 0.0;
      if (abs(xc) < hw + soft) {
        for (int j = -8; j <= 8; j++) {
          if (!smear && j != 0) continue;
          float fj = float(j) / 8.0;
          float wt = smear ? 1.0 - 0.55 * abs(fj) : 1.0;
          float sj = s + (fj + jitter * 0.125) * blurS;
          float k = floor(sj / pitch);
          float ly = sj - k * pitch;
          float sd = sdRound(vec2(xc, ly - hh), vec2(hw, hh), rad);
          // Edges soften with the tap spacing, so smeared card edges stay smooth.
          float softS = max(soft, blurS * 0.18);
          float c = (1.0 - smoothstep(-softS * 0.5, softS * 0.5, sd)) * wt;
          vec2 uv = clamp(vec2(xc / cw + 0.5, ly / ch), 0.0, 1.0);
          sum += textureLod(uTex, vec3(uv, mod(k, uCount)), lod) * c;
          cov += c;
        }
      }
      wsum = smear ? 12.05 : 1.0;
      vec3 surf = cov > 1e-4 ? sum.rgb / cov : vec3(0.0);
      float etch = cov > 1e-4 ? sum.a / cov : 0.0;
      cov /= wsum;

      // Card-local frame at the centre tap.
      float k0 = floor(s / pitch);
      float ly0 = s - k0 * pitch;
      vec2 lp = vec2(xc, ly0 - hh);
      float sd0 = sdRound(lp, vec2(hw, hh), rad);
      float inside = -sd0;
      float topness = mix(1.0, 0.16, smoothstep(0.0, 0.42 * ch, ly0));

      // Light coordinate: 0 at the fold, 1 about a card height below. The iso-lines
      // sag in the middle, so the light climbs higher up the sides of the card.
      float xn = xc / hw;
      float yn = ly0 / ch;
      float xs = xn - uPointer.x * 0.3 * uPointer.y;
      float speed = uFlow.y;
      float breathe = 0.012 * sin(uTime * 0.9) + 0.006 * sin(uTime * 2.3);
      // Motion pushes the light up the card and deepens its sag.
      float te = (y - foldY) / L + (0.2 + 0.05 * speed) * min(xs * xs, 1.6)
        - breathe - uPulse * 0.025 - speed * 0.05
        // The swell domes the light up under the middle of the card.
        - uSwell * (0.03 + 0.08 * exp(-2.2 * xs * xs));
      vec3 glowCol = mix(uMid, uLight, 0.55);

      // ---- metal face ------------------------------------------------------------
      // The face falls into shadow just before it meets the light; engraved
      // highlights keep catching light, so only the dark metal sinks.
      float luma = dot(surf, vec3(0.299, 0.587, 0.114));
      float shade = smoothstep(-0.45, -0.05, te) * (1.0 - smoothstep(0.12, 0.42, luma));
      vec3 metal = surf * mix(1.0, 0.5, shade);
      float band = (xn * 0.55 - (yn - 0.5) * 0.35 - uPointer.x * 0.7) / 0.22;
      metal += vec3(0.75, 0.82, 1.0) * exp(-band * band) * 0.06 * uPointer.y;

      // ---- glass face --------------------------------------------------------------
      // Clear glass over the page, a refracting bevel, and light from the pool
      // travelling up inside the slab: the bevel and the etched marks catch it.
      float bevelW = 0.05 * ch;
      // Edge detail is crisp on the flat card and dissolves inside the curl,
      // where the card is smeared and a sharp outline would read as a scratch.
      float edgeVis = (1.0 - smoothstep(0.0, 0.12, te)) * (1.0 - smoothstep(0.0, 0.06 * L, d));
      float bevel = 1.0 - smoothstep(0.0, bevelW, inside);
      bevel *= bevel * edgeVis;
      float rise = max(foldY - y, 0.0) / ch;
      float inner = exp(-rise / 0.42) * (1.0 + 0.35 * speed + 0.25 * uPulse + 0.45 * max(uSwell, 0.0));
      inner = max(inner, 0.12 * exp(-rise / 1.6));
      vec3 tint = mix(vec3(1.0), 0.45 + 0.55 * uLight, mix(0.4, 0.14, uTheme));
      float transmit = mix(mix(0.9, 0.975, uTheme), 0.62, bevel);
      vec3 glass = uBg * tint * transmit;
      // Dark pages: a faint smoke so the body reads against black.
      glass += mix(uDeep * 0.25 + 0.035, vec3(0.0), uTheme) * 0.8;
      float glowA = clamp(inner * (0.07 + 0.5 * bevel + 1.15 * etch), 0.0, 1.0);
      glass = mix(glass, glowCol * mix(1.0, 0.8, uTheme), glowA * mix(1.0, 0.75, uTheme));
      // Etched marks are frosted: they scatter the room light too.
      glass = mix(glass, mix(vec3(0.86, 0.9, 1.0), uBg * 0.6, uTheme), etch * mix(0.42, 0.5, uTheme));
      // Two soft reflections slide across as the card rises or the pointer moves.
      float r1 = (xn * 0.5 + yn * 0.95 - 0.38 - uPointer.x * 0.35 + 0.2 * sin(uTime * 0.21)) / 0.2;
      float r2 = (xn * 0.5 + yn * 0.95 - 0.78 - uPointer.x * 0.35 + 0.2 * sin(uTime * 0.21)) / 0.05;
      float refl = exp(-r1 * r1) * 0.07 + exp(-r2 * r2) * 0.05;
      glass += vec3(0.92, 0.95, 1.0) * refl * mix(1.0, 0.7, uTheme);
      // Polished edge: a dark refracted outline and a bright inner lip.
      float outline = exp(-pow(inside / (1.1 * px), 2.0)) * edgeVis;
      float lip = exp(-pow((inside - 2.4 * px) / (1.3 * px), 2.0)) * edgeVis;
      glass = mix(glass, glass * mix(0.55, 0.45, uTheme), outline * 0.8);
      glass = mix(glass, vec3(0.97, 0.98, 1.0), lip * mix(0.35, 0.95, topness) * mix(0.75, 0.9, uTheme));

      vec3 col = mix(metal, glass, uGlass);

      // ---- the light the card curls into ----------------------------------------
      // On a light page the deep tones are lifted: dark navy at partial alpha
      // over white reads as grey smoke rather than light.
      vec3 deep = mix(uDeep, mix(uDeep, uMid, 0.45), uTheme);
      vec3 edgeCol = mix(uEdge, mix(uEdge, uLight, 0.5), uTheme);
      col = mix(col, deep * 0.62 + col * 0.35, smoothstep(-0.03, 0.08, te));
      col = mix(col, deep, smoothstep(0.06, 0.14, te));
      col = mix(col, uMid, smoothstep(0.13, 0.22, te));
      col = mix(col, uWhite, smoothstep(0.22, 0.42, te));
      col = mix(col, mix(uWhite, uLight, 0.45), smoothstep(0.56, 0.76, te));
      col = mix(col, uLight, smoothstep(0.74, 1.02, te));
      // The halo outside the white core turns saturated toward the sides.
      float side = smoothstep(0.32, 1.05, abs(xc) / hw) * smoothstep(0.25, 0.85, te);
      col = mix(col, edgeCol, side * 0.85);

      // The glow is the curled card itself, so it travels with the strip:
      // gaps between cards dim it, marks leave soft ghosts in it, and a slow
      // caustic moves with the cards (and keeps drifting when they rest).
      float inLight = smoothstep(0.02, 0.3, te);
      // Both use a wide, soft card mask: a crisp one draws the card's straight
      // outline into the light as hard rectangular lines.
      float softC = max(0.12 * ch, blurS * 0.5);
      float sdN = min(sd0, min(sdRound(vec2(xc, ly0 - pitch - hh), vec2(hw, hh), rad),
                               sdRound(vec2(xc, ly0 + pitch - hh), vec2(hw, hh), rad)));
      float body = 1.0 - smoothstep(-softC, softC, sdN);
      float carry = mix(mix(0.74, 0.88, uTheme), 1.06, body);
      vec2 uvc = clamp(vec2(xc / cw + 0.5, ly0 / ch), 0.0, 1.0);
      vec4 far = textureLod(uTex, vec3(uvc, mod(k0, uCount)), max(lod + 2.0, 5.5));
      float marks = mix(max(dot(far.rgb, vec3(0.299, 0.587, 0.114)) - 0.12, 0.0) * 2.2, far.a * 1.1, uGlass);
      float ghost = marks * (1.0 - smoothstep(-2.0 * softC, 0.0, sd0));
      vec2 cp = vec2(xc / cw * 3.2, s / ch * 1.7 + uTime * 0.11);
      float caustic = vnoise(cp) * 0.65 + vnoise(cp * 2.3 + 4.1) * 0.35;
      float lightGain = carry * (1.0 + ghost) * (0.9 + 0.2 * caustic) * (1.0 + 0.05 * speed);
      col = mix(col, col * lightGain, inLight);

      // Light pool: it keeps glowing between two cards, so it never switches off.
      float win = 1.0 - smoothstep(hw - blurX * 0.5, hw + blurX * 1.1 + px, abs(xc));
      float pool = smoothstep(0.1, 0.3, te) * win;
      float a = max(cov, pool);

      // Metal: thin specular rim along the top edge, fading down the sides.
      float rimW = 0.9 * px + blurX * 0.25 + blurS * 0.15;
      float rim = exp(-pow((sd0 + 0.8 * px) / rimW, 2.0));
      rim *= topness * (1.0 - smoothstep(0.02, 0.3, te)) * (1.0 - uGlass);
      col = mix(col, vec3(0.96, 0.965, 0.99), clamp(rim * 0.92, 0.0, 1.0));
      a = max(a, rim * 0.92);

      // Inside the light, each card's top edge is a bright seam rising to the fold.
      float eTop = ly0 < pitch * 0.5 ? ly0 : ly0 - pitch;
      float seamW = 0.035 * ch + blurS * 0.45;
      float seam = exp(-pow(eTop / seamW, 2.0)) * smoothstep(0.03, 0.25, te) * win;
      seam *= 1.0 - smoothstep(0.55, 1.25, abs(xc) / hw);
      col = mix(col, mix(uWhite, vec3(1.0), 0.5), clamp(seam * (0.36 + 0.14 * speed), 0.0, 1.0));

      // Spectral fringe where the sides start to curl (borrowed from Fold Carousel).
      float edgeBand = smoothstep(0.0, 0.05, curl) * (1.0 - smoothstep(0.12, 0.42, curl));
      float fw = 1.2 * px + 0.04 * max(d, 0.0);
      float dOut = abs(xc) - hw;
      float warm = exp(-pow((dOut - fw * 1.2) / fw, 2.0));
      float cool = exp(-pow((dOut + fw * 0.6) / fw, 2.0));
      vec3 fringe = vec3(1.0, 0.38, 0.5) * warm * 0.55 + mix(uLight, vec3(0.6, 0.9, 1.0), 0.5) * cool * 0.45;
      float fringeGain = (1.0 + 0.35 * speed) * mix(1.0, 0.6, uTheme);
      col = mix(col + fringe * edgeBand * fringeGain, col * (1.0 - fringe * edgeBand * 0.5), uTheme);
      a = max(a, (warm * 0.55 + cool * 0.3) * edgeBand * min(fringeGain, 1.6));

      col *= 1.0 + (uPulse * 0.05 + 0.07 * max(uSwell, 0.0)) * smoothstep(0.0, 0.4, te);
      // Sub-level dither only: enough to stop gradient banding, too small to see.
      float g = hash(fc + fract(uTime * 7.13) * 91.7) - 0.5;
      col += g * (0.008 * smoothstep(0.1, 0.5, te) + 0.003);

      a = clamp(a * fade, 0.0, 1.0);
      outColor = vec4(mix(uBg, clamp(col, 0.0, 1.0), a), 1.0);
    }`;


    function compile(gl, type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(log || 'shader compile failed');
      }
      return sh;
    }

    function createProgram(gl) {
      const prog = gl.createProgram();
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
      }
      return prog;
    }

    const UNIFORMS = [
      'uTex', 'uRes', 'uDpr', 'uCard', 'uBand', 'uS0', 'uDrag', 'uSwell', 'uCount', 'uTexPx', 'uVelBlur', 'uTime',
      'uPointer', 'uPulse', 'uFlow', 'uBlur', 'uGlass', 'uTheme', 'uBg', 'uDeep', 'uMid', 'uWhite', 'uLight', 'uEdge'
    ];

    function waitForFonts() {
      const fonts = typeof document !== 'undefined' ? document.fonts : null;
      if (!fonts?.load) return Promise.resolve();
      const loads = Promise.all([fonts.load(NAME_FONT), fonts.load(DIGIT_FONT)]).catch(() => {});
      // A font that never arrives must not hold the cards back.
      return Promise.race([loads, new Promise((resolve) => setTimeout(resolve, 1500))]);
    }

    // ---------------------------------------------------------------------------
    // Runtime
    // ---------------------------------------------------------------------------

    const ENGINE_DEFAULTS = {
      names: ['Midnight', 'Amethyst', 'Verdant', 'Ember', 'Glacier', 'Graphite'],
      theme: 'dark',
      material: 'glass',
      autoplay: 4.20001,
      elastic: 1,
      blur: 1,
      wheel: 'on',
      draggable: true,
      preview: false
    };

    function buildLumenRise(root, config) {
      if (!root) return null;
      let cfg = { ...ENGINE_DEFAULTS, ...config };
      const stage = root.querySelector('.lr-gl') ?? root;
      const live = root.querySelector('.lr-live');
      const nameEl = root.querySelector('.lr-name');
      const countEl = root.querySelector('.lr-count');
      const rail = root.querySelector('.lr-rail');
      const reduceQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
      const reduced = () => Boolean(reduceQuery?.matches);
      const n = PALETTES.length;
      const now = () => performance.now();

      let disposed = false;
      const cleanups = [];
      const listen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        cleanups.push(() => target.removeEventListener(type, handler, options));
      };

      const canvas = document.createElement('canvas');
      canvas.className = 'lr-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      stage.replaceChildren(canvas);

      // ---- motion state ---------------------------------------------------------
      let pos = 0; // continuous slot position; an integer is a card at rest
      let vel = 0; // slots per second
      let target = 0;
      let pulse = 0;
      let lag = 0; // where the curled part of the strip is, trailing pos
      let lagVel = 0;
      let swell = 0;
      let swellVel = 0;
      let pointerX = 0;
      let pointerXTarget = 0;
      let hover = 0;
      let hoverTarget = 0;
      let lastInteraction = -1e9;
      let lastAuto = now();
      let shown = -1;
      let theme = cfg.theme === 'light' ? 1 : 0; // 0 dark page, 1 light page
      let glass = cfg.material === 'metal' ? 0 : 1; // 0 metal, 1 glass
      let label = null; // pending name swap, timed on the frame clock

      const nameOf = (i) => String(cfg.names?.[i] ?? ENGINE_DEFAULTS.names[i] ?? '');

      // Kick the light's swell: forward spits the next card out, back swallows it.
      function kick(dir, amount = 1) {
        if (reduced()) return;
        swellVel += Math.sign(dir) * 11 * amount * cfg.elastic;
      }

      function go(dir) {
        if (!dir) return;
        kick(dir);
        target = Math.round(target) + dir;
        pulse = 1;
        lastInteraction = now();
        wake();
      }

      function goTo(index) {
        const from = Math.round(target);
        target = from - wrapIndex(from, n) + wrapIndex(Math.round(index), n);
        lastInteraction = now();
        wake();
      }

      function announce(i) {
        if (!live || cfg.preview) return;
        live.textContent = `${nameOf(i)}, card ${i + 1} of ${n}`;
      }

      function setLabel(i, t) {
        if (countEl) countEl.textContent = `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
        if (rail) [...rail.children].forEach((li, j) => li.classList.toggle('is-active', j === i));
        if (!nameEl) return;
        const text = nameOf(i);
        if (nameEl.textContent === text && !label) return;
        if (reduced() || shown < 0) {
          nameEl.textContent = text;
          label = null;
          return;
        }
        nameEl.classList.add('is-leaving');
        label = { text, at: t + 220 };
      }

      function stepLabel(t) {
        if (!label || !nameEl || t < label.at) return;
        nameEl.textContent = label.text;
        label = null;
        nameEl.classList.remove('is-leaving');
        nameEl.classList.add('is-entering');
        void nameEl.offsetWidth;
        nameEl.classList.remove('is-entering');
      }

      // ---- input ----------------------------------------------------------------
      const isControl = (e) => e.target instanceof Element && Boolean(e.target.closest('button'));
      // Pointer deltas arrive in screen pixels; a host that scales the stage (the
      // editor's fit) would otherwise make a drag travel too far or too short.
      const screenScale = () => {
        const rect = root.getBoundingClientRect();
        return root.clientHeight ? rect.height / root.clientHeight : 1;
      };

      let drag = null;
      listen(root, 'pointerdown', (e) => {
        if (!cfg.draggable || cfg.preview || e.button !== 0 || isControl(e)) return;
        try { root.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
        const t = now();
        drag = { id: e.pointerId, y0: e.clientY, p0: pos, t0: t, lastY: e.clientY, lastT: t, v: 0, moved: 0, scale: screenScale() || 1 };
        target = pos;
        vel = 0;
        lastInteraction = t;
      });
      listen(root, 'pointermove', (e) => {
        const rect = root.getBoundingClientRect();
        if (rect.width > 0) pointerXTarget = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
        hoverTarget = 1;
        if (!drag || e.pointerId !== drag.id) return;
        const t = now();
        const unit = L.pitch * 0.900001 * drag.scale;
        const dy = e.clientY - drag.lastY;
        const dt = Math.max(1, t - drag.lastT) / 1000;
        drag.v = drag.v * 0.599999 + (-dy / unit / dt) * 0.4;
        drag.lastY = e.clientY;
        drag.lastT = t;
        drag.moved = Math.max(drag.moved, Math.abs(e.clientY - drag.y0));
        if (drag.moved > 4) root.setAttribute('data-dragging', '');
        pos = drag.p0 + (drag.y0 - e.clientY) / unit;
        target = pos;
        lastInteraction = t;
      });
      const endDrag = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        root.removeAttribute('data-dragging');
        const t = now();
        if (drag.moved < 6 && t - drag.t0 < 350) {
          // A tap is a step forward, like the card being pushed out of the light.
          go(1);
        } else {
          // A release long after the last move has no fling.
          const velocity = t - drag.lastT > 120 ? 0 : drag.v;
          const before = Math.round(drag.p0);
          target = releaseTarget(pos, velocity);
          if (target !== before) kick(target - before, 0.800001);
          vel = velocity;
          lastInteraction = t;
        }
        drag = null;
      };
      listen(root, 'pointerup', endDrag);
      listen(root, 'pointercancel', endDrag);
      listen(root, 'lostpointercapture', endDrag);
      listen(root, 'pointerleave', () => {
        hoverTarget = 0;
        pointerXTarget = 0;
      });

      const gate = { acc: 0, lock: 0, idle: 0 };
      listen(root, 'wheel', (e) => {
        if (cfg.preview || cfg.wheel === 'off') return;
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? L.H : 1;
        const dir = wheelGate(gate, e.deltaY * unit, now());
        if (dir) go(dir);
      }, { passive: false });

      listen(root, 'keydown', (e) => {
        if (cfg.preview || e.target !== root) return;
        const k = e.key;
        if (k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'ArrowRight') go(1);
        else if (k === 'ArrowUp' || k === 'PageUp' || k === 'ArrowLeft') go(-1);
        else if (k === 'Home') goTo(0);
        else if (k === 'End') goTo(n - 1);
        else return;
        e.preventDefault();
      });
      for (const button of root.querySelectorAll('[data-lr-step]')) {
        listen(button, 'click', () => go(Number(button.getAttribute('data-lr-step')) || 0));
      }

      // ---- layout ---------------------------------------------------------------
      let L = layoutFor(1, 1);
      let dpr = 1;
      let scale = 1;
      let slowFrames = 0;
      function resize() {
        const W = Math.max(1, root.clientWidth);
        const H = Math.max(1, root.clientHeight);
        dpr = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
        L = layoutFor(W, H);
        const bw = Math.round(W * dpr);
        const bh = Math.round(H * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
        }
      }

      // ---- GL -------------------------------------------------------------------
      let gl = null;
      let prog = null;
      let tex = null;
      let U = {};
      let painted = [];
      const faceCanvas = document.createElement('canvas');
      const etchCanvas = document.createElement('canvas');
      faceCanvas.width = etchCanvas.width = TEX_W;
      faceCanvas.height = etchCanvas.height = TEX_H;
      const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });
      const etchCtx = etchCanvas.getContext('2d', { willReadFrequently: true });
      const layer = new Uint8Array(TEX_W * TEX_H * 4);

      function fail() {
        if (disposed) return;
        root.setAttribute('data-lr-fallback', '');
      }

      function setupGL() {
        gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
        if (!gl) return false;
        try {
          prog = createProgram(gl);
        } catch {
          gl = null;
          return false;
        }
        gl.useProgram(prog);
        U = {};
        for (const name of UNIFORMS) U[name] = gl.getUniformLocation(prog, name);
        tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
        const levels = Math.floor(Math.log2(Math.max(TEX_W, TEX_H))) + 1;
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, TEX_W, TEX_H, n);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(U.uTex, 0);
        gl.uniform1f(U.uCount, n);
        painted = [];
        return true;
      }

      // Each face is repainted only when its name changes, then the mip chain is
      // rebuilt once for the whole array.
      function uploadFaces() {
        if (!gl) return;
        let changed = false;
        for (let i = 0; i < n; i += 1) {
          const name = nameOf(i);
          if (painted[i] === name) continue;
          drawCardFace(faceCtx, name, PALETTES[i], i);
          drawEtch(etchCtx, name, PALETTES[i], i);
          const face = faceCtx.getImageData(0, 0, TEX_W, TEX_H).data;
          const etch = etchCtx.getImageData(0, 0, TEX_W, TEX_H).data;
          for (let p = 0; p < layer.length; p += 4) {
            layer[p] = face[p];
            layer[p + 1] = face[p + 1];
            layer[p + 2] = face[p + 2];
            layer[p + 3] = etch[p];
          }
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
          gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, TEX_W, TEX_H, 1, gl.RGBA, gl.UNSIGNED_BYTE, layer);
          painted[i] = name;
          changed = true;
        }
        if (changed) gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      }

      // ---- frame ----------------------------------------------------------------
      const t0 = now();
      let last = t0;

      function stepSpring(dt) {
        // Cards arrive with a small overshoot, as if pushed out by the light.
        if (reduced()) [pos, vel] = spring(pos, vel, target, 26, 1, dt);
        else [pos, vel] = spring(pos, vel, target, 7.39999, 0.699999, dt);
        if (Math.abs(pos - target) < 1e-4 && Math.abs(vel) < 1e-3) {
          pos = target;
          vel = 0;
        }
      }

      function autoplay(t) {
        const seconds = Number(cfg.autoplay) || 0;
        if (seconds <= 0 || reduced() || drag) return;
        // A reader holding the carousel keeps the card they are on.
        if (!cfg.preview && (hover > 0.0500001 || root.matches(':focus-visible'))) return;
        const every = seconds * 1000;
        if (t - lastInteraction > every + 1000 && t - lastAuto > every && Math.abs(pos - target) < 0.0100001) {
          go(1);
          lastAuto = t;
          lastInteraction = t - every - 1000;
        }
      }

      function frame(t) {
        const gap = t - last;
        const dt = Math.min(0.05, Math.max(0, gap / 1000));
        last = t;
        if (scale === 1) {
          slowFrames = countSlowFrames(slowFrames, gap);
          if (slowFrames >= SLOW_FRAMES) {
            scale = SLOW_SCALE;
            resize();
          }
        }
        const rm = reduced();

        if (!drag) stepSpring(dt);
        pulse *= Math.exp(-dt * 2.59999);
        // The curl follows on a softer, bouncier spring: it trails the cards,
        // overshoots when they stop and settles like a stretched sheet.
        [lag, lagVel] = spring(lag, lagVel, pos, 6, 0.55, dt);
        // The swell rings once or twice after each kick, then rests.
        [swell, swellVel] = spring(swell, swellVel, 0, 8.49999, 0.319999, dt);
        swell = Math.max(-1.3, Math.min(1.39999, swell));
        if (rm) {
          lag = pos;
          lagVel = 0;
          swell = 0;
          swellVel = 0;
        }
        const trail = pos - lag; // slots the curl is behind the cards
        pointerX += (pointerXTarget - pointerX) * (1 - Math.exp(-dt * 4));
        hover += (hoverTarget - hover) * (1 - Math.exp(-dt * 5));
        const themeTarget = cfg.theme === 'light' ? 1 : 0;
        const glassTarget = cfg.material === 'metal' ? 0 : 1;
        if (rm) {
          theme = themeTarget;
          glass = glassTarget;
        } else {
          theme += (themeTarget - theme) * (1 - Math.exp(-dt * 7));
          glass += (glassTarget - glass) * (1 - Math.exp(-dt * 6));
        }

        autoplay(t);

        const idx = wrapIndex(Math.round(pos), n);
        if (idx !== shown) {
          setLabel(idx, t);
          if (shown >= 0) announce(idx);
          shown = idx;
        }
        stepLabel(t);

        if (!gl) return;
        const light = lightAt(pos);
        const time = rm ? 0 : (t - t0) / 1000;
        const velBlur = rm ? 0 : Math.min(Math.abs(vel) * L.pitch * 0.035, L.ch * 0.280001);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(U.uRes, L.W, L.H);
        gl.uniform1f(U.uDpr, canvas.width / L.W);
        gl.uniform4f(U.uCard, L.cw, L.ch, L.cw * 0.026, L.W / 2 + pointerX * 6 * hover);
        gl.uniform4f(U.uBand, L.fold, L.top, L.light, L.pitch);
        // A slow float keeps the strip, and the light it carries, alive at rest.
        const bob = rm ? 0 : L.ch * (0.0109999 * Math.sin(time * 0.549999) + 0.00499999 * Math.sin(time * 1.36999 + 1.19999));
        gl.uniform1f(U.uS0, pos * L.pitch + REST_FLAT * L.ch + bob);
        gl.uniform1f(U.uDrag, rm ? 1 : curlDrag(trail, L.pitch, L.curlLen, cfg.elastic));
        gl.uniform1f(U.uSwell, swell);
        gl.uniform2f(U.uFlow, rm ? 0 : trail, rm ? 0 : Math.min(Math.abs(trail) / 0.400001, 1));
        gl.uniform1f(U.uTexPx, TEX_W / L.cw);
        gl.uniform1f(U.uVelBlur, velBlur);
        gl.uniform1f(U.uTime, time);
        gl.uniform2f(U.uPointer, pointerX, hover);
        gl.uniform1f(U.uPulse, rm ? 0 : pulse);
        gl.uniform1f(U.uBlur, cfg.blur);
        gl.uniform1f(U.uGlass, glass);
        gl.uniform1f(U.uTheme, theme);
        gl.uniform3fv(U.uBg, mix3(BG_DARK, BG_LIGHT, theme));
        gl.uniform3fv(U.uDeep, light.deep);
        gl.uniform3fv(U.uMid, light.mid);
        gl.uniform3fv(U.uWhite, light.white);
        gl.uniform3fv(U.uLight, light.light);
        gl.uniform3fv(U.uEdge, light.edge);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // The light keeps breathing at rest, so the loop runs while the stage is on
      // screen and the tab is visible, and stops entirely otherwise.
      let onScreen = true;
      let raf = 0;
      let running = false;
      function loop() {
        raf = 0;
        if (disposed || !running || !onScreen || document.hidden) return;
        frame(now());
        raf = requestAnimationFrame(loop);
      }
      function wake() {
        if (!raf && running && onScreen && !document.hidden && !disposed) {
          last = now();
          raf = requestAnimationFrame(loop);
        }
      }

      const observer = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
          onScreen = entries.some((entry) => entry.isIntersecting);
          wake();
        })
        : null;
      observer?.observe(root);
      cleanups.push(() => observer?.disconnect());
      listen(document, 'visibilitychange', wake);
      const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
      resizeObserver?.observe(root);
      cleanups.push(() => resizeObserver?.disconnect());
      listen(window, 'resize', resize);

      listen(canvas, 'webglcontextlost', (e) => {
        e.preventDefault();
        running = false;
        cancelAnimationFrame(raf);
        raf = 0;
        gl = null;
        fail();
      });
      listen(canvas, 'webglcontextrestored', () => {
        if (disposed || !setupGL()) return;
        uploadFaces();
        root.removeAttribute('data-lr-fallback');
        running = true;
        wake();
      });

      resize();
      if (!setupGL()) {
        fail();
      } else {
        // Card faces are drawn with Inter; wait for it so the engraving uses it.
        waitForFonts().then(() => {
          if (disposed || !gl) return;
          uploadFaces();
          running = true;
          frame(now());
          root.setAttribute('data-lr-ready', '');
          wake();
        });
      }
      setLabel(0, now());
      shown = 0;

      return {
        setConfig(next) {
          if (disposed) return;
          cfg = { ...ENGINE_DEFAULTS, ...next };
          if (running) uploadFaces();
          // The label may show a renamed card.
          if (shown >= 0 && nameEl && !label) nameEl.textContent = nameOf(shown);
          lastAuto = now();
          wake();
        },
        go,
        goTo,
        get index() { return wrapIndex(Math.round(target), n); },
        get position() { return pos; },
        destroy() {
          disposed = true;
          running = false;
          cancelAnimationFrame(raf);
          raf = 0;
          cleanups.forEach((cleanup) => cleanup());
          cleanups.length = 0;
          if (gl) {
            gl.deleteTexture(tex);
            gl.deleteProgram(prog);
            // Free the context now rather than whenever the collector gets to it:
            // an editor that rebuilds would otherwise run into the browser's cap.
            gl.getExtension('WEBGL_lose_context')?.loseContext();
          }
          gl = null;
          canvas.remove();
          root.removeAttribute('data-lr-ready');
          root.removeAttribute('data-lr-fallback');
          root.removeAttribute('data-dragging');
        }
      };
    }

    const root = __q('.lr-root');
    const carousel = buildLumenRise(root, {
      names,
      theme: 'dark',
      material: 'glass',
      autoplay,
      elastic: 1,
      blur: 1,
      wheel: 'off',
      draggable: true,
      preview: false
    });
    return () => carousel?.destroy();
  }, []);


  const n = names.length;
  const pad = (v) => String(v).padStart(2, '0');
  return (
    <div ref={__root} className={`lr-export-host ${className}`}>
      <div className="lr-frame" style={{ '--lr-width': '100%', '--lr-height': '100%', '--lr-radius': '24px', '--lr-bg': '#05060a', '--lr-ink': '#eef1f8', '--lr-muted': '#8a90a2' }}>
        <div className="lr-root" tabIndex="0" role="region" aria-roledescription="carousel" aria-label={label} data-theme="dark" data-draggable="">
          <div className="lr-gl" aria-hidden="true"></div>
          <div className="lr-still" aria-hidden="true"></div>
          <p className="lr-meta" aria-hidden="true">
            <span className="lr-name">{names[0]}</span>
            <span className="lr-count">{`01 / ${pad(n)}`}</span>
          </p>
          <ol className="lr-rail" aria-hidden="true">
            {names.map((name, i) => <li key={name} className={i === 0 ? 'is-active' : undefined}></li>)}
          </ol>
          <p className="lr-hint" aria-hidden="true">
            <span className="lr-hint-text">Drag or use</span>
            <svg className="lr-arrow" viewBox="0 0 10 14" aria-hidden="true"><path d="M5 13V1.5M1 5.5l4-4 4 4"></path></svg>
            <svg className="lr-arrow" viewBox="0 0 10 14" aria-hidden="true"><path d="M5 1v11.5M1 8.5l4 4 4-4"></path></svg>
          </p>
          <button type="button" className="lr-step lr-prev" data-lr-step="-1" aria-label="Previous level">
            <svg className="lr-arrow" viewBox="0 0 10 14" aria-hidden="true"><path d="M5 13V1.5M1 5.5l4-4 4 4"></path></svg>
          </button>
          <button type="button" className="lr-step lr-next" data-lr-step="1" aria-label="Next level">
            <svg className="lr-arrow" viewBox="0 0 10 14" aria-hidden="true"><path d="M5 1v11.5M1 8.5l4 4 4-4"></path></svg>
          </button>
          <ol className="lr-sr">
            {names.map((name, i) => <li key={name}>{`${name}, level ${i + 1} of ${n}`}</li>)}
          </ol>
          <p className="lr-live" aria-live="polite"></p>
        </div>
      </div>
    </div>
  );
}
