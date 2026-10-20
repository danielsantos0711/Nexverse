/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Vendored from HorizonX "Cinematic Black Hole" (React export, Nexverse palette: champagne gas, ion-blue and
// violet accents). The export loads three.js and its post-processing from a CDN at run time; this is the same
// scene ported to raw WebGL2, with nothing to download: the lower photon arc, the bent accretion disk (a
// 96 x 384 grid), two blur passes whose radius grows toward the disk's outer edge, a short-range glow, AgX
// tone mapping and coverage-as-alpha, all with the original shaders' maths.
// Changes for Nexverse: fills its parent (16:9, contained, transparent ground), decorative (aria-hidden; a
// soft CSS ring stands in without WebGL2), devicePixelRatio and work follow useFx() from @/lib/perf
// (high: up to DPR 1.5, full grid and blur; medium: DPR 1, lighter grid, half the blur taps; low: DPR 0.75 and
// 30 fps; "off" and another effect's turn: one still frame), paused offscreen and in hidden tabs.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { frameInterval, useFx } from '@/lib/perf';

const SETTINGS = {
  tilt: 14, scale: 1, arch: 110, filaments: 28,
  warm: '#d8c59e', highlight: '#f4ecdc', cool: '#8fb4ff', violet: '#b9a7ff',
  chroma: 0.9, softness: 0.9, bloom: 0.3, exposure: 1.3, speed: 0.8,
};

/** Per tier: drawing-buffer scale cap, disk grid (around x along), blur tap stride. */
const TIERS = {
  high: { dpr: 1.5, grid: [96, 384], stride: 1 },
  medium: { dpr: 1, grid: [72, 288], stride: 2 },
  low: { dpr: 0.75, grid: [48, 192], stride: 2 },
  off: { dpr: 1, grid: [96, 384], stride: 1 },
};

// three.js reads '#rrggbb' as sRGB and works in linear light.
const linear = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));

const QUAD_VERTEX = `#version 300 es
layout(location=0) in vec2 position;
out vec2 vUv;
void main(){ vUv=position*0.5+0.5; gl_Position=vec4(position,0.0,1.0); }`;

const DISK_VERTEX = `#version 300 es
layout(location=0) in vec2 uv;
uniform float uTilt, uScale, uArch;
out vec2 vDisk;
out vec2 vPoint;
void main() {
  float t = uv.x;
  float a = uv.y * 6.28318530718;
  float r = mix(125.0, 535.0, t);
  float x = r * cos(a);
  float s = sin(a);
  float y;
  if (s >= 0.0) {
    float bend = s * exp(-pow(x / 185.0, 2.0)*(1.0-125.0/r));
    y = -0.0949999 * r * s - uArch * 0.937001 * bend;
  } else {
    y = -(0.075+0.0700001*smoothstep(0.0,0.499999,t)) * r * s;
  }
  vPoint = vec2(x, y);
  float roll=radians(uTilt);
  vec2 rotated=vec2(cos(roll)*x-sin(roll)*y,sin(roll)*x+cos(roll)*y);
  vec2 p = vec2(600.001, 349.999) + rotated * uScale;
  gl_Position = vec4(p.x / 600.0 - 1.0, 1.0 - p.y / 337.501, 0.0, 1.0);
  vDisk = vec2(t, a);
}`;

