// Ortak yardımcılar: matematik, deterministik rastgelelik, küçük araçlar.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Kare-hızdan bağımsız üstel yumuşatma */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;
export function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
export function dampAngle(a, b, lambda, dt) { return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt)); }
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

/** mulberry32 tabanlı tohumlu RNG */
export class RNG {
  constructor(seed = 1) { this.s = (hashString(String(seed)) || 1) >>> 0; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** ağırlıklı seçim: [[değer, ağırlık], ...] */
  weighted(list) {
    let tot = 0;
    for (const [, w] of list) tot += w;
    let r = this.next() * tot;
    for (const [v, w] of list) { r -= w; if (r <= 0) return v; }
    return list[list.length - 1][0];
  }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Konumdan deterministik 0..1 değer */
export function hash2(x, z, seed = 0) {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((z | 0) + seed * 7919, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- 2D değer gürültüsü (arazi için hızlı ve deterministik)
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
export function valueNoise(x, z, seed = 0) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed), c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  const u = fade(xf), v = fade(zf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
export function fbm(x, z, oct = 4, seed = 0, lac = 2, gain = 0.5) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += valueNoise(x * f, z * f, seed + i * 31) * amp; norm += amp; amp *= gain; f *= lac; }
  return sum / norm;
}

export function uid(prefix = '') { return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
export function fmt2(n) { return String(Math.floor(n)).padStart(2, '0'); }
export function formatClock(minutes) { const m = ((minutes % 1440) + 1440) % 1440; return `${fmt2(m / 60)}:${fmt2(m % 60)}`; }
export function formatKg(w) { return (Math.round(w * 10) / 10).toFixed(1); }
export function roomCode(rng = Math) {
  const A = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor((rng.next ? rng.next() : rng.random()) * A.length)];
  return s;
}
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
/** Nokta - dikdörtgen (eksen hizalı değil) içinde mi? r: [cx, cz, hw, hd, rot] */
export function pointInRect(x, z, cx, cz, hw, hd, rot = 0) {
  const c = Math.cos(-rot), s = Math.sin(-rot);
  const dx = x - cx, dz = z - cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= hw && Math.abs(lz) <= hd;
}
