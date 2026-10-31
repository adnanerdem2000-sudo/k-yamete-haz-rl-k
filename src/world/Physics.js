// Çarpışma dünyası: eksen hizalı kutular (AABB) + daireler (ağaç/direk), uzamsal ızgara,
// karakter itme (daire-kutu), zemin yüksekliği, ışın atma ve görüş hattı.
import { clamp } from '../core/util.js';

const CELL = 8;
let NEXT_ID = 1;

export class Collider {
  constructor(o) {
    this.id = NEXT_ID++;
    this.shape = o.shape || 'box'; // 'box' | 'circle'
    this.minX = o.minX; this.maxX = o.maxX; this.minZ = o.minZ; this.maxZ = o.maxZ;
    this.x = o.x; this.z = o.z; this.r = o.r;
    if (this.shape === 'circle') { this.minX = o.x - o.r; this.maxX = o.x + o.r; this.minZ = o.z - o.r; this.maxZ = o.z + o.r; }
    this.minY = o.minY ?? -50; this.maxY = o.maxY ?? 100;
    this.kind = o.kind || 'static';     // wall | prop | door | window | structure | tree | vehicle | fence | rock
    this.owner = o.owner || null;
    this.walkable = o.walkable !== false; // üstüne çıkılabilir mi
    this.blocksNav = o.blocksNav !== false;
    this.blocksSight = o.blocksSight !== false;
    this.blocksBullets = o.blocksBullets !== false;
    this.enabled = true;
    this.cells = [];
  }
}

export class CollisionWorld {
  constructor(terrain) {
    this.terrain = terrain;
    this.grid = new Map();
    this.all = new Set();
    this.floors = []; // ızgara içinde de tutulur (kind=floor)
    this._stamp = 0;
    this.onChange = null; // (collider, added) → nav güncellemesi
  }

  key(cx, cz) { return cx * 100003 + cz; }

  add(o) {
    const c = o instanceof Collider ? o : new Collider(o);
    this._insert(c);
    this.all.add(c);
    if (this.onChange) this.onChange(c, true);
    return c;
  }

  addBox(minX, minZ, maxX, maxZ, minY, maxY, opts = {}) {
    return this.add({ ...opts, minX, minZ, maxX, maxZ, minY, maxY });
  }

  /** Merkez/yarı-boyut ile kutu (dönüş 90°'nin katı ise kenarlar değişir) */
  addBoxC(cx, cz, hw, hd, minY, maxY, opts = {}) {
    return this.add({ ...opts, minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd, minY, maxY });
  }

  addFloor(minX, minZ, maxX, maxZ, y, opts = {}) {
    return this.add({ ...opts, minX, minZ, maxX, maxZ, minY: y - 0.3, maxY: y, kind: 'floor', blocksNav: false, blocksSight: false, blocksBullets: false, isFloor: true });
  }

