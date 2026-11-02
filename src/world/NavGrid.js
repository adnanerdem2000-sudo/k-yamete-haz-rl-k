// Yol bulma ızgarası (0.5 m hücre) + pencereli A*.
// Hücre türleri: 0 boş, 1 engel, 2 kapı, 3 pencere, 4 oyuncu yapısı, 5 su.
// Kırılabilir hücreler (2,3,4) zombiler için yüksek maliyetle geçilebilir: oraya varınca saldırırlar.
import { WORLD } from './WorldLayout.js';

export const NAV = { FREE: 0, BLOCK: 1, DOOR: 2, WINDOW: 3, STRUCT: 4, WATER: 5 };
const RES = 0.5;
const SIZE = Math.round(WORLD.size / RES);
const HALF = WORLD.half;
const WIN = 260; // A* penceresi (hücre) ≈ 130 m

export class NavGrid {
  constructor(terrain, physics) {
    this.terrain = terrain;
    this.physics = physics;
    this.size = SIZE;
    this.res = RES;
    this.cells = new Uint8Array(SIZE * SIZE);
    // A* çalışma alanı (pencere)
    const W2 = WIN * WIN;
    this.g = new Float32Array(W2);
    this.parent = new Int32Array(W2);
    this.stamp = new Uint32Array(W2);
    this.closed = new Uint32Array(W2);
    this.cur = 1;
    this.heap = new Int32Array(W2 * 4);
    this.heapF = new Float32Array(W2 * 4);
    this.searches = 0;
  }

  toCell(x) { return Math.floor((x + HALF) / RES); }
  toWorld(c) { return c * RES - HALF + RES / 2; }
  inBounds(i, j) { return i >= 0 && j >= 0 && i < SIZE && j < SIZE; }
  get(i, j) { return this.inBounds(i, j) ? this.cells[j * SIZE + i] : NAV.BLOCK; }
  at(x, z) { return this.get(this.toCell(x), this.toCell(z)); }

  /** Tüm dünyayı oluştur: su + çarpışma kutuları */
  buildAll() {
    this.rebuildArea(-HALF, -HALF, HALF, HALF);
  }

  /** Bir alanı sıfırdan yeniden rasterleştir (kapı açılınca, yapı kurulunca) */
  rebuildArea(minX, minZ, maxX, maxZ) {
    const i0 = Math.max(0, this.toCell(minX)), i1 = Math.min(SIZE - 1, this.toCell(maxX));
    const j0 = Math.max(0, this.toCell(minZ)), j1 = Math.min(SIZE - 1, this.toCell(maxZ));
    const t = this.terrain;
    for (let j = j0; j <= j1; j++) {
      const z = this.toWorld(j);
      for (let i = i0; i <= i1; i++) {
        const x = this.toWorld(i);
        const water = t.isWater(x, z) && t.heightAt(x, z) < t.waterLevelAt(x, z) - 0.9;
        this.cells[j * SIZE + i] = water ? NAV.WATER : NAV.FREE;
      }
    }
    const list = this.physics.query(minX - 1, minZ - 1, maxX + 1, maxZ + 1);
    for (const c of list) this.rasterize(c, i0, j0, i1, j1);
  }

