/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Astral Abyss" (React export). Changes: fills its parent; decorative (aria-hidden,
// no error box: without WebGL the section's ground shows instead); a lighter mesh (about a fifth of the
// original strands, exposure raised to match) drawn at 30 fps with devicePixelRatio capped at 1.5, so it
// stays cheap; one still frame under reduced motion; paused offscreen and in hidden tabs; cleans up on unmount.
import { useLayoutEffect, useRef } from 'react';

const SETTINGS = { speed: 0.25, scale: 1.1, intensity: 1.9, depth: 1.1, density: 1.1, turbulence: 0.9, stars: 1.2, phase: 4, color: '#c9d6f0', background: '#05060a' };

function geometry() {
  const vertices = [];
  for (let family = 1; family <= 3; family++) {
    const count = family === 1 ? 700 : family === 2 ? 620 : 160;
    const segments = 150;
    for (let strand = 0; strand < count; strand++) {
      for (let step = 0; step < segments; step++) vertices.push(step / segments, strand, family, (step + 1) / segments, strand, family);
    }
  }
  // the tiny explorer standing on the lip, for scale
  for (const [x, y] of [[0, -0.128], [0, -0.132], [0, -0.131999], [0, -0.138001], [0, -0.136999], [-0.002, -0.141999], [0, -0.137001], [0.002, -0.142001], [-0.003, -0.135001], [0.003, -0.135001]]) vertices.push(x, y, 4);
  const lineCount = vertices.length / 3;
  let randomState = 77129;
  const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; };
  const starCount = 14000;
  for (let i = 0; i < starCount; i++) vertices.push(random() * 2 - 1, random() * 2 - 1, -random());
  return { data: new Float32Array(vertices), lineCount, starCount };
}

