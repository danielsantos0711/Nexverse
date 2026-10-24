/*
 * The page shaders Nexverse draws itself (launch pass 2, Daniel: "queria que as paginas usassem um shader
 * diferente, até tu podes criar para condizer com a pagina em si"). Each is a GLSL `field()` that returns the
 * amount of silver light at a point; hx/field.jsx runs it on a transparent canvas. Coordinates: `p` is centred,
 * one unit = the backdrop's height, x runs from -u_aspect/2 to +u_aspect/2; `uv` is 0..1; `u_px` is one pixel.
 * The title sits on the left, so each motif leans to the right. Monochrome only; the colour comes from the runner.
 */

/** News: an oscilloscope, signals arriving across a faint graticule. */
export const signal = `
float field(vec2 uv, vec2 p, float t) {
  float I = 0.0;
  vec2 g = abs(fract(p * vec2(6.0, 6.0)) - 0.5);
  I += (glow(g.x, u_px * 6.0 * 0.9) + glow(g.y, u_px * 6.0 * 0.9)) * 0.05;
  float cx = u_aspect * 0.22;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float env = exp(-pow((p.x - cx + fi * 0.18) * 0.75, 2.0));
    float y = (fi - 2.0) * 0.1 + (0.05 + 0.04 * sin(t * 0.4 + fi)) * env * sin(p.x * (5.0 + fi * 2.3) - t * (1.1 + fi * 0.3) + fi * 1.7) * (0.6 + 0.4 * sin(p.x * 1.1 + t * 0.25 + fi));
    float d = abs(p.y - y);
    float pulse = 0.35 + 0.65 * exp(-pow(fract((p.x * 0.35 - t * 0.12 + fi * 0.21)) - 0.5, 2.0) * 40.0);
    I += (glow(d, u_px * 1.4) * 0.8 + glow(d, 0.018) * 0.12) * (0.25 + 0.75 * env) * pulse;
  }
  return I;
}`

/** Events: tilted orbits around a meeting point, a body travelling on each one. */
export const orbits = `
float field(vec2 uv, vec2 p, float t) {
  vec2 c = vec2(u_aspect * 0.22, 0.02);
  vec2 q = p - c;
  q = rot(-0.18) * q;
  vec2 e = q * vec2(1.0, 2.8);
  float r = length(e);
  float I = glow(r, 0.09) * 0.35 + glow(r, 0.025) * 0.5;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ri = 0.2 + fi * 0.17;
    float front = q.y < 0.0 ? 1.0 : 0.55;
    I += glow(abs(r - ri), u_px * 2.4) * 0.38 * front;
    float a = t * 0.5 / (1.0 + fi * 0.6) + fi * 2.4;
    vec2 body = vec2(cos(a), sin(a) / 2.8) * ri;
    float d = length(q - body);
    I += glow(d, 0.008) * 1.2 + glow(d, 0.035) * 0.22;
  }
  return I;
}`

/** Crews and People: a living constellation, stars that drift, twinkle and link to their neighbours. */
export const constellation = `
vec2 star(vec2 id, float t) { float h = hash(id); return id + 0.5 + 0.34 * vec2(sin(t * 0.35 + h * 6.28), cos(t * 0.3 + h * 9.1)); }
float field(vec2 uv, vec2 p, float t) {
  vec2 g = p * 5.5 + vec2(t * 0.04, 0.0);
  vec2 id = floor(g);
  float px = u_px * 5.5;
  float I = 0.0;
  vec2 c = star(id, t);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 n = id + vec2(float(x), float(y));
    vec2 s = star(n, t);
    float tw = 0.55 + 0.45 * sin(t * 2.0 + hash(n) * 40.0);
    I += glow(length(g - s), px * 2.2) * tw;
    float L = length(s - c);
    if (L > 0.01) I += glow(seg(g, c, s), px * 0.9) * smoothstep(1.45, 0.6, L) * 0.4;
  }
  vec2 a = star(id + vec2(1.0, 0.0), t), b = star(id + vec2(0.0, 1.0), t);
  I += glow(seg(g, a, b), px * 0.9) * smoothstep(1.45, 0.6, length(a - b)) * 0.4;
  float lean = smoothstep(-u_aspect * 0.5, u_aspect * 0.35, p.x);
  return I * (0.3 + 0.7 * lean);
}`

