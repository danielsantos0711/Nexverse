"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/*
 * Daniel's N as real liquid metal (round 12c: "o N está igual"). The outline is his own file (n-chrome-alpha.webp),
 * never redrawn or deformed: only its alpha is read. From it we build a soft height field (the alpha blurred at two
 * radii), and a small WebGL shader lights that relief like polished mercury: a studio of soft light bands reflected
 * in the surface, slowly flowing, with a bright rim and a slightly see-through body. The still image shows first
 * and stays under reduced motion, without WebGL, or on the low/off device tiers.
 */

const SRC = "/brand/n-chrome-alpha.webp"
const FW = 640
const FH = 594 // the N's own box in the file: 1000 × 928 from y = 36

const VERT = `attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;uv.y=1.-uv.y;gl_Position=vec4(p,0.,1.);}`
const FRAG = `precision highp float;
varying vec2 uv;uniform sampler2D f;uniform float t;uniform vec2 px;
float h(vec2 q){vec4 s=texture2D(f,q);return s.g*.55+s.b*.45;}
float n2(vec2 q){return sin(q.x)*sin(q.y);}
void main(){
  vec4 s=texture2D(f,uv);float a=s.r;if(a<.003){gl_FragColor=vec4(0.);return;}
  vec2 e=px*2.;
  float dx=h(uv+vec2(e.x,0.))-h(uv-vec2(e.x,0.));
  float dy=h(uv+vec2(0.,e.y))-h(uv-vec2(0.,e.y));
  vec3 nrm=normalize(vec3(-dx*9.,-dy*9.,1.));
  // the liquid: the normal ripples slowly, like a surface still settling
  vec2 w=uv*6.+vec2(t*.23,-t*.17);
  nrm.xy+=.06*vec2(n2(w+n2(w.yx*1.3+t*.3)),n2(w.yx*1.1-t*.2));
  nrm=normalize(nrm);
  vec3 r=reflect(vec3(0.,0.,-1.),nrm);
  // studio: soft horizontal light bands that drift, a dark horizon, a cool sky
  float y=r.y+.18*sin(r.x*2.4+t*.35);
  float bands=.55+.45*sin(y*7.5-t*.5);
  float env=mix(.32,1.,smoothstep(-.15,.55,y))*(.55+.45*bands);
  env+=.9*pow(max(0.,1.-abs(y-.42)*6.),3.);           // key light
  env+=.35*pow(max(0.,1.-abs(r.x+.55)*4.),4.);          // side strip
  env*=1.-.35*smoothstep(.0,-.35,y);                    // horizon
  float fres=pow(1.-max(nrm.z,0.),2.2);
  vec3 col=vec3(env)*vec3(.93,.95,1.)+fres*vec3(.75,.8,.9);
  col=mix(col,vec3(.12,.13,.15),.1*(1.-fres));
  // a body you can almost see through, opaque at the rim
  float body=mix(.93,1.,clamp(fres*2.+(1.-s.g)*1.5,0.,1.));
  float A=a*body;
  gl_FragColor=vec4(col*A,A);
}`

/** Box blur of one channel, three passes (close to a Gaussian). Done by hand: Safari ignores canvas `filter`. */
function blur(src: Float32Array, r: number): Float32Array {
  let a: Float32Array = src
  let b: Float32Array = new Float32Array(a.length)
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < FH; y++) {
      let acc = 0
      for (let x = -r; x <= r; x++) acc += a[y * FW + Math.min(FW - 1, Math.max(0, x))]
      for (let x = 0; x < FW; x++) {
        b[y * FW + x] = acc / (2 * r + 1)
        acc += a[y * FW + Math.min(FW - 1, x + r + 1)] - a[y * FW + Math.max(0, x - r)]
      }
    }
    ;[a, b] = [b, a]
    for (let x = 0; x < FW; x++) {
      let acc = 0
      for (let y = -r; y <= r; y++) acc += a[Math.min(FH - 1, Math.max(0, y)) * FW + x]
      for (let y = 0; y < FH; y++) {
        b[y * FW + x] = acc / (2 * r + 1)
        acc += a[Math.min(FH - 1, y + r + 1) * FW + x] - a[Math.max(0, y - r) * FW + x]
      }
    }
    ;[a, b] = [b, a]
  }
  return a
}

function buildField(img: HTMLImageElement) {
  const c = document.createElement("canvas")
  c.width = FW
  c.height = FH
  const g = c.getContext("2d", { willReadFrequently: true })!
  g.drawImage(img, 0, 36, 1000, 928, 0, 0, FW, FH)
  const px = g.getImageData(0, 0, FW, FH).data
  const a0 = new Float32Array(FW * FH)
  for (let i = 0; i < a0.length; i++) a0[i] = px[i * 4 + 3]
  const a1 = blur(a0, Math.round(FW / 150))
  const a2 = blur(a0, Math.round(FW / 50))
  const out = new Uint8Array(FW * FH * 4)
  for (let i = 0; i < a0.length; i++) {
    out[i * 4] = a0[i]
    out[i * 4 + 1] = a1[i]
    out[i * 4 + 2] = a2[i]
    out[i * 4 + 3] = 255
  }
  return out
}

export function LiquidN({ className, style, still = false, priority = false }: { className?: string; style?: React.CSSProperties; still?: boolean; priority?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || still) return
    const fx = document.documentElement.dataset.fx
    if (fx === "off" || fx === "low") return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true })
    if (!gl) return
    let raf = 0
    let alive = true
    let visible = true
    const img = new Image()
    img.decoding = "async"
    img.src = SRC
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, "p")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uT = gl.getUniformLocation(prog, "t")
    gl.uniform2f(gl.getUniformLocation(prog, "px"), 1 / FW, 1 / FH)

    const size = () => {
      const r = canvas.getBoundingClientRect()
      const d = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(r.width * d))
      canvas.height = Math.max(1, Math.round(r.height * d))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    const t0 = performance.now()
    const draw = () => {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(uT, reduced ? 2 : (performance.now() - t0) / 1000)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const loop = () => {
      raf = 0
      if (!alive) return
      draw()
      if (!reduced && visible && !document.hidden) raf = requestAnimationFrame(loop)
    }
    const kick = () => {
      if (!raf && alive) raf = requestAnimationFrame(loop)
    }
    const ro = new ResizeObserver(() => {
      size()
      kick()
    })
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      kick()
    })
    img.onload = () => {
      if (!alive) return
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildField(img))
      size()
      ro.observe(canvas)
      io.observe(canvas)
      document.addEventListener("visibilitychange", kick)
      setLive(true)
      kick()
    }
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener("visibilitychange", kick)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  }, [still])

  return (
    <span className={cn("relative block shrink-0", className)} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/n-liquid-512.webp" alt="" draggable={false} fetchPriority={priority ? "high" : undefined} className={cn("absolute inset-0 size-full object-contain transition-opacity duration-700", live && "opacity-0")} />
      <canvas ref={ref} aria-hidden className={cn("absolute inset-0 size-full transition-opacity duration-700", live ? "opacity-100" : "opacity-0")} />
    </span>
  )
}
