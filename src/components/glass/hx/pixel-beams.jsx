/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Pixel Beams" (React export, shader): an ordered-dither field of square pixels forming
// slow plasma waves. Changes: graphite ground and dim silver pixels (monochrome); fills its parent; decorative
// (aria-hidden); no editor API or status overlay; a pixel `budget` caps the drawing size. The renderer, its pause
// offscreen, in hidden tabs and under reduced motion (one still frame), and its cleanup are the export's.
import { useLayoutEffect, useRef } from 'react';

const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;
const fragmentSource = `
precision highp float;
uniform vec2 resolution, viewSize;
uniform float time, pixelSize, threshold, density, contrast;
uniform float waveFrequency, waveStrength, waveAngle;
uniform vec3 background, foreground;
float bayer2(vec2 p) { p = mod(p, 2.0); return mod(2.0 * p.x + 3.0 * p.y, 4.0); }
float bayer8(vec2 p) { return (16.0 * bayer2(p) + 4.0 * bayer2(floor(p / 2.0)) + bayer2(floor(p / 4.0)) + 0.5) / 64.0; }
void main() {
  vec2 css = gl_FragCoord.xy / resolution * viewSize;
  vec2 cell = floor(css / pixelSize);
  vec2 p = ((cell + 0.5) * pixelSize - viewSize * 0.5) / max(viewSize.y, 1.0);
  float angle = radians(waveAngle);
  vec2 along = vec2(cos(angle), sin(angle));
  vec2 across = vec2(-along.y, along.x);
  float u = dot(p, along), v = dot(p, across);
  float t = time * 0.32;
  float bend = sin(v * waveFrequency * 6.2831853 + t) * waveStrength * 0.18;
  float plasma = sin((u + bend) * 12.0 - t) + sin(v * 8.0 + u * 3.0 + t * 0.73) + sin((u - v) * 5.0 - t * 0.57);
  float field = 0.5 + plasma / 6.0;
  float coverage = clamp((field - threshold) * contrast * density * 1.25, 0.0, 0.5);
  float rank = bayer8(cell);
  float ink = smoothstep(rank - 0.004, rank + 0.004, coverage);
  gl_FragColor = vec4(mix(background, foreground, ink), 1.0);
}
`;

const rgb = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);
const KEYS = ['pixelSize', 'threshold', 'density', 'contrast', 'waveFrequency', 'waveStrength', 'waveAngle'];

function mount(canvas, s) {
  let gl, program, buffer, shaders = [], uniforms = {};
  let frame = 0, last = null, time = s.phase, visible = true, destroyed = false;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
  if (!gl) return () => {};
  const compile = (type, src) => { const sh = gl.createShader(type); shaders.push(sh); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return () => {};
  gl.useProgram(program);
  buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  for (const k of ['resolution', 'viewSize', 'time', 'background', 'foreground', ...KEYS]) uniforms[k] = gl.getUniformLocation(program, k);
  const bg = rgb(s.background), fg = rgb(s.foreground);
  function draw() {
    if (destroyed) return;
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(s.budget / Math.max(1, box.width * box.height)));
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uniforms.resolution, w, h);
    gl.uniform2f(uniforms.viewSize, box.width, box.height);
    gl.uniform1f(uniforms.time, time);
    gl.uniform3fv(uniforms.background, bg);
    gl.uniform3fv(uniforms.foreground, fg);
    for (const k of KEYS) gl.uniform1f(uniforms[k], s[k]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function tick(now) {
    frame = 0;
    if (last !== null) time += Math.min((now - last) / 1000, 0.05) * s.speed;
    last = now; draw(); schedule();
  }
  function schedule() {
    if (!frame && !destroyed && visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
  }
  function refresh() { cancelAnimationFrame(frame); frame = 0; last = null; draw(); schedule(); }
  const ro = new ResizeObserver(refresh); ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; refresh(); }); io.observe(canvas);
  document.addEventListener('visibilitychange', refresh);
  motion.addEventListener('change', refresh);
  refresh();
  return () => {
    destroyed = true; cancelAnimationFrame(frame); ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', refresh);
    motion.removeEventListener('change', refresh);
    shaders.forEach((sh) => gl.deleteShader(sh)); gl.deleteBuffer(buffer); gl.deleteProgram(program);
  };
}

export default function PixelBeams({
  speed = 0.8, pixelSize = 6, threshold = 0.41, density = 0.3, contrast = 0.9, waveFrequency = 1.8, waveStrength = 1,
  waveAngle = 256, phase = 4, background = '#0b0c0f', foreground = '#4d5159', budget = 900_000,
}) {
  const ref = useRef(null);
  useLayoutEffect(() => mount(ref.current, { speed, pixelSize, threshold, density, contrast, waveFrequency, waveStrength, waveAngle, phase, background, foreground, budget }),
    [speed, pixelSize, threshold, density, contrast, waveFrequency, waveStrength, waveAngle, phase, background, foreground, budget]);
  return <canvas ref={ref} aria-hidden style={{ display: 'block', width: '100%', height: '100%' }} />;
}
