/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Silver Stream" (React export, shader): ribbons of silver particles with short trails,
// fanning over a dark field. Changes: graphite ground and silver points (monochrome); fills its parent; decorative
// (aria-hidden); no editor API, status overlay or preserveDrawingBuffer; a pixel `budget` caps the drawing size.
// The renderer, its pause offscreen, in hidden tabs and under reduced motion (one still frame), and its cleanup
// are the export's.
import { useLayoutEffect, useRef } from 'react';

const vertexSource = `
precision highp float;
attribute vec3 particle;
attribute vec2 corner;
uniform vec2 resolution;
uniform float time, phase, pointSize, trails, bend, spread, scale, exposure;
varying vec2 local;
varying float light, extent;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float bell(float x) { return exp(-x*x); }
vec2 surface(float u, float v, float layer) {
  vec2 p;
  if (layer < 0.5) {
    float theta = -1.35 + 2.6*u;
    float r = 0.33 + 1.55*v;
    float twist = 0.12*sin(r*3.1)*bend;
    theta += twist + 0.035*sin(u*8.0+r*2.3)*bend;
    p = vec2(0.28 + r*sin(theta)*spread, 0.255 + r*cos(theta)*0.50);
    p.x += 0.13*bell((r-0.47)*3.8);
    p.y += (0.020*sin(u*9.0+r*3.8) - 0.015*cos(u*5.0+r*2.2))*bend;
    p.x += 0.008*sin(u*17.0+r*9.0)*bell((r-0.7)*3.0)*bend;
  } else if (layer < 1.5) {
    float t = v;
    vec2 a = vec2(0.28+u*0.80,-0.16);
    vec2 b = vec2(0.67+u*0.32,0.09);
    vec2 c = vec2(-0.55+u*2.2,0.14-u*0.015+0.24*pow(u,4.0));
    p = (1.0-t)*(1.0-t)*a + 2.0*t*(1.0-t)*b+t*t*c;
    p.x = 0.76+(p.x-0.76)*spread;
    p.x += 0.008*sin(u*54.0+t*11.0)*bend;
    p.y += 0.006*sin(u*42.0+t*15.0)*bend;
  } else if (layer < 2.5) {
    float x = -0.25+v*1.65;
    p = vec2(x, 0.125 + x*0.18 + x*x*0.015 + (u-0.5)*0.045*spread);
    p.y += 0.005*sin(x*5.0+u*2.0)*bend;
    p.x += 0.10*sin(u*3.14159)*sin(v*2.0);
  } else {
    p = vec2(-0.16+u*0.34 + 0.05*sin(v*5.0+u*2.0), -0.1+v*0.25);
  }
  float t = (time+phase)*0.24;
  p += vec2(sin(t+v*5.0+u*3.0)-sin(v*5.0+u*3.0), cos(t*0.7+u*4.0)-cos(u*4.0))*0.012*bend;
  return p;
}
void main() {
  float u = particle.x, v = particle.y, layer = particle.z;
  float seed = hash(vec2(u*83.0+layer*43.0,v*139.0));
  float flow = mod(v + time*0.015,1.0);
  vec2 p = surface(u,flow,layer);
  float lengthFactor;
  if (layer < 0.5) {
    lengthFactor = (smoothstep(0.56,0.74,u)*0.016 + smoothstep(0.56,0.86,p.y)*0.027)*(0.45+seed*0.8);
  } else if (layer < 1.5) {
    lengthFactor = 0.065*(0.08+seed);
  } else if (layer < 2.5) {
    lengthFactor = 0.042*(0.05+seed);
  } else lengthFactor = 0.0001;
  lengthFactor *= seed > 0.16 ? 0.25+0.75*seed : 0.005;
  float dt = max(0.00008,lengthFactor*trails);
  vec2 tail = surface(u,flow-dt,layer);
  float aspect = resolution.x/max(resolution.y,1.0);
  vec2 fit = vec2(max(1.0,0.5/aspect),max(1.0,aspect/0.5));
  vec2 head = (p-0.5)*vec2(2.0,-2.0)*fit*scale;
  vec2 end = (tail-0.5)*vec2(2.0,-2.0)*fit*scale;
  vec2 metric = resolution*0.5;
  vec2 d = (head-end)*metric;
  float len = length(d);
  vec2 tangent = d/max(len,0.0001);
  vec2 normal = vec2(-tangent.y,tangent.x);
  float radius = pointSize*(0.6+seed*0.65)*resolution.y/2048.0;
  radius = max(0.55,radius);
  vec2 midpoint = (head+end)*0.5;
  vec2 offset = (tangent*corner.x*(len*0.5+radius) + normal*corner.y*radius*1.6)/metric;
  gl_Position = vec4(midpoint+offset,0.0,1.0);
  local = vec2(corner.x*(len*0.5+radius)/radius,corner.y*1.6);
  extent = len*0.5/radius;
  light = (0.42+0.58*seed)*exposure;
  float cavity = bell((p.x-0.25)*5.0)*bell((p.y-0.355)*14.0);
  light *= 1.0-0.85*cavity;
  if (layer < 0.5) light *= mix(0.27,1.0,max(smoothstep(0.42,0.65,p.y),smoothstep(0.59,0.78,p.x)));
  if (layer > 0.5 && layer < 1.5) light *= 1.42;
  if (layer > 1.5 && layer < 2.5) light *= 0.74;
  light *= 0.55+0.45*hash(vec2(floor(u*72.0)+layer*18.0,5.0));
  light *= 0.60+0.40*sin(u*24.0+flow*13.0+layer)*sin(u*24.0+flow*13.0+layer);
}
`;
const fragmentSource = `
precision highp float;
uniform vec3 foreground;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.099,311.699)))*43758.54529); }
varying vec2 local;
varying float light, extent;
void main() {
  vec2 q=vec2(max(abs(local.x)-extent,0.0),local.y);
  float shape=1.0-smoothstep(0.55,1.2,length(q));
  float tail= mix(0.14,1.0,clamp((local.x+extent+1.0)/(2.0*extent+2.0),0.0,1.0));
  float core=exp(-local.y*local.y*4.0);
  float head = 1.0-smoothstep(0.35,1.25,length(local-vec2(extent,0.0)));
  float alpha=light*(shape*tail*0.85 + head*0.85)*(0.75+0.25*core);
  alpha *= 0.58+0.42*hash(floor(gl_FragCoord.xy));
  gl_FragColor=vec4(foreground,alpha);
}
`;

