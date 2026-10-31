// Ada arazisi: 4 m çözünürlüklü yükseklik alanı, bölge platoları, göl, dağ ve yollar.
// heightAt() görsel ağdaki üçgenlerle birebir aynı enterpolasyonu kullanır (karakterler
// zemine gömülmez ya da havada kalmaz).
import * as THREE from 'three';
import { WORLD, REGIONS, ROADS, LAKE, LAKES, MOUNTAIN, ISLAND, MAINLAND } from './WorldLayout.js';
import { fbm, smoothstep, clamp, lerp, valueNoise, wrapAngle } from '../core/util.js';
import { getTexture } from './TextureFactory.js';
import { SURF, NEUTRAL_GAIN } from './Surfaces.js';

const N = WORLD.size / WORLD.cell; // hücre sayısı
const V = N + 1;
const CELL = WORLD.cell;
const HALF = WORLD.half;

export const BIOME = { SEA: 0, SAND: 1, GRASS: 2, FOREST: 3, ROCK: 4, SNOW: 5, URBAN: 6, LAWN: 7, DIRT: 8, FIELD: 9 };

/** Ada kıyı yarıçapı (açıya göre). Güneydoğu körfezi (liman) eski kıyıda kalır, diğer yönler genişler. */
export function coastRadius(theta) {
  const bay = ISLAND.bayR + 36 * Math.sin(3 * theta + 0.5) + 22 * Math.sin(5 * theta + 2.1) + 12 * Math.sin(9 * theta + 1.3);
  const wide = ISLAND.R + 40 * Math.sin(3 * theta + 0.5) + 26 * Math.sin(5 * theta + 2.1) + 14 * Math.sin(9 * theta + 1.3);
  const d = Math.abs(wrapAngle(theta - ISLAND.bayAngle));
  return lerp(bay, wide, smoothstep(ISLAND.bayInner, ISLAND.bayOuter, d));
}

// Doğal tepeler (dağ köyü sırtı, doğu yaylası)
const HILLS = [
  { x: -650, z: -560, r: 150, peak: 30 },
  { x: -470, z: -420, r: 90, peak: 16 },
  { x: 560, z: 200, r: 120, peak: 14 },
  { x: -420, z: 420, r: 110, peak: 10 },
];

/** Orman yoğunluğu maskesi (0..1) — ağaç dağıtımı ve zemin rengi için */
export function forestMask(x, z) {
  const d1 = Math.hypot(x + 240, z + 170) / 210;
  const d2 = Math.hypot(x - 250, z + 60) / 70;   // doğu koruluğu
  const d3 = Math.hypot(x + 20, z + 380) / 90;   // laboratuvar ormanı
  const d4 = Math.hypot(x - 230, z - 160) / 55;  // güneydoğu koruluk
  const d5 = Math.hypot(x + 330, z - 30) / 70;   // batı kıyı ormanı
  // genişletilmiş adanın ormanları
  const d6 = Math.hypot(x + 520, z + 40) / 110;  // baraj ormanı
  const d7 = Math.hypot(x + 430, z - 400) / 120; // güneybatı korusu
  const d8 = Math.hypot(x - 420, z + 640) / 95;  // kuzeydoğu çam ormanı
  const d9 = Math.hypot(x + 700, z + 300) / 120; // kuzeybatı ormanı
  const d10 = Math.hypot(x - 520, z - 260) / 80; // doğu koruluğu
  let m = Math.max(1 - d1, 0.9 * (1 - d2), 0.95 * (1 - d3), 0.8 * (1 - d4), 0.85 * (1 - d5), 0.9 * (1 - d6), 0.85 * (1 - d7), 0.9 * (1 - d8), 0.95 * (1 - d9), 0.8 * (1 - d10));
  m += fbm(x / 70, z / 70, 3, 77) * 0.35;
  return clamp(m * 1.6, 0, 1);
}

