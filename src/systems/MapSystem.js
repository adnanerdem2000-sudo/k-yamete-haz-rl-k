// Harita sistemi: araziden üretilen resimli harita, keşif sisi (fog of war), işaretler,
// takım pingleri ve güvenli noktalar arası hızlı seyahat. Çizim ui/MapView.js'te yapılır.
import { WORLD, REGIONS, ROADS, POIS, LAKE, BRIDGE } from '../world/WorldLayout.js';
import { BIOME } from '../world/Terrain.js';
import { roadCenterline } from '../world/Roads.js';
import { clamp, dist, uid, valueNoise, hash2 } from '../core/util.js';

export const FOG_N = 128; // 10 m'lik keşif hücreleri
const FOG_CELL = WORLD.size / FOG_N;
export const MAP_PX = 1536;

// Hızlı seyahat noktaları (keşfedilmiş ve güvenliyse)
export const TRAVEL_POINTS = [
  { id: 'home', name: 'Üs (Evimiz)', x: -282, z: 168 },
  { id: 'camp', name: 'Kamp Alanı', x: -228, z: -32 },
  { id: 'hunt_cabin', name: 'Avcı Kulübesi', x: -140, z: -224 },
  { id: 'gas', name: 'Benzin İstasyonu', x: 58, z: 296 },
  { id: 'mountain', name: 'Dağ Kampı', x: -330, z: -322 },
];

const BIOME_COL = {
  [BIOME.SAND]: [232, 211, 154], [BIOME.LAWN]: [124, 190, 86], [BIOME.GRASS]: [138, 196, 88], [BIOME.FOREST]: [62, 124, 58],
  [BIOME.ROCK]: [146, 136, 124], [BIOME.SNOW]: [242, 245, 248], [BIOME.URBAN]: [190, 176, 152], [BIOME.DIRT]: [170, 130, 86], [BIOME.FIELD]: [214, 192, 100],
};
const ROOF = { mahalle: '#b5523b', sehir: '#8a8f9c', hastane: '#d9dde3', benzin: '#c0392b', sanayi: '#7d8a96', askeri: '#6b7a52', liman: '#4f7ea8', lab: '#9a8fb5', orman: '#7a5a3a', dag: '#7a5a3a' };

/** Dünya → harita pikseli */
export function toMap(x, z, size = MAP_PX) { return { x: (x + WORLD.half) / WORLD.size * size, y: (z + WORLD.half) / WORLD.size * size }; }
export function fromMap(px, py, size = MAP_PX) { return { x: px / size * WORLD.size - WORLD.half, z: py / size * WORLD.size - WORLD.half }; }

