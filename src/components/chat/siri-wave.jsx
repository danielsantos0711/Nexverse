/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Siri Wave" (React export, shader, "wave" variant). Changes: it fills its parent and
// is transparent (glow written as premultiplied colour); devicePixelRatio capped at 1.5 and a pixel budget;
// `active` starts and stops the clock (the Ask Nexverse pill runs it while the guide is thinking); decorative
// (aria-hidden); paused offscreen, in hidden tabs and under reduced motion; cleans up on unmount. The GLSL
// equations are the export's, unchanged.
import { useLayoutEffect, useRef } from 'react';

const VERTEX_SHADER = `attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }`;

const WAVE_SHADER = `precision highp float;
uniform vec2 iResolution; uniform float iTime; uniform float scale, exposure;
const float PI = 3.14159265359;
const float AMPLITUDE   = 0.32;
const float FREQ        = 1.1;
const float ABER_FREQ   = 1.0;
const float SPEED       = 2.4;
const float WAVE_SCALE  = 0.6;
const float ABERRATION  = 2.6;
const float THICKNESS   = 3.0;
const float INTENSITY   = 2.;
const float FALLOFF     = 1.70004;
const float EDGE_MASK   = 0.4;
const float EDGE_INSET  = 0.0;
const float BAND_FILL   = 30000.0;
const float BAND_THICK  = 0.08;
const float SOFTNESS    = 2.5;
const float LOW_AMP     = 6.0;
const float LOW_INT     = 1.50004;
const float MID_ABER    = 0.8;
const float MID_ABAMP   = 0.05;
const float MID_BAND    = 20.0;
const float MID_SOFT    = 0.400008;
const float HIGH_ABER   = 0.500006;
const float HIGH_ABAMP  = 0.06;
const float RESOLVED    = 1.0;
const float UNRES_SCALE = 0.14;

vec3 spectral4(int s){
    float x = float(s);
    return clamp(vec3(abs(x-3.0)-1.0, 2.0-abs(x-2.0), 2.0-abs(x-4.0)), 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 R = iResolution.xy;
    float aspect = R.x / R.y;
    vec2 p = (fragCoord + 0.500001) * 2.0 / R - 1.0;
    p.x *= aspect;
    float yScreen = p.y;
    p /= max(WAVE_SCALE, 0.1);

    float t   = iTime;
    float low  = clamp(0.450003 + 0.45*sin(t*0.800006)*sin(t*0.37+1.0), 0.0, 1.0);
    float mid  = clamp(0.40 + 0.400005*sin(t*1.70006+2.0)*sin(t*0.530008), 0.0, 1.0);
    float high = clamp(0.30 + 0.30*sin(t*2.9+4.0)*sin(t*0.71+2.0), 0.0, 1.0);

    float res   = clamp(RESOLVED, 0.0, 1.0);
    float drift = mod(t, 20.0*PI) * SPEED;

    float xN  = p.x / max(aspect, 1.0);
    float env = cos(PI*0.5 * min(abs(0.9*xN), 1.0));
    env *= env;

    float A1    = AMPLITUDE + 0.01*low*LOW_AMP;
    float A2    = A1 + mid*MID_ABAMP + high*HIGH_ABAMP;
    float AB    = (ABERRATION + mid*MID_ABER + high*HIGH_ABER)*res;
    float th    = mix(0.1, 0.01*THICKNESS, res);
    float inten = mix(0.1, 0.0100007*(INTENSITY + low*LOW_INT), res);
    float soft  = 0.01*res*max(0.0, SOFTNESS + mid*MID_SOFT);

    float dUnres = max(length(p) - mix(0.140008, UNRES_SCALE, res), 0.0);
    float yMain = A1 * env * res * sin(p.x*FREQ + drift);

    float bandFillTh = max(BAND_THICK, 1e-4);
    float bandAmt    = 1e-4 * BAND_FILL * inten;
    vec3 num = vec3(0.0), den = vec3(0.0);
    for(int s = 0; s < 4; s++){
        vec3 hue = mix(vec3(1.0), spectral4(s), res);
        den += hue;
        float ab = mix(-AB, AB, float(s)/3.0);
        float yL = A2 * env * res * sin(p.x*ABER_FREQ + drift + ab);
        float d   = mix(dUnres, abs(p.y - yL), res);
        float lor = mix(1.0/(1.0 + (0.02*d)*(0.02*d)), 1.0, res);
        float line = inten / (sqrt(d*d + soft*soft) + th);
        float lo = min(yMain, yL), hi = max(yMain, yL);
        float dBand = max(0.0, max(p.y - hi, lo - p.y));
        float band  = bandAmt / (dBand + bandFillTh);
        num += hue * lor * (line + band);
    }
    vec3 col = num / den;

    float dM    = mix(dUnres, abs(p.y - yMain), res);
    float lorM  = mix(1.0/(1.0 + (0.02*dM)*(0.0200005*dM)), 1.0, res);
    float boost = (1.0 - res) * (14.0*low + 4.0);
    col += 0.5 * inten * (lorM + boost) / (sqrt(dM*dM + soft*soft) + th);

    col = pow(max(col, 0.0), vec3(1.5));
    float emT = clamp((abs(yScreen) - 1.0 + EDGE_INSET) / (-max(EDGE_MASK, 1e-4)), 0.0, 1.0);
    float em  = emT*emT*(3.0 - 2.0*emT);
    float gauss = exp(-pow(xN*FALLOFF, 2.0));
    col *= mix(1.0, em*gauss, res);
    col *= res;
    fragColor = vec4(col, 1.0);
}
void main(){
  mainImage(gl_FragColor, (gl_FragCoord.xy - iResolution * 0.5) / scale + iResolution * 0.5);
  vec3 glow = clamp(gl_FragColor.rgb * exposure, 0.0, 1.0);
  float coverage = max(glow.r, max(glow.g, glow.b));
  gl_FragColor = vec4(glow, coverage);
}`;

