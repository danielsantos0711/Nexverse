/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Dust Vortex" (React export, site palette: silver dust, ion-blue shade). Changes: fills
// its parent, decorative (aria-hidden, no error box: without WebGL it simply shows nothing), transparent ground,
// no film grain, devicePixelRatio capped at 1.5 (and at ~1.2 MP), one still frame under reduced motion or
// `still`, paused offscreen and in hidden tabs, settings as a prop, cleans up on unmount.
import { useLayoutEffect, useRef } from 'react';

const SETTINGS = {
  dust: '#e9ebf1', shade: '#8fb4ff', background: '#05060a',
  speed: 0.5, density: 300, twist: -40, curl: 0.8, inflow: 1, spin: 0.4, hole: 0.3, dotSize: 1,
  lip: 1.2, lightAngle: 226, shadow: 0.92, perspective: 0.4, centerX: 0, centerY: 0,
  streaks: 0.8, twinkle: 0.35, grain: 0, backgroundOpacity: 0, seed: 11, phase: 3, animate: true,
};

/**
 * Thousands of grains stream inward along spiral arms into a glowing rim. `settings` overrides any of SETTINGS
 * (read once, at mount); `still` draws one frame and stops.
 */
export default function DustVortex({ className = '', settings = {}, still = false }) {
  const __root = useRef(null);

  useLayoutEffect(() => {
    const canvas = __root.current.querySelector('canvas');
    const state = { ...SETTINGS, ...settings, animate: !still };
    // The lattice wraps seamlessly only with a whole number of cells around the hollow and a whole number of
    // spiral arms. Cells are longer across the arms than along them, so grains line up into streaks.
    const pitch = (state.twist * Math.PI) / 180;
    const stretch = 1 + 2 * state.streaks;
    const cells = Math.max(1, Math.round(state.density * Math.cos(pitch)));
    const arms = Math.round((state.density * Math.sin(pitch)) / stretch);
    const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const numericUniforms = ['curl', 'inflow', 'spin', 'hole', 'dotSize', 'lip', 'lightAngle', 'shadow', 'perspective', 'centerX', 'centerY', 'streaks', 'twinkle', 'grain', 'backgroundOpacity', 'seed'];
    const colourUniforms = ['dust', 'shade', 'background'];
    const vertexSource = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.00001); }
    `;
    // Every grain sits on a log-polar spiral lattice, so the dust packs tight at the rim and thins out as it
    // sweeps away. Light rakes across from one side, leaving a bright lip and the far wall in shadow. Output is
    // premultiplied, so background opacity 0 gives a transparent canvas.
    const fragmentSource = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time, cells, arms, stretch, curl, inflow, spin, hole, dotSize, lip, lightAngle, shadow, perspective, centerX, centerY, streaks, twinkle, grain, backgroundOpacity, seed;
    uniform vec3 dust, shade, background;
    const float TAU = 6.28318530718;

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

    float dots(vec2 uv, float n, float m, float cellPx, float radiusPx, float salt) {
      vec2 base = floor(uv);
      float sum = 0.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 cell = base + vec2(float(i), float(j));
          float wraps = floor(cell.x / n);
          vec2 id = cell - wraps * vec2(n, -m) + salt;
          float band = noise(vec2(id.y * 0.3, id.x * 0.006));
          if (hash(id) > 0.92 * mix(1.0, smoothstep(0.15, 0.75, band) * 1.3, streaks)) continue;
          vec2 centre = cell + 0.5 + vec2(0.95, 0.9) * (vec2(hash(id + 17.1), hash(id + 41.7)) - 0.5);
          float dpx = length((uv - centre) * vec2(1.0, stretch)) * cellPx;
          float cover = 1.0 - smoothstep(radiusPx - 0.6, radiusPx + 0.6, dpx);
          float h = hash(id + 7.3);
          float bright = 0.4 + 0.6 * h * h;
          bright *= 1.0 - twinkle * 0.5 * (0.5 + 0.5 * sin(time * (1.5 + 3.0 * h) + h * TAU));
          sum += cover * bright;
        }
      }
      float average = 0.92 * 0.55 * min(1.0, 3.14159 * radiusPx * radiusPx / (cellPx * cellPx * stretch));
      return mix(average, sum, smoothstep(0.4, 1.6, cellPx));
    }

    void main() {
      float unit = min(resolution.x, resolution.y);
      vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / unit - vec2(centerX, centerY);
      float squash = 1.0 + perspective;
      vec2 q = vec2(p.x, p.y * squash);
      float r = max(length(q), 1e-5);
      float theta = atan(q.y, q.x);
      float lr = log(r);
      float pxScale = unit / sqrt(squash);

      float along = TAU / sqrt(cells * cells + arms * arms * stretch * stretch);
      float across = along * stretch;
      float ca = cells * along / TAU, sa = arms * across / TAU;
      float U = (theta * ca + lr * sa) / along - time * spin * 0.6;
      float V = (lr * ca - theta * sa) / across + time * inflow * 0.8;
      float cellPx = r * along * pxScale;
      float radiusPx = clamp(cellPx * 0.2 * dotSize, 0.7, max(0.8, unit * 0.0026 * dotSize));
      float fineRadius = clamp(cellPx * 0.07 * dotSize, 0.6, max(0.7, unit * 0.0016 * dotSize));

      float phi = mod(theta - radians(lightAngle) + 3.14159265, TAU) - 3.14159265;
      float facing = 0.5 + 0.5 * cos(phi);
      float light = mix(1.0, facing * facing, shadow);
      float turn = max(0.0, -phi * sign(curl));
      float open = abs(curl) * turn * (1.0 - smoothstep(0.7, 2.4, turn));
      float t = lr - log(hole) - open;
      float wall = smoothstep(-open - 0.02, 0.0, t);
      float rim = lip * facing * facing * exp(-abs(t) * 6.0);
      float ground = 0.5 + 0.6 * lip * facing * exp(-max(t, 0.0) * 1.2);
      float edge = smoothstep(-0.3, 0.1, lr - log(hole));
      edge *= edge;
      float lit = light * edge * wall * wall * ground;
      float dense = light * edge * (wall * wall * 2.2 * lip * facing * exp(-max(t, 0.0) * 2.2) + 2.5 * rim);

      float coarse = dots(vec2(U, V), cells, arms, cellPx, radiusPx, 0.0);
      float fine = dots(vec2(U, V) * 3.0, cells * 3.0, arms * 3.0, cellPx / 3.0, fineRadius, 91.0);
      float haze = 0.25 * rim * facing * facing * edge;
      float alpha = clamp(lit * coarse + dense * fine + haze, 0.0, 1.0);
      vec3 colour = mix(shade, dust, clamp(light * (0.5 + rim), 0.0, 1.0)) * alpha;

      float bgA = backgroundOpacity;
      vec3 premul = colour + background * bgA * (1.0 - alpha);
      float outA = alpha + bgA * (1.0 - alpha);
      float n = hash(gl_FragCoord.xy + floor(time * 24.0) * 17.0) - 0.5;
      premul = clamp(premul + n * grain * 0.07 * outA, 0.0, outA);
      gl_FragColor = vec4(premul, outA);
    }
    `;

    let gl, program, buffer, shaders = [], uniforms = {};
    let frame = 0, last = 0, time = 0, visible = true, destroyed = false, lost = false;
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
      if (!gl) throw new Error('WebGL is unavailable in this browser.');
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('The shader could not be compiled.');
        return shader;
      };
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('The shader could not be initialized.');
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const key of ['resolution', 'time', 'cells', 'arms', 'stretch', ...numericUniforms, ...colourUniforms]) {
        uniforms[key] = gl.getUniformLocation(program, key);
      }
    }
    function draw() {
      if (destroyed || lost || !program) return;
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1200000 / Math.max(1, box.width * box.height)));
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height); gl.useProgram(program);
      gl.disable(gl.BLEND);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.time, time + state.phase);
      gl.uniform1f(uniforms.cells, cells); gl.uniform1f(uniforms.arms, arms); gl.uniform1f(uniforms.stretch, stretch);
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
  }, [still]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={__root} aria-hidden="true" className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      <canvas style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
