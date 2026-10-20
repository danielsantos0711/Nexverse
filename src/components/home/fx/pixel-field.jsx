/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Pixel Card" (React export, ion and champagne pixels). Changes: instead of being
// a card itself it is a canvas layer that lights up its parent (hover, keyboard focus inside it, or a tap),
// so any existing card can carry it; decorative (aria-hidden); devicePixelRatio capped at 1.5; fully lit and
// still under reduced motion; paused offscreen and in hidden tabs; cleans up on unmount.
//
// Pixel Card, adapted from React Bits by David Haz (2025), MIT License.
// https://github.com/DavidHDev/react-bits/tree/3a6f88a53cc8461dc498aaaeb11203afc6313b03
// Copyright (c) 2025 David Haz. Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute,
// sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to
// do so, subject to the following conditions: The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT
// WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
// ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
import { useLayoutEffect, useRef } from 'react';
import { pixelRatio, qualityScale, useQuality } from '@/lib/perf';

function attachPixelField(card, canvas, config) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const doc = card.ownerDocument;
  const win = doc.defaultView;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const palette = config.colors.split(',');
  let pixels = [];
  let width = 0, height = 0, raf = 0, previous = 0;
  let hovered = false, focused = false, visible = false, destroyed = false;
  const active = () => hovered || focused;
  const stop = () => { win.cancelAnimationFrame(raf); raf = 0; previous = 0; };

  function draw() {
    ctx.clearRect(0, 0, width, height);
    for (const p of pixels) {
      if (p.size <= 0) continue;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x + 1 - p.size / 2, p.y + 1 - p.size / 2, p.size, p.size);
    }
  }
  // Pixels grow outward from the pointer's entry point, then shimmer; on leave they shrink away.
  function tick(time) {
    raf = 0;
    if (destroyed || !visible || doc.hidden) return;
    const step = previous ? Math.min(2, (time - previous) / (1e3 / 60)) : 1;
    previous = time;
    const on = active();
    let moving = false;
    for (const p of pixels) {
      if (on) {
        moving = true;
        if (p.counter < p.delay) { p.counter += p.counterStep * step; continue; }
        if (!p.shimmer) {
          p.size = Math.min(p.max, p.size + p.grow * step);
          p.shimmer = p.size >= p.max;
        } else {
          if (p.size >= p.max) p.reverse = true;
          if (p.size <= 0.5) p.reverse = false;
          p.size = Math.max(0.5, Math.min(p.max, p.size + (p.reverse ? -1 : 1) * p.speed * step));
        }
      } else {
        p.shimmer = false;
        p.counter = 0;
        p.size = Math.max(0, p.size - 0.1 * step);
        moving ||= p.size > 0;
      }
    }
    draw();
    if (moving) raf = win.requestAnimationFrame(tick);
  }
  function sync() {
    stop();
    const on = active();
    card.dataset.lit = String(on);
    if (destroyed || !visible || doc.hidden || !width || !height) return;
    if (motion.matches || config.quality === 'off') {
      for (const p of pixels) p.size = on ? p.max * 0.8 : 0;
      draw();
    } else if (on || pixels.some((p) => p.size > 0)) raf = win.requestAnimationFrame(tick);
    else draw();
  }
  let origin = null;
  function resize() {
    width = card.clientWidth;
    height = card.clientHeight;
    const dpr = pixelRatio(config.quality);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pixels = [];
    // lower quality tiers space the pixels wider: fewer to draw each frame
    const gap = Math.max(config.gap, Math.sqrt((width * height) / 18e3)) / Math.sqrt(Math.max(0.35, qualityScale(config.quality)));
    const ox = origin?.x ?? width / 2, oy = origin?.y ?? height / 2;
    for (let x = 0; x < width; x += gap) for (let y = 0; y < height; y += gap) pixels.push({
      x, y,
      color: palette[Math.floor(Math.random() * palette.length)],
      size: 0,
      max: 0.5 + Math.random() * 1.5,
      grow: 0.05 + Math.random() * 0.35,
      speed: (0.1 + Math.random() * 0.8) * config.speed * 0.001,
      delay: Math.hypot(x - ox, y - oy),
      counter: 0,
      counterStep: Math.random() * 4 + (width + height) * 0.01,
      reverse: false,
      shimmer: false,
    });
    sync();
  }
  const enter = (e) => {
    if (e.pointerType === 'touch') return;
    const box = card.getBoundingClientRect();
    origin = { x: e.clientX - box.left, y: e.clientY - box.top };
    for (const p of pixels) p.delay = Math.hypot(p.x - origin.x, p.y - origin.y);
    hovered = true;
    sync();
  };
  const leave = () => { hovered = false; sync(); };
  const focus = (e) => { if (e.target.matches(':focus-visible')) { focused = true; sync(); } };
  const blur = (e) => { if (!card.contains(e.relatedTarget)) { focused = false; sync(); } };
  const visibility = () => { if (doc.hidden) stop(); else sync(); };
  const listeners = { pointerenter: enter, pointerleave: leave, focusin: focus, focusout: blur };
  for (const [event, listener] of Object.entries(listeners)) card.addEventListener(event, listener);
  motion.addEventListener('change', sync);
  doc.addEventListener('visibilitychange', visibility);
  const observer = new win.ResizeObserver(resize);
  observer.observe(card);
  const intersection = new win.IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  intersection.observe(card);
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

/**
 * A field of tiny pixels that grows from the pointer and shimmers while its parent is hovered or holds
 * keyboard focus. Put it as the first child of a `relative overflow-hidden` card.
 */
export default function PixelField({ colors = '#8fb4ff,#c9d9ff,#d8c59e', gap = 6, speed = 35, className = '' }) {
  const ref = useRef(null);
  // perf (src/lib/perf.ts): it only moves while hovered, so it needs no turn; the tier sets its density
  const quality = useQuality();
  useLayoutEffect(() => {
    const canvas = ref.current;
    const card = canvas?.parentElement;
    if (!card) return;
    return attachPixelField(card, canvas, { colors, gap, speed, quality });
  }, [colors, gap, speed, quality]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', display: 'block' }}
    />
  );
}
