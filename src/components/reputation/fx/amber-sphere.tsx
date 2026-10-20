"use client"

import { useEffect, useRef, useState } from "react"
import { useQuality } from "@/lib/perf"
import { cn } from "@/lib/utils"

/*
 * HorizonX "Amber Sphere" for a member's level: a shell of dust that a light travels through on a slow
 * figure-eight. Ported from the export's three.js renderer to plain WebGL 1 points (the site has no three.js):
 * the vertex and fragment shaders, the particle field and the light's path are the export's; the bloom pass is
 * replaced by a soft CSS glow, and the camera is a fixed perspective written in the shader. Tinted by the level
 * (`amber` and `gold`), brighter as the member nears the next level (`energy`). Particles scale with the size
 * and quality; at low or off quality, under reduced motion or without WebGL it is a still CSS sphere. Draws only
 * while on screen and the tab is visible, at most 30 frames a second, devicePixelRatio capped at 1.5.
 */

const NOISE = `
float hash31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)),f.x), mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x), mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}`

const VERT = `
precision highp float;
uniform float uTime, uDpr, uScale, uIntensity, uTurbulence, uCameraDistance, uFocal;
uniform vec3 uAmber, uGold, uLight, uWakeNear, uWakeFar;
attribute vec3 position;
attribute vec4 aSeed;
varying vec3 vColor;
${NOISE}
void main(){
  float t = uTime;
  vec3 p = position;
  float kind = aSeed.w;
  vec3 n = normalize(p);
  float angle = t*(0.037 + 0.024*n.y) + 0.09*sin(t*0.17+n.y*5.0);
  float c = cos(angle), s = sin(angle);
  n.xz = mat2(c,-s,s,c)*n.xz;
  vec3 flow = vec3(-3.1*cos(n.z*3.1+t*0.23), -3.7*cos(n.x*3.7-t*0.19), -3.3*cos(n.y*3.3+t*0.16));
  flow -= n * dot(n, flow);
  n = normalize(n + flow*uTurbulence*0.35);
  float r = length(p) + 0.005*sin(t*0.5+aSeed.x*6.283);
  p = n*r;
  float grain = noise3(n*6.5 + vec3(0.0,t*0.065,t*0.025));
  float front = smoothstep(-0.25,0.55,n.z);
  float edge = pow(1.0-abs(n.z),4.0);
  float densityLight = smoothstep(0.18,0.83,grain);
  float light = (0.055 + 0.16*(n.y*0.5+0.5) + 0.29*edge) * (0.20 + densityLight*1.5) * (0.13 + 0.87*front);
  if (kind > 0.5) light *= 0.24;
  vec3 toLight = p-uLight;
  vec3 toWakeNear = p-uWakeNear;
  vec3 toWakeFar = p-uWakeFar;
  float distanceSq = dot(toLight,toLight);
  float coreLight = exp(-distanceSq/0.045);
  float movingLight = 3.6*coreLight + 1.05*exp(-distanceSq/0.23) + 0.85*exp(-dot(toWakeNear,toWakeNear)/0.15) + 0.38*exp(-dot(toWakeFar,toWakeFar)/0.22);
  float depth = smoothstep(-0.85,0.7,p.z);
  light += movingLight*(0.52+0.48*depth)*(0.40+0.75*densityLight)*mix(1.0,2.6,kind);
  light *= 0.22 + pow(aSeed.y,2.6)*1.9;
  float glint = pow(max(0.0,sin(t*0.42+aSeed.x*6.283)),18.0);
  light += glint*step(0.986,aSeed.y)*0.27*front;
  light *= 0.97 + 0.03*sin(t*0.41);
  float z = p.z - uCameraDistance;
  gl_Position = vec4(p.x*uFocal, p.y*uFocal, 0.0, -z);
  float pointSize = mix(0.9,2.6,pow(aSeed.z,2.1));
  gl_PointSize = clamp(pointSize*uDpr*uScale*(uCameraDistance/-z), 0.85*uDpr, 7.0);
  float gold = clamp(aSeed.y*0.42 + max(p.y,0.0)*0.12,0.0,0.8);
  vec3 dustColor = mix(uAmber,uGold,gold);
  dustColor = mix(dustColor, uGold*1.15, coreLight*0.68);
  vColor = dustColor*light*uIntensity*2.1;
}`