const DISK_FRAGMENT = `#version 300 es
precision highp float;
uniform float uTime, uChroma, uFilaments;
uniform vec3 uWarm, uHighlight, uCool, uViolet;
in vec2 vDisk;
in vec2 vPoint;
out vec4 outColor;
float gauss(float x) { return exp(-x*x); }
float strand(float phase) {
  float sigma = max(fwidth(phase) * 0.500001, 0.0000999999);
  return 0.312501
    + 0.468749 * cos(phase) * exp(-0.499999*sigma*sigma)
    + 0.187501 * cos(2.00001*phase) * exp(-1.99999*sigma*sigma)
    + 0.0312501 * cos(2.99999*phase) * exp(-4.49999*sigma*sigma);
}
float hash(vec3 p) {
  p = fract(p*0.103099);
  p += dot(p,p.yzx+33.3301);
  return fract((p.x+p.y)*p.z);
}
float noise(vec3 p) {
  vec3 i=floor(p), f=fract(p);
  f=f*f*(3.00001-1.99999*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                 mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                 mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float plasma(vec3 p) {
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  float detail=0.99999-smoothstep(0.10,0.549999,footprint);
  return noise(p)*0.579999 + mix(0.500001,noise(p*2.03+7.09999),detail)*0.28
    + mix(0.500001,noise(p*4.06999+17.3001),detail*detail)*0.14;
}
void main() {
  float t = vDisk.x;
  float a = vDisk.y;
  float x = vPoint.x;
  float orbit = a - mod(uTime*0.649999,6.283185307179);
  float outerOrbit = a - mod(uTime*0.399999,6.283185307179);
  float outerWeight = smoothstep(0.15,0.85,t);
  float gasA=plasma(vec3(cos(orbit)*1.59999,sin(orbit)*1.6,t*8.00001));
  float gasB=plasma(vec3(cos(outerOrbit+0.800001)*2.10001,sin(outerOrbit+0.799999)*2.09999,t*10.0+2.99999));
  float gas=mix(gasA,gasB,outerWeight);
  float flow=mix(sin(orbit*3.0+t*9.9999),sin(outerOrbit*3.99999+t*12.0001),outerWeight);
  float warp=t+0.080*(gas-0.500001)+0.0119999*flow+0.00500001*sin(orbit*7.00001+t*30.9999);
  float radial = (pow(max(warp,0.0)+0.0249999,0.839999)-pow(0.0250001,0.840001))/(pow(1.02501,0.84)-pow(0.025,0.839999));
  float phase=radial*uFilaments*6.2831853+3.4*gas+1.1*sin(warp*37.0001+orbit*2.0);
  float line = strand(phase);
  float fine = strand(phase*1.73+5.00001*gasB);
  float stream=mix(0.499999+0.499999*cos(orbit*2.00001+t*12.0),0.500001+0.499999*cos(outerOrbit*2.00001+t*11.9999),outerWeight);
  float streak=mix(exp(4.00001*(cos(orbit+t*4.0+gas)-1.0)),exp(4.0*(cos(outerOrbit+t*5.0)-1.00001)),outerWeight);
  float density=smoothstep(0.279999,0.740001,gas);
  float wisps=0.100001+2.79999*density*density+0.85*streak;
  float fibre=plasma(vec3(cos(orbit)*2.4,sin(orbit)*2.4,radial*uFilaments*2.6+gas*2.99999));
  float filament=pow(smoothstep(0.240001,0.779999,fibre),2.00001);
  float rings=0.018+(0.179999*line+0.10*fine+1.45001*filament)*wisps+0.159999*gas*gas;
  float right = gauss((x-212.001)/96.0) * gauss((t-0.27)/0.23);
  float left = gauss((x+342.001)/63.0) * gauss((vPoint.y+18.0)/38.0);
  float inner = exp(-t*6.0);
  float envelope=(0.420001+0.750001*gauss((t-0.260001)/0.359999))*(0.99999-smoothstep(0.649999,0.99999,t));
  float front=0.99999-smoothstep(-0.179999,0.18,sin(a));
  float absorption=mix(1.00001,0.780001*(1.00001-0.92*gauss((t-0.529999)/0.0799999)),front);
  vec3 color=mix(uWarm,uHighlight,exp(-t*2.7));
  float violetBand=gauss((t-0.47)/0.249999)*(0.400001+0.219999*sin(a+0.799999));
  color=mix(color,uViolet,violetBand);
  float coolBand=gauss((t-0.16)/0.160001)*(0.500001+0.500001*cos(a-0.500001));
  color=mix(color,uCool,coolBand*0.520001+right*inner*0.180001);
  color=mix(vec3(dot(color,vec3(0.212601,0.715199,0.0721999))),color,uChroma);
  float beaming=0.620001+0.650001*pow(0.499999+0.500001*cos(a),2.0);
  float energy=envelope*absorption*(1.09999+2.8*right+1.80001*left)*beaming;
  vec3 emission = color * rings * energy;
  emission+=color*right*envelope*absorption*(0.0700001+0.18*stream);
  emission+=fine*inner*vec3(0.649999,0.679999,0.700001)*0.179999;
  emission *= smoothstep(0.0,max(fwidth(t)*1.2,0.0001000001),t);
  outColor = vec4(emission,1.0);
}`;