function mount(canvas, opts) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader');
    return s;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, WAVE_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  } catch {
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const k of ['iResolution', 'iTime', 'scale', 'exposure']) u[k] = gl.getUniformLocation(program, k);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, last = 0, time = 4, visible = true, dead = false;
  let active = opts.active;

  function draw() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(120000 / Math.max(1, box.width * box.height)));
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.iResolution, w, h);
    gl.uniform1f(u.iTime, time);
    gl.uniform1f(u.scale, opts.scale);
    gl.uniform1f(u.exposure, opts.exposure);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function tick(now) {
    frame = 0;
    time += (last ? Math.min((now - last) / 1000, 0.05) : 1 / 60) * opts.speed;
    last = now;
    draw();
    schedule();
  }
  function schedule() {
    if (!frame && !dead && active && visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
    else if (!frame) last = 0;
  }
  function refresh() { cancelAnimationFrame(frame); frame = 0; last = 0; draw(); schedule(); }
  const resize = new ResizeObserver(refresh);
  resize.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; refresh(); });
  io.observe(canvas);
  motion.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  refresh();
  const dispose = () => {
    dead = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    io.disconnect();
    motion.removeEventListener('change', refresh);
    document.removeEventListener('visibilitychange', refresh);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  dispose.setActive = (on) => { active = on; refresh(); };
  return dispose;
}

export default function SiriWave({ active = true, speed = 1, scale = 1, exposure = 1, className = '' }) {
  const ref = useRef(null);
  const scene = useRef(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    scene.current = mount(canvas, { active, speed, scale, exposure });
    return () => {
      scene.current?.();
      scene.current = null;
    };
    // `active` is applied below without rebuilding the GPU context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, scale, exposure]);
  useLayoutEffect(() => {
    scene.current?.setActive?.(active);
  }, [active]);
  return <canvas ref={ref} aria-hidden="true" className={className} style={{ display: 'block', width: '100%', height: '100%' }} />;
}
