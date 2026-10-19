/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Filament Flow" (React export, ion-blue filaments on a transparent ground). Changes:
// fills its parent, decorative (aria-hidden, no error box: without WebGL it simply shows nothing), fewer strands
// (1400 × 140 instead of 3200 × 220) and drawn at 30 fps so it stays light, devicePixelRatio capped at 1.5,
// one still frame under reduced motion or `still`, paused offscreen and in hidden tabs, settings as a prop,
// cleans up on unmount.
import { useLayoutEffect, useRef } from 'react';

const SETTINGS = {
  colorA: '#bcd0ff', colorB: '#05060a', speed: 0.35, scale: 1,
  turbulence: 1, density: 1.1, thickness: 1, contrast: 1, intensity: 0.9,
  backgroundOpacity: 0, seed: 17, phase: 0,
};
const STRANDS = 1400;
const STEPS = 140;

/** Sheets of fine filaments drifting through folds, like gas between stars. `settings` is read once, at mount. */
export default function FilamentFlow({ className = '', settings = {}, still = false }) {
  const __root = useRef(null);

  useLayoutEffect(() => {
    const canvas = __root.current.querySelector('canvas');
    const state = { ...SETTINGS, ...settings };
    const numeric = ['scale', 'turbulence', 'density', 'thickness', 'contrast', 'intensity', 'seed'];
    const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    // Each strand is a fixed line in material space; the vertex shader folds it with layered noise, so the
    // motion is continuous and nothing is reseeded on screen.
    const vertexSource = `
    precision highp float;
    attribute vec3 position;
    uniform vec2 resolution;
    uniform float time, scale, turbulence, density, thickness, contrast, intensity, seed;
    varying float energy;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * .1031);
      p3 += dot(p3, p3.yzx + 33.3299);
      return fract((p3.x + p3.y) * p3.z);
    }
    float noise(vec2 p) {
      vec2 i=floor(p),f=fract(p); f=f*f*(3.00001-2.00001*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+0.99999),f.x),f.y);
    }
    float fbm(vec2 p) {
      return noise(p)*.55+noise(p*2.03001+8.3)*.269999+noise(p*4.07001+13.1001)*.120001+noise(p*8.13001+2.70001)*.06;
    }
    void main() {
      vec2 uv=position.xy;
      float t=time*.650001;
      vec2 offset=vec2(seed*.37,seed*.190001);
      vec2 q=uv+offset;
      float broad=fbm(q*vec2(.900001,.549999)+vec2(t*.230001,-t*.16));
      float fold=fbm(q*vec2(1.50001,.650001)+vec2(5.7,t*.21));
      vec2 warped=uv;
      warped.x+=(broad-.500001)*2.09999*turbulence+.279999*sin(uv.y*1.8+t*.310001);
      warped.y+=(fold-.499999)*2.50001*turbulence;
      vec2 w=q+vec2(broad,fold)*1.2;
      warped.x+=(fbm(w*3.19999+vec2(t*.0899999,0))-.500001)*.279999*turbulence;
      warped.y+=(fbm(w*3.7+vec2(0,t*.120001))-.500001)*.099999*turbulence;
      float curtain=fbm(q*.850001+9.69999);
      float coverage=smoothstep(.200001,.479999,curtain);
      float light=.55+.649999*noise(q*1.70001+20.9999);
      energy=pow(coverage,contrast)*light*intensity*.340001*thickness;
      energy*=.500001+.499999*position.z;
      energy*=.249999+1.29999*exp(-dot(warped*vec2(.649999,.4),warped*vec2(.650001,.4)));
      if(hash(vec2(uv.x,3.70001))>density/1.60001) energy=0.0;
      vec2 clip=warped*scale/2.0*min(resolution.x,resolution.y)/resolution;
      gl_Position=vec4(clip,0,1);
    }
    `;
    const fragmentSource = `
    precision highp float;
    uniform vec3 colorA;
    varying float energy;
    void main() {
      float alpha=clamp(energy,0.0,.85);
      gl_FragColor=vec4(colorA*alpha,alpha);
    }
    `;
    // Fewer strands than the original lose some fineness, so each one carries a little more light.
    const points = new Float32Array(STRANDS * STEPS * 6);
    {
      let value = 74219;
      const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
      let index = 0;
      for (let strand = 0; strand < STRANDS; strand++) {
        const x = (strand + random()) / STRANDS * 5.20001 - 2.6;
        const offset = random();
        for (let step = 0; step < STEPS; step++) {
          const grain = random();
          for (let end = 0; end < 2; end++) {
            points[index++] = x;
            points[index++] = (step + offset + end * .959999) / STEPS * 6.2 - 3.10001;
            points[index++] = grain;
          }
        }
      }
    }
    const boost = Math.sqrt((3200 * 220) / (STRANDS * STEPS)) * 0.8;

    let gl, program, buffer, shaders = [], uniforms = {};
    let frame = 0, last = 0, drawn = 0, time = 0, visible = true, destroyed = false, lost = false;
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
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
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
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
      for (const key of ['resolution', 'time', 'colorA', ...numeric]) uniforms[key] = gl.getUniformLocation(program, key);
    }
    function draw() {
      if (destroyed || lost || !program) return;
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, 1440 / Math.max(1, box.width, box.height));
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height); gl.useProgram(program);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.time, time + state.phase);
      for (const key of numeric) gl.uniform1f(uniforms[key], key === 'intensity' ? state[key] * boost : state[key]);
      gl.uniform3fv(uniforms.colorA, rgb(state.colorA));
      const background = rgb(state.colorB);
      const a = state.backgroundOpacity;
      gl.clearColor(background[0] * a, background[1] * a, background[2] * a, a);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.LINES, 0, points.length / 3);
    }
    function tick(now) {
      frame = 0;
      const delta = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      time += delta * state.speed;
      last = now;
      // 30 fps is plenty for drifting gas, and halves the cost
      if (now - drawn >= 32) { drawn = now; draw(); }
      schedule();
    }
    function schedule() {
      if (!frame && !destroyed && !lost && program && visible && !document.hidden && !still && state.speed > 0 && !motion.matches) {
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
