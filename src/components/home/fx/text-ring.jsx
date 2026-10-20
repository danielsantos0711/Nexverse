/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Text Ring" (React export). Changes: the words, size and ink are props; decorative
// (aria-hidden, the words are said elsewhere on the page); fills a square parent; paused offscreen and still
// under reduced motion (as the original); cleans up on unmount instead of on pagehide only.
import { useLayoutEffect, useRef } from 'react';
import { useQuality } from '@/lib/perf';

const CSS = `
.txr-ring{position:relative;width:100%;height:100%;border-radius:50%;touch-action:manipulation;-webkit-user-select:none;user-select:none}
.txr-spin{position:absolute;inset:0;transform-origin:50% 50%;will-change:transform;pointer-events:none;color:var(--txr-ink);font-family:var(--font-display,ui-sans-serif,system-ui,sans-serif);font-size:var(--txr-font);font-weight:var(--txr-weight);letter-spacing:0;line-height:1;text-align:center}
.txr-letter{position:absolute;top:50%;left:50%;display:inline-block;line-height:1;white-space:pre}
.txr-letter[hidden]{display:none}
`;

const MAX_REPEATS = 48;
const MAX_LETTERS = 900;
const SPRING_K = 300;
const SPRING_C = 20;
const NBSP = ' ';

const asFinite = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** One lap: the words joined by the separator, with a trailing separator so the repeats tile cleanly. */
function buildSegment(words, separator) {
  const list = (Array.isArray(words) ? words : []).map((w) => String(w ?? '').trim()).filter(Boolean);
  const glyph = String(separator ?? '').trim() || '·';
  return `${(list.length ? list : ['Nexverse']).join(` ${glyph} `)} ${glyph} `;
}

/**
 * The fit is solved, not searched: n*G + n*L*t = C gives t(n) = C/(n*L) - G/L, so the most repeats that still
 * honour the minimum gap is floor(C / (G + L*t_min)).
 */
function fitRing({ glyphTotal, letterCount, circumference, minTracking }) {
  const G = Math.max(0, asFinite(glyphTotal, 0));
  const L = Math.max(0, Math.trunc(asFinite(letterCount, 0)));
  const C = Math.max(0, asFinite(circumference, 0));
  const tMin = Math.max(0, asFinite(minTracking, 0));
  if (!L || !C) return { repeats: 1, tracking: tMin };
  const perSegment = G + L * tMin;
  const byTracking = perSegment > 0 ? Math.floor(C / perSegment) : MAX_REPEATS;
  const byCount = Math.floor(MAX_LETTERS / L);
  const repeats = Math.max(1, Math.min(MAX_REPEATS, byCount || 1, byTracking));
  return { repeats, tracking: C / (repeats * L) - G / L };
}

function placeLetters(widths, tracking) {
  const total = widths.reduce((sum, w) => sum + w, 0) + tracking * widths.length;
  if (!(total > 0)) return widths.map(() => 0);
  const angles = [];
  let cursor = 0;
  for (const w of widths) {
    angles.push(((cursor + w / 2) / total) * 360);
    cursor += w + tracking;
  }
  return angles;
}

const ratePerSecond = (seconds) => (seconds > 0 ? 360 / seconds : 0);

function readFont(win, el) {
  const cs = win.getComputedStyle(el);
  const size = Number.parseFloat(cs.fontSize) || 24;
  return { size, css: `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}` };
}

function measureWidths(ctx, letters, font) {
  if (!ctx) return letters.map((l) => (l === ' ' ? font.size * 0.35 : font.size * 0.55));
  ctx.font = font.css;
  return letters.map((l) => ctx.measureText(l === ' ' ? NBSP : l).width);
}