const VERTEX_SHADER = `
precision highp float;
attribute vec3 aPos;
uniform vec2 iResolution;
uniform float iTime, scale, exposure, depth, density, turbulence, stars;
uniform vec3 color;
varying vec4 light;
varying float point;
float hash(float n) { float p=fract(n*.1031);p*=p+33.33;p*=p+p;return fract(p); }
vec2 gradient(vec2 p) {
  vec2 g=vec2(hash(p.x+p.y*83.17),hash(p.x*19.13+p.y*7.17))-.5;
  return g/max(length(g),.001);
}
float spatial(vec2 p) {
  vec2 i=floor(p),f=fract(p);vec2 w=f*f*f*(f*(f*6.0-15.0)+10.0);
  float a=dot(gradient(i),f),b=dot(gradient(i+vec2(1,0)),f-vec2(1,0));
  float c=dot(gradient(i+vec2(0,1)),f-vec2(0,1)),d=dot(gradient(i+vec2(1,1)),f-vec2(1,1));
  return mix(mix(a,b,w.x),mix(c,d,w.x),w.y)*1.5;
}
float noise(float x, float seed) {
  float i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(hash(i+seed*171.17),hash(i+1.0+seed*171.17),f)*2.0-1.0;
}
float filament(float x,float seed) {
  return noise(x*3.0,seed)*0.58+noise(x*8.0,seed+17.0)*0.26+noise(x*21.0,seed+41.0)*0.11+noise(x*57.0,seed+73.0)*0.05;
}
void main() {
  float t=aPos.x, seed=aPos.y, family=aPos.z;
  float cluster=floor(seed/4.0);
  float r=hash(cluster+11.0),r2=hash(cluster+37.0),r3=hash(cluster+91.0);
  float unit=min(iResolution.x,iResolution.y*1.15);
  point=0.0;vec2 p=vec2(0);float alpha=0.0;
  if(family<0.5) {
    float n=t*71.0+seed*37.0;
    p=vec2(t,seed);
    gl_Position=vec4(p,0,1);
    float b=-family,dust=0.35+0.65*(1.0-smoothstep(-.65,.55,p.y));
    gl_PointSize=1.25+pow(b,15.0)*1.3;
    vec3 tint=mix(vec3(.75,.80,.90),vec3(.85,.77,.62),step(.982,hash(n+581.0)));
    light=vec4(tint,(.15+pow(b,17.0)*.45)*dust*stars*(.85+.15*sin(iTime*.6+n)));
    point=1.0;return;
  }
  if(family>3.5) {
    gl_Position=vec4(aPos.xy*unit*scale/iResolution*2.0,0,1);
    light=vec4(color,.6);gl_PointSize=1.0;return;
  }
  float clock=iTime*.15;
  float n=filament(t*1.4+clock,cluster);
  float fine=filament(t*3.0-clock,seed+281.0);
  float branch=smoothstep(.05+hash(seed+98.0)*.25,.45+hash(seed+19.0)*.4,t);
  if(family<1.5) {
    float side=step(.5,r)*2.0-1.0;
    float interior=step(.92,hash(cluster+171.0));
    float root=mix(.070+pow(hash(cluster+191.0),1.85)*.45,.004+hash(cluster+61.0)*.065,interior);
    float s=1.0-2.0*t;
    float fan=.24+pow(r2,.65)*1.36;
    p.x=side*(root+fan*s);
    float lip=-.14+.30*root*root;
    p.y=lip+(s>0.0 ? (.30+r3*.95)*(pow(s+.018,.85)-pow(.018,.85))*depth : -(.06+r2*.44)*pow(-s,1.35));
    float taper=.15+.85*smoothstep(0.0,.28,abs(s));
    p+=vec2(n*.009,n*.012)*taper*turbulence;
    p+=vec2(fine*.003,fine*.004)*branch*taper*turbulence;
    p.y+=sin(p.x*4.0+clock)*.012*smoothstep(0.0,.2,-s);
    alpha=(.006+.018*pow(hash(seed+17.0),4.0))*exp(-pow((t-.48)/.25,2.0));
    alpha*=mix(.12,3.5,smoothstep(-.1,.12,s));
    alpha*=mix(1.0,.25,interior);
    alpha*=exp(-max(p.y-.15,0.0)*5.0);
    alpha*=.35+1.25*exp(-pow((abs(p.x)-.23)/.24,2.0))*exp(-pow((p.y+.06)/.32,2.0));
    alpha*=.45+.55*noise(t*23.0-clock*3.0,cluster+23.0)*noise(t*23.0-clock*3.0,cluster+23.0);
  } else if(family<2.5) {
    p.x=(t*2.0-1.0)*1.35;
    float layer=pow(r,1.55)*.54;
    p.y=-.145+.26*p.x*p.x-layer+.22*p.x*pow(layer/.54,.7);
    p.y+=filament(t*1.8+clock,cluster+8.0)*(.012+layer*.13)*turbulence;
    p.y+=fine*.012*branch*turbulence;
    p.x+=n*.012*turbulence;
    alpha=(.003+.014*pow(hash(seed+61.0),3.0))*exp(-layer*4.5)*exp(-p.x*p.x*.4);
  } else {
    p.x=(t*2.0-1.0)*1.3;
    p.y=.28+r*.62+filament(t*1.8+clock,cluster+7.0)*.065*turbulence;
    p.y+=fine*.009*branch*turbulence;
    alpha=(.0009+.0025*r2)*exp(-r*2.0);
  }
  vec2 q=p*vec2(1.0,1.3)+vec2(clock*.03,clock*.05);
  vec2 q2=mat2(.8,-.6,.6,.8)*q;
  vec2 curl=vec2(spatial(q*8.0),spatial(q*8.0+vec2(21,7)))*.030;
  curl+=vec2(spatial(q2*23.0),spatial(q2*23.0+vec2(11,2)))*.012;
  curl+=vec2(spatial(q*61.0),spatial(q*61.0+vec2(7,31)))*.004;
  curl+=vec2(spatial(q2*149.0),spatial(q2*149.0+vec2(17,3)))*.001;
  float rim=-.14+.30*p.x*p.x;
  float rimSoftness=.28+.72*smoothstep(.008,.07,abs(p.y-rim));
  p+=curl*turbulence*rimSoftness;
  alpha*=smoothstep(-.70,-.47,p.y);
  alpha*=1.0-step(density/1.8,hash(seed+191.0));
  alpha*=smoothstep(0.0,.04,t)*(1.0-smoothstep(.92,1.0,t));
  gl_Position=vec4(p*unit*scale/iResolution*2.0,0,1);
  gl_PointSize=1.0;light=vec4(color,alpha*exposure*5.0);
}`;
const FRAGMENT_SHADER = `
precision highp float;
varying vec4 light;
varying float point;
void main() {
  float coverage=1.0;
  if(point>.5) coverage=1.0-smoothstep(.05,.5,length(gl_PointCoord-.5));
  gl_FragColor=vec4(light.rgb*light.a*coverage,1.0);
}`;
const QUAD_VERTEX = `
attribute vec2 position;varying vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0,1);}`;
const GLOW_FRAGMENT = `
precision mediump float;
varying vec2 uv;uniform sampler2D source;uniform vec2 direction;
void main(){
  vec3 c=texture2D(source,uv).rgb*.2270271;
  c+=(texture2D(source,uv+direction*1.3846151).rgb+texture2D(source,uv-direction*1.3846149).rgb)*.3162161;
  c+=(texture2D(source,uv+direction*3.2307689).rgb+texture2D(source,uv-direction*3.230769).rgb)*.0702699;
  gl_FragColor=vec4(c,1);
}`;
const COMPOSITE_FRAGMENT = `
precision mediump float;
varying vec2 uv;uniform sampler2D source;uniform sampler2D glow;uniform vec3 background;
void main(){
  vec3 c=texture2D(source,uv).rgb+texture2D(glow,uv).rgb*1.1;
  gl_FragColor=vec4(background+(1.0-background)*(1.0-exp(-c*1.35)),1);
}`;