/** Çiftlik köyü çevresindeki tarlalar (şeritli parseller) */
export function inFarmFields(x, z) {
  const d = Math.hypot(x + 640, z - 120);
  if (d < 95 || d > 230) return false;
  const parcel = Math.floor((x + 2000) / 46) * 13 + Math.floor((z + 2000) / 38) * 7;
  return (parcel % 5) !== 0 && valueNoise(x / 90, z / 90, 21) > 0.3;
}

export class Terrain {
  constructor() {
    this.N = N;
    this.cell = CELL;
    this.half = HALF;
    this.h = new Float32Array(V * V);
    this.biome = new Uint8Array(V * V);
    this.roadMask = new Float32Array(V * V);
    this.generate();
  }

  idx(i, j) { return j * V + i; }

  naturalHeight(x, z) {
    const r = Math.hypot(x, z);
    const theta = Math.atan2(z, x);
    const R = coastRadius(theta) + fbm(x / 90, z / 90, 3, 5) * 26;
    const t = (R - r) / 90;
    let land = smoothstep(-0.25, 1, t);
    // anakara (kuzeydoğu köşesi), arada boğaz
    const diag = (x - z) / Math.SQRT2;
    const tm = (diag - MAINLAND.diag + fbm(x / 70, z / 70, 3, 19) * 18) / 70;
    land = Math.max(land, smoothstep(-0.25, 1, tm));
    let h = -10 + land * 14;
    h += fbm(x / 200, z / 200, 4, 11) * 9 * land;
    h += fbm(x / 45, z / 45, 3, 23) * 1.2 * land;
    // iç kesimler deniz seviyesinin altına düşmesin (kıyıdan uzak çukurlarda yapay su birikintisi olmasın)
    const inland = smoothstep(1.4, 2.6, t);
    if (inland > 0) h = Math.max(h, lerp(h, 2.4 + Math.abs(fbm(x / 120, z / 120, 2, 71)) * 2, inland));
    // dağ kütlesi
    const dm = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
    const sig = MOUNTAIN.r / 2.1;
    const mount = Math.exp(-(dm * dm) / (2 * sig * sig));
    h += MOUNTAIN.peak * mount * (0.82 + fbm(x / 70, z / 70, 4, 31) * 0.35);
    h += Math.abs(fbm(x / 40, z / 40, 3, 41)) * 14 * mount;
    // doğu tepeleri
    const dh = Math.hypot(x - 230, z + 60);
    h += 14 * Math.exp(-(dh * dh) / (2 * 70 * 70));
    for (const hl of HILLS) {
      const d = Math.hypot(x - hl.x, z - hl.z), sg = hl.r / 2;
      h += hl.peak * land * Math.exp(-(d * d) / (2 * sg * sg)) * (0.85 + fbm(x / 50, z / 50, 3, 61) * 0.3);
    }
    return h;
  }