let BASE = null;
/** Resimli taban haritayı (bir kez) üret */
export function mapBase(world) {
  if (BASE) return BASE;
  const T = world.terrain;
  const V = T.N + 1;
  const small = document.createElement('canvas');
  small.width = V; small.height = V;
  const sg = small.getContext('2d');
  const img = sg.createImageData(V, V);
  const h = T.h;
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const k = j * V + i;
      const x = -WORLD.half + i * WORLD.cell, z = -WORLD.half + j * WORLD.cell;
      let r, g, b;
      const hh = h[k];
      const inLake = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1 && hh < LAKE.level - 0.1;
      if (hh < -0.3 || inLake) {
        // su: derinliğe göre
        const depth = inLake ? clamp((LAKE.level - hh) / 4, 0, 1) : clamp(-hh / 14, 0, 1);
        r = 64 - depth * 40; g = 150 - depth * 70; b = 200 - depth * 50;
        const wave = valueNoise(x / 18, z / 18, 5) * 6;
        r += wave; g += wave; b += wave;
      } else {
        const c = BIOME_COL[T.biome[k]] || BIOME_COL[BIOME.GRASS];
        // tepe gölgelendirme (kuzeybatıdan ışık)
        const hl = h[k - (i > 0 ? 1 : 0)], hr = h[k + (i < V - 1 ? 1 : 0)], hu = h[k - (j > 0 ? V : 0)], hd = h[k + (j < V - 1 ? V : 0)];
        const shade = clamp(1 + ((hl - hr) + (hu - hd)) * 0.045, 0.62, 1.3);
        const n = 1 + valueNoise(x / 10, z / 10, 7) * 0.06;
        r = c[0] * shade * n; g = c[1] * shade * n; b = c[2] * shade * n;
        // kıyı köpüğü
        if (hh < 0.6) { r = r * 0.6 + 240 * 0.4; g = g * 0.6 + 236 * 0.4; b = b * 0.6 + 220 * 0.4; }
      }
      img.data[k * 4] = r; img.data[k * 4 + 1] = g; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);
  const c = document.createElement('canvas');
  c.width = MAP_PX; c.height = MAP_PX;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, MAP_PX, MAP_PX);
  const S = MAP_PX / WORLD.size;
  // orman ağaç beneklemesi (resimli harita hissi)
  g.save();
  for (let gz = -WORLD.half; gz < WORLD.half; gz += 11) {
    for (let gx = -WORLD.half; gx < WORLD.half; gx += 11) {
      const x = gx + hash2(gx, gz, 1) * 9, z = gz + hash2(gx, gz, 2) * 9;
      const k = Math.round((z + WORLD.half) / WORLD.cell) * V + Math.round((x + WORLD.half) / WORLD.cell);
      const bio = T.biome[k];
      if (bio !== BIOME.FOREST && !(bio === BIOME.GRASS && hash2(gx, gz, 3) < 0.06)) continue;
      if (T.heightAt(x, z) < 1) continue;
      const p = toMap(x, z);
      const r = 2.4 + hash2(gx, gz, 4) * 1.6;
      g.fillStyle = 'rgba(20,52,24,0.5)';
      g.beginPath(); g.arc(p.x + 1, p.y + 1.6, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = hash2(gx, gz, 5) < 0.5 ? 'rgba(58,122,52,0.95)' : 'rgba(76,146,62,0.95)';
      g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
  // yollar
  const order = ['path', 'dirt', 'asphalt'];
  for (const type of order) {
    for (const road of ROADS.filter((r) => r.type === type)) {
      const pts = roadCenterline(road, 4).map((v) => toMap(v.x, v.z));
      const w = Math.max(2, road.w * S);
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (type === 'path') { g.setLineDash([4, 4]); g.strokeStyle = 'rgba(120,86,50,0.9)'; g.lineWidth = 2; }
      else { g.setLineDash([]); g.strokeStyle = type === 'asphalt' ? '#3b3b40' : '#6e5232'; g.lineWidth = w + 2.5; }
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      if (type !== 'path') {
        g.strokeStyle = type === 'asphalt' ? '#e9dfc8' : '#c9a273'; g.lineWidth = w;
        g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      }
    }
  }
  g.setLineDash([]);
  // anakara köprüsü
  {
    const a = toMap(BRIDGE.start.x, BRIDGE.start.z), b = toMap(BRIDGE.end.x, BRIDGE.end.z);
    g.lineCap = 'butt';
    g.strokeStyle = '#2b2b30'; g.lineWidth = 9.2 * S + 3; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = '#c0392b'; g.lineWidth = 9.2 * S; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = '#e9dfc8'; g.lineWidth = 6 * S; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  // binalar
  for (const b of world.buildings) {
    const bx = b.box;
    if (!bx) continue;
    const a = toMap(bx.minX, bx.minZ), e = toMap(bx.maxX, bx.maxZ);
    const col = b.id === 'home' ? '#2ecc71' : b.spec.roofCol || ROOF[b.spec.region] || '#a0522d';
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(a.x + 1.5, a.y + 1.5, e.x - a.x, e.y - a.y);
    g.fillStyle = col;
    g.fillRect(a.x, a.y, e.x - a.x, e.y - a.y);
    g.strokeStyle = 'rgba(30,20,10,0.75)'; g.lineWidth = 1;
    g.strokeRect(a.x + 0.5, a.y + 0.5, e.x - a.x - 1, e.y - a.y - 1);
  }
  // ince parşömen vinyeti
  const vg = g.createRadialGradient(MAP_PX / 2, MAP_PX / 2, MAP_PX * 0.3, MAP_PX / 2, MAP_PX / 2, MAP_PX * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,20,45,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, MAP_PX, MAP_PX);
  BASE = c;
  return c;
}

export class MapSystem {
  constructor(session) {
    this.s = session;
    this.fog = new Uint8Array(FOG_N * FOG_N);
    this.markers = [];
    this.pings = [];
    this.version = 0;
    this._t = 0;
    this.revealAround(session.world.spawn.x, session.world.spawn.z, 90);
  }

  revealAround(x, z, r) {
    const ci = Math.floor((x + WORLD.half) / FOG_CELL), cj = Math.floor((z + WORLD.half) / FOG_CELL);
    const rc = Math.ceil(r / FOG_CELL);
    let changed = false;
    for (let j = cj - rc; j <= cj + rc; j++) for (let i = ci - rc; i <= ci + rc; i++) {
      if (i < 0 || j < 0 || i >= FOG_N || j >= FOG_N) continue;
      if ((i - ci) ** 2 + (j - cj) ** 2 > rc * rc) continue;
      const k = j * FOG_N + i;
      if (!this.fog[k]) { this.fog[k] = 1; changed = true; }
    }
    if (changed) this.version++;
  }

  explored(x, z) {
    const i = Math.floor((x + WORLD.half) / FOG_CELL), j = Math.floor((z + WORLD.half) / FOG_CELL);
    if (i < 0 || j < 0 || i >= FOG_N || j >= FOG_N) return false;
    return !!this.fog[j * FOG_N + i];
  }

  exploredPct() { let n = 0; for (const v of this.fog) n += v; return n / this.fog.length; }

  update(dt) {
    const S = this.s;
    this._t -= dt;
    if (this._t <= 0) {
      this._t = 0.5;
      const p = S.local.pos;
      this.revealAround(p.x, p.z, S.local.vehicle ? 80 : 60 + Math.max(0, p.y - 10) * 0.8);
      // ilk kez görülen bölge bildirimi
      const reg = S.region;
      if (reg && !(this.seenRegions || (this.seenRegions = new Set())).has(reg.id)) {
        this.seenRegions.add(reg.id);
        if (reg.id !== 'mahalle') S.ui.regionBanner && S.ui.regionBanner(reg.name, reg.desc, reg.danger);
      }
    }
    for (let i = this.pings.length - 1; i >= 0; i--) { this.pings[i].t -= dt; if (this.pings[i].t <= 0) this.pings.splice(i, 1); }
    const now = S.time.total;
    for (let i = this.markers.length - 1; i >= 0; i--) { const m = this.markers[i]; if (m.until && now > m.until) this.markers.splice(i, 1); }
  }

  /** ttl: oyun dakikası (yoksa kalıcı) */
  addMarker(x, z, label, icon = 'quest', ttl = 0) {
    const ex = this.markers.find((m) => m.label === label && dist(m.x, m.z, x, z) < 20);
    if (ex) { ex.x = x; ex.z = z; if (ttl) ex.until = this.s.time.total + ttl; return ex; }
    const m = { id: uid('m'), x, z, label, icon, until: ttl ? this.s.time.total + ttl : 0, user: false };
    this.markers.push(m);
    this.version++;
    return m;
  }

  addUserMarker(x, z, label = 'İşaret') {
    const m = { id: uid('u'), x, z, label, icon: 'pin', until: 0, user: true };
    this.markers.push(m);
    this.version++;
    return m;
  }

  removeMarker(id) { const i = this.markers.findIndex((m) => m.id === id); if (i >= 0) { this.markers.splice(i, 1); this.version++; } }

  addPing(x, z, name) { this.pings.push({ x, z, name, t: 10 }); }

  /** Görev hedefleri, POI'ler, bölgeler: arayüz için tek liste */
  pois() {
    return POIS.filter((p) => this.explored(p.x, p.z) || p.id === 'home').map((p) => ({ ...p }));
  }

  regions() { return REGIONS.map((r) => ({ ...r, known: this.explored(r.x, r.z) })); }

  // ======================================================================= hızlı seyahat
  travelPoints() {
    const S = this.s;
    const p = S.local.pos;
    return TRAVEL_POINTS.map((t) => ({ ...t, known: t.id === 'home' || this.explored(t.x, t.z), here: dist(t.x, t.z, p.x, p.z) < 30 }));
  }

  canFastTravel() {
    const S = this.s;
    if (S.local.vehicle) return { ok: false, why: 'Araçtayken hızlı seyahat edilemez.' };
    if (S.localStats.downed) return { ok: false, why: 'Yerdeyken olmaz.' };
    if (S.zombies.threatLevel > 0.15) return { ok: false, why: 'Yakında tehlike var!' };
    if (S.endings.active) return { ok: false, why: 'Son gece hızlı seyahat yok.' };
    const here = this.travelPoints().find((t) => t.here);
    if (!here) return { ok: false, why: 'Hızlı seyahat sadece güvenli noktalardan yapılır (üs, kamp, kulübeler, benzinlik).' };
    return { ok: true, from: here };
  }

  fastTravel(id) {
    const S = this.s;
    const c = this.canFastTravel();
    if (!c.ok) { S.ui.toast(c.why, 'warn'); return false; }
    const t = TRAVEL_POINTS.find((q) => q.id === id);
    if (!t || !(t.id === 'home' || this.explored(t.x, t.z))) return false;
    if (t.id === c.from.id) return false;
    const d = dist(c.from.x, c.from.z, t.x, t.z);
    const mins = Math.round(d / 1.6 / 60 * 1.0 + 10); // yürüme süresi (dk)
    const st = S.localStats;
    st.hunger = Math.max(0, st.hunger - mins / 60 * 4.2);
    st.thirst = Math.max(0, st.thirst - mins / 60 * 6);
    st.energy = Math.max(0, st.energy - mins / 60 * 3.4);
    if (S.isHost && !S.net.active) S.time.advance(mins);
    const y = S.world.physics.groundHeight(t.x, t.z, 200);
    S.local.spawnAt(t.x, y + 0.1, t.z, S.local.yaw);
    S.ui.fadeFlash && S.ui.fadeFlash();
    S.ui.toast(`${t.name} noktasına ulaştın (${mins} dk yürüyüş).`, 'info', 4);
    return true;
  }

  // ======================================================================= kayıt (sis RLE + işaretler)
  serialize() {
    const runs = [];
    let cur = this.fog[0], n = 0;
    for (const v of this.fog) { if (v === cur) n++; else { runs.push(n); cur = v; n = 1; } }
    runs.push(n);
    return { f0: this.fog[0], runs, markers: this.markers.filter((m) => !m.until), regions: [...(this.seenRegions || [])] };
  }

  load(o) {
    if (!o) return;
    if (o.runs) {
      let v = o.f0, k = 0;
      for (const n of o.runs) { this.fog.fill(v, k, Math.min(this.fog.length, k + n)); k += n; v = v ? 0 : 1; }
    }
    this.markers = (o.markers || []).map((m) => ({ ...m }));
    this.seenRegions = new Set(o.regions || []);
    this.version++;
  }

  dispose() {}
}

export { FOG_CELL };