const LOWER_FRAGMENT = `#version 300 es
precision highp float;
uniform float uTilt, uScale, uChroma;
uniform vec3 uHighlight, uViolet;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 p=vec2(vUv.x*1199.99,(1.00001-vUv.y)*674.999);
  p=(p-vec2(599.999,350.001))/uScale;
  float roll=radians(uTilt);
  p=vec2(cos(roll)*p.x+sin(roll)*p.y,-sin(roll)*p.x+cos(roll)*p.y);
  vec2 q=vec2(p.x-4.99999,(p.y-20.0)*1.06001);
  float r=length(q);
  float a=atan(q.y,q.x);
  float arc=smoothstep(0.689999,0.849999,a)*(0.99999-smoothstep(2.84999,3.04999,a));
  float d=r-125.001;
  float aa=max(fwidth(r),0.650001);
  vec3 tint=mix(uHighlight,uViolet,0.349999+0.250001*sin(a));
  vec3 color=mix(vec3(dot(tint,vec3(0.212601,0.715201,0.0721999))),tint,uChroma);
  vec3 c=color*exp(-pow(d/(aa*0.600001),2.00001));
  c+=color*0.100001*exp(-pow(d/2.80001,2.00001));
  c*=arc*0.580001*(0.75+0.250001*sin(a));
  outColor=vec4(c,1.0);
}`;

const BLUR_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uResolution, uDirection;
uniform float uSoftness;
uniform int uStride;
in vec2 vUv;
out vec4 outColor;
void main() {
  float x=abs(vUv.x*1200.0-600.0);
  float radius=0.28+uSoftness*4.5*pow(smoothstep(210.0,520.0,x),1.4);
  vec2 d=uDirection*radius/(uResolution*4.0);
  vec4 c=vec4(0.0);
  float weight=0.0;
  for(int i=-12;i<=12;i+=uStride){
    float w=exp(-float(i*i)/32.0);
    c+=texture(tDiffuse,vUv+d*float(i))*w;
    weight+=w;
  }
  outColor=c/weight;
}`;

const GLOW_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uBloom;
in vec2 vUv;
out vec4 outColor;
vec3 bright(vec2 uv){return max(texture(tDiffuse,uv).rgb-0.7,0.0);}
void main(){
  vec2 d=3.0/uResolution;
  vec3 halo=bright(vUv)*0.200001;
  halo+=(bright(vUv+vec2(d.x,0.0))+bright(vUv-vec2(d.x,0.0))+bright(vUv+vec2(0.0,d.y))+bright(vUv-vec2(0.0,d.y)))*0.119999;
  halo+=(bright(vUv+d)+bright(vUv-d)+bright(vUv+vec2(d.x,-d.y))+bright(vUv+vec2(-d.x,d.y)))*0.0800001;
  vec2 wide=d*3.5;
  halo+=(bright(vUv+vec2(wide.x,0.0))+bright(vUv-vec2(wide.x,0.0))+bright(vUv+vec2(0.0,wide.y))+bright(vUv-vec2(0.0,wide.y)))*0.0550001;
  outColor=vec4(texture(tDiffuse,vUv).rgb+halo*uBloom,1.0);
}`;

