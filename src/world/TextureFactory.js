// Prosedürel dokular (canvas): ahşap kaplama, tuğla, sıva, kiremit, parke, fayans, beton, metal, çim/toprak.
// Dış dosya gerektirmez; stilize ve hafif "boyanmış" görünüm hedeflenir.
import * as THREE from 'three';
import { RNG } from '../core/util.js';

const cache = new Map();

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function finish(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noiseFill(g, w, h, base, amp, rng, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
    const v = (rng.next() - 0.5) * amp;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(x, y, size, size);
  }
}

const makers = {
  // Beyaz tabanlı (tint vertex rengiyle verilir) yatay ahşap kaplama
  siding() {
    const c = canvas(256), g = c.getContext('2d'), r = new RNG('siding');
    noiseFill(g, 256, 256, '#f2f2f2', 0.06, r, 2);
    for (let y = 0; y < 256; y += 32) {
      const grd = g.createLinearGradient(0, y, 0, y + 32);
      grd.addColorStop(0, 'rgba(255,255,255,0.25)'); grd.addColorStop(0.85, 'rgba(0,0,0,0.02)'); grd.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = grd; g.fillRect(0, y, 256, 32);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(r.int(0, 250), y + r.int(4, 26), r.int(20, 80), 1); }
    }
    return finish(c);
  },
  brick() {
    const c = canvas(256), g = c.getContext('2d'), r = new RNG('brick');
    g.fillStyle = '#d9d2c8'; g.fillRect(0, 0, 256, 256);
    const bh = 21, bw = 64;
    for (let row = 0; row * bh < 256; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < 256 + bw; x += bw) {
        const v = 0.82 + r.next() * 0.25;
        g.fillStyle = `rgb(${Math.floor(255 * v)},${Math.floor(240 * v)},${Math.floor(230 * v)})`;
        g.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
        g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x + off + 2, row * bh + bh - 6, bw - 4, 4);
      }
    }
    return finish(c);
  },
  plaster() {
    const c = canvas(256), g = c.getContext('2d'), r = new RNG('plaster');
    noiseFill(g, 256, 256, '#f0f0f0', 0.07, r, 4);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${r.range(0.01, 0.04)})`; g.beginPath(); g.arc(r.int(0, 256), r.int(0, 256), r.int(6, 30), 0, 7); g.fill(); }
    return finish(c);
  },
  concrete() {
    const c = canvas(256), g = c.getContext('2d'), r = new RNG('concrete');
    noiseFill(g, 256, 256, '#e6e6e6', 0.09, r, 2);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2;
    for (let y = 0; y <= 256; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    for (let x = 0; x <= 256; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    return finish(c);
  },
  metal() {
    const c = canvas(256), g = c.getContext('2d'), r = new RNG('metal');
    g.fillStyle = '#ececec'; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      const grd = g.createLinearGradient(x, 0, x + 16, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0.18)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = grd; g.fillRect(x, 0, 16, 256);
    }
    for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(120,60,20,${r.range(0.04, 0.12)})`; g.beginPath(); g.arc(r.int(0, 256), r.int(0, 256), r.int(4, 22), 0, 7); g.fill(); }
    return finish(c);
  },
  shingles() {
    const c = canvas(256), g = c.getContext('2d'), r = new RNG('shingle');
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 256, 256);
    const sh = 24, sw = 32;
    for (let row = 0; row * sh < 256; row++) {
      const off = row % 2 ? sw / 2 : 0;
      for (let x = -sw; x < 256 + sw; x += sw) {
        const v = 0.78 + r.next() * 0.3;
        g.fillStyle = `rgb(${Math.floor(255 * v)},${Math.floor(255 * v)},${Math.floor(255 * v)})`;
        g.fillRect(x + off + 1, row * sh, sw - 2, sh - 2);
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + off + 1, row * sh + sh - 5, sw - 2, 3);
      }
    }
    return finish(c);
  },
  woodfloor() {
    const c = canvas(256), g = c.getContext('2d'), r = new RNG('wfloor');
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 256, 256);
    const ph = 32;
    for (let y = 0; y < 256; y += ph) {
      let x = -r.int(0, 120);
      while (x < 256) {
        const len = r.int(80, 160), v = 0.8 + r.next() * 0.25;
        g.fillStyle = `rgb(${Math.floor(255 * v)},${Math.floor(240 * v)},${Math.floor(220 * v)})`;
        g.fillRect(x + 1, y + 1, len - 2, ph - 2);
        for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(x + 4, y + r.int(4, ph - 4), len - 8, 1); }
        x += len;
      }
    }
    return finish(c);
  },
  tiles() {
    const c = canvas(256), g = c.getContext('2d'), r = new RNG('tiles');
    g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
      const v = 0.92 + r.next() * 0.08;
      g.fillStyle = `rgb(${Math.floor(250 * v)},${Math.floor(250 * v)},${Math.floor(248 * v)})`;
      g.fillRect(x + 2, y + 2, 60, 60);
    }
    return finish(c);
  },
  asphalt() {
    const c = canvas(256), g = c.getContext('2d'), r = new RNG('asphalt');
    noiseFill(g, 256, 256, '#d0d0d0', 0.16, r, 2);
    for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.beginPath(); let x = r.int(0, 256), y = r.int(0, 256); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += r.int(-20, 20); y += r.int(-20, 20); g.lineTo(x, y); } g.stroke(); }
    return finish(c);
  },
  ground() {
    // arazi detay dokusu: gri tonlu ince gürültü (vertex rengiyle çarpılır)
    const c = canvas(512), g = c.getContext('2d'), r = new RNG('ground');
    noiseFill(g, 512, 512, '#e4e4e4', 0.07, r, 2);
    for (let i = 0; i < 1400; i++) {
      const x = r.int(0, 512), y = r.int(0, 512);
      g.strokeStyle = r.chance(0.5) ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.int(-3, 3), y - r.int(4, 9)); g.stroke();
    }
    return finish(c);
  },
  wood() {
    const c = canvas(128), g = c.getContext('2d'), r = new RNG('wood');
    g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(0,0,0,${r.range(0.03, 0.1)})`; g.lineWidth = r.range(0.5, 2); const y = r.int(0, 128); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(40, y + r.int(-4, 4), 90, y + r.int(-4, 4), 128, y); g.stroke(); }
    return finish(c);
  },
  carpet() {
    const c = canvas(128), g = c.getContext('2d'), r = new RNG('carpet');
    noiseFill(g, 128, 128, '#e0e0e0', 0.12, r, 1);
    return finish(c);
  },
};

export function getTexture(name) {
  if (!cache.has(name)) cache.set(name, makers[name]());
  return cache.get(name);
}

/** Tabela dokusu: metin + renkler */
export function signTexture(text, bg = '#c0392b', fg = '#ffffff', w = 512, h = 128, opts = {}) {
  const key = `sign:${text}:${bg}:${fg}:${w}:${h}:${opts.icon || ''}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, w, h * 0.45);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  let fs = Math.floor(h * 0.6);
  g.font = `${fs}px "Luckiest Guy", "Arial Black", sans-serif`;
  while (g.measureText(text).width > w * 0.86 && fs > 10) { fs -= 2; g.font = `${fs}px "Luckiest Guy", "Arial Black", sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(text, w / 2 + 3, h / 2 + 5);
  g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 2);
  if (opts.icon === 'cross') { g.fillStyle = fg; const s = h * 0.5; g.fillRect(h * 0.25 + s * 0.33, h * 0.25, s * 0.34, s); g.fillRect(h * 0.25, h * 0.25 + s * 0.33, s, s * 0.34); }
  const t = finish(c, false);
  cache.set(key, t);
  return t;
}

/** Karakter/eşya simgeleri için yuvarlak gradyan sprite */
export function glowTexture(color = '#ffffff') {
  const key = 'glow:' + color;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(64), g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, color); grd.addColorStop(0.35, color.replace(')', ',0.5)').replace('rgb', 'rgba')); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = finish(c, false);
  cache.set(key, t);
  return t;
}

export function softDot() {
  if (cache.has('softdot')) return cache.get('softdot');
  const c = canvas(64), g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = finish(c, false, false);
  cache.set('softdot', t);
  return t;
}
