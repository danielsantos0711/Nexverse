/* eslint-disable */
// @ts-nocheck
// Vendored from HorizonX "Pixel Card" (React export; adapted from React Bits by David Haz, MIT, 2025: see the
// licence text kept in the engine below). Changes for Nexverse: the card fills its parent and holds any children
// (a badge on a profile) instead of the export's fixed copy; colours come from props; no web font import;
// devicePixelRatio is capped at 1.5; the engine is detached on unmount, not only on pagehide. The engine (pixels
// that grow from the centre on hover, focus or tap, pause offscreen and in hidden tabs, and stand still under
// reduced motion) is the export's.
import { useLayoutEffect, useRef } from 'react';

const CSS = `
.hpc-card{box-sizing:border-box;position:relative;isolation:isolate;display:block;width:100%;height:100%;overflow:hidden;border:1px solid var(--hpc-border);border-radius:var(--hpc-radius);background:var(--hpc-surface);color:inherit;user-select:none;transition:border-color 200ms cubic-bezier(.5,1,.89,1)}
.hpc-card::before{content:'';position:absolute;inset:0;background:radial-gradient(circle,color-mix(in srgb,var(--hpc-active) 22%,transparent),transparent 85%);opacity:0;transition:opacity 800ms cubic-bezier(.5,1,.89,1);pointer-events:none}
.hpc-card[data-active="true"]{border-color:color-mix(in srgb,var(--hpc-active) 55%,transparent)}
.hpc-card[data-active="true"]::before{opacity:1}
.hpc-card:focus-visible{outline:2px solid var(--hpc-active);outline-offset:2px}
.hpc-canvas{position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none}
.hpc-content{position:relative;z-index:1;height:100%}
@media(prefers-reduced-motion:reduce){.hpc-card,.hpc-card::before{transition:none}}
`;

