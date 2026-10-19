/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Comet Streaks" (React export, ion-blue palette). Changes: fills its parent,
// decorative (aria-hidden, no error box: without WebGL it simply shows nothing), transparent ground so the
// section's own colour shows through, devicePixelRatio capped at 1.5, one still frame under reduced motion,
// paused offscreen and in hidden tabs, cleans up on unmount.
import { useLayoutEffect, useRef } from 'react';

const SETTINGS = {
  head: '#ffffff', body: '#bcd0ff', tail: '#1a2238', background: '#05060a',
  speed: 0.35, density: 40, streakWidth: 0.8, streakLength: 1.4, angle: 24, coverage: 0.32,
  fade: 0.8, glow: 0.8, depth: 0.7, blur: 1, focus: 0.4, tiltAngle: 24, grain: 0.15,
  backgroundOpacity: 0, seed: 18, phase: 6, animate: true,
};

export default function CometStreaks({ className = '', settings = {} }) {
  const __root = useRef(null);

  useLayoutEffect(() => {
    const canvas = __root.current.querySelector('canvas');
    const state = { ...SETTINGS, ...settings };
    const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const numericUniforms = ['density', 'streakWidth', 'streakLength', 'angle', 'coverage', 'fade', 'glow', 'depth', 'blur', 'focus', 'tiltAngle', 'grain', 'backgroundOpacity', 'seed'];
    const colourUniforms = ['head', 'body', 'tail', 'background'];
    const vertexSource = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.00001); }
    `;
    // Comets fall diagonally through parallel lanes. Each streak runs from a rounded white head through
    // silver into a tail that fades out behind it; farther lanes are thinner, dimmer and slower, and a
    // tilt-shift band keeps one diagonal sharp. Output is premultiplied (background opacity 0 = transparent).
    const fragmentSource = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time, density, streakWidth, streakLength, angle, coverage, fade, glow, depth, blur, focus, tiltAngle, grain, backgroundOpacity, seed;
    uniform vec3 head, body, tail, background;

    float hash(vec2 p) {
      p = fract(p * vec2(0.1031, 0.1030) + seed * 0.0137);
      p += dot(p, p.yx + 33.33);
      return fract((p.x + p.y) * p.x);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
    vec3 toSrgb(vec3 c) {
      c = max(c, 0.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    vec3 toOklab(vec3 c) {
      vec3 lms = vec3(
        0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b,
        0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b,
        0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
      lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
      return vec3(
        0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
        1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
        0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
    }
    vec3 fromOklab(vec3 c) {
      vec3 lms = vec3(
        c.x + 0.3963377774 * c.y + 0.2158037573 * c.z,
        c.x - 0.1055613458 * c.y - 0.0638541728 * c.z,
        c.x - 0.0894841775 * c.y - 1.2914855480 * c.z);
      lms = lms * lms * lms;
      return vec3(
        4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
       -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
       -0.0041960863 * lms.x - 0.7034186168 * lms.y + 1.7076127700 * lms.z);
    }
    vec3 gradient(vec3 a, vec3 b, float t) { return toSrgb(fromOklab(mix(a, b, t))); }

    void main() {
      vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
      p.y = -p.y;
      float a = radians(angle);
      vec2 dir = vec2(cos(a), sin(a));
      vec2 nrm = vec2(-dir.y, dir.x);
      float along = dot(p, dir), across = dot(p, nrm);

      float t = radians(tiltAngle);
      float off = abs(dot(p, vec2(-sin(t), cos(t))));
      float soft = blur * 0.009 * smoothstep(focus * 0.5, focus * 0.5 + 0.35, off);
      float aa = 1.0 / resolution.y;
      float sw = aa + soft;

      float pitch = 1.0 / density;
      float lane0 = floor(across / pitch);
      float cell = 0.62 * streakLength;
      vec3 labHead = toOklab(toLinear(head)), labBody = toOklab(toLinear(body)), labTail = toOklab(toLinear(tail));
      vec3 colour = vec3(0.0);
      float alpha = 0.0;
      float halo = 0.0;

      for (int li = -2; li <= 2; li++) {
        float lane = lane0 + float(li);
        float centre = (lane + 0.5) * pitch;
        float dAcross = abs(across - centre);
        float z = mix(1.0, noise(vec2(lane * 0.23, 21.0)) * 0.85 + hash(vec2(lane, 21.0)) * 0.15, depth);
        float radius = 0.0068 * streakWidth * mix(0.45, 1.0, z);
        float reach = max(radius + 2.0 * sw, radius * 9.0 * glow);
        if (dAcross > reach) continue;
        float laneSpeed = 0.2 * (0.92 + 0.16 * noise(vec2(lane * 0.15, 5.0))) * mix(0.72, 1.0, z);
        float pos = along - time * laneSpeed - hash(vec2(lane, 3.0)) * 0.3 * cell;
        float k0 = floor(pos / cell);
        for (int ki = -1; ki <= 1; ki++) {
          float k = k0 + float(ki);
          float cluster = noise(vec2(lane * 0.4, k * 0.95 + 11.0));
          if (cluster * 0.78 + hash(vec2(lane, k)) * 0.22 < 1.0 - coverage) continue;
          float len = cell * (0.42 + 0.33 * hash(vec2(k, lane + 0.5)));
          float start = k * cell + hash(vec2(k + 0.7, lane)) * (cell - len);
          float tip = start + len;
          float strength = (0.8 + 0.2 * hash(vec2(lane + 0.3, k + 0.3))) * mix(0.35, 1.0, z);
          vec2 toHead = vec2(pos - tip + radius, dAcross);
          halo += glow * strength * z * 0.22 * exp(-dot(toHead, toHead) / (radius * radius * 14.0));
          float s = clamp(pos, start, tip);
          float d = length(vec2(pos - s, dAcross)) - radius;
          float cover = 1.0 - smoothstep(-sw, sw, d);
          cover *= radius / (radius + 0.35 * soft);
          if (cover <= 0.0) continue;
          float u = clamp((pos - start) / len, 0.0, 1.0);
          float trail = mix(1.0, smoothstep(-0.05, 0.85, u), fade);
          vec3 c = u < 0.55 ? gradient(labTail, labBody, smoothstep(0.0, 0.55, u))
                            : gradient(labBody, labHead, smoothstep(0.55, 0.97, u));
          float sa = cover * trail * strength;
          colour = c * sa + colour * (1.0 - sa);
          alpha = sa + alpha * (1.0 - sa);
        }
      }
      halo = min(halo, 1.0);
      colour += head * halo * (1.0 - alpha);
      alpha += halo * (1.0 - alpha);
      float bgA = backgroundOpacity;
      vec3 premul = colour + background * bgA * (1.0 - alpha);
      float outA = alpha + bgA * (1.0 - alpha);
      float n = hash(gl_FragCoord.xy + floor(time * 24.0) * 17.0) - 0.5;
      premul = clamp(premul + n * grain * 0.07 * outA, 0.0, outA);
      gl_FragColor = vec4(premul, outA);
    }
    `;

    let gl, program, buffer, shaders = [], uniforms = {};
    let frame = 0, last = 0, time = 0, visible = false, destroyed = false, lost = false;
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
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
      if (!gl) throw new Error('no webgl');
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        shaders.push(shader);
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
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const key of ['resolution', 'time', ...numericUniforms, ...colourUniforms]) uniforms[key] = gl.getUniformLocation(program, key);
    }
    function draw() {
      if (destroyed || lost || !program) return;
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1600000 / Math.max(1, box.width * box.height)));
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height); gl.useProgram(program);
      gl.disable(gl.BLEND);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.time, time + state.phase);
      for (const key of numericUniforms) gl.uniform1f(uniforms[key], state[key]);
      for (const key of colourUniforms) gl.uniform3fv(uniforms[key], rgb(state[key]));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    function tick(now) {
      frame = 0;
      const delta = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      time += delta * state.speed;
      last = now; draw(); schedule();
    }
    function schedule() {
      if (!frame && !destroyed && !lost && program && visible && !document.hidden && state.animate && state.speed > 0 && !motion.matches) {
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
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); }, { rootMargin: '120px' });
    intersection.observe(canvas);
    motion.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
    refresh();
    return () => {
      destroyed = true; cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect();
      motion.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', refresh);
      canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      release();
    };
    // settings are read once at mount, like the original export
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={__root} aria-hidden="true" className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      <canvas style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
