/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Phosphor Flow" (React export), recoloured as a deep-blue nebula. Changes: decorative
// (aria-hidden), fills its parent, renders at a low pixel budget and about 30 fps because it sits behind the star
// map and is soft anyway, pauses offscreen, when the tab is hidden or when `paused` is set, and cleans up on unmount.
import { useLayoutEffect, useRef } from 'react';

const CSS = `
.cosmos-nebula{position:absolute;inset:0;overflow:hidden}
.cosmos-nebula canvas{display:block;width:100%;height:100%}
`;

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
  for (int i = 0; i < 80; i++) {
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
  vec3 e = exp(-2.0 * energy * brightness / 5000.0);
  vec3 mapped = (1.0 - e) / (1.0 + e);
  float light = dot(mapped, vec3(0.212606, 0.7152, 0.0722));
  vec3 colour = mix(background, midtone, smoothstep(0.0, 0.55, light));
  colour = mix(colour, highlight, smoothstep(0.350003, 1.0, light));
  gl_FragColor = vec4(colour, 1.0);
}
`;

const SETTINGS = { background: '#05060a', midtone: '#1c2a58', highlight: '#7590d8', speed: 0.12, scale: 2, brightness: 0.55, phase: 6 };
/** Pixels drawn per frame. The canvas is stretched to fill, which only softens an already soft field. */
const PIXEL_BUDGET = 300000;
const FRAME_MS = 1000 / 30;

const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);

function mountNebula(canvas, isPaused) {
  let gl, program, buffer, shaders = [], uniforms = {};
  let frame = 0, last = 0, lastDraw = 0, time = 0, visible = true, destroyed = false, lost = false;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function release() {
    if (gl) {
      shaders.forEach((shader) => gl.deleteShader(shader));
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
    shaders = []; program = null; buffer = null;
  }
  function initialize() {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!gl) return;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader');
      return shader;
    };
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(program);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const key of ['resolution', 'time', 'scale', 'brightness', 'background', 'midtone', 'highlight']) {
      uniforms[key] = gl.getUniformLocation(program, key);
    }
  }
  function draw() {
    if (destroyed || lost || !program) return;
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(PIXEL_BUDGET / Math.max(1, box.width * box.height)));
    const width = Math.max(1, Math.round(box.width * dpr));
    const height = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, width, height);
    gl.uniform1f(uniforms.time, time + SETTINGS.phase);
    gl.uniform1f(uniforms.scale, SETTINGS.scale);
    gl.uniform1f(uniforms.brightness, SETTINGS.brightness);
    for (const key of ['background', 'midtone', 'highlight']) gl.uniform3fv(uniforms[key], rgb(SETTINGS[key]));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function tick(now) {
    frame = 0;
    const delta = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
    time += delta * SETTINGS.speed;
    last = now;
    if (now - lastDraw >= FRAME_MS) { lastDraw = now; draw(); }
    schedule();
  }
  function schedule() {
    if (!frame && !destroyed && !lost && program && visible && !document.hidden && !isPaused() && !motion.matches) {
      frame = requestAnimationFrame(tick);
    }
  }
  function refresh() {
    cancelAnimationFrame(frame); frame = 0; last = 0; draw(); schedule();
  }
  function contextLost(event) {
    event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0;
  }
  function contextRestored() {
    lost = false; shaders = []; program = null; buffer = null;
    try { initialize(); refresh(); } catch { release(); }
  }
  try { initialize(); } catch { release(); }
  const resize = new ResizeObserver(refresh); resize.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); });
  intersection.observe(canvas);
  motion.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  refresh();
  return {
    refresh,
    destroy() {
      destroyed = true; cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect();
      motion.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', refresh);
      canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      release();
    }
  };
}

export default function Nebula({ paused = false, className = '' }) {
  const root = useRef(null);
  const pausedRef = useRef(paused);
  const scene = useRef(null);

  useLayoutEffect(() => {
    if (!document.querySelector('style[data-cosmos-nebula]')) {
      const tag = document.createElement('style');
      tag.setAttribute('data-cosmos-nebula', '');
      tag.textContent = CSS;
      document.head.append(tag);
    }
    scene.current = mountNebula(root.current.querySelector('canvas'), () => pausedRef.current);
    return () => { scene.current?.destroy(); scene.current = null; };
  }, []);

  useLayoutEffect(() => {
    pausedRef.current = paused;
    scene.current?.refresh();
  }, [paused]);

  return (
    <div ref={root} className={`cosmos-nebula ${className}`} aria-hidden="true">
      <canvas />
    </div>
  );
}
