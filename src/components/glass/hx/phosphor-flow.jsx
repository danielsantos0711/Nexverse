/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Phosphor Flow" (React export, shader). Changes: colours come from props (the site's
// deep ground, ion folds and pale highlights instead of graphite); it fills its parent; the pixel budget and
// the frame rate follow the quality tier (`budget` pixels, `fps`), devicePixelRatio is capped at 1.5; decorative
// (aria-hidden), paused offscreen, in hidden tabs and under reduced motion (one still frame), cleans up on
// unmount. The ray field and nested sine distortion are the export's, unchanged.
import { useLayoutEffect, useRef } from 'react';

const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;
const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform float time, scale, brightness;
uniform vec3 background, midtone, highlight;
void main() {
  vec2 coord = (gl_FragCoord.xy - resolution * 0.500009) / scale + resolution * 0.5;
  vec3 ray = normalize(vec3(coord, time) * 2.0 - resolution.xyy);
  vec3 energy = vec3(0.0);
  float z = 0.0, d = 0.0, s = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = z * ray;
    vec3 a = normalize(cos(vec3(5.0, 0.0, 1.0) + time - d * 4.0));
    p.z += 5.0;
    a = a * dot(a, p) - cross(a, p);
    for (int layer = 2; layer <= 9; layer++) {
      float frequency = float(layer);
      a -= sin(a * frequency + time).zxy / frequency;
    }
    s = a.y;
    d = 0.1 * abs(length(p) - 3.0) + 0.07 * abs(cos(s));
    z += d;
    energy += (cos(s + vec3(0.0, 1.0, 8.0)) + 1.0) / max(d, 0.00001);
  }
  vec3 e = exp(-2.0 * energy * brightness / (5000.0 * float(STEPS) / 80.0));
  vec3 mapped = (1.0 - e) / (1.0 + e);
  float light = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
  vec3 colour = mix(background, midtone, smoothstep(0.0, 0.55, light));
  colour = mix(colour, highlight, smoothstep(0.35, 1.0, light));
  gl_FragColor = vec4(colour, 1.0);
}
`;
const rgb = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);

function mount(canvas, opts) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader');
    return s;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `#define STEPS ${opts.steps}\n` + fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  } catch {
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const k of ['resolution', 'time', 'scale', 'brightness', 'background', 'midtone', 'highlight']) u[k] = gl.getUniformLocation(program, k);

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, last = 0, time = opts.phase, visible = true, dead = false, lastDraw = 0;
  const minGap = 1000 / opts.fps;

  function draw() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(opts.budget / Math.max(1, box.width * box.height)));
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.resolution, w, h);
    gl.uniform1f(u.time, time);
    gl.uniform1f(u.scale, opts.scale);
    gl.uniform1f(u.brightness, opts.brightness);
    gl.uniform3fv(u.background, rgb(opts.background));
    gl.uniform3fv(u.midtone, rgb(opts.midtone));
    gl.uniform3fv(u.highlight, rgb(opts.highlight));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function tick(now) {
    frame = 0;
    if (now - lastDraw >= minGap - 2) {
      const delta = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      time += delta * opts.speed;
      last = now;
      lastDraw = now;
      draw();
    }
    schedule();
  }
  function schedule() {
    if (!frame && !dead && visible && !document.hidden && !motion.matches && opts.animate) frame = requestAnimationFrame(tick);
  }
  function refresh() { cancelAnimationFrame(frame); frame = 0; last = 0; draw(); schedule(); }
  const resize = new ResizeObserver(refresh);
  resize.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; refresh(); });
  io.observe(canvas);
  motion.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  refresh();
  return () => {
    dead = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    io.disconnect();
    motion.removeEventListener('change', refresh);
    document.removeEventListener('visibilitychange', refresh);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

export default function PhosphorFlow({
  className = '',
  background = '#05060a',
  midtone = '#22325a',
  highlight = '#c9d9ff',
  speed = 0.35,
  scale = 1.2,
  brightness = 0.9,
  phase = 3,
  steps = 48,
  budget = 160000,
  fps = 30,
  animate = true,
}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return mount(canvas, { background, midtone, highlight, speed, scale, brightness, phase, steps, budget, fps, animate }) ?? undefined;
  }, [background, midtone, highlight, speed, scale, brightness, phase, steps, budget, fps, animate]);
  return <canvas ref={ref} aria-hidden="true" className={className} style={{ display: 'block', width: '100%', height: '100%' }} />;
}
