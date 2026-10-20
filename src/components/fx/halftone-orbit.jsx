/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Halftone Orbit" (React export, site palette: card graphite, ion blue, silver). Changes:
// fills its parent (keep the box square), decorative (aria-hidden, no error box), devicePixelRatio capped at 1.5,
// one still frame under reduced motion or `still`, paused offscreen and in hidden tabs, settings as a prop,
// cleans up on unmount.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { frameInterval, pixelRatio, useFx } from '@/lib/perf';

const SETTINGS = {
  colorA: '#0c0e14', colorB: '#8fb4ff', colorC: '#e9ebf1',
  speed: 0.6, scale: 1, radius: 0.335, width: 0.1, density: 64,
  angle: 40, distortion: 0.7, grain: 0.08, intensity: 1, phase: 0, animate: true,
};

/** A ring printed as a halftone screen, breathing gently, on a transparent ground. A small focal accent. */
export default function HalftoneOrbit({ className = '', settings = {}, still = false }) {
  const __root = useRef(null);
  const api = useRef(null);
  // perf (src/lib/perf.ts): pixel ratio and frame rate follow the quality tier; "off" or another heavy
  // effect's turn on screen holds one still frame
  const { quality, run } = useFx(__root, { minimum: 'medium' });
  const live = run && !still;
  useEffect(() => {
    api.current?.set(quality, live);
  }, [quality, live]);

  useLayoutEffect(() => {
    const canvas = __root.current.querySelector('canvas');
    const state = { ...SETTINGS, ...settings, animate: true };
    const numeric = ['scale', 'radius', 'width', 'density', 'angle', 'distortion', 'grain', 'intensity'];
    const colours = ['colorA', 'colorB', 'colorC'];
    const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const vertexSource = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.00001); }
    `;
    // One circular dot per rotated square cell; the dots swell where the ring is bright and shrink at its
    // fringes instead of becoming a flat glow. Premultiplied output: the aperture and outside stay transparent.
    const fragmentSource = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time, scale, radius, width, density, angle, distortion, grain, intensity;
    uniform vec3 colorA, colorB, colorC;
    float hash(vec2 p) {
      vec3 q=fract(vec3(p.xyx)*.1031);
      q+=dot(q,q.yzx+33.33);
      return fract((q.x+q.y)*q.z);
    }
    void main() {
      float unit=min(resolution.x,resolution.y)*scale;
      vec2 p=(gl_FragCoord.xy-resolution*.5)/unit-vec2(-.008,.055);
      float theta=angle*.01745329252;
      mat2 turn=mat2(cos(theta),-sin(theta),sin(theta),cos(theta));
      vec2 grid=turn*p*density;
      vec2 cell=floor(grid)+.5;
      vec2 center=vec2(cos(theta)*cell.x-sin(theta)*cell.y,sin(theta)*cell.x+cos(theta)*cell.y)/density;
      float a=atan(center.y,center.x);
      float r=length(center);
      float drift=distortion*(.012*sin(a*3.0-time*1.8)
        +.006*sin(a*5.0+time*1.15)+.004*sin(r*28.0-time*2.8));
      float bandWidth=width*mix(1.25,.90,smoothstep(radius-.02,radius+.02,r));
      float ring=exp(-pow((r-radius-drift)/bandWidth,2.0)*.72);
      float light=ring*(.92+.08*sin(a*2.0+time*.45));
      float dotRadius=.545*pow(light,.40);
      float aa=.65*density/unit;
      float coverage=1.0-smoothstep(max(0.0,dotRadius-aa),dotRadius+aa,length(grid-cell));
      float warm=smoothstep(-.07,.28,center.y);
      float rose=smoothstep(-.18,.26,center.x);
      vec3 pigment=mix(colorC,colorB,rose*.85);
      pigment=mix(pigment,colorA,warm*.93);
      float innerIvory=(1.0-smoothstep(radius-.045,radius+.015,r))*warm*.82;
      pigment=mix(pigment,colorC,innerIvory);
      float ink=pow(light,.65)*intensity;
      float paperNoise=hash(floor(gl_FragCoord.xy));
      float dotNoise=hash(cell);
      vec3 col=pigment*(1.0-grain*(paperNoise*.32+dotNoise*.25));
      float alpha=coverage*clamp(ink,0.0,1.0)*smoothstep(.002,.018,light);
      gl_FragColor=vec4(clamp(col,0.0,1.0)*alpha,alpha);
    }
    `;

    let gl, program, buffer, shaders = [], uniforms = {};
    let quality = 'high', live = false, drawnAt = 0;
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
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const key of ['resolution', 'time', ...numeric, ...colours]) uniforms[key] = gl.getUniformLocation(program, key);
    }
    function draw() {
      if (destroyed || lost || !program) return;
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(pixelRatio(quality));
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height); gl.useProgram(program);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform1f(uniforms.time, time + state.phase);
      for (const key of numeric) gl.uniform1f(uniforms[key], state[key]);
      for (const key of colours) gl.uniform3fv(uniforms[key], rgb(state[key]));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
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
      if (!frame && !destroyed && !lost && program && live && visible && !document.hidden && state.animate && state.speed > 0 && !motion.matches) {
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
    // settings are read once at mount, like the original export
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={__root} aria-hidden="true" className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      <canvas style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