const rgb = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);
const KEYS = ['phase', 'pointSize', 'trails', 'bend', 'spread', 'scale', 'exposure'];

function mount(canvas, s) {
  let gl, program, buffer, shaders = [], uniforms = {}, count = 0;
  let frame = 0, last = null, time = 0, visible = true, destroyed = false;
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
  const particle = gl.getAttribLocation(program, 'particle');
  gl.enableVertexAttribArray(particle); gl.vertexAttribPointer(particle, 3, gl.FLOAT, false, 20, 0);
  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner); gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 20, 12);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const k of ['resolution', 'time', 'foreground', ...KEYS]) uniforms[k] = gl.getUniformLocation(program, k);

  // the particle grid (built once: density does not change while mounted)
  const values = [];
  const corners = [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]];
  const density = Math.round(s.density);
  for (let layer = 0; layer < 4; layer++) {
    const cols = layer === 2 ? Math.round(density * 0.35) : layer === 3 ? Math.round(density * 0.25) : layer === 1 ? Math.round(density * 1.3) : density;
    const rows = layer === 0 ? Math.round(density * 1.2) : Math.round(density * 0.45);
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const jx = Math.sin(col * 123.7 + row * 327.1 + layer * 8.1) * 0.18;
      const jy = Math.sin(col * 73.1 + row * 171.3 + layer * 42.0) * 0.18;
      for (const [x, y] of corners) values.push((col + 0.5 + jx) / cols, (row + 0.5 + jy) / rows, layer, x, y);
    }
  }
  count = values.length / 5;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
  const bg = rgb(s.background), fg = rgb(s.foreground);

  function draw() {
    if (destroyed) return;
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(s.budget / Math.max(1, box.width * box.height)));
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.resolution, w, h);
    gl.uniform1f(uniforms.time, time);
    gl.uniform3fv(uniforms.foreground, fg);
    for (const k of KEYS) gl.uniform1f(uniforms[k], s[k]);
    gl.drawArrays(gl.TRIANGLES, 0, count);
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

export default function SilverStream({
  speed = 0.3, density = 102, pointSize = 2.4, trails = 1, bend = 1, spread = 1, exposure = 0.85, scale = 1, phase = 3,
  background = '#0b0c0f', foreground = '#c9ced6', budget = 1_400_000,
}) {
  const ref = useRef(null);
  useLayoutEffect(() => mount(ref.current, { speed, density, pointSize, trails, bend, spread, exposure, scale, phase, background, foreground, budget }),
    [speed, density, pointSize, trails, bend, spread, exposure, scale, phase, background, foreground, budget]);
  return <canvas ref={ref} aria-hidden style={{ display: 'block', width: '100%', height: '100%' }} />;
}