  _insert(c) {
    c.cells.length = 0;
    const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = this.key(x, z);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(c);
      c.cells.push(k);
    }
  }

  _removeFromCells(c) {
    for (const k of c.cells) {
      const arr = this.grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
    c.cells.length = 0;
  }

  remove(c) {
    if (!c || !this.all.has(c)) return;
    this._removeFromCells(c);
    this.all.delete(c);
    if (this.onChange) this.onChange(c, false);
  }

  setEnabled(c, en) {
    if (c.enabled === en) return;
    c.enabled = en;
    if (this.onChange) this.onChange(c, en);
  }

  /** Kutunun konumunu güncelle (hareketli nesneler) */
  move(c, minX, minZ, maxX, maxZ) {
    this._removeFromCells(c);
    c.minX = minX; c.maxX = maxX; c.minZ = minZ; c.maxZ = maxZ;
    this._insert(c);
  }

  query(minX, minZ, maxX, maxZ, out = []) {
    this._stamp++;
    const st = this._stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const arr = this.grid.get(this.key(x, z));
      if (!arr) continue;
      for (const c of arr) {
        if (c._q === st || !c.enabled) continue;
        c._q = st;
        if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
        out.push(c);
      }
    }
    return out;
  }

  /**
   * Zemin yüksekliği: arazi + basılabilir yüzeyler (zeminler, kutu üstleri).
   * feetY + step altında kalan en yüksek yüzey döndürülür.
   */
  groundHeight(x, z, feetY = 1e9, step = 0.55, radius = 0.0) {
    let g = this.terrain.heightAt(x, z);
    let surf = null;
    const list = this.query(x - radius, z - radius, x + radius, z + radius, this._tmpList || (this._tmpList = []));
    for (const c of list) {
      if (!c.walkable) continue;
      if (c.shape === 'circle') { if ((x - c.x) ** 2 + (z - c.z) ** 2 > (c.r + radius) ** 2) continue; }
      else if (x < c.minX - radius || x > c.maxX + radius || z < c.minZ - radius || z > c.maxZ + radius) continue;
      if (c.maxY <= feetY + step && c.maxY > g) { g = c.maxY; surf = c; }
    }
    list.length = 0;
    this.lastSurface = surf;
    return g;
  }

  /**
   * Daireyi (karakter) engellerden it. y aralığı [feetY + step, headY].
   * Dönüş: {x, z, hit, hits:[colliders]}
   */
  resolveCircle(x, z, r, feetY, headY, step = 0.55, ignore = null, out = { x: 0, z: 0, hit: false, hits: [] }) {
    out.hit = false; out.hits.length = 0;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.query(x - r - 0.1, z - r - 0.1, x + r + 0.1, z + r + 0.1, this._tmpList2 || (this._tmpList2 = []));
      for (const c of list) {
        if (c === ignore || (ignore && c.owner && c.owner === ignore)) continue;
        if (c.maxY <= feetY + step || c.minY >= headY) continue; // basamak ya da baş üstü
        if (c.isFloor) continue;
        if (c.shape === 'circle') {
          const dx = x - c.x, dz = z - c.z;
          const d2 = dx * dx + dz * dz, rr = r + c.r;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1e-4;
            const push = rr - d;
            x += (dx / d) * push; z += (dz / d) * push;
            moved = true; out.hit = true; out.hits.push(c);
          }
          continue;
        }
        const px = clamp(x, c.minX, c.maxX), pz = clamp(z, c.minZ, c.maxZ);
        let dx = x - px, dz = z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x += (dx / d) * (r - d); z += (dz / d) * (r - d);
        } else {
          // merkez kutunun içinde: en kısa eksenden çık
          const l = x - c.minX, rr2 = c.maxX - x, t = z - c.minZ, b = c.maxZ - z;
          const m = Math.min(l, rr2, t, b);
          if (m === l) x = c.minX - r; else if (m === rr2) x = c.maxX + r; else if (m === t) z = c.minZ - r; else z = c.maxZ + r;
        }
        moved = true; out.hit = true; out.hits.push(c);
      }
      list.length = 0;
      if (!moved) break;
    }
    out.x = x; out.z = z;
    return out;
  }

  /** Nokta bir engelin içinde mi (yerleştirme doğrulaması) */
  overlapsBox(minX, minZ, maxX, maxZ, minY, maxY, filter = null) {
    const list = this.query(minX, minZ, maxX, maxZ);
    for (const c of list) {
      if (c.isFloor) continue;
      if (filter && !filter(c)) continue;
      if (c.maxY <= minY || c.minY >= maxY) continue;
      if (c.shape === 'circle') {
        const px = clamp(c.x, minX, maxX), pz = clamp(c.z, minZ, maxZ);
        if ((px - c.x) ** 2 + (pz - c.z) ** 2 < c.r * c.r) return c;
        continue;
      }
      return c;
    }
    return null;
  }

  /**
   * 3B ışın: kutular/daireler + arazi. Dönüş {dist, collider, point:{x,y,z}, terrain}
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter = null) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    let best = maxDist, bestC = null;
    // ızgara boyunca ilerle (her 8 m'lik adımda hücreleri sorgula)
    const steps = Math.ceil(maxDist / CELL) + 1;
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t0 = s * CELL;
      if (t0 > best + CELL) break;
      const cx = ox + dx * t0, cz = oz + dz * t0;
      const list = this.query(cx - CELL, cz - CELL, cx + CELL, cz + CELL);
      for (const c of list) {
        if (seen.has(c)) continue;
        seen.add(c);
        if (c.isFloor && !c.blocksBullets) continue;
        if (filter && !filter(c)) continue;
        let t;
        if (c.shape === 'circle') t = rayCylinder(ox, oy, oz, dx, dy, dz, c.x, c.z, c.r, c.minY, c.maxY);
        else t = rayBox(ox, oy, oz, dx, dy, dz, c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ);
        if (t !== null && t < best) { best = t; bestC = c; }
      }
    }
    // arazi
    let terrainHit = false;
    const stepT = 1.0;
    for (let t = 0; t < best; t += stepT) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (y < this.terrain.heightAt(x, z)) {
        // ince ayar
        let a = Math.max(0, t - stepT), b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          if (oy + dy * m < this.terrain.heightAt(ox + dx * m, oz + dz * m)) b = m; else a = m;
        }
        best = b; bestC = null; terrainHit = true;
        break;
      }
    }
    if (best >= maxDist && !bestC && !terrainHit) return null;
    return { dist: best, collider: bestC, terrain: terrainHit, point: { x: ox + dx * best, y: oy + dy * best, z: oz + dz * best } };
  }

  /** Görüş hattı açık mı (zombi algısı) */
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    const hit = this.raycast(ax, ay, az, dx, dy, dz, d - 0.3, (c) => c.blocksSight);
    return !hit;
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return null; } else {
    let a = (x0 - ox) / dx, b = (x1 - ox) / dx; if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
  }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return null; } else {
    let a = (y0 - oy) / dy, b = (y1 - oy) / dy; if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
  }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return null; } else {
    let a = (z0 - oz) / dz, b = (z1 - oz) / dz; if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
  }
  if (tmax < Math.max(tmin, 0)) return null;
  return tmin >= 0 ? tmin : null; // başlangıç kutunun içindeyse yok say
}

function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  const y = oy + dy * t;
  if (y < y0 || y > y1) return null;
  return t;
}