// three.js's OutputPass (AgX tone mapping, then sRGB) followed by the export's coverage-as-alpha pass.
const OUTPUT_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D tDiffuse;
uniform float uExposure;
in vec2 vUv;
out vec4 outColor;
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(vec3(1.6605,-0.1246,-0.0182),vec3(-0.5876,1.1329,-0.1006),vec3(-0.0728,-0.0083,1.1187));
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(vec3(0.6274,0.0691,0.0164),vec3(0.3293,0.9195,0.0880),vec3(0.0433,0.0113,0.8956));
vec3 contrast(vec3 x){ vec3 x2=x*x; vec3 x4=x2*x2; return 15.5*x4*x2-40.14*x4*x+31.96*x4-6.868*x2*x+0.4298*x2+0.1191*x-0.00232; }
vec3 agx(vec3 color){
  const mat3 inset=mat3(vec3(0.856627153315983,0.137318972929847,0.11189821299995),vec3(0.0951212405381588,0.761241990602591,0.0767994186031903),vec3(0.0482516061458583,0.101439036467562,0.811302368396859));
  const mat3 outset=mat3(vec3(1.1271005818144368,-0.1413297634984383,-0.14132976349843826),vec3(-0.11060664309660323,1.157823702216272,-0.11060664309660294),vec3(-0.016493938717834573,-0.016493938717834257,1.2519364065950405));
  const float minEv=-12.47393; const float maxEv=4.026069;
  color*=uExposure;
  color=LINEAR_SRGB_TO_LINEAR_REC2020*color;
  color=inset*color;
  color=max(color,1e-10);
  color=log2(color);
  color=(color-minEv)/(maxEv-minEv);
  color=clamp(color,0.0,1.0);
  color=contrast(color);
  color=outset*color;
  color=pow(max(vec3(0.0),color),vec3(2.2));
  color=LINEAR_REC2020_TO_LINEAR_SRGB*color;
  return clamp(color,0.0,1.0);
}
vec3 srgb(vec3 c){ return mix(c*12.92, pow(c,vec3(0.41666))*1.055-0.055, step(0.0031308,c)); }
void main(){
  vec3 color=srgb(agx(texture(tDiffuse,vUv).rgb));
  float coverage=max(color.r,max(color.g,color.b));
  outColor=vec4(color,coverage);
}`;

function mount(root, canvas, state) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const half = !!gl.getExtension('EXT_color_buffer_float');
  const FORMAT = half ? [gl.RGBA16F, gl.HALF_FLOAT] : [gl.RGBA8, gl.UNSIGNED_BYTE];
  let quality = 'high', live = false;
  let frame = 0, last = 0, drawnAt = 0, time = 3, visible = true, destroyed = false, lost = false;
  let programs = null, quad = null, disk = null, targets = [], size = '', grid = '';
  const objects = [];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const colors = { uWarm: linear(state.warm), uHighlight: linear(state.highlight), uCool: linear(state.cool), uViolet: linear(state.violet) };

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s); gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    objects.push(() => gl.deleteProgram(p));
    return { p, u };
  }

  function buildDisk(cols, rows) {
    if (disk) { gl.deleteVertexArray(disk.vao); gl.deleteBuffer(disk.vbo); gl.deleteBuffer(disk.ibo); }
    const uv = new Float32Array((cols + 1) * (rows + 1) * 2);
    let k = 0;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { uv[k++] = i / cols; uv[k++] = 1 - j / rows; }
    const index = new Uint32Array(cols * rows * 6);
    k = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + cols + 1;
      index[k++] = a; index[k++] = b; index[k++] = a + 1;
      index[k++] = b; index[k++] = b + 1; index[k++] = a + 1;
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    disk = { vao, vbo, ibo, count: index.length };
  }

  function initialize() {
    programs = {
      lower: program(QUAD_VERTEX, LOWER_FRAGMENT),
      disk: program(DISK_VERTEX, DISK_FRAGMENT),
      blur: program(QUAD_VERTEX, BLUR_FRAGMENT),
      glow: program(QUAD_VERTEX, GLOW_FRAGMENT),
      output: program(QUAD_VERTEX, OUTPUT_FRAGMENT),
    };
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    quad = { vao, vbo };
    objects.push(() => { gl.deleteVertexArray(vao); gl.deleteBuffer(vbo); });
    disk = null; grid = ''; targets = []; size = '';
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  }

  function target(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, FORMAT[0], w, h, 0, gl.RGBA, FORMAT[1], null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb };
  }

  function draw() {
    if (destroyed || lost || !programs) return;
    const tier = TIERS[quality] ?? TIERS.high;
    // the stage is 16:9, contained in the box and centred by CSS
    const width = Math.max(1, Math.min(root.clientWidth, (root.clientHeight * 16) / 9));
    const height = (width * 9) / 16;
    const scale = Math.min(window.devicePixelRatio || 1, tier.dpr, 2400 / width);
    const rw = Math.max(1, Math.round(width * scale)), rh = Math.max(1, Math.round(height * scale));
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    if (canvas.width !== rw || canvas.height !== rh) { canvas.width = rw; canvas.height = rh; }
    const key = `${rw}x${rh}`;
    if (key !== size) {
      for (const t of targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
      targets = [target(rw, rh), target(rw, rh)];
      size = key;
    }
    const gridKey = tier.grid.join('x');
    if (gridKey !== grid) { buildDisk(tier.grid[0], tier.grid[1]); grid = gridKey; }
    const [A, B] = targets;
    gl.viewport(0, 0, rw, rh);

    // 1. the scene, in linear light: lower photon arc, then the disk over it (both opaque, as in the original)
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const { lower, disk: dp, blur, glow, output } = programs;
    gl.useProgram(lower.p);
    gl.uniform1f(lower.u.uTilt, state.tilt); gl.uniform1f(lower.u.uScale, state.scale); gl.uniform1f(lower.u.uChroma, state.chroma);
    gl.uniform3fv(lower.u.uHighlight, colors.uHighlight); gl.uniform3fv(lower.u.uViolet, colors.uViolet);
    gl.bindVertexArray(quad.vao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.useProgram(dp.p);
    gl.uniform1f(dp.u.uTilt, state.tilt); gl.uniform1f(dp.u.uScale, state.scale); gl.uniform1f(dp.u.uArch, state.arch);
    gl.uniform1f(dp.u.uTime, time); gl.uniform1f(dp.u.uChroma, state.chroma); gl.uniform1f(dp.u.uFilaments, state.filaments);
    for (const k in colors) gl.uniform3fv(dp.u[k], colors[k]);
    gl.bindVertexArray(disk.vao); gl.drawElements(gl.TRIANGLES, disk.count, gl.UNSIGNED_INT, 0);

    // 2. blur across, then down: soft at the disk's far edges, sharp at its heart
    gl.bindVertexArray(quad.vao);
    gl.useProgram(blur.p);
    gl.uniform2f(blur.u.uResolution, rw, rh); gl.uniform1f(blur.u.uSoftness, state.softness); gl.uniform1i(blur.u.uStride, tier.stride);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(blur.u.tDiffuse, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb); gl.bindTexture(gl.TEXTURE_2D, A.tex);
    gl.uniform2f(blur.u.uDirection, 1, 0); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb); gl.bindTexture(gl.TEXTURE_2D, B.tex);
    gl.uniform2f(blur.u.uDirection, 0, 1); gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 3. a short glow around the brightest gas
    gl.useProgram(glow.p);
    gl.uniform2f(glow.u.uResolution, rw, rh); gl.uniform1f(glow.u.uBloom, state.bloom); gl.uniform1i(glow.u.tDiffuse, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb); gl.bindTexture(gl.TEXTURE_2D, A.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 4. tone map to the screen, light as coverage over a transparent ground
    gl.useProgram(output.p);
    gl.uniform1f(output.u.uExposure, state.exposure); gl.uniform1i(output.u.tDiffuse, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, B.tex);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    root.dataset.ready = '';
  }

  function tick(now) {
    frame = 0;
    if (now - drawnAt < frameInterval(quality)) { schedule(); return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now; drawnAt = now; time += dt * state.speed;
    draw(); schedule();
  }
  function schedule() {
    if (!frame && !destroyed && !lost && programs && live && visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
  }
  function refresh() { cancelAnimationFrame(frame); frame = 0; last = 0; draw(); schedule(); }
  function onLost(event) { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; delete root.dataset.ready; }
  function onRestored() { lost = false; try { initialize(); refresh(); } catch { programs = null; } }

  try { initialize(); } catch { return null; }
  const resize = new ResizeObserver(refresh); resize.observe(root);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); }, { rootMargin: '80px' });
  intersection.observe(root);
  motion.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  refresh();
  return {
    set(q, l) { quality = q; live = l; refresh(); },
    destroy() {
      destroyed = true; cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect();
      motion.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', refresh);
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
      for (const t of targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
      if (disk) { gl.deleteVertexArray(disk.vao); gl.deleteBuffer(disk.vbo); gl.deleteBuffer(disk.ibo); }
      objects.forEach((release) => release());
    },
  };
}

/** A black hole's accretion disk, its light bent over the top, turning slowly. Fills its parent (16:9, contained). */
export default function BlackHole({ className = '', settings = {} }) {
  const root = useRef(null);
  const scene = useRef(null);
  const { quality, run } = useFx(root);

  useLayoutEffect(() => {
    const el = root.current;
    const s = mount(el, el.querySelector('canvas'), { ...SETTINGS, ...settings });
    if (!s) el.dataset.fallback = '';
    scene.current = s;
    return () => { s?.destroy(); scene.current = null; };
    // settings are read once at mount, like the original export
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scene.current?.set(quality, run);
  }, [quality, run]);

  return (
    <div ref={root} aria-hidden="true" className={`bh-root ${className}`} style={{ position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <canvas style={{ display: 'block' }} />
    </div>
  );
}
