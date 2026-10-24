/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Nexverse's own page shaders (launch pass 2). One small WebGL runner for a full-frame fragment shader; each page
// passes the GLSL that suits it (src/components/glass/fields.js). A field returns a light value per pixel and the
// runner draws it in silver on a TRANSPARENT canvas (premultiplied alpha), so the page's own ground and stars show
// through and no edge of the canvas is ever visible. Like the vendored HorizonX files: capped pixel budget and
// frame rate, paused offscreen and in hidden tabs, one still frame under reduced motion, full cleanup.
import { useLayoutEffect, useRef } from 'react';

const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;
const header = `
precision highp float;
uniform vec2 u_res;
uniform float u_time, u_aspect, u_px;
uniform vec3 u_fg;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float glow(float d, float w) { return exp(-d * d / (w * w)); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;
const footer = `
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float light = clamp(field(uv, p, u_time), 0.0, 1.0);
  gl_FragColor = vec4(u_fg * light, light);
}
`;

const rgb = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);

function mount(canvas, s) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return () => {};
  const shaders = [];
  const compile = (type, src) => { const sh = gl.createShader(type); shaders.push(sh); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, header + s.source + footer));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (process.env.NODE_ENV !== 'production') console.warn('field shader:', gl.getShaderInfoLog(shaders[1]));
    return () => { shaders.forEach((sh) => gl.deleteShader(sh)); gl.deleteProgram(program); };
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const k of ['u_res', 'u_time', 'u_aspect', 'u_px', 'u_fg']) u[k] = gl.getUniformLocation(program, k);
  const fg = rgb(s.color);

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, last = 0, lastDraw = 0, time = s.phase, visible = true, dead = false;
  const minGap = 1000 / s.fps;

  function draw() {
    if (dead) return;
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(s.budget / Math.max(1, box.width * box.height)));
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.u_res, w, h);
    gl.uniform1f(u.u_time, time);
    gl.uniform1f(u.u_aspect, w / h);
    gl.uniform1f(u.u_px, 1 / h);
    gl.uniform3fv(u.u_fg, fg);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function tick(now) {
    frame = 0;
    if (now - lastDraw >= minGap - 2) {
      time += (last ? Math.min((now - last) / 1000, 0.1) : 1 / 60) * s.speed;
      last = now;
      lastDraw = now;
      draw();
    }
    schedule();
  }
  function schedule() {
    if (!frame && !dead && visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
  }
  function refresh() { cancelAnimationFrame(frame); frame = 0; last = 0; draw(); schedule(); }
  const ro = new ResizeObserver(refresh);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; refresh(); });
  io.observe(canvas);
  motion.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  refresh();
  return () => {
    dead = true;
    cancelAnimationFrame(frame);
    ro.disconnect();
    io.disconnect();
    motion.removeEventListener('change', refresh);
    document.removeEventListener('visibilitychange', refresh);
    shaders.forEach((sh) => gl.deleteShader(sh));
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

export default function Field({ source, speed = 1, phase = 7, color = '#c9ced6', budget = 500_000, fps = 40 }) {
  const ref = useRef(null);
  useLayoutEffect(() => mount(ref.current, { source, speed, phase, color, budget, fps }), [source, speed, phase, color, budget, fps]);
  return <canvas ref={ref} aria-hidden style={{ display: 'block', width: '100%', height: '100%' }} />;
}
