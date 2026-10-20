/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Particle Veil" (React export, ion-blue palette, slow flow). Changes: fills its
// parent, decorative (aria-hidden, no error box: without WebGL it simply shows nothing), no pointer
// interaction, devicePixelRatio capped at 1.5, one still frame under reduced motion, paused offscreen and in
// hidden tabs, cleans up on unmount.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { frameInterval, pixelRatio, useFx } from '@/lib/perf';

const STATE = {
  foreground: '#c9d6ff', accent: '#8fb4ff',
  speed: 0.25, density: 110, twist: 0.9, flow: 0.6, pointSize: 1.2,
  filaments: 0.45, frame: 0.25, scale: 1.1, animate: true,
};

export default function ParticleVeil({ className = '' }) {
  const root = useRef(null);
  const api = useRef(null);
  // perf (src/lib/perf.ts): pixel ratio and frame rate follow the quality tier; "off" or another heavy
  // effect's turn on screen holds one still frame
  const { quality, run } = useFx(root, { minimum: 'medium' });
  const live = run;
  useEffect(() => {
    api.current?.set(quality, live);
  }, [quality, live]);

  useLayoutEffect(() => {
    const canvas = root.current.querySelector('canvas');
    const state = STATE;
    const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const vertexSource = `
    precision highp float;
    attribute vec3 position;
    uniform vec2 resolution;
    uniform float time, twist, flow, scale, pointSize, pixelRatio, mode;
    varying float light, tint;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      float u = position.x, v = position.y;
      float seed = hash(position.xy);
      vec3 p;
      if (position.z > 1.5) {
        p = vec3(u, v, 0.0);
        light = 1.0;
        tint = 0.0;
      } else {
        float t = time * 0.34;
        float waist = 0.20 + 0.80 * pow(abs(v), 0.8);
        float angle = twist * (v * 1.9 - 1.2 + sin(v * 3.1 + t) * 0.38);
        float sheet = u * 0.98 * waist;
        float ripple = sin(u * 4.6 + v * 4.2 - t) * flow;
        p.x = sheet * cos(angle) + sin(v * 3.0 + t * 0.6) * 0.18;
        p.y = v * 1.38 + ripple * (0.08 + 0.14 * (1.0 - abs(v)));
        p.z = sheet * sin(angle) + ripple * 0.14;
        float fold = exp(-pow((v + 0.23) * 5.5, 2.0));
        p.x += u * fold * 0.85;
        p.y += fold * sin(u * 3.8 + t) * 0.22 * flow;
        p.z += fold * cos(u * 3.0 - t) * 0.35;
        if (position.z > 0.5) {
          float scatter = 0.015 + 0.12 * (1.0 - v) + fold * 0.12 + 0.25 * (1.0 - smoothstep(-0.8, -0.25, v));
          p += vec3(seed - 0.5, hash(position.yx + 4.2) - 0.5,
            hash(position.xy + 8.7) - 0.5) * scatter * 2.0;
        }
        p.z *= 0.35 + 0.65 * (1.0 - abs(v));
        p.x += p.z * 0.36;
        p.y += p.z * 0.17;
        p.xy *= 3.6 / (3.6 - p.z);
        light = (0.48 + 0.52 * seed) * (0.8 + 0.2 * cos(angle));
        light *= 0.18 + 0.82 * smoothstep(-1.0, -0.30, v);
        if (position.z > 0.5) light *= 0.72;
        else light *= smoothstep(-0.95, -0.35, v);
        tint = clamp((-v - 0.08) * 0.65 + p.z * 0.3, 0.0, 0.6);
      }
      float aspect = resolution.x / max(resolution.y, 1.0);
      vec2 fit = vec2(1.0 / max(aspect, 0.72), min(1.0, aspect / 0.72));
      vec2 projected = p.xy * fit * 0.54 * scale;
      gl_Position = vec4(projected, 0.0, 1.0);
      gl_PointSize = max(1.0, pointSize * pixelRatio * (0.65 + light * 0.75));
    }
    `;
    const fragmentSource = `
    precision mediump float;
    uniform vec3 foreground, accent;
    uniform float mode, opacity;
    varying float light, tint;
    void main() {
      float alpha = light * opacity;
      if (mode < 0.5) {
        float radius = length(gl_PointCoord - 0.5);
        alpha *= 1.0 - smoothstep(0.20, 0.5, radius);
      }
      gl_FragColor = vec4(mix(foreground, accent, tint), alpha);
    }
    `;

    let gl, program, buffer, shaders = [], uniforms = {};
    let quality = 'high', live = false, drawnAt = 0;
    let frame = 0, last = 0, time = 4, visible = false, destroyed = false, lost = false;
    let pointCount = 0, lineCount = 0, frameCount = 0;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function release() {
      if (gl) {
        shaders.forEach((shader) => gl.deleteShader(shader));
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
      shaders = []; program = null; buffer = null;
    }
    function geometry() {
      const n = Math.round(state.density), rows = Math.round(n * 1.25);
      const vertices = [];
      for (let y = 0; y <= rows; y++) {
        for (let x = 0; x <= n; x++) {
          vertices.push(x / n * 2 - 1, y / rows * 2 - 1, 0);
          vertices.push(x / n * 2 - 0.997, y / rows * 2 - 0.997, 1);
        }
      }
      pointCount = vertices.length / 3;
      for (let y = 0; y <= 85; y++) {
        for (let x = 0; x < 90; x++) {
          vertices.push(x / 90 * 2 - 1, y / 85 * 1.45 - 0.45, 0, (x + 1) / 90 * 2 - 1, y / 85 * 1.45 - 0.45, 0);
        }
      }
      lineCount = vertices.length / 3 - pointCount;
      for (let i = 0; i < 7; i++) {
        const offset = i * 0.024, left = -0.75 + offset, right = 0.75 - offset;
        const bottom = -1.7 + offset, top = 1.7 - offset;
        vertices.push(left, bottom, 2, left, top, 2, left, top, 2, right, top, 2,
          right, top, 2, right, bottom, 2, right, bottom, 2, left, bottom, 2);
      }
      for (const x of [-1, 1]) {
        for (const y of [-1, 1]) vertices.push(x * 0.75, y * 1.7, 2, x * 0.606, y * 1.556, 2);
      }
      frameCount = vertices.length / 3 - pointCount - lineCount;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    }
    function initialize() {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, powerPreference: 'low-power' });
      if (!gl) throw new Error('no webgl');
      const compile = (type, source) => {
        const shader = gl.createShader(type); shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('compile');
        return shader;
      };
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
      for (const key of ['resolution', 'time', 'twist', 'flow', 'scale', 'pointSize', 'pixelRatio', 'mode', 'opacity', 'foreground', 'accent']) {
        uniforms[key] = gl.getUniformLocation(program, key);
      }
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      geometry();
    }
    function draw() {
      if (destroyed || lost || !program) return;
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(pixelRatio(quality), Math.sqrt(1500000 / Math.max(1, box.width * box.height)));
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height); gl.useProgram(program);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.time, time); gl.uniform1f(uniforms.pixelRatio, dpr);
      for (const key of ['twist', 'flow', 'scale', 'pointSize']) gl.uniform1f(uniforms[key], state[key]);
      for (const key of ['foreground', 'accent']) gl.uniform3fv(uniforms[key], rgb(state[key]));
      gl.uniform1f(uniforms.mode, 1); gl.uniform1f(uniforms.opacity, state.frame * 0.4);
      gl.drawArrays(gl.LINES, pointCount + lineCount, frameCount);
      gl.uniform1f(uniforms.opacity, state.filaments * 0.38);
      gl.drawArrays(gl.LINES, pointCount, lineCount);
      gl.uniform1f(uniforms.mode, 0); gl.uniform1f(uniforms.opacity, 0.85);
      gl.drawArrays(gl.POINTS, 0, pointCount);
    }
    function tick(now) {
      frame = 0;
      if (now - drawnAt < frameInterval(quality)) { schedule(); return; }
      drawnAt = now;
      const delta = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      time += delta * state.speed;
      last = now; draw(); schedule();
    }
    function schedule() {
      if (!frame && !destroyed && !lost && program && live && visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
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
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); }, { rootMargin: '80px' });
    intersection.observe(canvas);
    motion.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
    refresh();
    api.current = { set(q, l) { quality = q; live = l; refresh(); } };
    return () => {
      api.current = null;
      destroyed = true; cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect();
      motion.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', refresh);
      canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      release();
    };
  }, []);

  return (
    <div ref={root} aria-hidden="true" className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      <canvas style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