  rasterize(c, ci0 = 0, cj0 = 0, ci1 = SIZE - 1, cj1 = SIZE - 1) {
    if (!c.enabled || !c.blocksNav || c.isFloor) return;
    const ground = this.terrain.heightAt((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2);
    if (c.maxY < ground + 0.5 || c.minY > ground + 1.9) {
      // kapı/pencere gibi işaretliler yine de işaretlenir
      if (!c.navType) return;
    }
    let type = NAV.BLOCK;
    if (c.navType) type = c.navType;
    const pad = c.navPad ?? (c.kind === 'door' || c.kind === 'window' ? 0.05 : 0.22);
    const i0 = Math.max(ci0, this.toCell(c.minX - pad)), i1 = Math.min(ci1, this.toCell(c.maxX + pad));
    const j0 = Math.max(cj0, this.toCell(c.minZ - pad)), j1 = Math.min(cj1, this.toCell(c.maxZ + pad));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (c.shape === 'circle') {
        const x = this.toWorld(i), z = this.toWorld(j);
        if ((x - c.x) ** 2 + (z - c.z) ** 2 > (c.r + pad) ** 2) continue;
      }
      const k = j * SIZE + i;
      const cur = this.cells[k];
      // öncelik: engel > yapı > pencere > kapı > boş
      if (cur === NAV.BLOCK) continue;
      if (type === NAV.BLOCK || cur === NAV.FREE || cur === NAV.WATER || type > cur) this.cells[k] = type;
    }
  }

  walkable(i, j, allowBreak) {
    const v = this.get(i, j);
    return v === NAV.FREE || (allowBreak && (v === NAV.DOOR || v === NAV.WINDOW || v === NAV.STRUCT));
  }