function mountAstralAbyss(canvas, state) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  let gl, program, buffer, shaders = [], uniforms = {};
  let lineCount = 0, starCount = 0;
  let blurProgram, compositeProgram, quadBuffer, targets = [], targetWidth = 0, targetHeight = 0;
  let frame = 0, last = 0, time = 0, visible = false, destroyed = false, lost = false, drawn = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function release() {
    if (gl) {
      shaders.forEach((shader) => gl.deleteShader(shader));
      for (const target of targets) { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); }
      if (blurProgram) gl.deleteProgram(blurProgram);
      if (compositeProgram) gl.deleteProgram(compositeProgram);
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
    shaders = []; program = null; buffer = null;
    blurProgram = null; compositeProgram = null; quadBuffer = null; targets = []; targetWidth = 0; targetHeight = 0;
  }
  function initialize() {
    gl = canvas.getContext('webgl', { alpha: false, premultipliedAlpha: true, antialias: true, powerPreference: 'low-power' });
    if (!gl) throw new Error('no webgl');
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('compile');
      return shader;
    };
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(program);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const mesh = geometry(); lineCount = mesh.lineCount; starCount = mesh.starCount;
    gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
    uniforms = {};
    for (const key of ['iResolution', 'iTime', 'scale', 'exposure', 'depth', 'density', 'turbulence', 'stars', 'color']) uniforms[key] = gl.getUniformLocation(program, key);
    const postProgram = (fragment) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, QUAD_VERTEX));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); throw new Error('post'); }
      return p;
    };
    blurProgram = postProgram(GLOW_FRAGMENT); compositeProgram = postProgram(COMPOSITE_FRAGMENT);
    quadBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }
  function resizeTargets(width, height) {
    if (width === targetWidth && height === targetHeight) return;
    for (const target of targets) { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); }
    targets = []; targetWidth = width; targetHeight = height;
    for (let i = 0; i < 3; i++) {
      const w = i ? Math.max(1, Math.ceil(width / 3)) : width;
      const h = i ? Math.max(1, Math.ceil(height / 3)) : height;
      const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const format = i ? gl.RGBA : gl.RGB;
      gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, format, gl.UNSIGNED_BYTE, null);
      const framebuffer = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      targets.push({ texture, framebuffer, width: w, height: h });
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function post(programToUse, texture, target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(0, 0, target?.width ?? canvas.width, target?.height ?? canvas.height);
    gl.useProgram(programToUse); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const position = gl.getAttribLocation(programToUse, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(programToUse, 'source'), 0);
  }
  function draw() {
    if (destroyed || lost || !program) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(box.width * dpr));
    const height = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    resizeTargets(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height); gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uniforms.iResolution, width, height);
    gl.uniform1f(uniforms.iTime, time + state.phase);
    gl.uniform1f(uniforms.scale, state.scale);
    gl.uniform1f(uniforms.exposure, state.intensity);
    for (const key of ['depth', 'density', 'turbulence', 'stars']) gl.uniform1f(uniforms[key], state[key]);
    gl.uniform3fv(uniforms.color, rgb(state.color));
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, lineCount, starCount);
    gl.drawArrays(gl.LINES, 0, lineCount);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, targets[0].texture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height);
    post(blurProgram, targets[0].texture, targets[1]);
    gl.uniform2f(gl.getUniformLocation(blurProgram, 'direction'), 2.5 / width, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    post(blurProgram, targets[1].texture, targets[2]);
    gl.uniform2f(gl.getUniformLocation(blurProgram, 'direction'), 0, 2.5 / height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    post(compositeProgram, targets[0].texture, null);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, targets[2].texture);
    gl.uniform1i(gl.getUniformLocation(compositeProgram, 'glow'), 1);
    gl.uniform3fv(gl.getUniformLocation(compositeProgram, 'background'), rgb(state.background));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // 30 frames a second is plenty for a scene this slow, and halves its cost.
  function tick(now) {
    frame = 0;
    if (!last) last = now;
    if (now - drawn >= 32) {
      time += Math.min(0.1, (now - last) / 1000) * state.speed;
      last = now; drawn = now;
      draw();
    }
    schedule();
  }
  function schedule() {
    if (!frame && !destroyed && !lost && program && visible && !document.hidden && state.speed > 0 && !motion.matches) frame = requestAnimationFrame(tick);
  }
  function refresh() {
    cancelAnimationFrame(frame); frame = 0; last = 0; draw(); schedule();
  }
  function contextLost(event) { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; }
  function contextRestored() {
    lost = false; shaders = []; program = null; buffer = null;
    targets = []; targetWidth = 0; targetHeight = 0; blurProgram = null; compositeProgram = null; quadBuffer = null;
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
  return () => {
    destroyed = true; cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect();
    motion.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', refresh);
    canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
    release();
  };
}

/** A basin of silver filaments with a tiny explorer on its lip. Fills its parent. */
export default function AstralAbyss({ className = '' }) {
  const __root = useRef(null);
  useLayoutEffect(() => mountAstralAbyss(__root.current.querySelector('canvas'), SETTINGS), []);
  return (
    <div ref={__root} aria-hidden="true" className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      <canvas style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