/** Missions: trajectories, dashed arcs with a comet tracing each path. */
export const trajectories = `
float arc(float x, float x0, float x1, float h) { float m = (x - x0) / (x1 - x0); return -0.42 + h * 4.0 * m * (1.0 - m); }
float field(vec2 uv, vec2 p, float t) {
  float I = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float x0 = -u_aspect * 0.15 + fi * 0.22, x1 = u_aspect * 0.48 + fi * 0.1, h = 0.55 + fi * 0.09;
    float y = arc(p.x, x0, x1, h);
    float dy = (arc(p.x + 0.001, x0, x1, h) - y) / 0.001;
    float d = abs(p.y - y) / sqrt(1.0 + dy * dy);
    float inside = step(x0, p.x) * step(p.x, x1);
    float dash = smoothstep(0.35, 0.5, fract(p.x * 16.0 - t * 0.9 + fi * 0.37));
    I += glow(d, u_px * 1.3) * 0.38 * dash * inside;
    float k = fract(t * 0.07 + fi * 0.23);
    float xh = mix(x0, x1, k);
    vec2 head = vec2(xh, arc(xh, x0, x1, h));
    float dh = length(p - head);
    float trail = glow(d, u_px * 2.0) * smoothstep(xh - 0.35, xh, p.x) * step(p.x, xh) * inside;
    I += glow(dh, 0.01) * 1.3 + glow(dh, 0.04) * 0.25 + trail * 0.7;
  }
  return I;
}`

/** Launchpad: lift-off, streaks rising from a glowing pad and speeding up as they climb. */
export const ascent = `
float field(vec2 uv, vec2 p, float t) {
  float x0 = u_aspect * 0.24;
  float cols = 70.0;
  float cx = floor(p.x * cols);
  float f = fract(p.x * cols) - 0.5;
  float h = hash(vec2(cx, 3.0));
  float spread = exp(-pow((p.x - x0) * 1.6, 2.0));
  float y = fract(h * 7.0 + t * (0.18 + h * 0.3) * (1.0 + (p.y + 0.5) * 0.8));
  float head = (p.y + 0.5) - y;
  float len = 0.08 + 0.25 * h;
  float streak = smoothstep(-len, 0.0, head) * step(head, 0.0) * glow(f, 0.12);
  float I = streak * spread * (0.4 + 0.6 * h) * step(0.35, h);
  vec2 pad = vec2(x0, -0.52);
  float n = noise(vec2(p.x * 6.0, p.y * 4.0 - t * 1.4));
  I += glow(length((p - pad) * vec2(0.8, 1.6)), 0.22) * (0.25 + 0.3 * n);
  return I;
}`

/** Arena: two wave fronts driving into each other, a bright seam where they meet. */
export const duel = `
float field(vec2 uv, vec2 p, float t) {
  float xm = u_aspect * 0.2 + 0.05 * sin(t * 0.5);
  float bend = 0.06 * (noise(vec2(p.y * 3.0, t * 0.3)) - 0.5);
  float x = p.x - xm + bend;
  float left = pow(0.5 + 0.5 * cos((x - t * 0.25) * 22.0), 24.0) * smoothstep(-1.4, 0.0, x) * step(x, 0.0);
  float right = pow(0.5 + 0.5 * cos((x + t * 0.25) * 22.0), 24.0) * smoothstep(1.4, 0.0, x) * step(0.0, x);
  float seam = glow(x, 0.012 + 0.008 * noise(vec2(p.y * 12.0, t * 2.0))) * (0.6 + 0.4 * noise(vec2(p.y * 8.0, t)));
  float vfade = glow(p.y, 0.45);
  return ((left + right) * 0.55 + seam * 0.9 + glow(x, 0.12) * 0.12) * vfade;
}`

/** Benchmarks: an equaliser of LED bars, scores rising and settling, a peak marker on each. */
export const spectrum = `
float field(vec2 uv, vec2 p, float t) {
  float bars = 34.0;
  float x = p.x * bars / u_aspect * 1.6;
  float b = floor(x);
  float fx = fract(x) - 0.5;
  float y = p.y + 0.5;
  float level = 0.12 + 0.62 * noise(vec2(b * 0.31, t * 0.5)) * (0.5 + 0.5 * smoothstep(-u_aspect * 0.4, u_aspect * 0.3, p.x));
  float peak = level + 0.04 + 0.03 * noise(vec2(b * 0.31, t * 0.5 - 0.6));
  float led = step(abs(fx), 0.32) * step(abs(fract(y * 34.0) - 0.5), 0.3);
  float lit = step(y, level) * (0.18 + 0.55 * smoothstep(level - 0.25, level, y));
  float cap = step(abs(fx), 0.32) * glow(y - peak, u_px * 2.0);
  return led * lit + cap * 0.75;
}`