const FRAG = `
precision mediump float;
varying vec3 vColor;
void main(){
  float d = length(gl_PointCoord-0.5)*2.0;
  if (d > 1.0) discard;
  float core = exp(-d*d*6.0);
  float feather = 1.0-smoothstep(0.7,1.0,d);
  // premultiplied, additive: the page shows through the gaps
  vec3 rgb = vColor*core*feather;
  gl_FragColor = vec4(rgb, max(rgb.r, max(rgb.g, rgb.b)));
}`

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296
  }
}

function particles(count: number) {
  const rand = rng(47237)
  const pos = new Float32Array(count * 3)
  const seeds = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    const type = rand() < 0.2 ? 1 : 0
    const y = rand() * 2 - 1
    const a = rand() * Math.PI * 2
    const ring = Math.sqrt(1 - y * y)
    const r = type === 1 ? Math.cbrt(rand()) * 0.96 : 0.987 + (rand() - 0.5) * 0.028
    pos.set([ring * Math.cos(a) * r, y * r, ring * Math.sin(a) * r], i * 3)
    seeds.set([rand(), rand(), rand(), type], i * 4)
  }
  return { pos, seeds }
}

function lightPosition(t: number): [number, number, number] {
  const phase = t * 0.12
  const x = 0.84 * Math.sin(phase)
  const y = 0.6 * Math.sin(phase * 2 + 0.3)
  const tilt = 0.32 * Math.sin(t * 0.037)
  return [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt), 0.42 * Math.cos(phase + 0.4)]
}

const rgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.replace("#", ""), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

type Opts = { amber: string; gold: string; energy: number; count: number }