  /** Izgara üzerinde düz çizgi açık mı (Bresenham) */
  lineClear(ax, az, bx, bz, allowBreak = false) {
    let x0 = this.toCell(ax), y0 = this.toCell(az);
    const x1 = this.toCell(bx), y1 = this.toCell(bz);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, n = 0;
    while (n++ < 2000) {
      if (!this.walkable(x0, y0, allowBreak)) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return true;
  }

  /** En yakın yürünebilir hücre (spawn için) */
  nearestFree(x, z, maxR = 12) {
    const ci = this.toCell(x), cj = this.toCell(z);
    if (this.walkable(ci, cj, false)) return { x: this.toWorld(ci), z: this.toWorld(cj) };
    for (let r = 1; r <= maxR / RES; r++) {
      for (let k = -r; k <= r; k++) {
        for (const [i, j] of [[ci + k, cj - r], [ci + k, cj + r], [ci - r, cj + k], [ci + r, cj + k]]) {
          if (this.walkable(i, j, false)) return { x: this.toWorld(i), z: this.toWorld(j) };
        }
      }
    }
    return null;
  }

  /**
   * A*: başlangıçtan hedefe yol. Pencere dışındaki hedefler pencere kenarına kırpılır.
   * Dönüş: [{x, z, type}] ya da null. 'type' kırılabilir hücreleri işaretler.
   */
  findPath(sx, sz, tx, tz, opts = {}) {
    const allowBreak = opts.allowBreak !== false;
    const maxNodes = opts.maxNodes || 9000;
    this.searches++;
    const si = this.toCell(sx), sj = this.toCell(sz);
    let ti = this.toCell(tx), tj = this.toCell(tz);
    // pencere
    const cx = Math.round((si + ti) / 2), cj = Math.round((sj + tj) / 2);
    let ox = Math.min(Math.max(cx - WIN / 2, 0), SIZE - WIN), oz = Math.min(Math.max(cj - WIN / 2, 0), SIZE - WIN);
    // başlangıç pencerede olmalı
    if (si < ox + 2 || si >= ox + WIN - 2) ox = Math.min(Math.max(si - WIN / 2, 0), SIZE - WIN);
    if (sj < oz + 2 || sj >= oz + WIN - 2) oz = Math.min(Math.max(sj - WIN / 2, 0), SIZE - WIN);
    ti = Math.min(Math.max(ti, ox + 1), ox + WIN - 2);
    tj = Math.min(Math.max(tj, oz + 1), oz + WIN - 2);
    if (!this.walkable(ti, tj, allowBreak)) {
      // hedefe en yakın yürünebilir hücre
      let found = false;
      for (let r = 1; r < 8 && !found; r++) {
        for (let a = -r; a <= r && !found; a++) for (const [i, j] of [[ti + a, tj - r], [ti + a, tj + r], [ti - r, tj + a], [ti + r, tj + a]]) {
          if (i > ox && j > oz && i < ox + WIN - 1 && j < oz + WIN - 1 && this.walkable(i, j, allowBreak)) { ti = i; tj = j; found = true; break; }
        }
      }
      if (!found) return null;
    }
    const cur = ++this.cur;
    const W = WIN;
    const li = (i, j) => (j - oz) * W + (i - ox);
    const start = li(si, sj), goal = li(ti, tj);
    if (start < 0 || start >= W * W) return null;
    const g = this.g, par = this.parent, st = this.stamp, cl = this.closed;
    const heap = this.heap, hf = this.heapF;
    let hn = 0;
    const push = (n, f) => {
      let i = hn++;
      heap[i] = n; hf[i] = f;
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0];
      hn--;
      if (hn > 0) {
        heap[0] = heap[hn]; hf[0] = hf[hn];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < hn && hf[l] < hf[m]) m = l;
          if (r < hn && hf[r] < hf[m]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m;
        }
      }
      return top;
    };
    const H = (i, j) => { const dx = Math.abs(i - ti), dy = Math.abs(j - tj); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
    g[start] = 0; st[start] = cur; par[start] = -1;
    push(start, H(si, sj));
    let expanded = 0, reached = -1, bestNode = start, bestH = H(si, sj);
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    while (hn > 0) {
      const n = pop();
      if (cl[n] === cur) continue;
      cl[n] = cur;
      if (n === goal) { reached = n; break; }
      if (++expanded > maxNodes) break;
      const ni = (n % W) + ox, nj = Math.floor(n / W) + oz;
      const hh = H(ni, nj);
      if (hh < bestH) { bestH = hh; bestNode = n; }
      for (const [dx, dy, cost] of DIRS) {
        const i = ni + dx, j = nj + dy;
        if (i <= ox || j <= oz || i >= ox + W - 1 || j >= oz + W - 1) continue;
        const v = this.get(i, j);
        if (!(v === NAV.FREE || (allowBreak && (v === NAV.DOOR || v === NAV.WINDOW || v === NAV.STRUCT)))) continue;
        if (dx !== 0 && dy !== 0) { // köşe kesmeyi önle
          if (!this.walkable(ni + dx, nj, allowBreak) || !this.walkable(ni, nj + dy, allowBreak)) continue;
        }
        const m = li(i, j);
        if (cl[m] === cur) continue;
        const extra = v === NAV.FREE ? 0 : v === NAV.DOOR ? 14 : v === NAV.WINDOW ? 22 : 30;
        const ng = g[n] + cost + extra;
        if (st[m] !== cur || ng < g[m]) {
          st[m] = cur; g[m] = ng; par[m] = n;
          push(m, ng + H(i, j) * 1.15);
        }
      }
    }
    const endNode = reached >= 0 ? reached : bestNode;
    if (endNode === start) return reached >= 0 ? [{ x: tx, z: tz, type: 0 }] : null;
    const raw = [];
    for (let n = endNode; n !== -1 && raw.length < 4000; n = par[n]) {
      const i = (n % W) + ox, j = Math.floor(n / W) + oz;
      raw.push({ x: this.toWorld(i), z: this.toWorld(j), type: this.get(i, j) });
    }
    raw.reverse();
    return this.smooth(raw, allowBreak, reached >= 0);
  }

  /** İp çekme: görüş hattı olan ara noktaları atla; kırılabilir hücreler korunur */
  smooth(pts, allowBreak, complete) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let anchor = 0;
    for (let k = 2; k < pts.length; k++) {
      const a = pts[anchor], b = pts[k];
      const breakable = pts[k - 1].type !== NAV.FREE;
      if (breakable || !this.lineClear(a.x, a.z, b.x, b.z, false)) {
        out.push(pts[k - 1]);
        anchor = k - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    out.complete = complete;
    return out;
  }
}
