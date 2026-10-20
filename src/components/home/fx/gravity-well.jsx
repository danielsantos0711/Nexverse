/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Gravity Well" (React export): a wireframe of flat space bent into a funnel, rings
// streaming inward and spokes running down its throat, drawn with the 2D canvas API (additive lines, then a
// three-step downsampled bloom). Changes for Nexverse: fills its parent on a transparent ground, decorative
// (aria-hidden; no drag-to-orbit or keyboard, since it sits behind content; the pointer still dimples the
// fabric and a click sends a ripple), site colours, and its cost follows useFx() from @/lib/perf (high: DPR up
// to 1.5 and the full mesh; medium: DPR 1.25 and fewer samples; low: DPR 1, fewer rings, 30 fps; "off" and
// another effect's turn: one still frame). Paused offscreen and in hidden tabs.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { frameInterval, pixelRatio, useFx } from '@/lib/perf';

const SETTINGS = {
  lineColor: '#7d88a8', innerColor: '#c9d9ff', rings: 14, spokes: 18, clustering: 1.7, throat: 0.28, depth: 0.32,
  steepness: 1.6, tube: 0.4, tilt: 30, distance: 3.4, zoom: 1, lineWidth: 1.1, glow: 1, throatGlow: 1.3,
  spokeOpacity: 0.42, flow: 0.6, spin: 0.15, twist: 0, probeMass: 0.16, ripple: 0.8,
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const TUBE_SHARE = 0.12;
const NECK = 0.82;
const MAX_PULSES = 6;
/** Samples per ring and per spoke, by tier. */
const DETAIL = { high: [144, 40, 12], medium: [108, 30, 10], low: [84, 24, 8], off: [144, 40, 12] };

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
function smoothstep(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
const parse = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16));
const ringRadius = (u, throat, clustering) => throat + (1 - throat) * Math.pow(clamp(u, 0, 1), clustering);
function wellDepth(r, throat, depth, steepness) {
  if (r <= throat) return depth;
  if (r >= 1) return 0;
  const neck = throat * NECK;
  const lip = Math.acosh(throat / neck);
  const s = (Math.acosh(r / neck) - lip) / (Math.acosh(1 / neck) - lip);
  return depth * Math.pow(1 - s, steepness);
}
function flowPosition(v, share) {
  if (share <= 0) return { u: clamp(v, 0, 1), down: 0 };
  const w = v * (1 + share) - share;
  return w >= 0 ? { u: w, down: 0 } : { u: 0, down: clamp(-w / share, 0, 1) };
}
const ricker = (x) => (1 - 2 * x * x) * Math.exp(-x * x);
function makeCamera(tiltDeg, yaw, distance, scale = 1, cx = 0, cy = 0) {
  const t = tiltDeg * DEG;
  return { cosTilt: Math.cos(t), sinTilt: Math.sin(t), cosYaw: Math.cos(yaw), sinYaw: Math.sin(yaw), distance, scale, cx, cy };
}
function project(c, x, y, z, out) {
  const x1 = x * c.cosYaw - z * c.sinYaw;
  const z1 = x * c.sinYaw + z * c.cosYaw;
  const sy = y * c.cosTilt - z1 * c.sinTilt;
  const depth = Math.max(c.distance - (y * c.sinTilt + z1 * c.cosTilt), 0.05);
  const k = c.distance / depth;
  out.x = c.cx + c.scale * x1 * k; out.y = c.cy - c.scale * sy * k; out.z = depth;
  return out;
}
function unprojectToPlane(c, sx, sy) {
  const px = (sx - c.cx) / c.scale, py = -(sy - c.cy) / c.scale;
  const den = py * c.cosTilt - c.sinTilt * c.distance;
  if (den > -1e-4) return null;
  const z1 = (py * c.distance) / den;
  const depth = c.distance - z1 * c.cosTilt;
  if (depth <= 0.05) return null;
  const x1 = (px * depth) / c.distance;
  return { x: x1 * c.cosYaw + z1 * c.sinYaw, z: -x1 * c.sinYaw + z1 * c.cosYaw };
}
function fitStage(config, width, height) {
  const cam = makeCamera(config.tilt, 0, config.distance);
  const p = { x: 0, y: 0, z: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const include = (x, y, z) => { project(cam, x, y, z, p); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); };
  const bottom = -(config.depth + config.tube * 0.55);
  for (let i = 0; i < 64; i++) { const a = (i / 64) * TAU; include(Math.cos(a), 0, Math.sin(a)); include(config.throat * Math.cos(a), bottom, config.throat * Math.sin(a)); }
  const pad = 0.07;
  const scale = Math.min((width * (1 - 2 * pad)) / Math.max(maxX - minX, 1e-3), (height * (1 - 2 * pad)) / Math.max(maxY - minY, 1e-3)) * config.zoom;
  return { scale, cx: width / 2 - scale * ((minX + maxX) / 2), cy: height / 2 - scale * ((minY + maxY) / 2) };
}

