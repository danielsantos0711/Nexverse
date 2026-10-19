import { hash, STAR_KINDS, type Cosmos, type Galaxy, type LinkKind, type Star, type StarKind } from "@/components/cosmos/model"

/**
 * The Cosmos renderer: a 2D canvas with additive glow, slow twinkle and three parallax layers of background stars.
 *
 * Everything expensive is drawn once into sprites (glows, galaxy dust, background tiles) and stamped each frame, so
 * a frame is a few hundred drawImage calls. The loop runs only while the map is on screen and the tab is visible;
 * with reduced motion it draws only when something changes, and camera moves jump instead of flying.
 */

type Camera = { x: number; y: number; z: number }
type Flight = { from: Camera; to: Camera; start: number; duration: number; dip: number }
type Rgb = [number, number, number]

export type EngineEvents = {
  /** The star under the mouse changed (null when it left every star). */
  onHover: (id: string | null) => void
  /** A tap or click without a drag: a star, or empty space (null). */
  onPick: (id: string | null) => void
  /** Called after every drawn frame, so overlays can follow the camera without React renders. */
  onFrame: () => void
}

const DPR_CAP = 1.5
const MAX_ZOOM = 3.2
const FOCUS_ZOOM = 1.55

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r},${g},${b},${a})`
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** A small seeded generator for sprites that must look the same on every visit. */
function rng(seed: number) {
  let s = Math.floor(seed * 4294967296) >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas")
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** A soft round glow in one colour: the halo every star stamps with additive blending. */
function glowSprite(color: Rgb) {
  const c = canvas(128, 128)
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, rgba(color, 0.9))
  grad.addColorStop(0.12, rgba(color, 0.45))
  grad.addColorStop(0.32, rgba(color, 0.12))
  grad.addColorStop(0.6, rgba(color, 0.03))
  grad.addColorStop(1, rgba(color, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return c
}

/** The bright body of a star: a white-hot centre fading through its colour. */
function coreSprite(color: Rgb) {
  const c = canvas(64, 64)
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.22, "rgba(255,255,255,0.95)")
  grad.addColorStop(0.42, rgba(color, 0.9))
  grad.addColorStop(0.7, rgba(color, 0.18))
  grad.addColorStop(1, rgba(color, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return c
}

/** Thin diffraction spikes for the brightest stars, the way a telescope sees them. */
function flareSprite(color: Rgb) {
  const c = canvas(256, 256)
  const g = c.getContext("2d")!
  for (const vertical of [false, true]) {
    const grad = vertical ? g.createLinearGradient(0, 0, 0, 256) : g.createLinearGradient(0, 0, 256, 0)
    grad.addColorStop(0, rgba(color, 0))
    grad.addColorStop(0.5, rgba(color, 0.75))
    grad.addColorStop(1, rgba(color, 0))
    g.fillStyle = grad
    if (vertical) g.fillRect(127, 0, 2, 256)
    else g.fillRect(0, 127, 256, 2)
  }
  return c
}

/** A galaxy's dust: a bulge and two or three spiral arms of tiny grains, drawn once per galaxy. */
function galaxySprite(g: Galaxy, size: number) {
  const c = canvas(size, size)
  const ctx = c.getContext("2d")!
  const tint = rgb(g.tint)
  const half = size / 2
  const scale = half / 1.3
  const rand = rng(g.seed)

  const haze = ctx.createRadialGradient(half, half, 0, half, half, half)
  haze.addColorStop(0, rgba(tint, 0.34))
  haze.addColorStop(0.22, rgba(tint, 0.12))
  haze.addColorStop(0.55, rgba(tint, 0.035))
  haze.addColorStop(1, rgba(tint, 0))
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, size, size)

  ctx.globalCompositeOperation = "lighter"
  const arms = 2 + Math.floor(rand() * 2)
  const twist = 2.4 + rand() * 1.2
  const tilt = 0.62 + rand() * 0.2
  const rot = rand() * Math.PI * 2
  const grains = 4200
  for (let i = 0; i < grains; i++) {
    const bulge = rand() < 0.22
    const t = bulge ? Math.pow(rand(), 2) * 0.35 : Math.pow(rand(), 0.75)
    const arm = (Math.floor(rand() * arms) / arms) * Math.PI * 2
    const spread = (rand() + rand() + rand() - 1.5) * (bulge ? 2.4 : 0.5 * (1 - t * 0.45))
    const a = arm + t * twist + spread + rot
    const d = t * (0.95 + rand() * 0.25)
    const x = Math.cos(a) * d
    const y = Math.sin(a) * d * tilt
    const px = half + x * scale
    const py = half + y * scale
    const warm = rand()
    const color: Rgb = warm < 0.18 ? [255, 236, 214] : warm < 0.5 ? [235, 240, 255] : tint
    const s = rand() < 0.06 ? 2 : 1.2
    ctx.fillStyle = rgba(color, (0.35 + rand() * 0.65) * (1 - t * 0.5))
    ctx.fillRect(px, py, s, s)
  }
  // A few brighter knots along the arms, like star-forming regions.
  for (let i = 0; i < 26; i++) {
    const t = 0.25 + rand() * 0.7
    const a = (Math.floor(rand() * arms) / arms) * Math.PI * 2 + t * twist + rot + (rand() - 0.5) * 0.3
    const px = half + Math.cos(a) * t * scale
    const py = half + Math.sin(a) * t * tilt * scale
    const r = 4 + rand() * 10
    const knot = ctx.createRadialGradient(px, py, 0, px, py, r)
    knot.addColorStop(0, rgba(tint, 0.16))
    knot.addColorStop(1, rgba(tint, 0))
    ctx.fillStyle = knot
    ctx.fillRect(px - r, py - r, r * 2, r * 2)
  }
  return c
}

/** One tile of background stars. Three tiles at different depths make the parallax. */
function starTile(size: number, count: number, minR: number, maxR: number, alpha: [number, number], seed: number, dpr: number) {
  const c = canvas(size * dpr, size * dpr)
  const g = c.getContext("2d")!
  const rand = rng(seed)
  g.scale(dpr, dpr)
  for (let i = 0; i < count; i++) {
    const r = minR + rand() * (maxR - minR)
    const tint = rand()
    const color: Rgb = tint < 0.15 ? [255, 228, 200] : tint < 0.35 ? [200, 216, 255] : [240, 242, 250]
    g.fillStyle = rgba(color, alpha[0] + rand() * (alpha[1] - alpha[0]))
    g.beginPath()
    g.arc(rand() * size, rand() * size, r, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

const LINK_STYLE: Record<LinkKind, { color: Rgb; alpha: number; width: number }> = {
  stack: { color: [216, 197, 158], alpha: 0.34, width: 1.1 },
  thread: { color: [143, 180, 255], alpha: 0.055, width: 0.8 },
  maker: { color: [244, 239, 230], alpha: 0.1, width: 0.8 },
  you: { color: [143, 180, 255], alpha: 0.32, width: 1.1 },
}

export class CosmosEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private backdrop: HTMLCanvasElement
  private bg: CanvasRenderingContext2D
  private backdropKey = ""
  private backdropVersion = 0
  private events: EngineEvents
  private data: Cosmos | null = null
  private cam: Camera = { x: 0, y: 0, z: 0.5 }
  private w = 0
  private h = 0
  private dpr = 1
  private raf = 0
  private last = 0
  private time = 0
  private dirty = true
  private flight: Flight | null = null
  private velocity = { x: 0, y: 0 }
  private onScreen = true
  private paused = false
  private reduced: MediaQueryList
  private font = "system-ui, sans-serif"
  private fitted = false

  private sprites = new Map<string, { glow: HTMLCanvasElement; core: HTMLCanvasElement; flare: HTMLCanvasElement }>()
  private galaxySprites = new Map<string, HTMLCanvasElement>()
  private tiles: { tile: HTMLCanvasElement; size: number; depth: number }[] = []
  private twinklers: { x: number; y: number; r: number; phase: number; speed: number }[] = []
  private neighbours = new Map<string, Set<string>>()
  private phases = new Map<string, number>()

  private visibleKinds = new Set<StarKind>(Object.keys(STAR_KINDS) as StarKind[])
  private highlights = new Set<string>()
  private hoverId: string | null = null
  private focusId: string | null = null
  private selectedId: string | null = null
  private youMode = false

  private pointers = new Map<number, { x: number; y: number }>()
  private drag: { x: number; y: number; moved: number; t: number; pinch: number; mid: { x: number; y: number } } | null = null
  private minimap: HTMLCanvasElement | null = null
  private miniDrag = false

  private resizeObserver: ResizeObserver
  private intersection: IntersectionObserver
  private cleanups: (() => void)[] = []

  /** `el` takes input and draws stars, lines and labels; `backdrop` sits behind it for the layers that rarely change. */
  constructor(el: HTMLCanvasElement, backdrop: HTMLCanvasElement, events: EngineEvents) {
    this.canvas = el
    this.ctx = el.getContext("2d")!
    this.backdrop = backdrop
    this.bg = backdrop.getContext("2d")!
    this.events = events
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    this.font = getComputedStyle(document.body).fontFamily || this.font

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(el)
    this.intersection = new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting
      this.schedule()
    })
    this.intersection.observe(el)

    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Document | MediaQueryList, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(el, "pointerdown", this.pointerDown)
    on(el, "pointermove", this.pointerMove)
    on(el, "pointerup", this.pointerUp)
    on(el, "pointercancel", this.pointerUp)
    on(el, "pointerleave", this.pointerLeave)
    on(el, "wheel", this.wheel, { passive: false })
    on(document, "visibilitychange", () => this.invalidate())
    on(this.reduced, "change", () => this.invalidate())
    this.resize()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.resizeObserver.disconnect()
    this.intersection.disconnect()
    for (const c of this.cleanups) c()
    this.cleanups = []
    this.sprites.clear()
    this.galaxySprites.clear()
    this.tiles = []
  }

  // ─── Public API ──────────────────────────────────────────────────────────────────────────────────────────────

  setData(data: Cosmos) {
    const firstTime = !this.data
    this.data = data
    this.neighbours.clear()
    for (const l of data.links) {
      if (!this.neighbours.has(l.a)) this.neighbours.set(l.a, new Set())
      if (!this.neighbours.has(l.b)) this.neighbours.set(l.b, new Set())
      this.neighbours.get(l.a)!.add(l.b)
      this.neighbours.get(l.b)!.add(l.a)
    }
    for (const s of data.stars) if (!this.phases.has(s.id)) this.phases.set(s.id, hash(s.id) * Math.PI * 2)
    // Galaxy sprites depend on size only, so a galaxy that grew (a new project) is redrawn and the rest are kept.
    for (const g of data.galaxies) {
      const key = `${g.id}:${Math.round(g.radius)}`
      if (!this.galaxySprites.has(key)) {
        for (const k of this.galaxySprites.keys()) if (k.startsWith(`${g.id}:`)) this.galaxySprites.delete(k)
        this.galaxySprites.set(key, galaxySprite(g, 560))
      }
    }
    this.backdropVersion++
    if (firstTime && this.w) this.fit(false)
    this.invalidate()
  }

  setVisibleKinds(kinds: Set<StarKind>) {
    this.visibleKinds = new Set([...kinds, "you"])
    this.invalidate()
  }

  setHighlights(targets: Set<string>, youMode: boolean) {
    this.highlights = targets
    this.youMode = youMode
    this.invalidate()
  }

  setFocus(id: string | null) {
    this.focusId = id
    this.invalidate()
  }

  setSelected(id: string | null) {
    this.selectedId = id
    this.invalidate()
  }

  setPaused(paused: boolean) {
    this.paused = paused
    if (!paused) this.resize()
    this.schedule()
  }

  attachMinimap(el: HTMLCanvasElement | null) {
    this.minimap = el
    if (!el) return
    const down = (e: PointerEvent) => {
      this.miniDrag = true
      el.setPointerCapture(e.pointerId)
      this.miniJump(e)
    }
    const move = (e: PointerEvent) => this.miniDrag && this.miniJump(e)
    const up = () => (this.miniDrag = false)
    el.addEventListener("pointerdown", down)
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
    el.addEventListener("pointercancel", up)
    this.cleanups.push(() => {
      el.removeEventListener("pointerdown", down)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
      el.removeEventListener("pointercancel", up)
    })
    this.invalidate()
  }

  /** Star centre in CSS pixels relative to the canvas, and its drawn radius. */
  screenOf(id: string) {
    const s = this.data?.byId.get(id)
    if (!s) return null
    const { x, y } = this.toScreen(s.x, s.y)
    return { x, y, r: this.starRadius(s), w: this.w, h: this.h }
  }

  isVisible(s: Star) {
    return this.visibleKinds.has(s.kind)
  }

  /** Flies to a star. Zooms in unless already close enough. */
  flyToStar(id: string, opts: { zoom?: number; instant?: boolean } = {}) {
    const s = this.data?.byId.get(id)
    if (!s) return false
    const z = opts.zoom ?? clamp(Math.max(this.cam.z, FOCUS_ZOOM), FOCUS_ZOOM, 2.2)
    // On narrow screens the card covers the bottom, so the star rises a little above centre.
    const lift = this.w < 640 ? (this.h * 0.14) / z : 0
    this.flyTo({ x: s.x, y: s.y + lift, z }, opts.instant)
    return true
  }

  /** Pans just enough to bring a star into view, keeping the zoom. Used when the keyboard hops between stars. */
  reveal(id: string) {
    const p = this.screenOf(id)
    if (!p) return
    const mx = Math.min(140, this.w * 0.2)
    const my = Math.min(120, this.h * 0.2)
    if (p.x > mx && p.x < this.w - mx && p.y > my && p.y < this.h - my) return
    const s = this.data!.byId.get(id)!
    this.flyTo({ x: s.x, y: s.y, z: Math.max(this.cam.z, 0.9) })
  }

  /** Frames a set of stars, for "Where am I": you and everything you liked or saved. */
  frameStars(ids: string[]) {
    const stars = ids.map((id) => this.data?.byId.get(id)).filter((s): s is Star => Boolean(s))
    if (!stars.length || !this.w) return
    const xs = stars.map((s) => s.x)
    const ys = stars.map((s) => s.y)
    const bw = Math.max(...xs) - Math.min(...xs) + 260
    const bh = Math.max(...ys) - Math.min(...ys) + 260
    const z = clamp(Math.min(this.w / bw, this.h / bh), 0.2, FOCUS_ZOOM)
    this.flyTo({ x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, z })
  }

  zoomBy(factor: number) {
    const target = { ...this.cam, z: this.clampZoom(this.cam.z * factor) }
    this.flyTo(target)
  }

  /** Back to the whole map. */
  fit(animate = true) {
    if (!this.data || !this.w) return
    const b = this.data.bounds
    const bw = b.maxX - b.minX
    const bh = b.maxY - b.minY
    // Portrait phones crop the sides rather than shrinking every star to a dot; the minimap shows the rest.
    const portrait = this.h > this.w
    // Leave room for the toolbar at the top and the minimap at the bottom.
    const top = this.w < 640 ? 150 : 104
    const bottom = 28
    const avail = Math.max(200, this.h - top - bottom)
    const z = portrait ? Math.min((this.w / bw) * 1.12, avail / bh) : Math.min(this.w / bw, avail / bh)
    this.fitted = true
    this.flyTo({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 - (top - bottom) / 2 / z, z }, !animate)
  }

  /** Next star from `id` in a direction, for arrow keys: the nearest one inside a 90° cone, preferring straight ahead. */
  neighbourInDirection(id: string | null, dx: number, dy: number, order: Star[]) {
    if (!order.length) return null
    const from = id ? this.data?.byId.get(id) : null
    if (!from) {
      // Start from whichever visible star is closest to the middle of the screen.
      let best: Star | null = null
      let bestD = Infinity
      for (const s of order) {
        const d = (s.x - this.cam.x) ** 2 + (s.y - this.cam.y) ** 2
        if (d < bestD) {
          best = s
          bestD = d
        }
      }
      return best
    }
    let best: Star | null = null
    let bestScore = Infinity
    for (const s of order) {
      if (s.id === from.id) continue
      const vx = s.x - from.x
      const vy = s.y - from.y
      const dist = Math.hypot(vx, vy)
      if (!dist) continue
      const cos = (vx * dx + vy * dy) / dist
      if (cos < 0.5) continue
      const score = dist * (1 + (1 - cos) * 3)
      if (score < bestScore) {
        best = s
        bestScore = score
      }
    }
    return best
  }

  get camera() {
    return this.cam as Readonly<Camera>
  }

  // ─── Camera ──────────────────────────────────────────────────────────────────────────────────────────────────

  private clampZoom(z: number) {
    if (!this.data || !this.w) return clamp(z, 0.1, MAX_ZOOM)
    const b = this.data.bounds
    const min = Math.min(this.w / (b.maxX - b.minX), this.h / (b.maxY - b.minY)) * 0.7
    return clamp(z, min, MAX_ZOOM)
  }

  private clampCamera() {
    if (!this.data) return
    const b = this.data.bounds
    this.cam.x = clamp(this.cam.x, b.minX, b.maxX)
    this.cam.y = clamp(this.cam.y, b.minY, b.maxY)
  }

  private flyTo(to: Camera, instant = false) {
    to = { x: to.x, y: to.y, z: this.clampZoom(to.z) }
    this.velocity = { x: 0, y: 0 }
    if (instant || this.reduced.matches || !this.w) {
      this.flight = null
      this.cam = to
      this.clampCamera()
      this.invalidate()
      return
    }
    const from = { ...this.cam }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const span = (dist * Math.min(from.z, to.z)) / Math.max(1, Math.min(this.w, this.h))
    // Long trips pull back mid-flight, like a map's fly-to, so you see where you are going.
    const dip = clamp(span * 0.45, 0, 1.1)
    const duration = 620 + 520 * clamp(span, 0, 1.4) + 160 * Math.abs(Math.log(to.z / from.z))
    this.flight = { from, to, start: performance.now(), duration, dip }
    this.invalidate()
  }

  private zoomAround(factor: number, sx: number, sy: number) {
    const before = this.toWorld(sx, sy)
    this.cam.z = this.clampZoom(this.cam.z * factor)
    const after = this.toWorld(sx, sy)
    this.cam.x += before.x - after.x
    this.cam.y += before.y - after.y
    this.clampCamera()
    this.invalidate()
  }

  private toScreen(x: number, y: number) {
    return { x: (x - this.cam.x) * this.cam.z + this.w / 2, y: (y - this.cam.y) * this.cam.z + this.h / 2 }
  }

  private toWorld(sx: number, sy: number) {
    return { x: (sx - this.w / 2) / this.cam.z + this.cam.x, y: (sy - this.h / 2) / this.cam.z + this.cam.y }
  }

  /** Stars grow slower than the map when zooming, so close up they spread apart instead of becoming planets. */
  private starRadius(s: Star) {
    return Math.max(1.6, s.r * Math.pow(this.cam.z, 0.55))
  }

  private step(now: number, dt: number) {
    const f = this.flight
    if (f) {
      const t = clamp((now - f.start) / f.duration, 0, 1)
      const e = ease(t)
      const lz = Math.log(f.from.z) + (Math.log(f.to.z) - Math.log(f.from.z)) * e - f.dip * Math.sin(Math.PI * e)
      this.cam = { x: f.from.x + (f.to.x - f.from.x) * e, y: f.from.y + (f.to.y - f.from.y) * e, z: Math.exp(lz) }
      if (t >= 1) {
        this.cam = { ...f.to }
        this.flight = null
      }
      this.dirty = true
    } else if (Math.abs(this.velocity.x) + Math.abs(this.velocity.y) > 0.01) {
      // Inertia after a drag, in world units per millisecond, decaying smoothly.
      this.cam.x -= this.velocity.x * dt
      this.cam.y -= this.velocity.y * dt
      const decay = Math.pow(0.992, dt)
      this.velocity.x *= decay
      this.velocity.y *= decay
      this.clampCamera()
      this.dirty = true
    }
  }

  // ─── Loop ────────────────────────────────────────────────────────────────────────────────────────────────────

  private get running() {
    return this.onScreen && !this.paused && !document.hidden && this.w > 0
  }

  private invalidate() {
    this.dirty = true
    this.schedule()
  }

  private schedule() {
    if (this.raf || !this.running) return
    // With reduced motion nothing twinkles, so frames are drawn only when something changed.
    const animating = !this.reduced.matches || this.flight || Math.abs(this.velocity.x) + Math.abs(this.velocity.y) > 0.01
    if (!animating && !this.dirty) return
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    const dt = this.last ? Math.min(now - this.last, 50) : 16
    this.last = now
    if (!this.reduced.matches) this.time += dt / 1000
    this.step(now, dt)
    this.draw()
    this.drawMinimap()
    this.dirty = false
    this.events.onFrame()
    if (this.running) this.schedule()
    else this.last = 0
  }

  private resize() {
    const box = this.canvas.getBoundingClientRect()
    if (!box.width || !box.height) return
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
    const changedDpr = dpr !== this.dpr || !this.tiles.length
    this.w = box.width
    this.h = box.height
    this.dpr = dpr
    this.canvas.width = this.backdrop.width = Math.round(box.width * dpr)
    this.canvas.height = this.backdrop.height = Math.round(box.height * dpr)
    this.backdropKey = ""
    if (changedDpr) this.buildBackground()
    if (!this.fitted && this.data) this.fit(false)
    this.invalidate()
  }

  private buildBackground() {
    this.tiles = [
      { tile: starTile(640, 340, 0.3, 0.7, [0.18, 0.5], 0.137, this.dpr), size: 640, depth: 0.025 },
      { tile: starTile(720, 120, 0.5, 0.95, [0.3, 0.7], 0.519, this.dpr), size: 720, depth: 0.06 },
      { tile: starTile(900, 40, 0.8, 1.3, [0.45, 0.85], 0.871, this.dpr), size: 900, depth: 0.12 },
    ]
    const rand = rng(0.333)
    this.twinklers = Array.from({ length: 70 }, () => ({ x: rand(), y: rand(), r: 0.6 + rand() * 0.9, phase: rand() * Math.PI * 2, speed: 0.4 + rand() * 1.4 }))
  }

  private spritesFor(color: string) {
    let s = this.sprites.get(color)
    if (!s) {
      const c = rgb(color)
      s = { glow: glowSprite(c), core: coreSprite(c), flare: flareSprite(c) }
      this.sprites.set(color, s)
    }
    return s
  }

  // ─── Drawing ─────────────────────────────────────────────────────────────────────────────────────────────────

  /** The slow layer: parallax stars and galaxy dust. Redrawn only when the camera, size or data change. */
  private drawBackdrop() {
    const { bg, w, h, cam } = this
    const key = `${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(4)},${w},${h},${this.backdropVersion}`
    if (key === this.backdropKey) return
    this.backdropKey = key
    bg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    bg.globalCompositeOperation = "source-over"
    bg.globalAlpha = 1
    bg.clearRect(0, 0, w, h)

    // Background stars: three tiles at different depths, tiled across the view.
    for (const { tile, size, depth } of this.tiles) {
      const ox = (((-cam.x * depth * (0.6 + cam.z * 0.4)) % size) + size) % size
      const oy = (((-cam.y * depth * (0.6 + cam.z * 0.4)) % size) + size) % size
      for (let x = ox - size; x < w; x += size) for (let y = oy - size; y < h; y += size) bg.drawImage(tile, x, y, size, size)
    }

    const data = this.data
    if (!data) return
    // Galaxy dust, additive, fading as you zoom in so it never competes with the stars.
    bg.globalCompositeOperation = "lighter"
    bg.globalAlpha = clamp(1.25 - cam.z * 0.32, 0.45, 1)
    for (const g of data.galaxies) {
      const sprite = this.galaxySprites.get(`${g.id}:${Math.round(g.radius)}`)
      if (!sprite) continue
      const size = g.radius * 2 * 1.5 * cam.z
      const c = this.toScreen(g.x, g.y)
      if (c.x + size / 2 < 0 || c.x - size / 2 > w || c.y + size / 2 < 0 || c.y - size / 2 > h) continue
      bg.drawImage(sprite, c.x - size / 2, c.y - size / 2, size, size)
    }
    bg.globalAlpha = 1
    bg.globalCompositeOperation = "source-over"
  }

  private draw() {
    this.drawBackdrop()
    const { ctx, w, h, cam } = this
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.globalCompositeOperation = "source-over"
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, w, h)

    // A handful of background stars twinkle; they live on this layer so the backdrop can stay still.
    if (!this.reduced.matches) {
      for (const t of this.twinklers) {
        const a = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * t.speed + t.phase))
        const px = (((t.x * w - cam.x * 0.09) % w) + w) % w
        const py = (((t.y * h - cam.y * 0.09) % h) + h) % h
        ctx.fillStyle = `rgba(236,240,255,${a})`
        ctx.fillRect(px, py, t.r, t.r)
      }
    }

    const data = this.data
    if (!data) return
    ctx.globalCompositeOperation = "lighter"

    const active = this.hoverId ?? this.focusId ?? this.selectedId
    const near = active ? this.neighbours.get(active) : null
    const shown = (s: Star) => this.visibleKinds.has(s.kind)

    // Lines, batched by style. Lines touching the active star light up; with "Where am I" on, your lines do.
    ctx.lineCap = "round"
    for (const kind of ["thread", "maker", "stack", "you"] as LinkKind[]) {
      const style = LINK_STYLE[kind]
      const lit: [Star, Star][] = []
      ctx.beginPath()
      let any = false
      for (const l of data.links) {
        if (l.kind !== kind) continue
        const a = data.byId.get(l.a)!
        const b = data.byId.get(l.b)!
        if (!shown(a) || !shown(b)) continue
        if ((active && (l.a === active || l.b === active)) || (kind === "you" && this.youMode)) {
          lit.push([a, b])
          continue
        }
        this.segment(a, b)
        any = true
      }
      if (any) {
        ctx.strokeStyle = rgba(style.color, style.alpha * (active ? 0.55 : 1))
        ctx.lineWidth = style.width
        ctx.stroke()
      }
      if (lit.length) {
        ctx.beginPath()
        for (const [a, b] of lit) this.segment(a, b)
        ctx.strokeStyle = rgba(style.color, Math.min(0.85, style.alpha * 2.6 + 0.25))
        ctx.lineWidth = style.width + 0.4
        if (kind === "you") {
          ctx.setLineDash([4, 6])
          ctx.lineDashOffset = -this.time * 18
        }
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Stars: halo, spikes for the brightest, then the white-hot core.
    const reduced = this.reduced.matches
    for (const s of data.stars) {
      const p = this.toScreen(s.x, s.y)
      const r = this.starRadius(s)
      if (p.x < -r * 8 || p.x > w + r * 8 || p.y < -r * 8 || p.y > h + r * 8) continue
      const visible = shown(s)
      if (!visible) {
        // Filtered out: a faint pinpoint keeps the galaxy's shape without a muddy halo.
        ctx.globalAlpha = 0.16
        ctx.fillStyle = "rgb(233,235,241)"
        ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5)
        continue
      }
      const special = s.id === active || near?.has(s.id) || this.highlights.has(s.id) || s.kind === "you"
      const twinkle = reduced ? 1 : 0.86 + 0.14 * Math.sin(this.time * (0.7 + (this.phases.get(s.id)! % 1) * 1.1) + this.phases.get(s.id)!)
      const dim = active && !special ? 0.6 : 1
      const sp = this.spritesFor(STAR_KINDS[s.kind].color)
      const halo = r * (s.kind === "category" ? 4 + s.weight * 2 : 5.5 + s.weight * 3)
      ctx.globalAlpha = (s.kind === "category" ? 0.28 + 0.3 * s.weight : 0.34 + 0.46 * s.weight) * twinkle * dim
      ctx.drawImage(sp.glow, p.x - halo, p.y - halo, halo * 2, halo * 2)
      if ((s.weight > 0.86 || s.kind === "you" || s.id === active)) {
        const f = r * (5 + s.weight * 6) * (0.9 + 0.1 * twinkle)
        ctx.globalAlpha = 0.5 * twinkle * dim
        ctx.drawImage(sp.flare, p.x - f, p.y - f, f * 2, f * 2)
      }
      ctx.globalAlpha = Math.min(1, (0.75 + 0.25 * twinkle) * dim)
      const core = r * 1.9
      ctx.drawImage(sp.core, p.x - core, p.y - core, core * 2, core * 2)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = "source-over"

    // Rings: liked or saved (gold), focus (ion, solid) and selected (ion, slowly turning dashes).
    for (const s of data.stars) {
      if (!shown(s)) continue
      const isFocus = s.id === this.focusId
      const isSel = s.id === this.selectedId
      const isMine = this.highlights.has(s.id)
      if (!isFocus && !isSel && !isMine && s.id !== this.hoverId && s.kind !== "you") continue
      const p = this.toScreen(s.x, s.y)
      const r = this.starRadius(s)
      if (isMine) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(216,197,158,${this.youMode ? 0.9 : 0.55})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      if (s.kind === "you") {
        const pulse = reduced ? 0.5 : (this.time * 0.5) % 1
        ctx.beginPath()
        ctx.arc(p.x, p.y, r + 6 + pulse * 22, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(143,180,255,${0.5 * (1 - pulse)})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      if (isSel) {
        ctx.beginPath()
        ctx.setLineDash([3, 5])
        ctx.lineDashOffset = -this.time * 8
        ctx.arc(p.x, p.y, r + 9, 0, Math.PI * 2)
        ctx.strokeStyle = "rgba(201,217,255,0.85)"
        ctx.lineWidth = 1.3
        ctx.stroke()
        ctx.setLineDash([])
      }
      if (isFocus || s.id === this.hoverId) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, r + (isFocus ? 7 : 6), 0, Math.PI * 2)
        ctx.strokeStyle = isFocus ? "rgba(143,180,255,1)" : "rgba(233,235,241,0.55)"
        ctx.lineWidth = isFocus ? 2 : 1
        ctx.stroke()
      }
    }

    this.drawLabels(data, active, near ?? null)
  }

  /** A gently curved line between two stars: long links read as routes rather than a tangle of straight cuts. */
  private segment(a: Star, b: Star) {
    const pa = this.toScreen(a.x, a.y)
    const pb = this.toScreen(b.x, b.y)
    const dx = pb.x - pa.x
    const dy = pb.y - pa.y
    const bend = 0.14
    this.ctx.moveTo(pa.x, pa.y)
    this.ctx.quadraticCurveTo((pa.x + pb.x) / 2 - dy * bend, (pa.y + pb.y) / 2 + dx * bend, pb.x, pb.y)
  }

  private drawLabels(data: Cosmos, active: string | null, near: Set<string> | null) {
    const { ctx, cam, w, h } = this
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"

    // Galaxy names, until you are close enough to read the stars themselves.
    const gAlpha = clamp((1.5 - cam.z) / 0.6, 0, 1)
    if (gAlpha > 0.01) {
      for (const g of data.galaxies) {
        const p = this.toScreen(g.x, g.y - g.radius * 0.92)
        if (p.x < -200 || p.x > w + 200 || p.y < -40 || p.y > h + 40) continue
        ctx.font = `600 11px ${this.font}`
        ctx.letterSpacing = "0.14em"
        ctx.fillStyle = rgba(rgb(g.tint), 0.85 * gAlpha)
        ctx.fillText(g.name.toUpperCase(), p.x, p.y)
        ctx.letterSpacing = "0px"
        ctx.font = `400 11px ${this.font}`
        ctx.fillStyle = `rgba(148,156,173,${0.8 * gAlpha})`
        ctx.fillText(g.count ? `${g.count} ${g.count === 1 ? "star" : "stars"}` : "No stars yet", p.x, p.y + 15)
      }
    }

    // Star names: the important ones first, skipping any that would overlap one already placed.
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
    const candidates: { s: Star; pri: number }[] = []
    for (const s of data.stars) {
      if (!this.visibleKinds.has(s.kind)) continue
      const r = this.starRadius(s)
      const special = s.id === active || s.id === this.focusId || s.id === this.selectedId || s.kind === "you" || (this.youMode && this.highlights.has(s.id))
      const show = special || near?.has(s.id) || cam.z > 1.15 || (cam.z > 0.62 && s.weight > 0.72) || (cam.z > 0.85 && s.weight > 0.5)
      if (!show) continue
      const p = this.toScreen(s.x, s.y)
      if (p.x < -80 || p.x > w + 80 || p.y < -20 || p.y > h + 30) continue
      candidates.push({ s, pri: (special ? 10 : near?.has(s.id) ? 5 : 0) + s.weight + r * 0.01 })
    }
    candidates.sort((a, b) => b.pri - a.pri)
    for (const { s, pri } of candidates) {
      const p = this.toScreen(s.x, s.y)
      const r = this.starRadius(s)
      const strong = pri >= 10
      ctx.font = `${strong ? 600 : 500} ${strong ? 13 : 12}px ${this.font}`
      const tw = ctx.measureText(s.name).width
      const y = p.y + r + 15
      const box = { x0: p.x - tw / 2 - 4, y0: y - 12, x1: p.x + tw / 2 + 4, y1: y + 4 }
      if (!strong && placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue
      placed.push(box)
      // A dark outline keeps names readable over bright dust without a costly shadow.
      ctx.lineWidth = 3
      ctx.strokeStyle = "rgba(5,6,10,0.75)"
      ctx.strokeText(s.name, p.x, y)
      ctx.fillStyle = strong ? "rgba(244,246,251,1)" : `rgba(220,226,238,${0.62 + 0.3 * s.weight})`
      ctx.fillText(s.name, p.x, y)
    }
  }

  private drawMinimap() {
    const el = this.minimap
    const data = this.data
    if (!el || !data) return
    const box = el.getBoundingClientRect()
    if (!box.width) return
    const dpr = this.dpr
    if (el.width !== Math.round(box.width * dpr)) {
      el.width = Math.round(box.width * dpr)
      el.height = Math.round(box.height * dpr)
    }
    const g = el.getContext("2d")!
    const b = data.bounds
    const s = Math.min(box.width / (b.maxX - b.minX), box.height / (b.maxY - b.minY))
    const ox = (box.width - (b.maxX - b.minX) * s) / 2
    const oy = (box.height - (b.maxY - b.minY) * s) / 2
    const mx = (x: number) => ox + (x - b.minX) * s
    const my = (y: number) => oy + (y - b.minY) * s
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, box.width, box.height)
    g.globalCompositeOperation = "lighter"
    for (const gal of data.galaxies) {
      const r = gal.radius * s * 1.1
      const grad = g.createRadialGradient(mx(gal.x), my(gal.y), 0, mx(gal.x), my(gal.y), r)
      grad.addColorStop(0, rgba(rgb(gal.tint), 0.35))
      grad.addColorStop(1, rgba(rgb(gal.tint), 0))
      g.fillStyle = grad
      g.fillRect(mx(gal.x) - r, my(gal.y) - r, r * 2, r * 2)
    }
    for (const st of data.stars) {
      if (!this.visibleKinds.has(st.kind)) continue
      g.fillStyle = this.highlights.has(st.id) || st.kind === "you" ? "rgba(216,197,158,1)" : "rgba(233,235,241,0.7)"
      const d = st.kind === "you" ? 3 : 1.4
      g.fillRect(mx(st.x) - d / 2, my(st.y) - d / 2, d, d)
    }
    g.globalCompositeOperation = "source-over"
    const tl = this.toWorld(0, 0)
    const br = this.toWorld(this.w, this.h)
    const x0 = clamp(mx(tl.x), 0, box.width)
    const y0 = clamp(my(tl.y), 0, box.height)
    const x1 = clamp(mx(br.x), 0, box.width)
    const y1 = clamp(my(br.y), 0, box.height)
    g.strokeStyle = "rgba(143,180,255,0.9)"
    g.lineWidth = 1
    g.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(2, x1 - x0 - 1), Math.max(2, y1 - y0 - 1))
    g.fillStyle = "rgba(143,180,255,0.08)"
    g.fillRect(x0, y0, x1 - x0, y1 - y0)
  }

  private miniJump(e: PointerEvent) {
    const el = this.minimap
    const data = this.data
    if (!el || !data) return
    const box = el.getBoundingClientRect()
    const b = data.bounds
    const s = Math.min(box.width / (b.maxX - b.minX), box.height / (b.maxY - b.minY))
    const ox = (box.width - (b.maxX - b.minX) * s) / 2
    const oy = (box.height - (b.maxY - b.minY) * s) / 2
    this.flight = null
    this.velocity = { x: 0, y: 0 }
    this.cam.x = b.minX + (e.clientX - box.left - ox) / s
    this.cam.y = b.minY + (e.clientY - box.top - oy) / s
    this.clampCamera()
    this.invalidate()
  }

  // ─── Pointer input ───────────────────────────────────────────────────────────────────────────────────────────

  private local(e: PointerEvent | WheelEvent) {
    const box = this.canvas.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  /** The visible star under a point, with a generous target on touch screens. */
  hit(sx: number, sy: number, coarse = false) {
    const data = this.data
    if (!data) return null
    let best: Star | null = null
    let bestD = Infinity
    for (const s of data.stars) {
      if (!this.visibleKinds.has(s.kind)) continue
      const p = this.toScreen(s.x, s.y)
      const d = Math.hypot(p.x - sx, p.y - sy)
      const reach = Math.max(this.starRadius(s) * 1.5 + 4, coarse ? 22 : 12)
      if (d < reach && d < bestD) {
        best = s
        bestD = d
      }
    }
    return best
  }

  private setHover(id: string | null) {
    if (id === this.hoverId) return
    this.hoverId = id
    this.canvas.style.cursor = id ? "pointer" : "grab"
    this.events.onHover(id)
    this.invalidate()
  }

  private pointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return
    this.canvas.setPointerCapture(e.pointerId)
    const p = this.local(e)
    this.pointers.set(e.pointerId, p)
    this.flight = null
    this.velocity = { x: 0, y: 0 }
    if (this.pointers.size === 1) {
      this.drag = { x: p.x, y: p.y, moved: 0, t: performance.now(), pinch: 0, mid: p }
      if (e.pointerType === "mouse") this.canvas.style.cursor = "grabbing"
    } else if (this.pointers.size === 2 && this.drag) {
      const [a, b] = [...this.pointers.values()]
      this.drag.pinch = Math.hypot(a.x - b.x, a.y - b.y)
      this.drag.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      this.drag.moved = 99
    }
  }

  private pointerMove = (e: PointerEvent) => {
    const p = this.local(e)
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === "mouse") this.setHover(this.hit(p.x, p.y)?.id ?? null)
      return
    }
    const prev = this.pointers.get(e.pointerId)!
    this.pointers.set(e.pointerId, p)
    const d = this.drag
    if (!d) return
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (d.pinch) this.zoomAround(dist / d.pinch, mid.x, mid.y)
      this.cam.x -= (mid.x - d.mid.x) / this.cam.z
      this.cam.y -= (mid.y - d.mid.y) / this.cam.z
      d.pinch = dist
      d.mid = mid
      this.clampCamera()
      this.invalidate()
      return
    }
    const dx = p.x - prev.x
    const dy = p.y - prev.y
    d.moved += Math.abs(dx) + Math.abs(dy)
    if (d.moved < 4) return
    this.cam.x -= dx / this.cam.z
    this.cam.y -= dy / this.cam.z
    const now = performance.now()
    const dt = Math.max(1, now - d.t)
    d.t = now
    // Smoothed velocity for the throw when the finger lifts.
    this.velocity = { x: this.velocity.x * 0.6 + ((dx / this.cam.z) / dt) * 0.4, y: this.velocity.y * 0.6 + ((dy / this.cam.z) / dt) * 0.4 }
    this.clampCamera()
    if (this.hoverId) this.setHover(null)
    this.invalidate()
  }

  private pointerUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    this.pointers.delete(e.pointerId)
    const d = this.drag
    if (this.pointers.size > 0) {
      // One finger of a pinch lifted: keep panning with the other.
      const [rest] = [...this.pointers.values()]
      if (d) {
        d.pinch = 0
        d.mid = rest
      }
      return
    }
    this.drag = null
    this.canvas.style.cursor = this.hoverId ? "pointer" : "grab"
    if (d && d.moved < 6 && e.type === "pointerup") {
      const p = this.local(e)
      const s = this.hit(p.x, p.y, e.pointerType !== "mouse")
      this.events.onPick(s?.id ?? null)
      this.velocity = { x: 0, y: 0 }
    } else if (this.reduced.matches || performance.now() - (d?.t ?? 0) > 80) {
      this.velocity = { x: 0, y: 0 }
    }
    this.invalidate()
  }

  private pointerLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && !this.pointers.size) this.setHover(null)
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault()
    this.flight = null
    const p = this.local(e)
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    // Trackpad pinch arrives as ctrl+wheel with small deltas; both feel the same here.
    this.zoomAround(Math.exp(-clamp(delta, -120, 120) * (e.ctrlKey ? 0.01 : 0.0022)), p.x, p.y)
  }
}