/** Compare: two sources rippling, the interference pattern where they overlap. */
export const interference = `
float field(vec2 uv, vec2 p, float t) {
  vec2 a = vec2(u_aspect * 0.08 + 0.05 * sin(t * 0.3), 0.08);
  vec2 b = vec2(u_aspect * 0.34 + 0.05 * cos(t * 0.27), -0.08);
  float da = length(p - a), db = length(p - b);
  float ra = pow(0.5 + 0.5 * cos(da * 46.0 - t * 1.6), 14.0) * exp(-da * 1.6);
  float rb = pow(0.5 + 0.5 * cos(db * 46.0 - t * 1.6), 14.0) * exp(-db * 1.6);
  return (ra + rb) * 0.35 + ra * rb * 2.2 + (glow(da, 0.012) + glow(db, 0.012)) * 0.9;
}`

/** Code: circuit traces with pulses running along them, pads where they end. */
export const circuit = `
float field(vec2 uv, vec2 p, float t) {
  float s = 9.0;
  vec2 g = p * s;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float r = hash(id);
  float px = u_px * s;
  float d;
  float along;
  if (r < 0.42) { d = abs(f.y); along = g.x; }
  else if (r < 0.7) { d = abs(f.x); along = g.y; }
  else if (r < 0.85) { d = min(length(f - vec2(clamp(f.x, -0.5, 0.0), 0.0)), length(f - vec2(0.0, clamp(f.y, 0.0, 0.5)))); along = g.x + g.y; }
  else { d = 9.0; along = 0.0; }
  float trace = glow(d, px * 1.1);
  float pulse = exp(-pow(fract(along * 0.12 - t * 0.35 + hash(id.yy) * 3.0) - 0.5, 2.0) * 160.0);
  float pad = step(0.93, r) * (glow(length(f), px * 3.0) * 0.8 + glow(abs(length(f) - 0.16), px * 1.1) * 0.6);
  float lean = smoothstep(-u_aspect * 0.5, u_aspect * 0.3, p.x);
  return (trace * (0.16 + 0.9 * pulse) + pad) * (0.35 + 0.65 * lean);
}`

/** Trending: currents climbing to the upper right, pulses riding the fastest ones. */
export const rising = `
float field(vec2 uv, vec2 p, float t) {
  vec2 q = rot(0.42) * p;
  float y = q.y + 0.09 * noise(vec2(q.x * 1.4 - t * 0.25, 2.0));
  float lane = floor(y * 16.0);
  float f = fract(y * 16.0) - 0.5;
  float line = glow(f, u_px * 16.0 * 1.1);
  float h = hash(vec2(lane, 1.0));
  float pulse = exp(-pow(fract(q.x * 0.45 - t * (0.12 + 0.18 * h) + h * 5.0) - 0.5, 2.0) * 90.0);
  float lean = smoothstep(-u_aspect * 0.4, u_aspect * 0.45, q.x);
  return line * (0.1 + 0.95 * pulse * step(0.3, h)) * lean;
}`

/** Leaderboard: three pillars of light like a podium, dust rising through them. */
export const podium = `
float field(vec2 uv, vec2 p, float t) {
  float I = 0.0;
  float base = u_aspect * 0.22;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = base + (fi - 1.0) * 0.32;
    float top = fi == 1.0 ? 0.55 : (fi == 0.0 ? 0.25 : 0.1);
    float w = fi == 1.0 ? 0.06 : 0.045;
    float beam = glow(p.x - x, w) * smoothstep(top, top - 0.5, p.y) * (0.85 + 0.15 * sin(t * 1.3 + fi * 2.0));
    I += beam * (fi == 1.0 ? 0.55 : 0.32);
    I += glow(p.x - x, w * 0.18) * smoothstep(top, top - 0.3, p.y) * 0.35;
  }
  vec2 g = vec2(p.x * 40.0, p.y * 40.0 - t * 2.0);
  vec2 id = floor(g);
  float h = hash(id);
  float dust = step(0.94, h) * glow(length(fract(g) - 0.5), 0.12);
  float near = glow(p.x - base, 0.38);
  return I + dust * near * 0.8;
}`

/** Explore: a spiral galaxy turning slowly, dust lanes and scattered stars. */
export const galaxy = `
float field(vec2 uv, vec2 p, float t) {
  vec2 c = vec2(u_aspect * 0.22, 0.0);
  vec2 q = rot(0.35) * (p - c);
  q.y *= 2.1;
  float r = length(q);
  float a = atan(q.y, q.x);
  float arms = 0.5 + 0.5 * sin(2.0 * a - log(r + 0.02) * 5.0 + t * 0.35);
  float dust = noise(vec2(a * 3.0 + t * 0.1, r * 9.0)) * 0.6 + 0.4;
  float disc = exp(-r * 2.6);
  float I = pow(arms, 3.0) * disc * dust * 0.85 + glow(r, 0.07) * 0.75 + glow(r, 0.22) * 0.15;
  vec2 sg = p * 60.0;
  float sh = hash(floor(sg));
  I += step(0.985, sh) * glow(length(fract(sg) - 0.5), 0.15) * (0.4 + 0.6 * sin(t * 1.5 + sh * 50.0));
  return I;
}`