function mount(root, canvas, config) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const layers = [0, 1, 2, 3].map(() => document.createElement('canvas'));
  const lctx = layers.map((l) => l.getContext('2d'));
  const outer = parse(config.lineColor), inner = parse(config.innerColor);
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let quality = 'high', live = false;
  let width = 0, height = 0, dpr = 1, fit = { scale: 1, cx: 0, cy: 0 }, rect = null;
  let visible = true, destroyed = false, raf = 0, lastTime = 0, drawnAt = 0;
  const still = () => reducedQuery.matches || !live;
  const motion = { phase: 0, rotation: 0, depthScale: 0, depthVelocity: 0, reveal: 0, flash: 0 };
  const probe = { x: 0, z: 0, tx: 0, tz: 0, presence: 0, target: 0 };
  let pulses = [];
  const point = { x: 0, y: 0, z: 0 };
  const color = [0, 0, 0];
  const max = 145 + 53;
  const xs = new Float32Array(max), ys = new Float32Array(max), zs = new Float32Array(max), bs = new Float32Array(max), ins = new Float32Array(max), fades = new Float32Array(max);

  function measure() {
    const box = root.getBoundingClientRect();
    rect = box;
    dpr = pixelRatio(quality);
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (w === width && h === height) return;
    width = w; height = h; canvas.width = w; canvas.height = h;
    layers.forEach((l, i) => { l.width = Math.max(1, Math.round(w / 2 ** i)); l.height = Math.max(1, Math.round(h / 2 ** i)); });
    fit = fitStage(config, width, height);
  }
  const depthFade = (z) => 0.78 + 0.22 * clamp(config.distance - z, -1, 1);
  function placeSurface(cam, x, z, r, baseY) {
    let y = baseY, boost = 0;
    for (const pulse of pulses) {
      const x0 = (r - (config.throat + 0.95 * pulse.age)) / 0.075;
      if (x0 > -4 && x0 < 4) { const decay = Math.exp(-pulse.age * 0.85) * pulse.strength; y -= 0.13 * config.ripple * ricker(x0) * decay; boost += Math.exp(-x0 * x0) * decay * 0.9; }
    }
    if (probe.presence > 0.001) {
      const dx = x - probe.x, dz = z - probe.z;
      const g = Math.exp(-(dx * dx + dz * dz) / 0.04) * probe.presence;
      if (g > 1e-4) { y -= config.probeMass * g; const pull = 0.35 * g * Math.min(config.probeMass / 0.3, 1); x -= dx * pull; z -= dz * pull; boost += g * 0.45; }
    }
    project(cam, x, y, z, point);
    return boost;
  }
  const level = (k) => (0.42 + 0.58 * k) * (1 + config.throatGlow * 0.9 * k ** 4 + motion.flash * 1.4 * k * k);
  function stroke(target, count, chunk, alphaAt, innerAt, widthScale) {
    const lw = config.lineWidth * dpr;
    for (let start = 0; start < count - 1; start += chunk) {
      const end = Math.min(start + chunk, count - 1);
      const mid = (start + end) >> 1;
      const alpha = clamp(alphaAt(mid) * depthFade(zs[mid]) * (1 + bs[mid]), 0, 1);
      if (alpha < 0.004) continue;
      const k = clamp(innerAt(mid) + bs[mid] * 0.6, 0, 1);
      for (let c = 0; c < 3; c++) color[c] = Math.round(outer[c] + (inner[c] - outer[c]) * k);
      target.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha.toFixed(3)})`;
      target.lineWidth = lw * widthScale * (0.85 + 0.55 * k);
      target.beginPath();
      target.moveTo(xs[start], ys[start]);
      for (let i = start + 1; i <= end; i++) target.lineTo(xs[i], ys[i]);
      target.stroke();
    }
  }
  function drawRing(target, cam, v, isRim, samples) {
    const { u, down } = flowPosition(v, config.tube > 0 ? TUBE_SHARE : 0);
    const inTube = down > 0;
    const r = inTube ? config.throat : ringRadius(u, config.throat, config.clustering);
    const y = inTube ? -(config.depth * motion.depthScale + config.tube * down) : -wellDepth(r, config.throat, config.depth, config.steepness) * motion.depthScale;
    const k = inTube ? 1 : (1 - u) ** 2;
    let fade = isRim ? 1 : 1 - smoothstep(0.95, 1, v);
    if (inTube) fade *= (1 - down) ** 3;
    fade *= smoothstep(0, 0.35, motion.reveal * 1.35 - (1 - k) * 0.35);
    const ringAlpha = level(k) * fade * (isRim ? 0.9 : 1);
    if (ringAlpha < 0.004) return;
    for (let i = 0; i <= samples; i++) {
      const a = (i / samples) * TAU;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      if (inTube) { project(cam, x, y, z, point); bs[i] = 0; } else bs[i] = placeSurface(cam, x, z, r, y);
      xs[i] = point.x; ys[i] = point.y; zs[i] = point.z;
    }
    stroke(target, samples + 1, Math.max(4, Math.round(samples / 24)), () => ringAlpha, () => k, 1);
  }
  function drawSpoke(target, cam, angle, surface, tube) {
    let n = 0;
    const depth = config.depth * motion.depthScale;
    for (let k = surface; k >= 0; k--) {
      const u = (k / surface) ** 1.6;
      const r = ringRadius(u, config.throat, config.clustering);
      const theta = angle + config.twist * (1 - u) ** 2;
      bs[n] = placeSurface(cam, r * Math.cos(theta), r * Math.sin(theta), r, -wellDepth(r, config.throat, config.depth, config.steepness) * motion.depthScale);
      xs[n] = point.x; ys[n] = point.y; zs[n] = point.z; ins[n] = (1 - u) ** 2; fades[n] = 1; n++;
    }
    for (let k = 1; k <= tube; k++) {
      const down = k / tube;
      const theta = angle + config.twist * (1 + 0.6 * down);
      project(cam, config.throat * Math.cos(theta), -(depth + config.tube * down), config.throat * Math.sin(theta), point);
      xs[n] = point.x; ys[n] = point.y; zs[n] = point.z; bs[n] = 0; ins[n] = 1; fades[n] = (1 - down) ** 1.4; n++;
    }
    const reveal = smoothstep(0.15, 1, motion.reveal);
    stroke(target, n, 4, (i) => config.spokeOpacity * reveal * fades[i] * (0.5 + 0.5 * level(ins[i])), (i) => ins[i], 0.85);
  }
  function draw() {
    if (!width || !height || destroyed) return;
    const [ringSamples, spokeSurface, spokeTube] = DETAIL[quality] ?? DETAIL.high;
    const lines = layers[0], lc = lctx[0];
    const cam = makeCamera(config.tilt, 0, config.distance, fit.scale, fit.cx, fit.cy);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, width, height);
    lc.globalCompositeOperation = 'lighter';
    lc.lineJoin = 'round';
    for (let j = 0; j < config.spokes; j++) drawSpoke(lc, cam, (j / config.spokes) * TAU + motion.rotation, spokeSurface, spokeTube);
    const rings = quality === 'low' ? Math.round(config.rings * 0.75) : config.rings;
    drawRing(lc, cam, 1, true, ringSamples);
    for (let i = 0; i < rings; i++) drawRing(lc, cam, ((((i + 0.5) / rings - motion.phase) % 1) + 1) % 1, false, ringSamples);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    // bloom: halve three times, add the smallest back into the quarter, climb back up an octave at a time
    for (let i = 1; i < layers.length; i++) { lctx[i].globalCompositeOperation = 'copy'; lctx[i].drawImage(layers[i - 1], 0, 0, layers[i].width, layers[i].height); }
    const quarter = lctx[2];
    quarter.globalCompositeOperation = 'lighter';
    for (let amount = 1.25 / 0.9; amount > 0.001; amount -= 1) { quarter.globalAlpha = Math.min(amount, 1); quarter.drawImage(layers[3], 0, 0, layers[2].width, layers[2].height); }
    quarter.globalAlpha = 1;
    lctx[1].globalCompositeOperation = 'copy';
    lctx[1].drawImage(layers[2], 0, 0, layers[1].width, layers[1].height);
    for (let amount = config.glow * 0.9; amount > 0.001; amount -= 1) { ctx.globalAlpha = Math.min(amount, 1); ctx.drawImage(layers[1], 0, 0, width, height); }
    ctx.globalAlpha = 1;
    ctx.drawImage(lines, 0, 0);
    // soft edges, multiplied into the alpha: in from the left on wide boxes, at the top and bottom always
    ctx.globalCompositeOperation = 'destination-in';
    if (width > height * 1.4) {
      const across = ctx.createLinearGradient(0, 0, width, 0);
      across.addColorStop(0, 'rgba(0,0,0,0)');
      across.addColorStop(0.38, 'rgba(0,0,0,1)');
      ctx.fillStyle = across;
      ctx.fillRect(0, 0, width, height);
    }
    const down = ctx.createLinearGradient(0, 0, 0, height);
    down.addColorStop(0, 'rgba(0,0,0,0)');
    down.addColorStop(0.2, 'rgba(0,0,0,1)');
    down.addColorStop(0.72, 'rgba(0,0,0,1)');
    down.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = down;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }
  function step(dt) {
    if (still()) {
      // a resting well: fully formed, still turning nowhere
      motion.depthScale = 1; motion.depthVelocity = 0; motion.reveal = 1; motion.flash = 0;
    } else {
      motion.phase = (motion.phase + dt * config.flow * 0.05) % 1;
      motion.rotation += dt * config.spin * 0.2;
      motion.depthVelocity += (58 * (1 - motion.depthScale) - 8.5 * motion.depthVelocity) * dt;
      motion.depthScale += motion.depthVelocity * dt;
      motion.reveal = Math.min(1, motion.reveal + dt / 1.1);
      motion.flash *= Math.exp(-dt * 3.2);
    }
    pulses = pulses.filter((p) => (p.age += dt) < 3.6);
    const follow = 1 - Math.exp(-dt * 9);
    probe.x += (probe.tx - probe.x) * follow;
    probe.z += (probe.tz - probe.z) * follow;
    probe.presence += (probe.target - probe.presence) * (1 - Math.exp(-dt * 5));
  }
  function frame(now) {
    raf = 0;
    if (destroyed || !visible || document.hidden) return;
    if (now - drawnAt < frameInterval(quality)) { schedule(); return; }
    const dt = lastTime ? clamp((now - lastTime) / 1000, 0, 0.05) : 1 / 60;
    lastTime = now; drawnAt = now;
    measure(); step(dt); draw();
    const settling = pulses.length || Math.abs(probe.presence - probe.target) > 1e-3;
    if (!still() || settling) schedule(); else lastTime = 0;
  }
  function schedule() { if (!raf && !destroyed && visible && !document.hidden) raf = requestAnimationFrame(frame); }
  function refresh() { cancelAnimationFrame(raf); raf = 0; lastTime = 0; measure(); if (still()) step(0); draw(); if (!still()) schedule(); }

  function aim(e) {
    if (!rect || !rect.width) return;
    const hit = unprojectToPlane(makeCamera(config.tilt, 0, config.distance, fit.scale, fit.cx, fit.cy), (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    if (!hit) { probe.target = 0; return; }
    const radius = Math.hypot(hit.x, hit.z);
    if (probe.target === 0 && probe.presence < 0.01) { probe.x = hit.x; probe.z = hit.z; }
    probe.tx = hit.x; probe.tz = hit.z;
    probe.target = smoothstep(config.throat * 0.9, config.throat * 1.8, radius) * (1 - smoothstep(1.05, 1.35, radius));
  }
  const onMove = (e) => { if (e.pointerType !== 'mouse' || still()) return; rect = root.getBoundingClientRect(); aim(e); schedule(); };
  const onLeave = () => { probe.target = 0; schedule(); };
  const onDown = (e) => {
    if (still() || e.button > 0) return;
    pulses.push({ age: 0, strength: 1 });
    if (pulses.length > MAX_PULSES) pulses.shift();
    motion.depthVelocity += 2.6 * config.ripple;
    motion.flash = Math.min(motion.flash + 0.9, 1.4);
    schedule();
  };
  const onMotion = () => refresh();
  const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else refresh(); };
  const resize = new ResizeObserver(refresh); resize.observe(root);
  const intersection = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) refresh(); else { cancelAnimationFrame(raf); raf = 0; } }, { rootMargin: '80px' });
  intersection.observe(root);
  const host = root.parentElement ?? root;
  host.addEventListener('pointermove', onMove, { passive: true });
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('pointerdown', onDown);
  reducedQuery.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', onVisibility);
  refresh();
  return {
    set(q, l) { quality = q; live = l; refresh(); },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); resize.disconnect(); intersection.disconnect();
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave); host.removeEventListener('pointerdown', onDown);
      reducedQuery.removeEventListener('change', onMotion); document.removeEventListener('visibilitychange', onVisibility);
      layers.forEach((l) => { l.width = 0; l.height = 0; });
    },
  };
}

/**
 * Space bent into a funnel, rings streaming into its throat. Fills its parent; the pointer over the parent
 * dimples the fabric and a click sends a ripple out from the throat.
 */
export default function GravityWell({ className = '', settings = {} }) {
  const root = useRef(null);
  const scene = useRef(null);
  const { quality, run } = useFx(root);

  useLayoutEffect(() => {
    const el = root.current;
    const s = mount(el, el.querySelector('canvas'), { ...SETTINGS, ...settings });
    scene.current = s;
    return () => { s?.destroy(); scene.current = null; };
    // settings are read once at mount, like the original export
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scene.current?.set(quality, run);
  }, [quality, run]);

  return (
    <div ref={root} aria-hidden="true" className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      <canvas style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