function buildTextRing(root, initial) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const ring = root.querySelector('.txr-ring');
  const spin = root.querySelector('.txr-spin');
  const gauge = doc.createElement('canvas').getContext('2d');
  // quality "off" (the admins' motion off, reduced motion) rests the ring like reduced motion does
  const reduced = initial.still ? { matches: true, addEventListener() {}, removeEventListener() {} } : win.matchMedia('(prefers-reduced-motion: reduce)');
  const config = initial;
  let destroyed = false, raf = 0, lastFrame = 0, onScreen = false;
  let angle = 0, rate = 0, paused = false, scale = 1, scaleTarget = 1, scaleRate = 0;
  let spans = [];

  const write = () => { spin.style.transform = `rotate(${angle}deg) scale(${scale})`; };

  const fit = () => {
    const segmentLetters = Array.from(buildSegment(config.words, config.separator));
    const font = readFont(win, spin);
    const box = Math.max(0, Math.min(ring.clientWidth, ring.clientHeight));
    const radius = Math.max(8, box / 2 - font.size * 0.55);
    const segmentWidths = measureWidths(gauge, segmentLetters, font);
    const { repeats, tracking } = fitRing({
      glyphTotal: segmentWidths.reduce((s, w) => s + w, 0),
      letterCount: segmentLetters.length,
      circumference: 2 * Math.PI * radius,
      minTracking: Math.max(0, asFinite(config.tracking, 0.02)) * font.size,
    });
    const letters = [];
    const widths = [];
    for (let i = 0; i < repeats; i += 1) { letters.push(...segmentLetters); widths.push(...segmentWidths); }
    const angles = placeLetters(widths, tracking);
    if (letters.length > spans.length) {
      const frag = doc.createDocumentFragment();
      for (let i = spans.length; i < letters.length; i += 1) {
        const span = doc.createElement('span');
        span.className = 'txr-letter';
        frag.append(span);
        spans.push(span);
      }
      spin.append(frag);
    }
    for (let i = letters.length; i < spans.length; i += 1) { spans[i].hidden = true; spans[i].textContent = ''; }
    for (let i = 0; i < letters.length; i += 1) {
      const rad = (angles[i] * Math.PI) / 180;
      spans[i].hidden = false;
      spans[i].textContent = letters[i] === ' ' ? NBSP : letters[i];
      spans[i].style.transform = `translate(-50%,-50%) translate(${(radius * Math.cos(rad)).toFixed(2)}px,${(radius * Math.sin(rad)).toFixed(2)}px) rotate(${(angles[i] + 90).toFixed(2)}deg)`;
    }
    write();
  };

  const restMotion = () => {
    if (reduced.matches || !(config.secondsPerTurn > 0)) {
      rate = 0; paused = true; scaleTarget = 1; scale = 1; scaleRate = 0;
      return;
    }
    paused = false;
    rate = ratePerSecond(config.secondsPerTurn) * (config.reverse ? -1 : 1);
    scaleTarget = 1;
  };

  const frame = (now) => {
    if (destroyed) return;
    raf = win.requestAnimationFrame(frame);
    const dt = Math.min(now - lastFrame, 64) / 1000;
    lastFrame = now;
    if (!(dt > 0)) return;
    if (!paused && rate !== 0) {
      angle = (angle + rate * dt) % 360;
      if (angle < 0) angle += 360;
    }
    if (scaleTarget !== scale || scaleRate !== 0) {
      scaleRate += (SPRING_K * (scaleTarget - scale) - SPRING_C * scaleRate) * dt;
      scale += scaleRate * dt;
      if (Math.abs(scaleTarget - scale) < 0.0005 && Math.abs(scaleRate) < 0.005) { scale = scaleTarget; scaleRate = 0; }
    } else if (paused || rate === 0) {
      return;
    }
    write();
  };

  const start = () => {
    if (destroyed || raf || !onScreen || reduced.matches) return;
    lastFrame = win.performance.now();
    raf = win.requestAnimationFrame(frame);
  };
  const stop = () => { if (raf) win.cancelAnimationFrame(raf); raf = 0; };

  // On hover the ring speeds up, then eases back to its slow turn.
  const onEnter = () => {
    if (reduced.matches || !(config.secondsPerTurn > 0)) return;
    rate = ratePerSecond(Math.max(0.1, config.hoverSeconds)) * (config.reverse ? -1 : 1);
    start();
  };
  const onLeave = () => {
    if (reduced.matches || !(config.secondsPerTurn > 0)) return;
    rate = ratePerSecond(config.secondsPerTurn) * (config.reverse ? -1 : 1);
    start();
  };
  const onReduced = () => { restMotion(); write(); if (reduced.matches) stop(); else start(); };

  const resizeObserver = new win.ResizeObserver(() => fit());
  resizeObserver.observe(ring);
  const intersectionObserver = new win.IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    if (onScreen) start();
    else stop();
  });
  intersectionObserver.observe(ring);
  const host = config.hoverTarget ?? ring;
  host.addEventListener('pointerenter', onEnter);
  host.addEventListener('pointerleave', onLeave);
  reduced.addEventListener?.('change', onReduced);
  doc.fonts?.ready?.then(() => { if (!destroyed) fit(); });

  restMotion();
  fit();

  return () => {
    destroyed = true;
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    host.removeEventListener('pointerenter', onEnter);
    host.removeEventListener('pointerleave', onLeave);
    reduced.removeEventListener?.('change', onReduced);
    spin.replaceChildren();
    spans = [];
  };
}

/**
 * Words set around a circle, turning slowly; it speeds up while the pointer is over its parent.
 * Size it with the parent (it fills a square box).
 */
export default function TextRing({ words, separator = '·', font = 12, weight = 500, ink = 'currentColor', tracking = 0.1, secondsPerTurn = 48, hoverSeconds = 10, reverse = false, className = '' }) {
  const __root = useRef(null);
  const still = useQuality() === 'off';
  const key = JSON.stringify([words, separator, secondsPerTurn, hoverSeconds, reverse, tracking, still]);

  useLayoutEffect(() => {
    if (!document.querySelector('style[data-text-ring]')) {
      const tag = document.createElement('style');
      tag.setAttribute('data-text-ring', '');
      tag.textContent = CSS;
      document.head.append(tag);
    }
    const root = __root.current;
    return buildTextRing(root, { words, separator, tracking, secondsPerTurn, hoverSeconds, reverse, still, hoverTarget: root.parentElement });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={__root} aria-hidden="true" className={className} style={{ '--txr-font': `${font}px`, '--txr-weight': String(weight), '--txr-ink': ink }}>
      <div className="txr-ring">
        <div className="txr-spin"></div>
      </div>
    </div>
  );
}