/** Forum: threads of conversation braiding past each other, replies travelling along them as beads. */
export const threads = `
float field(vec2 uv, vec2 p, float t) {
  float I = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ph = fi * 1.9;
    float y = 0.24 * sin(p.x * (1.3 + 0.18 * fi) + t * 0.22 + ph) * (0.6 + 0.4 * sin(p.x * 0.5 + ph));
    float dy = 0.24 * (1.3 + 0.18 * fi) * cos(p.x * (1.3 + 0.18 * fi) + t * 0.22 + ph);
    float d = abs(p.y - y) / sqrt(1.0 + dy * dy * 0.6);
    I += glow(d, u_px * 1.5) * 0.45 + glow(d, 0.02) * 0.05;
    float xb = fract(t * 0.05 + fi * 0.173) * u_aspect - u_aspect * 0.5;
    float yb = 0.24 * sin(xb * (1.3 + 0.18 * fi) + t * 0.22 + ph) * (0.6 + 0.4 * sin(xb * 0.5 + ph));
    float db = length(p - vec2(xb, yb));
    I += glow(db, 0.009) * 1.1 + glow(db, 0.03) * 0.2;
  }
  float lean = smoothstep(-u_aspect * 0.5, u_aspect * 0.3, p.x);
  return I * (0.35 + 0.65 * lean);
}`

/** Profiles and Your page: a halo, one bright ring breathing with fainter orbits around it. */
export const halo = `
float field(vec2 uv, vec2 p, float t) {
  vec2 c = vec2(u_aspect * 0.26, 0.04);
  vec2 q = p - c;
  float r = length(q);
  float a = atan(q.y, q.x);
  float wob = 0.012 * (noise(vec2(a * 2.0 + t * 0.3, t * 0.2)) - 0.5);
  float R = 0.26 + 0.01 * sin(t * 0.8);
  float spot = 0.45 + 0.55 * pow(0.5 + 0.5 * cos(a - t * 0.45), 4.0);
  float I = glow(r - R - wob, u_px * 2.2) * spot + glow(r - R, 0.03) * 0.18 * spot;
  for (int i = 1; i < 4; i++) { float fi = float(i); I += glow(abs(r - R - fi * 0.11), u_px * 1.4) * (0.22 / fi); }
  I += glow(r, R * 0.9) * 0.06;
  return I;
}`

/** Models: a neural network, layers of nodes with signals firing along the weights. */
export const neural = `
float field(vec2 uv, vec2 p, float t) {
  float I = 0.0;
  float x0 = -u_aspect * 0.12, gap = u_aspect * 0.11;
  for (int l = 0; l < 5; l++) {
    float fl = float(l);
    float xa = x0 + fl * gap, xb = xa + gap;
    if (l < 4 && abs(p.x - (xa + xb) * 0.5) < gap * 0.6) {
      for (int i = 0; i < 5; i++) for (int j = 0; j < 5; j++) {
        vec2 a = vec2(xa, (float(i) - 2.0) * 0.17), b = vec2(xb, (float(j) - 2.0) * 0.17);
        float w = hash(vec2(fl * 7.0 + float(i), float(j)));
        float d = seg(p, a, b);
        float k = fract(t * (0.15 + 0.2 * w) + w * 4.0);
        float spark = glow(length(p - mix(a, b, k)), 0.01);
        I += glow(d, u_px * 0.9) * 0.12 * w + spark * step(0.55, w) * 0.9;
      }
    }
    for (int i = 0; i < 5; i++) {
      vec2 n = vec2(xa, (float(i) - 2.0) * 0.17);
      float pulse = 0.6 + 0.4 * sin(t * 1.2 + fl * 1.3 + float(i) * 2.1);
      I += glow(length(p - n), 0.012) * pulse + glow(abs(length(p - n) - 0.022), u_px * 1.2) * 0.5;
    }
  }
  return I;
}`

/** Datasets: a field of data points, rows scanned as a wave of values passes through. */
export const matrix = `
float field(vec2 uv, vec2 p, float t) {
  float s = 26.0;
  vec2 g = p * s;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float v = noise(id * 0.18 + vec2(t * 0.15, 0.0));
  float scan = exp(-pow(fract(p.x * 0.3 - t * 0.06) - 0.5, 2.0) * 60.0);
  float lean = smoothstep(-u_aspect * 0.5, u_aspect * 0.35, p.x);
  float dot1 = glow(length(f), 0.1 + 0.12 * v);
  return dot1 * (0.08 + 0.45 * v * v + 0.6 * scan * v) * (0.3 + 0.7 * lean);
}`