function attachPixelCard(card, config) {
  /* Pixel Card — adapted from React Bits by David Haz (2025).
  MIT License. Copyright (c) 2025 David Haz.
  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
  documentation files (the "Software"), to deal in the Software without restriction, including without limitation
  the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
  to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above
  copyright notice and this permission notice shall be included in all copies or substantial portions of the
  Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. */
  const canvas = card.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return () => {};
  const doc = card.ownerDocument;
  const win = doc.defaultView;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const palette = config.colors.split(',');
  let pixels = [];
  let width = 0;
  let height = 0;
  let raf = 0;
  let previous = 0;
  let hovered = false;
  let focused = false;
  let touched = false;
  let visible = true;
  let destroyed = false;
  let pointerStart = null;
  const active = () => hovered || focused || touched;
  const still = () => motion.matches || config.speed === 0;
  const stop = () => {
    win.cancelAnimationFrame(raf);
    raf = 0;
    previous = 0;
  };
  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const p of pixels) {
      if (p.size <= 0) continue;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x + 1 - p.size / 2, p.y + 1 - p.size / 2, p.size, p.size);
    }
  }
  function tick(time) {
    raf = 0;
    if (destroyed || !visible || doc.hidden) return;
    const step = previous ? Math.min(2, (time - previous) / (1e3 / 60)) : 1;
    previous = time;
    const on = active();
    let moving = false;
    for (const p of pixels)
      if (on) {
        moving = true;
        if (p.counter < p.delay) {
          p.counter += p.counterStep * step;
          continue;
        }
        if (!p.shimmer) {
          p.size = Math.min(p.max, p.size + p.grow * step);
          p.shimmer = p.size >= p.max;
        } else {
          if (p.size >= p.max) p.reverse = true;
          if (p.size <= 0.5) p.reverse = false;
          p.size = Math.max(0.500003, Math.min(p.max, p.size + (p.reverse ? -1 : 1) * p.speed * step));
        }
      } else {
        p.shimmer = false;
        p.counter = 0;
        p.size = Math.max(0, p.size - 0.1 * step);
        moving ||= p.size > 0;
      }
    draw();
    if (moving) raf = win.requestAnimationFrame(tick);
  }
  function sync() {
    stop();
    const on = active();
    card.dataset.active = String(on);
    if (destroyed || !visible || doc.hidden || !width || !height) return;
    if (still()) {
      for (const p of pixels) p.size = on ? p.max : 0;
      draw();
    } else if (on || pixels.some((p) => p.size > 0)) raf = win.requestAnimationFrame(tick);
    else draw();
  }
  function resize() {
    width = card.clientWidth;
    height = card.clientHeight;
    const dpr = Math.min(1.5, win.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pixels = [];
    const gap = Math.max(config.gap, Math.sqrt((width * height) / 18e3));
    for (let x = 0; x < width; x += gap)
      for (let y = 0; y < height; y += gap)
        pixels.push({
          x,
          y,
          color: palette[Math.floor(Math.random() * palette.length)],
          size: 0,
          max: 0.5 + Math.random() * 1.5,
          grow: 0.05 + Math.random() * 0.35,
          speed: (0.1 + Math.random() * 0.8) * config.speed * 0.001,
          delay: Math.hypot(x - width / 2, y - height / 2),
          counter: 0,
          counterStep: Math.random() * 4 + (width + height) * 0.01,
          reverse: false,
          shimmer: false,
        });
    sync();
  }
  const enter = (e) => {
    if (e.pointerType === 'touch') return;
    hovered = true;
    sync();
  };
  const leave = () => {
    hovered = false;
    sync();
  };
  const focus = () => {
    if (!pointerStart?.touch) {
      focused = true;
      sync();
    }
  };
  const blur = (e) => {
    if (!card.contains(e.relatedTarget)) {
      focused = false;
      touched = false;
      sync();
    }
  };
  const down = (e) => {
    pointerStart = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    if (pointerStart.touch) focused = false;
  };
  const up = (e) => {
    if (e.pointerType !== 'touch' || !pointerStart) return;
    if (Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) < 10) {
      touched = !touched;
      sync();
    }
    pointerStart = null;
  };
  const cancel = () => {
    pointerStart = null;
  };
  const visibility = () => (doc.hidden ? stop() : sync());
  const listeners = { pointerenter: enter, pointerleave: leave, focusin: focus, focusout: blur, pointerdown: down, pointerup: up, pointercancel: cancel };
  for (const [event, listener] of Object.entries(listeners)) card.addEventListener(event, listener);
  motion.addEventListener('change', sync);
  doc.addEventListener('visibilitychange', visibility);
  const observer = new win.ResizeObserver(resize);
  observer.observe(card);
  const intersection = new win.IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  intersection.observe(card);
  resize();
  return () => {
    destroyed = true;
    stop();
    observer.disconnect();
    intersection.disconnect();
    motion.removeEventListener('change', sync);
    doc.removeEventListener('visibilitychange', visibility);
    for (const [event, listener] of Object.entries(listeners)) card.removeEventListener(event, listener);
    pixels = [];
  };
}

export default function PixelCard({ colors = '#f3f3f3,#d9d9d9,#9d9d9d', active = '#8fb4ff', radius = 16, gap = 5, speed = 35, label, className = '', children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!document.querySelector('style[data-pixel-card]')) {
      const tag = document.createElement('style');
      tag.setAttribute('data-pixel-card', '');
      tag.textContent = CSS;
      document.head.append(tag);
    }
    return attachPixelCard(ref.current, { colors, gap, speed });
  }, [colors, gap, speed]);
  return (
    <div
      ref={ref}
      className={`hpc-card ${className}`}
      data-active="false"
      role="group"
      aria-label={label}
      tabIndex={0}
      style={{ '--hpc-radius': `${radius}px`, '--hpc-border': 'var(--border)', '--hpc-surface': 'var(--card)', '--hpc-active': active }}
    >
      <canvas className="hpc-canvas" aria-hidden="true" />
      <div className="hpc-content">{children}</div>
    </div>
  );
}