  generate() {
    const h = this.h;
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL;
        h[this.idx(i, j)] = this.naturalHeight(x, z);
      }
    }
    // göl çukurları (göl + baraj gölü)
    for (const L of LAKES) {
      this.stamp((x, z, cur) => {
        const d = Math.hypot(x - L.x, z - L.z);
        if (d > L.r + 30) return cur;
        const bed = L.level - 3.2 * (1 - clamp(d / L.r, 0, 1) ** 2) - 0.4;
        const shore = L.level + 0.8;
        if (d < L.r) return bed;
        const w = smoothstep(L.r + 30, L.r, d);
        return lerp(cur, shore + (d - L.r) * 0.02, w);
      }, [L.x - L.r - 32, L.z - L.r - 32, L.x + L.r + 32, L.z + L.r + 32]);
    }
    // platolar
    for (const reg of REGIONS) {
      if (!reg.plateau) continue;
      const [x0, z0, x1, z1] = reg.plateau;
      const margin = reg.id === 'liman' ? 8 : reg.id === 'dag' || reg.id === 'dagkoy' ? 22 : reg.id === 'fener' ? 14 : 34;
      this.stamp((x, z, cur) => {
        const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
        const d = Math.hypot(dx, dz);
        if (d > margin) return cur;
        const w = smoothstep(margin, 0, d);
        return lerp(cur, reg.h, w);
      }, [x0 - margin, z0 - margin, x1 + margin, z1 + margin]);
    }
    // yollar
    for (const road of ROADS) this.stampRoad(road);
    this.computeBiomes();
  }

  /** fn(x, z, mevcut) → yeni yükseklik; bbox ile sınırlı */
  stamp(fn, bbox = [-HALF, -HALF, HALF, HALF]) {
    const i0 = clamp(Math.floor((bbox[0] + HALF) / CELL), 0, N), i1 = clamp(Math.ceil((bbox[2] + HALF) / CELL), 0, N);
    const j0 = clamp(Math.floor((bbox[1] + HALF) / CELL), 0, N), j1 = clamp(Math.ceil((bbox[3] + HALF) / CELL), 0, N);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = this.idx(i, j);
      this.h[k] = fn(-HALF + i * CELL, -HALF + j * CELL, this.h[k]);
    }
  }

  stampRoad(road) {
    // merkez hattını 4 m'de bir örnekle, yükseklik profilini yumuşat
    const samples = [];
    for (let s = 0; s < road.pts.length - 1; s++) {
      const [ax, az] = road.pts[s], [bx, bz] = road.pts[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 4));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        samples.push({ x: lerp(ax, bx, t), z: lerp(az, bz, t) });
      }
    }
    const last = road.pts[road.pts.length - 1];
    samples.push({ x: last[0], z: last[1] });
    for (const s of samples) s.h = Math.max(this.sampleGrid(s.x, s.z), road.type === 'path' ? -99 : 1.2);
    // yumuşatma (hareketli ortalama, birkaç geçiş)
    for (let pass = 0; pass < 4; pass++) {
      const copy = samples.map((s) => s.h);
      for (let k = 1; k < samples.length - 1; k++) samples[k].h = (copy[k - 1] + copy[k] * 2 + copy[k + 1]) / 4;
    }
    road.samples = samples;
    const hw = road.w / 2;
    const fall = road.type === 'path' ? 3 : 9;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const s of samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
    const pad = hw + fall + 2;
    this.stamp((x, z, cur) => {
      // en yakın segment
      let best = Infinity, bh = cur;
      for (let k = 0; k < samples.length - 1; k++) {
        const a = samples[k], b = samples[k + 1];
        const vx = b.x - a.x, vz = b.z - a.z;
        const L2 = vx * vx + vz * vz || 1;
        let t = ((x - a.x) * vx + (z - a.z) * vz) / L2;
        t = clamp(t, 0, 1);
        const px = a.x + vx * t, pz = a.z + vz * t;
        const d = Math.hypot(x - px, z - pz);
        if (d < best) { best = d; bh = lerp(a.h, b.h, t); }
      }
      if (best > hw + fall) return cur;
      const w = best <= hw + 1.5 ? 1 : smoothstep(hw + fall, hw + 1.5, best);
      const k = this.idx(Math.round((x + HALF) / CELL), Math.round((z + HALF) / CELL));
      if (best <= hw + 0.5) this.roadMask[k] = Math.max(this.roadMask[k], road.type === 'asphalt' ? 1 : 0.5);
      return lerp(cur, bh, w);
    }, [minX - pad, minZ - pad, maxX + pad, maxZ + pad]);
  }

  sampleGrid(x, z) { return this.heightAt(x, z); }

  /** Görsel ağla birebir uyumlu yükseklik */
  heightAt(x, z) {
    const gx = clamp((x + HALF) / CELL, 0, N - 1e-4), gz = clamp((z + HALF) / CELL, 0, N - 1e-4);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h = this.h;
    const h00 = h[j * V + i], h10 = h[j * V + i + 1], h01 = h[(j + 1) * V + i], h11 = h[(j + 1) * V + i + 1];
    // ters köşegen (10–01) üçgenleme: Rapier yükseklik alanıyla birebir aynı
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.5;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z), hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  slopeAt(x, z) { return 1 - this.normalAt(x, z).y; }

  /** Yüzey sınıfı (araç tutunması, ses, toz): asphalt | concrete | dirt | grass | sand | rock | snow */
  surfaceAt(x, z) {
    const ix = Math.round((x + this.half) / this.cell), iz = Math.round((z + this.half) / this.cell);
    const k = this.idx(Math.max(0, Math.min(this.N, ix)), Math.max(0, Math.min(this.N, iz)));
    if (this.roadMask && this.roadMask[k] >= 1) return 'asphalt';
    if (this.roadMask && this.roadMask[k] > 0) return 'dirt'; // toprak yol
    switch (this.biome[k]) {
      case BIOME.URBAN: return 'concrete';
      case BIOME.DIRT: case BIOME.FIELD: return 'dirt';
      case BIOME.SAND: case BIOME.SEA: return 'sand';
      case BIOME.ROCK: return 'rock';
      case BIOME.SNOW: return 'snow';
      default: return 'grass';
    }
  }

  regionAt(x, z) {
    for (const r of REGIONS) {
      if (!r.plateau) continue;
      const [x0, z0, x1, z1] = r.plateau;
      if (x >= x0 - 6 && x <= x1 + 6 && z >= z0 - 6 && z <= z1 + 6) return r;
    }
    if (forestMask(x, z) > 0.45 || Math.hypot(x + 235, z + 160) < 200) return REGIONS.find((r) => r.id === 'orman');
    return null;
  }

  isWater(x, z) {
    const h = this.heightAt(x, z);
    if (h < WORLD.sea - 0.2) return true;
    for (const L of LAKES) if (Math.hypot(x - L.x, z - L.z) < L.r + 2 && h < L.level - 0.2) return true;
    return false;
  }

  waterLevelAt(x, z) {
    for (const L of LAKES) if (Math.hypot(x - L.x, z - L.z) < L.r + 4) return L.level;
    return WORLD.sea;
  }

  computeBiomes() {
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = this.idx(i, j);
      const x = -HALF + i * CELL, z = -HALF + j * CELL;
      const h = this.h[k];
      let b = BIOME.GRASS;
      const reg = this.regionAt(x, z);
      const slope = this.slopeAt(x, z);
      if (h < -0.4) b = BIOME.SEA;
      else if (h < 1.7 && !reg) b = BIOME.SAND;
      else if (reg && (reg.id === 'mahalle' || reg.id === 'tatil' || reg.id === 'ciftlik' || reg.id === 'dagkoy')) b = BIOME.LAWN;
      else if (reg && ['sehir', 'hastane', 'sanayi', 'askeri', 'liman', 'lab', 'benzin', 'cezaevi', 'havaalani', 'baraj', 'kopru'].includes(reg.id)) b = BIOME.URBAN;
      else if (h > 70) b = BIOME.SNOW;
      else if (slope > 0.32 || h > 54) b = BIOME.ROCK;
      else if (forestMask(x, z) > 0.4) b = BIOME.FOREST;
      else if (valueNoise(x / 120, z / 120, 9) > 0.45 && Math.hypot(x - 260, z - 140) < 120) b = BIOME.FIELD;
      else if (inFarmFields(x, z)) b = BIOME.FIELD;
      for (const L of LAKES) if (Math.hypot(x - L.x, z - L.z) < L.r + 3) b = BIOME.SAND;
      // tatil köyü plajı
      if (!reg && h < 4.2 && h > -0.4 && x > -320 && x < -40 && z > 700) b = BIOME.SAND;
      if (this.roadMask[k] > 0 && this.roadMask[k] < 1) b = BIOME.DIRT;
      this.biome[k] = b;
    }
  }

  colorFor(k, x, z) {
    const b = this.biome[k];
    const n = valueNoise(x / 9, z / 9, 3) * 0.5 + valueNoise(x / 37, z / 37, 4) * 0.5;
    const c = new THREE.Color();
    // renkler sRGB (doğal tonlar; ayrıntı katmanı ve ışık bunların üzerine gelir)
    const srgb = (r, g, bb) => c.setRGB(r, g, bb, THREE.SRGBColorSpace);
    switch (b) {
      case BIOME.SEA: srgb(0.62, 0.58, 0.44); break;
      case BIOME.SAND: srgb(0.86, 0.79, 0.6).offsetHSL(0, 0, n * 0.04); break;
      case BIOME.LAWN: srgb(0.38, 0.58, 0.24).offsetHSL(n * 0.02, 0, n * 0.06); break;
      case BIOME.FOREST: srgb(0.3, 0.42, 0.18).offsetHSL(n * 0.03, 0, n * 0.06); break;
      case BIOME.ROCK: srgb(0.56, 0.53, 0.49).offsetHSL(0, 0, n * 0.08); break;
      case BIOME.SNOW: srgb(0.93, 0.95, 0.98); break;
      case BIOME.URBAN: srgb(0.66, 0.62, 0.55).offsetHSL(n * 0.02, 0, n * 0.06); break;
      case BIOME.DIRT: srgb(0.55, 0.42, 0.29).offsetHSL(0, 0, n * 0.04); break;
      case BIOME.FIELD: srgb(0.7, 0.62, 0.34).offsetHSL(n * 0.02, 0, n * 0.05); break;
      default: {
        // çayır: yeşil + kuru (sarımsı) lekeler
        const y = smoothstep(0.1, 0.6, valueNoise(x / 60, z / 60, 12));
        srgb(lerp(0.36, 0.55, y), lerp(0.55, 0.56, y), lerp(0.22, 0.26, y)).offsetHSL(n * 0.02, 0, n * 0.05);
      }
    }
    return c;
  }

  buildMesh() {
    const pos = new Float32Array(V * V * 3);
    const col = new Float32Array(V * V * 3);
    const uv = new Float32Array(V * V * 2);
    const mat4 = new Float32Array(V * V * 4); // katman ağırlıkları: çimen, toprak, kaya, beton (kalan: düz)
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = this.idx(i, j);
      const x = -HALF + i * CELL, z = -HALF + j * CELL;
      pos[k * 3] = x; pos[k * 3 + 1] = this.h[k]; pos[k * 3 + 2] = z;
      const c = this.colorFor(k, x, z);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = x / 5; uv[k * 2 + 1] = z / 5;
      mat4.set(this.layersFor(k, x, z), k * 4);
    }
    const idx = new Uint32Array(N * N * 6);
    let p = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * V + i, b = j * V + i + 1, c = (j + 1) * V + i, d = (j + 1) * V + i + 1;
      // (00, 01, 10) ve (10, 01, 11) — fizik yükseklik alanıyla aynı köşegen
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aLayer', new THREE.BufferAttribute(mat4, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mat = SURF.dirt_c ? this.layeredMaterial() : new THREE.MeshStandardMaterial({ vertexColors: true, map: getTexture('ground'), roughness: 0.96, metalness: 0 });
    this.material = mat;
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.mesh = mesh;
    return mesh;
  }

  /** Köşe katman ağırlıkları [çimen, toprak, kaya, beton]; toplam < 1 ise kalan düz renk (kar, kum) */
  layersFor(k, x, z) {
    const b = this.biome[k];
    const n = valueNoise(x / 23, z / 23, 31), n2 = valueNoise(x / 7, z / 7, 32);
    switch (b) {
      case BIOME.LAWN: { const d = smoothstep(0.62, 0.85, n) * 0.5; return [1 - d, d, 0, 0]; }
      case BIOME.GRASS: { const d = smoothstep(0.55, 0.8, n) * 0.6 + n2 * 0.08; return [1 - d, d, 0, 0]; }
      case BIOME.FOREST: { const d = 0.35 + smoothstep(0.4, 0.75, n) * 0.45; return [1 - d, d, 0, 0]; }
      case BIOME.FIELD: return [0.45, 0.55, 0, 0];
      case BIOME.DIRT: return [0, 1, 0, 0];
      case BIOME.URBAN: { const d = smoothstep(0.5, 0.8, n) * 0.4; return [0, d, 0, 1 - d]; }
      case BIOME.ROCK: { const d = smoothstep(0.55, 0.8, n) * 0.35; return [0, d, 1 - d, 0]; }
      case BIOME.SAND: case BIOME.SEA: return [0, 0.35, 0, 0];
      case BIOME.SNOW: return [0, 0, 0.25, 0];
      default: return [0.5, 0.5, 0, 0];
    }
  }

  /**
   * Katmanlı arazi malzemesi: köşe rengi (biyom tonu) × katman ayrıntısı. Katmanlar dünya koordinatıyla iki
   * ölçekte örneklenir (tekrar deseni gizlenir): çimen (prosedürel ot), toprak, kaya, beton. Normal haritası:
   * toprak/beton katmanlarından, ağırlıkla.
   */
  layeredMaterial() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, normalMap: SURF.dirt_n || null, normalScale: new THREE.Vector2(0.6, 0.6) });
    const grass = getTexture('grassDetail');
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tGrass: { value: grass }, tDirt: { value: SURF.dirt_c }, tRock: { value: SURF.rock_c || SURF.dirt_c }, tConc: { value: SURF.concrete_c || SURF.dirt_c }, tConcN: { value: SURF.concrete_n || SURF.dirt_n } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aLayer; varying vec4 vLayer; varying vec2 vWXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLayer = aLayer; vWXZ = position.xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tDirt, tRock, tConc, tConcN; varying vec4 vLayer; varying vec2 vWXZ;')
        .replace('#include <map_fragment>', `
          vec4 L = vLayer;
          float lsum = L.x + L.y + L.z + L.w;
          vec3 det = vec3(0.6) * max(0.0, 1.0 - lsum);
          if (L.x > 0.01) det += L.x * (texture2D(tGrass, vWXZ / 1.7).rgb * 0.55 + texture2D(tGrass, vWXZ / 6.3).rgb * 0.45);
          if (L.y > 0.01) det += L.y * (texture2D(tDirt, vWXZ / 3.1).rgb * 0.6 + texture2D(tDirt, vWXZ / 11.7).rgb * 0.4);
          if (L.z > 0.01) det += L.z * (texture2D(tRock, vWXZ / 4.3).rgb * 0.6 + texture2D(tRock, vWXZ / 14.1).rgb * 0.4);
          if (L.w > 0.01) det += L.w * texture2D(tConc, vWXZ / 4.0).rgb;
          diffuseColor.rgb *= det * ${NEUTRAL_GAIN.toFixed(2)} / max(lsum + max(0.0, 1.0 - lsum), 1e-3);`)
        .replace('#include <normal_fragment_maps>', `
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 mapN = texture2D(normalMap, vWXZ / 3.1).xyz * 2.0 - 1.0;
            vec3 mapC = texture2D(tConcN, vWXZ / 4.0).xyz * 2.0 - 1.0;
            mapN = normalize(mix(mapN, mapC, vLayer.w));
            mapN.xy *= normalScale * clamp(vLayer.y + vLayer.w + vLayer.x * 0.4 + vLayer.z, 0.0, 1.0);
            normal = normalize(tbn * mapN);
          #endif`);
    };
    mat.customProgramCacheKey = () => 'terrain-layered';
    return mat;
  }

  /** Yağmur ıslaklığı: 0..1 */
  setWetness(w) {
    if (!this.material) return;
    this.material.roughness = lerp(0.96, 0.55, w);
    this.material.color.setScalar(lerp(1, 0.78, w));
  }
}