function mount(canvas: HTMLCanvasElement, opts: Opts, onLost: () => void) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" })
  if (!gl) return null
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = shader(gl.VERTEX_SHADER, VERT)
  const fs = shader(gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)

  const { pos, seeds } = particles(opts.count)
  const bufs = [gl.createBuffer(), gl.createBuffer()]
  const attr = (name: string, data: Float32Array, size: number, buf: WebGLBuffer | null) => {
    const loc = gl.getAttribLocation(prog, name)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
  }
  attr("position", pos, 3, bufs[0])
  attr("aSeed", seeds, 4, bufs[1])
  const u = Object.fromEntries(
    ["uTime", "uDpr", "uScale", "uIntensity", "uTurbulence", "uCameraDistance", "uFocal", "uAmber", "uGold", "uLight", "uWakeNear", "uWakeFar"].map((k) => [k, gl.getUniformLocation(prog, k)])
  )
  gl.disable(gl.DEPTH_TEST)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE)
  gl.clearColor(0, 0, 0, 0)

  // The export's camera: 36 degree field of view, distance so the sphere fills 70% of the short side.
  const focal = 1 / Math.tan((18 * Math.PI) / 180)
  const distance = 1 / Math.sin((18 * Math.PI) / 180) / 0.7
  const motion = matchMedia("(prefers-reduced-motion: reduce)")
  let raf = 0
  let last = 0
  let lastDraw = 0
  let time = 9
  let visible = true
  let dead = false

  const draw = () => {
    const w = Math.max(1, canvas.clientWidth)
    const h = Math.max(1, canvas.clientHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const rw = Math.round(w * dpr)
    const rh = Math.round(h * dpr)
    if (canvas.width !== rw || canvas.height !== rh) {
      canvas.width = rw
      canvas.height = rh
    }
    gl.viewport(0, 0, rw, rh)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform1f(u.uTime, time)
    gl.uniform1f(u.uDpr, dpr)
    gl.uniform1f(u.uScale, Math.max(0.55, Math.min(Math.min(w, h) / 320, 1.1)))
    // small spheres hold fewer, brighter grains; the energy lifts them toward the next level
    gl.uniform1f(u.uIntensity, (2.6 + 1.0 * opts.energy) * Math.max(1, 22000 / opts.count) ** 0.35)
    gl.uniform1f(u.uTurbulence, 0.052)
    gl.uniform1f(u.uCameraDistance, distance)
    gl.uniform1f(u.uFocal, focal)
    gl.uniform3fv(u.uAmber, rgb(opts.amber))
    gl.uniform3fv(u.uGold, rgb(opts.gold))
    gl.uniform3fv(u.uLight, lightPosition(time))
    gl.uniform3fv(u.uWakeNear, lightPosition(time - 2.4))
    gl.uniform3fv(u.uWakeFar, lightPosition(time - 5.2))
    gl.drawArrays(gl.POINTS, 0, opts.count)
  }
  const tick = (now: number) => {
    raf = 0
    if (now - lastDraw >= 1000 / 30 - 2) {
      time += last ? Math.min((now - last) / 1000, 0.05) * (0.9 + opts.energy * 0.6) : 0
      last = now
      lastDraw = now
      draw()
    }
    schedule()
  }
  const schedule = () => {
    if (!raf && !dead && visible && !document.hidden && !motion.matches) raf = requestAnimationFrame(tick)
    else if (!raf) last = 0
  }
  const refresh = () => {
    cancelAnimationFrame(raf)
    raf = 0
    last = 0
    draw()
    schedule()
  }
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    refresh()
  })
  io.observe(canvas)
  // a lost context (GPU reset, too many contexts on the page) hands over to the still sphere
  const lost = (e: Event) => {
    e.preventDefault()
    dead = true
    cancelAnimationFrame(raf)
    onLost()
  }
  canvas.addEventListener("webglcontextlost", lost)
  const ro = new ResizeObserver(refresh)
  ro.observe(canvas)
  document.addEventListener("visibilitychange", refresh)
  motion.addEventListener("change", refresh)
  refresh()
  return () => {
    dead = true
    cancelAnimationFrame(raf)
    canvas.removeEventListener("webglcontextlost", lost)
    io.disconnect()
    ro.disconnect()
    document.removeEventListener("visibilitychange", refresh)
    motion.removeEventListener("change", refresh)
    bufs.forEach((b) => gl.deleteBuffer(b))
    gl.deleteProgram(prog)
    gl.getExtension("WEBGL_lose_context")?.loseContext()
  }
}

export function AmberSphere({ amber, gold, energy = 0.5, size = 112, className }: { amber: string; gold: string; energy?: number; size?: number; className?: string }) {
  const quality = useQuality()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [gl, setGl] = useState(false)
  const [failed, setFailed] = useState(false)
  const allowed = quality === "high" || quality === "medium"

  useEffect(() => {
    const cv = canvas.current
    if (!allowed || failed || !cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    // grains by area: about 22,000 for a 320px sphere at high quality
    const count = Math.round(Math.min(22000, Math.max(5000, size * size * 0.22)) * (quality === "high" ? 1 : 0.6))
    const dispose = mount(cv, { amber, gold, energy, count }, () => {
      setGl(false)
      setFailed(true)
    })
    if (!dispose) return
    setGl(true)
    return () => {
      dispose()
      setGl(false)
    }
  }, [allowed, failed, quality, amber, gold, energy, size])

  return (
    <span aria-hidden className={cn("relative block shrink-0", className)} style={{ width: size, height: size }}>
      {/* the glow the export's bloom pass gave, and the still sphere when there is no WebGL */}
      <span className="absolute inset-[12%] rounded-full blur-xl" style={{ background: `radial-gradient(closest-side, ${amber}55, transparent)` }} />
      {!gl && (
        <span
          className="absolute inset-[15%] rounded-full"
          style={{ background: `radial-gradient(circle at 38% 32%, ${gold}cc, ${amber}66 45%, transparent 72%)`, boxShadow: `inset 0 0 0 1px ${gold}33` }}
        />
      )}
      {allowed && !failed && <canvas ref={canvas} className={cn("absolute inset-0 size-full", !gl && "invisible")} />}
    </span>
  )
}
