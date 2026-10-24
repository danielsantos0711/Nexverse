/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Topographic Flow" (React export, shader): winding contour lines over a slowly moving
// terrain, monochrome. Changes: graphite and silver colours; fills its parent; decorative (aria-hidden); the
// renderer, its pause offscreen, in hidden tabs and under reduced motion, and its cleanup are the export's.
import { useLayoutEffect, useRef } from 'react';

const vertexSource = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.00001); }
`;
const fragmentSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 u_colors[2];
uniform vec4 u_scene;
uniform vec4 u_shape;
uniform vec4 u_lens;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
}
float terrain(vec2 p, float t) {
  vec2 warp = vec2(noise(p * 0.65 + vec2(t, 4.3)), noise(p * 0.65 + vec2(7.1, -t * 0.7)));
  p += (warp - 0.5) * 1.8 * u_lens.z;
  float h = 0.0, amplitude = 0.56;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 3; i++) { h += amplitude * noise(p); p = turn * p * 2.03 + vec2(5.2, 9.7); amplitude *= 0.43; }
  return h;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_scene.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_scene.xy) / min(u_scene.x, u_scene.y);
  p *= 3.5 * u_scene.w;
  p.y *= 1.35;
  float t = u_scene.z * 0.055;
  p += vec2(t * 0.18, -t * 0.12) + vec2(2.15, 0.4);
  float base = terrain(p, t);
  p.y += (base - 0.4) * u_shape.z * 1.4;
  float h = terrain(p, t);
  float epsilon = 0.006;
  vec2 slope = vec2(terrain(p + vec2(epsilon, 0.0), t) - h, terrain(p + vec2(0.0, epsilon), t) - h) / epsilon;
  float gradient = max(length(slope), 0.018);
  float distanceToLine = abs(fract(h * u_shape.x + 0.5) - 0.5) / (u_shape.x * gradient);
  float pixel = 3.5 * u_scene.w / min(u_scene.x, u_scene.y);
  float sharpWidth = pixel * u_shape.y * 0.72;
  float defocus = pow(abs(uv.y - u_lens.x), 1.6) * u_lens.y * 0.22;
  float width = sqrt(sharpWidth * sharpWidth + defocus * defocus + pixel * pixel * 0.25);
  float line = exp(-0.5 * pow(distanceToLine / width, 2.0)) * sharpWidth / width;
  vec3 normal = normalize(vec3(-slope.x * u_shape.z, -slope.y * u_shape.z, 1.0));
  float light = max(dot(normal, normalize(vec3(-0.3, 0.7, 0.6))), 0.0);
  float rim = pow(max(0.0, -normal.y), 2.0);
  float focusLight = 0.55 + 0.45 * exp(-pow((uv.y - u_lens.x) * 4.0, 2.0));
  vec3 color = u_colors[0] * (0.65 + 1.1 * light);
  color += u_colors[1] * (0.035 * light * light + 0.08 * rim) * u_shape.z;
  color += u_colors[1] * line * focusLight * (0.6 + 0.4 * light);
  float vignette = 1.0 - 0.28 * smoothstep(0.25, 0.75, length(uv - 0.5));
  vec3 lit = max(clamp(color * vignette * u_shape.w, 0.0, 1.0) - u_colors[0], 0.0);
  gl_FragColor = vec4(lit, max(lit.r, max(lit.g, lit.b)));
}
`;

const rgb = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);

function mount(canvas, s) {
  let gl, program, buffer, shaders = [], uniforms = {};
  let frame = 0, last = null, time = 0, visible = true, destroyed = false;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
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
  const pos = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  for (const k of ['u_colors[0]', 'u_scene', 'u_shape', 'u_lens']) uniforms[k] = gl.getUniformLocation(program, k);
  const colors = new Float32Array([...rgb(s.background), ...rgb(s.foreground)]);
  function draw() {
    if (destroyed) return;
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rw = Math.max(1, Math.round(box.width * dpr)), rh = Math.max(1, Math.round(box.height * dpr));
    const k = Math.min(1, Math.sqrt(s.budget / (rw * rh)));
    const w = Math.max(1, Math.round(rw * k)), h = Math.max(1, Math.round(rh * k));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform3fv(uniforms['u_colors[0]'], colors);
    gl.uniform4f(uniforms.u_scene, w, h, time, s.scale);
    gl.uniform4f(uniforms.u_shape, s.density, s.thickness, s.relief, s.exposure);
    gl.uniform4f(uniforms.u_lens, s.focus, s.depthOfField, s.distortion, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function tick(now) {
    frame = 0;
    if (last !== null) time += Math.min((now - last) / 1000, 0.1) * s.speed;
    last = now; draw(); schedule();
  }
  function schedule() {
    if (!frame && !destroyed && visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
  }
  function refresh() { cancelAnimationFrame(frame); frame = 0; last = null; draw(); schedule(); }
  const ro = new ResizeObserver(refresh); ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; refresh(); }); io.observe(canvas);
  document.addEventListener('visibilitychange', refresh);
  refresh();
  return () => {
    destroyed = true; cancelAnimationFrame(frame); ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', refresh);
    shaders.forEach((sh) => gl.deleteShader(sh)); gl.deleteBuffer(buffer); gl.deleteProgram(program);
  };
}

export default function TopographicFlow({
  speed = 0.25, scale = 1, density = 24, thickness = 0.85, relief = 1, distortion = 1, focus = 0.54,
  depthOfField = 1.3, exposure = 0.8, background = '#0b0c0f', foreground = '#b9bec8', budget = 600_000,
}) {
  const ref = useRef(null);
  useLayoutEffect(() => mount(ref.current, { speed, scale, density, thickness, relief, distortion, focus, depthOfField, exposure, background, foreground, budget }),
    [speed, scale, density, thickness, relief, distortion, focus, depthOfField, exposure, background, foreground, budget]);
  return <canvas ref={ref} aria-hidden style={{ display: 'block', width: '100%', height: '100%' }} />;
}
