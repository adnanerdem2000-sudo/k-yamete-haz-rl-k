// Yer altı sığınakları. Her sığınak GERÇEK XZ konumunda, arazinin ~12 m altında kapalı beton (ya da kaya) odalardır:
// zemin + duvarlar + TAVAN (hem görsel hem çarpıştırıcı; arazi alttan görünmez ve gölge düşürmez). Giriş/çıkış
// yüzeydeki kapaktan, merdiven evinden, maden ağzından, mağara yarığından ya da mahzen kapağından kararmalı
// ışınlamayla yapılır; aşağıda merdivenin dibine inilir, merdiven sahanlığı salona açılır.
// world.under bölge kaydı (zoneAt/cavityAt): y'ye kör sistemler (zemin yüksekliği, ışın/görüş hattı, kamera
// kelepçesi, iç mekân algısı, yağmur/ortam ışığı/deniz, zombi algısı) bölgeye duyarlı çalışır.
// Kimlikler açık ve sığınağa bağlı (sh:<id>:…): dünya üretiminin başka hiçbir kimliği kaymaz.
import * as THREE from 'three';
import { Geo, materials } from './Geo.js';
import * as P from './Props.js';
import { signTexture } from './TextureFactory.js';
import { RNG } from '../core/util.js';

const H = 3.2, WALL = 0.3, DEPTH = 12, LW = 1.2;

/**
 * Sığınak verisi. x/z: yüzey girişi (dünya), rot: giriş yönü (rad, 90°'nin katı; yerel +Z dünyada içeri), rooms: yerel
 * dikdörtgenler [x0, z0, x1, z1, tür] (orijin = girişin altındaki merdiven sahanlığının salona açıldığı kenar, +Z
 * içeri), lock: 0 açık / 1 levye ya da maymuncuk / 2 anahtar kartı, entry: stairs | hatch | mine | pit | cellar.
 * Odalar kenar paylaşınca aralarına geçit açılır.
 */
export const SHELTERS = [
  { id: 'sehir', name: 'Şehir Halk Sığınağı', region: 'sehir', x: 63, z: 58, rot: Math.PI, entry: 'stairs', lock: 0, sign: 'SIĞINAK',
    rooms: [[-3, 0, 3, 5, 'hall'], [-9, 5, 9, 15, 'dorm'], [9, 7, 15, 15, 'store'], [-15, 7, -9, 15, 'med']] },
  { id: 'hastane', name: 'Hastane Bodrumu ve Morg', region: 'hastane', x: -102, z: -68, rot: 0, entry: 'stairs', lock: 0, sign: 'BODRUM · MORG',
    rooms: [[-3, 0, 3, 6, 'hall'], [-8, 6, 8, 14, 'morgue'], [8, 6, 14, 12, 'med']] },
  { id: 'askeri', name: 'Askerî Komuta Sığınağı', region: 'askeri', x: 300, z: -318, rot: Math.PI / 2, entry: 'stairs', lock: 1, sign: 'ASKERİ SIĞINAK',
    rooms: [[-3, 0, 3, 6, 'hall'], [-8, 6, 8, 14, 'command'], [-8, 14, 0, 20, 'armory'], [0, 14, 8, 20, 'dorm']] },
  { id: 'ciftlik', name: 'Çiftlik Fırtına Mahzeni', region: 'ciftlik', x: -572, z: 106, rot: 0, entry: 'hatch', lock: 0,
    rooms: [[-2.5, 0, 2.5, 4, 'hall'], [-6, 4, 6, 11, 'cellar']] },
  // kaya halkasının arka (batı) duvarının dibinde, ip merdivenli yarık: odalar batıya, halkanın altına uzanır
  { id: 'orman', name: 'Orman Mağarası', region: 'orman', x: -303.4, z: -196, rot: -Math.PI / 2, entry: 'pit', lock: 0, cave: true,
    rooms: [[-3, 0, 3, 5, 'hall'], [-7, 5, 7, 14, 'cave']] },
  // fener kulesinin doğusunda ahşap mahzen kapağı (kule kapısı yukarı, fener odasına çıkar)
  { id: 'fener', name: 'Fener Mahzeni', region: 'fener', x: -592.5, z: 544, rot: -Math.PI / 2, entry: 'cellar', lock: 0,
    rooms: [[-2.5, 0, 2.5, 4, 'hall'], [-5, 4, 5, 10, 'keeper']] },
  // dağ kampı platosunun batı kenarı: yamaca açılan galeri ağzı, odalar dağın altına
  { id: 'dag', name: 'Eski Maden Galerisi', region: 'dag', x: -368, z: -344, rot: -Math.PI / 2, entry: 'mine', lock: 0, cave: true,
    rooms: [[-2.5, 0, 2.5, 6, 'hall'], [-3, 6, 3, 18, 'mine'], [3, 12, 10, 18, 'mine_end']] },
  { id: 'lab', name: 'Laboratuvar B1 Katı', region: 'lab', x: 12, z: -420, rot: 0, entry: 'stairs', lock: 2, sign: 'B1 · YETKİLİ',
    rooms: [[-3, 0, 3, 6, 'hall'], [-9, 6, 9, 14, 'lab_b1'], [-9, 14, 0, 20, 'server'], [0, 14, 9, 20, 'store']] },
];

/** Yer altı bölge kaydı: noktanın hangi sığınak odası hacminde olduğu */
export class UnderZones {
  constructor() { this.zones = []; }
  add(z) { this.zones.push(z); return z; }
  remove(id) { this.zones = this.zones.filter((z) => z.id !== id); }
  /** (x, y, z) bir sığınağın içinde mi: oda kutuları (zemin −1 m … tavan + 0,5 m) */
  zoneAt(x, y, z) {
    for (const Z of this.zones) {
      if (x < Z.minX || x > Z.maxX || z < Z.minZ || z > Z.maxZ || y < Z.floorY - 1 || y > Z.ceilY + 0.5) continue;
      for (const r of Z.rooms) if (x >= r.minX - 0.05 && x <= r.maxX + 0.05 && z >= r.minZ - 0.05 && z <= r.maxZ + 0.05) return Z;
    }
    return null;
  }
  cavityAt(x, y, z) { return this.zoneAt(x, y, z) !== null; }
}

/** Sığınakları kur (WorldBuilder: tabelalar birleştirilmeden önce; kimlikler ve yerleşim başka hiçbir şeyi kaydırmaz) */
export function buildShelters(W) {
  W.under = W.under || new UnderZones();
  W.shelters = [];
  for (const def of SHELTERS) {
    try { W.shelters.push(buildShelter(W, def)); } catch (e) { console.warn('Sığınak kurulamadı', def.id, e); }
  }
}

function buildShelter(W, def) {
  const T = W.terrain, phys = W.physics;
  const c = Math.cos(def.rot), s = Math.sin(def.rot);
  // yerel (lx, lz) → dünya; yerel +Z dünyada (sin rot, cos rot) yönünde
  const wp = (lx, lz) => ({ x: def.x + lx * c + lz * s, z: def.z - lx * s + lz * c });
  const wbox = (x0, z0, x1, z1) => { const a = wp(x0, z0), b = wp(x1, z1); return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) }; };
  // taban: ayak izi (+3 m pay) üzerindeki en alçak arazinin 12 m altı (üstte ≥ 8,8 m toprak)
  let minT = Infinity;
  for (const [x0, z0, x1, z1] of def.rooms) {
    for (let lx = x0 - 3; lx <= x1 + 3; lx += 2) for (let lz = z0 - 3; lz <= z1 + 3; lz += 2) { const p = wp(lx, lz); minT = Math.min(minT, T.heightAt(p.x, p.z)); }
  }
  const floorY = minT - DEPTH, ceilY = floorY + H;
  const surfY = T.heightAt(def.x, def.z);
  const g = new Geo();
  const rng = new RNG('sh:' + def.id);
  const wallC = def.cave ? '#6e665c' : '#a19d94', floorC = def.cave ? '#4a4239' : '#8a867e', ceilC = def.cave ? '#5b544b' : '#9a968d';
  const mat = 'concrete';
  const rooms = def.rooms.map(([x0, z0, x1, z1, kind], i) => ({ i, x0, z0, x1, z1, kind, ...wbox(x0, z0, x1, z1) }));
  const cols = [];
  const WALLOPT = { kind: 'wall', walkable: false, blocksNav: false };
  const solid = (lx0, lz0, lx1, lz1, y0, y1, opts = WALLOPT) => { const b = wbox(lx0, lz0, lx1, lz1); cols.push(phys.addBox(b.minX, b.minZ, b.maxX, b.maxZ, floorY + y0, floorY + y1, opts)); };
  // ---------------------------------------------------------------- odalar: zemin, tavan
  for (const r of rooms) {
    boxL(g, wp, r.x0, -0.35, r.z0, r.x1, 0, r.z1, floorC, mat, floorY, 4);
    boxL(g, wp, r.x0, H, r.z0, r.x1, H + 0.35, r.z1, ceilC, mat, floorY, 8);
    cols.push(phys.addFloor(r.minX, r.minZ, r.maxX, r.maxZ, floorY, { kind: 'floor' }));
    // tavan döşemesi: kamera ve ışınlar odadan çıkmasın, zıplayan oyuncu tavana çarpsın
    cols.push(phys.addBox(r.minX, r.minZ, r.maxX, r.maxZ, ceilY, ceilY + 0.4, WALLOPT));
  }
  // ---------------------------------------------------------------- geçitler: merdiven sahanlığı → salon, odalar arası
  const openings = [{ axis: 'z', c: 0, s: -LW, e: LW }];
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
    const A = rooms[a], B = rooms[b];
    for (const [axis, ca, cb] of [['z', A.z1, B.z0], ['z', A.z0, B.z1], ['x', A.x1, B.x0], ['x', A.x0, B.x1]]) {
      if (Math.abs(ca - cb) > 0.01) continue;
      const lo = axis === 'z' ? Math.max(A.x0, B.x0) : Math.max(A.z0, B.z0), hi = axis === 'z' ? Math.min(A.x1, B.x1) : Math.min(A.z1, B.z1);
      if (hi - lo < 1.6) continue;
      const mid = (lo + hi) / 2, wdt = Math.min(2.2, hi - lo - 0.4);
      openings.push({ axis, c: ca, s: mid - wdt / 2, e: mid + wdt / 2 });
    }
  }
  // ---------------------------------------------------------------- duvarlar (paylaşılan kenarda geçit)
  for (const r of rooms) {
    for (const [axis, cc, s0, e0, out] of [['z', r.z0, r.x0, r.x1, -1], ['z', r.z1, r.x0, r.x1, 1], ['x', r.x0, r.z0, r.z1, -1], ['x', r.x1, r.z0, r.z1, 1]]) {
      // bu kenar başka bir odanın içine bakıyorsa (paylaşılan kenar) duvar yalnız paylaşılmayan kısımda
      const segs = subtractShared(rooms, r, axis, cc, s0, e0, out).flatMap(([s1, e1]) => cutOpenings(openings, axis, cc, s1, e1));
      for (const [s1, e1] of segs) {
        if (e1 - s1 < 0.05) continue;
        const [lx0, lz0, lx1, lz1] = axis === 'z' ? [s1 - (s1 === s0 ? WALL : 0), cc + (out > 0 ? 0 : -WALL), e1 + (e1 === e0 ? WALL : 0), cc + (out > 0 ? WALL : 0)] : [cc + (out > 0 ? 0 : -WALL), s1, cc + (out > 0 ? WALL : 0), e1];
        boxL(g, wp, lx0, 0, lz0, lx1, H, lz1, wallC, mat, floorY);
        solid(lx0, lz0, lx1, lz1, -0.4, H + 0.4);
      }
    }
  }
  // geçit lentoları (açıklık üstü 2,3 m'den tavana)
  for (const o of openings) {
    const [lx0, lz0, lx1, lz1] = o.axis === 'z' ? [o.s, o.c - WALL / 2, o.e, o.c + WALL / 2] : [o.c - WALL / 2, o.s, o.c + WALL / 2, o.e];
    boxL(g, wp, lx0, 2.3, lz0, lx1, H, lz1, wallC, mat, floorY);
  }
  // ---------------------------------------------------------------- merdiven sahanlığı: yukarı (yüzeye) çıkan merdiven
  // sahanlık salona açıktır; basamaklar arka duvara doğru yükselip tavandaki karanlık kuyuya girer (yukarı çıkış = etkileşim)
  boxL(g, wp, -LW, -0.35, -2.8, LW, 0, 0, floorC, mat, floorY, 4);
  boxL(g, wp, -LW, H, -1.25, LW, H + 0.35, 0, ceilC, mat, floorY, 8);
  boxL(g, wp, -LW, H - 0.02, -2.8, LW, H + 0.35, -1.25, '#0b0a09', 'plain', floorY, 8); // kuyu ağzı (karanlık)
  const stepC = def.cave ? '#5f574d' : '#8f8b83';
  for (let k = 0; k < 8; k++) boxL(g, wp, -1.0, 0, -1.05 - (k + 1) * 0.22, 1.0, (k + 1) * 0.4, -1.05 - k * 0.22, stepC, mat, floorY);
  for (const sx of [-1, 1]) { // korkuluk: basamak boyunca kademeli boru
    for (let k = 0; k < 8; k++) boxL(g, wp, sx * 1.05 - 0.03, (k + 1) * 0.4 + 0.85, -1.05 - (k + 1) * 0.22, sx * 1.05 + 0.03, (k + 1) * 0.4 + 0.9, -1.05 - k * 0.22, '#3c4043', 'metal', floorY);
  }
  for (const sx of [-1, 1]) { boxL(g, wp, sx * LW - (sx > 0 ? 0 : WALL), 0, -2.8, sx * LW + (sx > 0 ? WALL : 0), H, 0, wallC, mat, floorY); solid(sx * LW - (sx > 0 ? 0 : WALL), -2.8, sx * LW + (sx > 0 ? WALL : 0), 0, -0.4, H + 0.4); }
  boxL(g, wp, -LW - WALL, 0, -3.1, LW + WALL, H + 0.35, -2.8, wallC, mat, floorY); solid(-LW - WALL, -3.1, LW + WALL, -2.8, -0.4, H + 0.4);
  solid(-LW, -2.8, LW, -1.05, 0, H); // basamaklar: üstü kuyu (yürünmez; yukarı çıkış etkileşimle)
  { const fb = wbox(-LW, -2.8, LW, 0); cols.push(phys.addFloor(fb.minX, fb.minZ, fb.maxX, fb.maxZ, floorY, { kind: 'floor' })); cols.push(phys.addBox(fb.minX, fb.minZ, fb.maxX, fb.maxZ, ceilY, ceilY + 0.4, WALLOPT)); }
  const exitP = wp(0, -1.45), spawnP = wp(0, -0.55);
  const zone = W.under.add({
    id: def.id, name: def.name, floorY, ceilY, rooms: rooms.map((r) => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, kind: r.kind })),
    minX: Math.min(...rooms.map((r) => r.minX)), maxX: Math.max(...rooms.map((r) => r.maxX)), minZ: Math.min(...rooms.map((r) => r.minZ)), maxZ: Math.max(...rooms.map((r) => r.maxZ)),
    spawn: { x: spawnP.x, y: floorY + 0.05, z: spawnP.z, yaw: def.rot }, cave: !!def.cave,
  });
  // merdiven sahanlığı da bölgenin parçası (iniş noktası merdivenin dibi)
  const st = wbox(-LW, -2.8, LW, 0);
  zone.rooms.push(st); zone.minZ = Math.min(zone.minZ, st.minZ); zone.maxZ = Math.max(zone.maxZ, st.maxZ); zone.minX = Math.min(zone.minX, st.minX); zone.maxX = Math.max(zone.maxX, st.maxX);
  // ---------------------------------------------------------------- yüzey girişi
  const outP = wp(0, -2.4); // girişin önü (yüzeyde çıkış noktası)
  const entry = { x: def.x, z: def.z, y: surfY, out: { x: outP.x, z: outP.z, y: T.heightAt(outP.x, outP.z) + 0.05, yaw: def.rot + Math.PI } };
  surfaceEntrance(W, def, entry, wp);
  W.interactables.push({ id: `sh:${def.id}:enter`, type: 'shelter', shelter: def.id, x: def.x, y: surfY + 1.0, z: def.z, name: def.name });
  W.interactables.push({ id: `sh:${def.id}:exit`, type: 'shelter_exit', shelter: def.id, x: exitP.x, y: floorY + 1.1, z: exitP.z, name: def.name });
  // ---------------------------------------------------------------- donatım yerleşimi
  // geçit önleri, merdiven dibi ve jeneratör boş kalır; her eşya yeri duvar boyunca kaydırılarak bulunur ve sahiplenilir
  const clear = openings.map((o) => (o.axis === 'z' ? [o.s - 0.4, o.c - 1.6, o.e + 0.4, o.c + 1.6] : [o.c - 1.6, o.s - 0.4, o.c + 1.6, o.e + 0.4]));
  clear.push([1.0, 0.6, 2.65, 1.8]); // jeneratör
  const hits = (x0, z0, x1, z1) => clear.some(([a, b, cc, d]) => x0 < cc && x1 > a && z0 < d && z1 > b);
  const spot = (r, lx, lz, hw, hd, slide = 'x') => {
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8, 10, -10, 13, -13]) {
      const x = slide === 'x' ? lx + k * 0.5 : lx, z = slide === 'z' ? lz + k * 0.5 : lz;
      if (x - hw < r.x0 + 0.04 || x + hw > r.x1 - 0.04 || z - hd < r.z0 + 0.04 || z + hd > r.z1 - 0.04) { if (!slide) break; continue; }
      if (hits(x - hw, z - hd, x + hw, z + hd)) { if (!slide) break; continue; }
      clear.push([x - hw - 0.12, z - hd - 0.12, x + hw + 0.12, z + hd + 0.12]);
      return [x, z];
    }
    return null;
  };
  const lights = [];
  let cn = 0;
  const cont = (type, lx, lz, h, label, yaw = 0, front = null) => {
    const p = wp(lx, lz);
    const ct = W.container(type, p.x, p.z, { id: `sh:${def.id}:c${cn++}`, y: floorY, h, label });
    if (front) Object.assign(ct, { yaw: def.rot + yaw, fy: floorY, fmodel: 'proto', ...front });
    return ct;
  };
  const item = (lx0, y0, lz0, lx1, y1, lz1, color, m = 'wood', isSolid = true) => {
    boxL(g, wp, lx0, y0, lz0, lx1, y1, lz1, color, m, floorY);
    if (isSolid) { const b = wbox(lx0, lz0, lx1, lz1); cols.push(phys.addBox(b.minX, b.minZ, b.maxX, b.maxZ, floorY + y0, floorY + y1, { kind: 'prop', walkable: y1 < 1.3, blocksNav: false, blocksSight: y1 > 1.5 })); }
  };
  const goods = ['#c0392b', '#d35400', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#ecf0f1', '#7f8c8d', '#a04000'];
  // duvara (x1) yaslı açık raf: sırt, yanlar, 4 tahta ve üstünde kutular/konserveler
  const shelfX1 = (sx, sz, color = '#8e9aa3', fill = true) => {
    item(sx + 0.17, 0, sz - 0.9, sx + 0.22, 1.9, sz + 0.9, color, 'metal', false);
    for (const e of [-1, 1]) item(sx - 0.25, 0, sz + e * 0.9 - 0.03, sx + 0.22, 1.9, sz + e * 0.9 + 0.03, color, 'metal', false);
    for (let k = 0; k < 4; k++) {
      const y = 0.08 + k * 0.48;
      item(sx - 0.25, y, sz - 0.87, sx + 0.17, y + 0.04, sz + 0.87, '#6f7c84', 'metal', false);
      if (!fill) continue;
      for (let j = 0; j < 3; j++) { if (rng.chance(0.25)) continue; const gz = sz - 0.6 + j * 0.6 + rng.range(-0.1, 0.1), gh = rng.range(0.14, 0.3), gw = rng.range(0.12, 0.2); item(sx - 0.15, y + 0.04, gz - gw, sx + 0.12, y + 0.04 + gh, gz + gw, rng.pick(goods), 'plain', false); }
    }
    const b = wbox(sx - 0.25, sz - 0.93, sx + 0.22, sz + 0.93); cols.push(phys.addBox(b.minX, b.minZ, b.maxX, b.maxZ, floorY, floorY + 1.9, { kind: 'prop', walkable: false, blocksNav: false, blocksSight: true }));
  };
  const beds = [];
  const isCave = (r) => r.kind === 'cave' || r.kind === 'mine' || r.kind === 'mine_end' || (def.cave && r.kind === 'hall');
  for (const r of rooms) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
    // tavan lambası
    if (isCave(r)) { // madenci lambası: kabloyla asılı
      item(cx - 0.02, H - 0.6, cz - 0.02, cx + 0.02, H, cz + 0.02, '#1c1c1c', 'metal', false);
      item(cx - 0.12, H - 0.82, cz - 0.12, cx + 0.12, H - 0.6, cz + 0.12, '#ffcf8a', 'sh_main', false);
    } else boxL(g, wp, cx - 0.25, H - 0.08, cz - 0.25, cx + 0.25, H, cz + 0.25, '#fff3c4', 'sh_main', floorY);
    const lp = wp(cx, cz);
    lights.push({ x: lp.x, y: floorY + H - 0.4, z: lp.z, color: def.cave ? 0xffb066 : 0xfff0c8, intensity: 12, range: Math.max(9, Math.hypot(w, d) * 0.7), on: false, always: true, zone: def.id, main: true });
    switch (r.kind) {
      case 'hall': {
        const b = spot(r, r.x0 + 0.3, r.z1 - 1.2, 0.22, 0.9, 'z');
        if (b) { item(b[0] - 0.22, 0.4, b[1] - 0.9, b[0] + 0.22, 0.46, b[1] + 0.9, '#7a5c3a'); for (const e of [-0.75, 0.75]) item(b[0] - 0.18, 0, b[1] + e - 0.05, b[0] + 0.18, 0.4, b[1] + e + 0.05, '#4d4d4d', 'metal', false); }
        break;
      }
      case 'dorm': {
        const n = Math.max(1, Math.floor((w - 1) / 2.2));
        for (let i = 0; i < n; i++) {
          const p = spot(r, r.x0 + 1.1 + i * 2.2, r.z1 - 1.2, 0.55, 1.05, null);
          if (!p) continue;
          const [bx, bz] = p;
          item(bx - 0.5, 0.3, bz - 1.0, bx + 0.5, 0.42, bz + 1.0, '#5b6655', 'metal');
          item(bx - 0.46, 0.42, bz - 0.96, bx + 0.46, 0.55, bz + 0.96, '#b9b29c', 'plain', false);
          item(bx - 0.5, 1.4, bz - 1.0, bx + 0.5, 1.5, bz + 1.0, '#5b6655', 'metal', false);
          item(bx - 0.46, 1.5, bz - 0.96, bx + 0.46, 1.62, bz + 0.96, '#a9a28c', 'plain', false);
          for (const px of [-0.47, 0.42]) for (const pz of [-0.97, 0.92]) item(bx + px, 0, bz + pz, bx + px + 0.05, 1.65, bz + pz + 0.05, '#3d4438', 'metal', false);
          if (!beds.length) { const bp = wp(bx, bz); beds.push({ x: bp.x, z: bp.z }); }
        }
        const lk = spot(r, r.x0 + 0.5, r.z0 + 0.4, 0.3, 0.28, 'x');
        if (lk) { cont('locker', lk[0], lk[1], 1.2, 'Sığınak Dolabı', 0, { fw: 0.6, fd: 0.55, fh: 1.9, fcol: '#6f7a6a' }); item(lk[0] - 0.3, 0, lk[1] - 0.27, lk[0] + 0.3, 1.9, lk[1] + 0.28, '#6f7a6a', 'metal'); }
        const cr = spot(r, r.x0 + 2.0, r.z0 + 0.6, 0.6, 0.35, 'x');
        if (cr) { cont('crate', cr[0], cr[1], 0.7, 'Erzak Sandığı'); item(cr[0] - 0.6, 0, cr[1] - 0.35, cr[0] + 0.6, 0.65, cr[1] + 0.35, '#7a5c3a'); }
        break;
      }
      case 'store': case 'cellar': case 'mine_end': {
        const ns = Math.max(1, Math.floor((d - 1) / 2.4));
        for (let i = 0; i < ns; i++) {
          const p = spot(r, r.x1 - 0.3, r.z0 + 1.4 + i * 2.4, 0.26, 0.95, 'z');
          if (!p) continue;
          if (r.kind === 'mine_end') { // madenci sandık yığını
            item(p[0] - 0.25, 0, p[1] - 0.9, p[0] + 0.22, 0.6, p[1] - 0.05, '#6e4b1f');
            item(p[0] - 0.25, 0, p[1] + 0.05, p[0] + 0.22, 0.6, p[1] + 0.9, '#7a5530');
            if (i === 0) item(p[0] - 0.22, 0.6, p[1] - 0.6, p[0] + 0.18, 1.1, p[1] + 0.3, '#6e4b1f');
            cont('crate', p[0] - 0.6, p[1], 0.6, 'Madenci Sandığı');
          } else {
            shelfX1(p[0], p[1], r.kind === 'cellar' ? '#7a5c3a' : '#8e9aa3');
            cont('shelf_food', p[0] - 0.55, p[1], 1.0, r.kind === 'cellar' ? 'Konserve Rafı' : 'Erzak Rafı');
          }
        }
        const br = spot(r, r.x0 + 0.65, r.z0 + 0.65, 0.42, 0.42, 'x');
        if (br) {
          const bp = wp(br[0], br[1]);
          cont('barrel', br[0], br[1], 0.9, 'Su Varili');
          g.cylinder('metal', bp.x, floorY, bp.z, 0.38, 0.95, '#2e6a8a', 12);
          cols.push(phys.addBox(bp.x - 0.38, bp.z - 0.38, bp.x + 0.38, bp.z + 0.38, floorY, floorY + 0.95, { kind: 'prop', walkable: true, blocksNav: false }));
        }
        break;
      }
      case 'med': case 'morgue': {
        const sh = spot(r, r.x1 - 0.3, cz, 0.26, 0.95, 'z');
        if (sh) { shelfX1(sh[0], sh[1], '#d5d8dc'); cont('shelf_medical', sh[0] - 0.55, sh[1], 1.0, r.kind === 'morgue' ? 'Morg Dolabı' : 'İlaç Rafı'); }
        if (r.kind === 'morgue') {
          const mg = spot(r, r.x0 + 1.15, cz, 1.0, 1.25, 'z');
          if (mg) {
            item(mg[0] - 1.0, 0, mg[1] - 1.25, mg[0] + 0.95, 2.3, mg[1] + 1.25, '#b8bcc0', 'metal');
            for (let i = 0; i < 3; i++) for (const e of [-0.62, 0.62]) { item(mg[0] + 0.95, 0.25 + i * 0.72, mg[1] + e - 0.55, mg[0] + 1.0, 0.85 + i * 0.72, mg[1] + e + 0.55, '#d0d3d4', 'metal', false); item(mg[0] + 1.0, 0.5 + i * 0.72, mg[1] + e - 0.15, mg[0] + 1.05, 0.58 + i * 0.72, mg[1] + e + 0.15, '#566573', 'metal', false); }
          }
        } else {
          const tb = spot(r, cx, cz, 1.0, 0.42, 'z');
          if (tb) { item(tb[0] - 1.0, 0.72, tb[1] - 0.4, tb[0] + 1.0, 0.85, tb[1] + 0.4, '#e5e8e8', 'metal'); for (const ex of [-0.9, 0.85]) for (const ez of [-0.35, 0.3]) item(tb[0] + ex, 0, tb[1] + ez, tb[0] + ex + 0.05, 0.72, tb[1] + ez + 0.05, '#909497', 'metal', false); }
        }
        const ca = spot(r, cx, r.z0 + 0.55, 0.4, 0.3, 'x');
        if (ca) { cont('medical_cart', ca[0], ca[1], 0.95, 'Sedye Arabası'); item(ca[0] - 0.4, 0.15, ca[1] - 0.28, ca[0] + 0.4, 0.9, ca[1] + 0.28, '#d5d8dc', 'metal'); }
        break;
      }
      case 'command': {
        const tb = spot(r, cx, cz, 2.0, 0.55, 'z');
        if (tb) { item(tb[0] - 2, 0, tb[1] - 0.5, tb[0] + 2, 0.78, tb[1] + 0.5, '#4d5656', 'metal'); item(tb[0] - 1.6, 0.78, tb[1] - 0.4, tb[0] + 1.6, 0.8, tb[1] + 0.4, '#c8b88a', 'plain', false); cont('desk', tb[0], tb[1], 0.8, 'Harita Masası'); }
        const rd = spot(r, r.x0 + 1.45, r.z1 - 0.5, 1.15, 0.35, 'x');
        if (rd) { item(rd[0] - 1.15, 0, rd[1] - 0.35, rd[0] + 1.15, 0.75, rd[1] + 0.35, '#566573', 'metal'); item(rd[0] - 0.5, 0.75, rd[1] - 0.2, rd[0] + 0.4, 1.05, rd[1] + 0.25, '#2c3e50', 'metal', false); cont('radio_desk', rd[0], rd[1], 0.9, 'Telsiz Masası'); }
        const fc = spot(r, r.x1 - 0.5, r.z1 - 0.5, 0.3, 0.3, 'x');
        if (fc) { item(fc[0] - 0.3, 0, fc[1] - 0.3, fc[0] + 0.3, 1.4, fc[1] + 0.3, '#5d6d7e', 'metal'); cont('filing_cabinet', fc[0], fc[1], 1.2, 'Gizli Arşiv'); }
        break;
      }
      case 'armory': {
        for (let i = 0; i < 2; i++) {
          const p = spot(r, r.x0 + 0.48, r.z0 + 1.0 + i * 1.6, 0.28, 0.5, 'z');
          if (!p) continue;
          cont('weapon_locker', p[0], p[1], 1.2, 'Cephanelik Dolabı', Math.PI / 2, { fw: 1.0, fd: 0.55, fh: 2.0, fcol: '#556b2f' });
          item(p[0] - 0.28, 0, p[1] - 0.5, p[0] + 0.27, 2.0, p[1] + 0.5, '#556b2f', 'metal');
        }
        const am = spot(r, cx + 1, cz, 0.6, 0.35, 'z');
        if (am) { item(am[0] - 0.6, 0, am[1] - 0.35, am[0] + 0.6, 0.6, am[1] + 0.35, '#4d5a2a'); cont('ammo_crate', am[0], am[1], 0.7, 'Mühimmat Sandığı'); }
        break;
      }
      case 'cave': case 'mine': {
        for (let i = 0; i < 6; i++) {
          const rx = r.x0 + 0.6 + ((i * 2.9) % (w - 1.2)), rz = r.z0 + 0.6 + ((i * 3.7) % (d - 1.2)), hw = rng.range(0.35, 0.6), hd = rng.range(0.3, 0.55);
          const p = spot(r, rx, rz, hw, hd, null);
          if (p) item(p[0] - hw, 0, p[1] - hd, p[0] + hw, 0.35 + (i % 3) * 0.25, p[1] + hd, rng.pick(['#5a5248', '#615a50', '#544c43']), 'concrete');
        }
        const ch = spot(r, cx, r.z1 - 0.8, 0.5, 0.3, 'x');
        if (ch) { item(ch[0] - 0.5, 0, ch[1] - 0.3, ch[0] + 0.5, 0.55, ch[1] + 0.3, '#6e4b1f'); cont(r.kind === 'cave' ? 'cabin_chest' : 'crate', ch[0], ch[1], 0.55, r.kind === 'cave' ? 'Kaçakçı Zulası' : 'Madenci Sandığı'); }
        if (r.kind === 'cave') {
          const bg = spot(r, r.x0 + 1.4, r.z1 - 0.7, 0.3, 0.25, 'x');
          if (bg) { item(bg[0] - 0.28, 0, bg[1] - 0.2, bg[0] + 0.28, 0.42, bg[1] + 0.2, '#4b5320', 'plain'); cont('backpack', bg[0], bg[1], 0.35, 'Kaçakçı Çantası'); }
          const bd = spot(r, r.x1 - 1.4, cz, 0.45, 1.0, 'z');
          if (bd) { item(bd[0] - 0.45, 0, bd[1] - 1.0, bd[0] + 0.45, 0.12, bd[1] + 1.0, '#5d6d4e', 'plain', false); const bp = wp(bd[0], bd[1]); beds.push({ x: bp.x, z: bp.z }); }
        }
        if (r.kind === 'mine') for (let k = 0; k < Math.floor(d / 3); k++) {
          const lz = r.z0 + 1.5 + k * 3;
          for (const [a, b] of [[r.x0 + 0.08, r.x0 + 0.3], [r.x1 - 0.3, r.x1 - 0.08]]) if (!hits(a, lz - 0.1, b, lz + 0.1)) item(a, 0, lz - 0.1, b, H, lz + 0.1, '#6e4b1f', 'wood', false);
          item(r.x0 + 0.08, H - 0.3, lz - 0.1, r.x1 - 0.08, H - 0.08, lz + 0.1, '#6e4b1f', 'wood', false);
        }
        break;
      }
      case 'lab_b1': {
        for (let i = 0; i < 2; i++) {
          const p = spot(r, r.x0 + 3 + i * 7, cz, 1.0, 0.42, 'z');
          if (!p) continue;
          item(p[0] - 1, 0, p[1] - 0.4, p[0] + 1, 0.9, p[1] + 0.4, '#f4f6f7', 'plain');
          item(p[0] - 0.8, 0.9, p[1] - 0.15, p[0] - 0.6, 1.15, p[1] + 0.05, '#76d7c4', 'glass', false);
          cont('lab_bench', p[0], p[1], 0.95, 'B1 Tezgâhı');
        }
        const tk = spot(r, r.x1 - 1.5, r.z1 - 1.5, 0.75, 0.75, null);
        if (tk) { const tp = wp(tk[0], tk[1]); g.cylinder('glass', tp.x, floorY, tp.z, 0.7, 2.2, '#a3e4d7', 14, false); cols.push(phys.addBox(tp.x - 0.7, tp.z - 0.7, tp.x + 0.7, tp.z + 0.7, floorY, floorY + 2.2, { kind: 'prop', walkable: false, blocksNav: false })); }
        break;
      }
      case 'server': {
        let first = null;
        for (let i = 0; i < 3; i++) {
          const p = spot(r, r.x0 + 1.2 + i * 1.2, r.z1 - 0.55, 0.42, 0.45, null);
          if (!p) continue;
          first = first || p;
          item(p[0] - 0.4, 0, p[1] - 0.45, p[0] + 0.4, 2.1, p[1] + 0.45, '#17202a', 'shiny');
          for (let k = 0; k < 6; k++) item(p[0] - 0.3, 0.3 + k * 0.28, p[1] - 0.47, p[0] + 0.3, 0.33 + k * 0.28, p[1] - 0.45, k % 2 ? '#2ecc71' : '#3498db', 'sh_always', false);
        }
        if (first) cont('server', first[0], first[1] - 0.75, 1.0, 'Sunucu Kabini');
        break;
      }
      case 'keeper': {
        const bd = spot(r, r.x0 + 0.7, r.z1 - 1.2, 0.5, 1.0, 'z');
        if (bd) { item(bd[0] - 0.5, 0, bd[1] - 1.0, bd[0] + 0.5, 0.45, bd[1] + 1.0, '#6e4b1f'); item(bd[0] - 0.45, 0.45, bd[1] - 0.95, bd[0] + 0.45, 0.55, bd[1] + 0.95, '#c9b99a', 'plain', false); const bp = wp(bd[0], bd[1]); beds.push({ x: bp.x, z: bp.z }); }
        const ch = spot(r, r.x1 - 0.8, r.z1 - 0.6, 0.5, 0.3, 'x');
        if (ch) { cont('cabin_chest', ch[0], ch[1], 0.55, 'Bekçi Sandığı', Math.PI, { fw: 1.0, fd: 0.6, fh: 0.6, fcol: '#6e4b1f' }); item(ch[0] - 0.5, 0, ch[1] - 0.3, ch[0] + 0.5, 0.55, ch[1] + 0.3, '#7e5109'); }
        const fb = spot(r, cx, r.z0 + 0.45, 0.3, 0.22, 'x');
        if (fb) { item(fb[0] - 0.3, 0, fb[1] - 0.22, fb[0] + 0.3, 0.35, fb[1] + 0.22, '#2e86c1', 'plain'); cont('fishing_box', fb[0], fb[1], 0.5, 'Balıkçı Kutusu'); }
        break;
      }
      default: break;
    }
  }
  // mağara/maden: düz beton duvar yerine düzensiz kaya yüzü (geçit önleri ve eşyalar boş kalır)
  if (def.cave) for (const r of rooms) {
    for (const [axis, cc, a0, a1, inward] of [['z', r.z0, r.x0, r.x1, 1], ['z', r.z1, r.x0, r.x1, -1], ['x', r.x0, r.z0, r.z1, 1], ['x', r.x1, r.z0, r.z1, -1]]) {
      for (let t = a0 + 0.3; t < a1 - 0.3; t += rng.range(1.0, 1.6)) {
        const len = rng.range(0.7, 1.5), dep = rng.range(0.15, 0.5), top = rng.chance(0.35) ? H : rng.range(0.9, 2.6);
        const e = Math.min(a1 - 0.02, t + len);
        const [x0, z0, x1, z1] = axis === 'z' ? [t, inward > 0 ? cc : cc - dep, e, inward > 0 ? cc + dep : cc] : [inward > 0 ? cc : cc - dep, t, inward > 0 ? cc + dep : cc, e];
        if (hits(x0, z0, x1, z1)) continue;
        item(x0, 0, z0, x1, top, z1, rng.pick(['#5f574d', '#675e53', '#564e45', '#6e665c']), 'concrete');
      }
    }
  }
  // jeneratör (salon): ana ışıkları yakar; acil durum ışığı (kızıl, kısık) hep yanar
  const gp = wp(1.8, 1.2);
  P.generatorModel(g, gp.x, floorY, gp.z, def.rot, false);
  solid(1.05, 0.7, 2.55, 1.7, 0, 1.15, { kind: 'prop', walkable: false, blocksNav: false });
  W.interactables.push({ id: `sh:${def.id}:power`, type: 'shelter_power', shelter: def.id, x: gp.x, y: floorY + 0.9, z: gp.z, name: def.name });
  const ep = wp(0, 0.6);
  boxL(g, wp, -0.18, H - 0.1, 0.5, 0.18, H, 0.7, '#ff5a3c', 'sh_always', floorY);
  lights.push({ x: ep.x, y: floorY + H - 0.3, z: ep.z, color: 0xff6040, intensity: 5, range: 7, on: true, always: true, zone: def.id, emergency: true });
  beds.forEach((b, i) => W.interactables.push({ id: `sh:${def.id}:bed${i}`, type: 'bed', shelter: def.id, x: b.x, y: floorY + 0.5, z: b.z, name: def.name + ' — Yatak', rot: def.rot }));
  // ---------------------------------------------------------------- ağlar (sığınak başına ayrı grup: yalnız içindeyken çizilir)
  const grp = new THREE.Group();
  grp.name = 'shelter:' + def.id;
  // lamba gövdeleri sokak elektriğine bağlı ortak ışıklı malzemeyi değil, sığınağın kendi malzemesini kullanır: ana
  // lambalar jeneratörle yanar (Shelters.applyLights), acil durum ışığı ve sunucu ledleri hep yanar
  const mainMat = shelterGlow(0), alwaysMat = shelterGlow(1);
  for (const m of g.toMeshes()) {
    m.receiveShadow = true; m.castShadow = false;
    if (m.name === 'geo:sh_main') m.material = mainMat;
    else if (m.name === 'geo:sh_always') m.material = alwaysMat;
    grp.add(m);
  }
  (W.underRoot || (W.underRoot = (() => { const r0 = new THREE.Group(); r0.name = 'underground'; W.root.add(r0); return r0; })())).add(grp);
  grp.visible = false;
  return { def, zone, group: grp, entry, lights, floorY, ceilY, cols, mainMat };
}

/** Sığınak lamba gövdesi malzemesi: köşe renkleriyle ışıyan (Geo'nun ışıklı malzemesiyle aynı gölgelendirici eki) */
function shelterGlow(intensity) {
  const base = materials().emissive;
  const m = base.clone();
  m.onBeforeCompile = base.onBeforeCompile;
  m.customProgramCacheKey = base.customProgramCacheKey;
  m.emissiveIntensity = intensity;
  m.name = 'shelter_glow';
  return m;
}

/** Yerel kutu (döndürülmüş dikdörtgen, rot 90°'nin katı) → Geo dünya kutusu; y değerleri tabana göre */
function boxL(g, wp, x0, y0, z0, x1, y1, z1, color, mat, baseY, faces = 63) {
  const a = wp(x0, z0), b = wp(x1, z1);
  g.box(mat, Math.min(a.x, b.x), baseY + y0, Math.min(a.z, b.z), Math.max(a.x, b.x), baseY + y1, Math.max(a.z, b.z), color, faces);
}

/** Kenarın başka bir odanın içine bakan (paylaşılan) kısımlarını çıkar: kalan duvar parçaları [s, e] */
function subtractShared(rooms, r, axis, cc, s0, e0, out) {
  let segs = [[s0, e0]];
  for (const o of rooms) {
    if (o === r) continue;
    let shared = false, lo = 0, hi = 0;
    if (axis === 'z' && Math.abs((out > 0 ? o.z0 : o.z1) - cc) < 0.01) { shared = true; lo = o.x0; hi = o.x1; }
    if (axis === 'x' && Math.abs((out > 0 ? o.x0 : o.x1) - cc) < 0.01) { shared = true; lo = o.z0; hi = o.z1; }
    if (!shared) continue;
    // paylaşılan kısımda duvarı yalnız bir oda çizsin: düşük indeksli oda çizer (yarım duvar çakışması olmasın)
    if (o.i < r.i) segs = segs.flatMap(([s, e]) => (hi <= s || lo >= e ? [[s, e]] : [[s, Math.max(s, lo)], [Math.min(e, hi), e]].filter(([a, b]) => b - a > 0.01)));
  }
  return segs;
}

function cutOpenings(openings, axis, cc, s, e) {
  let segs = [[s, e]];
  for (const o of openings) {
    if (o.axis !== axis || Math.abs(o.c - cc) > 0.01) continue;
    segs = segs.flatMap(([a, b]) => (o.e <= a || o.s >= b ? [[a, b]] : [[a, Math.max(a, o.s)], [Math.min(b, o.e), b]].filter(([x, y]) => y - x > 0.01)));
  }
  return segs;
}

/** Yüzey girişi: merdiven evi (çelik kapılı beton kulübe + tabela), kapak, maden ağzı, ip merdivenli yarık, mahzen kapağı */
function surfaceEntrance(W, def, entry, wp) {
  const g = W.geo, T = W.terrain, phys = W.physics;
  const y = entry.y;
  // yerel kutu (taban = giriş yüksekliği ya da verilen y); col verilirse çarpıştırıcı da eklenir
  const B = (lx0, ly0, lz0, lx1, ly1, lz1, color, m = 'concrete', col = null, by = y) => {
    const a = wp(lx0, lz0), b = wp(lx1, lz1);
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
    g.box(m, x0, by + ly0, z0, x1, by + ly1, z1, color);
    if (col) phys.addBox(x0, z0, x1, z1, by + ly0, by + ly1, col);
  };
  if (def.entry === 'hatch') {
    P.bunkerHatch(g, def.x, y, def.z);
    phys.addBoxC(def.x, def.z, 1.3, 1.3, y - 0.2, y + 0.35, { kind: 'prop', walkable: true }); // bitki/kaya saçılımı kapağın üstüne düşmesin
    return;
  }
  if (def.entry === 'stairs') {
    // 3,2 × 3,4 m beton merdiven evi; kapı girişin önünde (yerel −Z), üstünde tabela
    B(-1.6, -0.3, -1.0, 1.6, 2.7, 2.4, '#8f8b83', 'concrete', { kind: 'prop', walkable: false });
    B(-1.75, 2.7, -1.15, 1.75, 2.9, 2.55, '#7b776f');
    B(-0.62, 0, -1.06, 0.62, 2.12, -1.0, '#2f3a2f', 'metal');
    B(-0.6, 0, -1.07, 0.6, 2.1, -1.04, '#3d4a3d', 'metal');
    B(0.32, 0.95, -1.13, 0.48, 1.05, -1.07, '#b7b7b7', 'metal'); // kol
    B(-0.75, -0.3, -1.6, 0.75, 0.08, -1.0, '#a19d94'); // basamak
    if (def.sign) {
      const tex = signTexture(def.sign, def.lock ? '#c0392b' : '#f1c40f', def.lock ? '#ffffff' : '#1b1b1b', 512, 128);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), mat);
      const p = wp(0, -1.03);
      sg.position.set(p.x, y + 2.42, p.z);
      sg.rotation.y = def.rot + Math.PI; // yerel −Z'ye (kapının baktığı yöne) bakar
      sg.name = 'sign';
      W.root.add(sg);
    }
    return;
  }
  if (def.entry === 'mine') {
    // yamaca gömülü maden ağzı: derin karanlık galeri, iki yanda ve üstte kaya kütlesi, ahşap kasa, dışarı uzanan raylar
    B(-1.1, -0.3, -0.22, 1.1, 2.32, 1.8, '#0d0b09', 'plain', { kind: 'wall', walkable: false, blocksNav: false });
    B(-3.5, -0.8, -0.9, -1.36, 3.0, 2.6, '#6e6a63', 'concrete', { kind: 'rock', walkable: false });
    B(1.36, -0.8, -0.9, 3.7, 3.4, 2.6, '#7b766e', 'concrete', { kind: 'rock', walkable: false });
    B(-2.7, 2.5, -0.8, 2.9, 4.1, 2.6, '#726d65', 'concrete', { kind: 'rock', walkable: false });
    B(-2.2, 3.4, 0.2, 2.0, 4.8, 2.6, '#69645c');
    for (const sx of [-1, 1]) B(sx * 1.24 - 0.13, -0.1, -0.46, sx * 1.24 + 0.13, 2.45, -0.2, '#6e4b1f', 'wood');
    B(-1.55, 2.3, -0.52, 1.55, 2.62, -0.16, '#6e4b1f', 'wood');
    B(-0.9, 2.68, -0.87, 0.9, 3.04, -0.81, '#d4ac0d', 'plain'); // uyarı levhası (kaya yüzünde, kasanın üstünde)
    for (let k = 0; k < 7; k++) {
      const lz = -0.55 - k * 0.6, p = wp(0, lz), hy = T.heightAt(p.x, p.z);
      B(-0.72, -0.02, lz - 0.09, 0.72, 0.06, lz + 0.09, '#5d4037', 'wood', null, hy);
      for (const sx of [-0.45, 0.45]) B(sx - 0.035, 0.06, lz - 0.31, sx + 0.035, 0.13, lz + 0.31, '#5d6d7e', 'metal', null, hy);
    }
    return;
  }
  if (def.entry === 'pit') {
    // kaya halkasının dibinde karanlık yarık; ahşap çatkıdan sarkan ip merdiven aşağı iner
    B(-1.0, -0.05, -0.55, 1.0, 0.04, 0.55, '#0b0907', 'plain');
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, lx = Math.cos(a) * 1.3, lz = Math.sin(a) * 0.85; B(lx - 0.24, -0.1, lz - 0.2, lx + 0.24, 0.16 + (i % 3) * 0.07, lz + 0.2, i % 2 ? '#6e6a63' : '#7b766e'); }
    for (const sx of [-1, 1]) B(sx * 1.18 - 0.07, -0.1, -0.07, sx * 1.18 + 0.07, 1.75, 0.07, '#6e4b1f', 'wood', { kind: 'prop', walkable: false });
    B(-1.32, 1.66, -0.06, 1.32, 1.78, 0.06, '#6e4b1f', 'wood');
    for (const sx of [-0.24, 0.24]) B(sx - 0.02, -0.7, -0.02, sx + 0.02, 1.66, 0.02, '#a1887f', 'plain');
    for (let k = 0; k < 5; k++) B(-0.26, 0.1 + k * 0.3, -0.03, 0.26, 0.14 + k * 0.3, 0.03, '#8d6e63', 'wood');
    return;
  }
  if (def.entry === 'cellar') {
    // ahşap kanatlı mahzen kapağı (beton çerçeve, demir şeritler, kulplar)
    B(-0.95, -0.25, -1.05, 0.95, 0.3, 1.05, '#9e9a90', 'concrete', { kind: 'prop', walkable: true });
    for (const sx of [-1, 1]) B(sx > 0 ? 0.03 : -0.83, 0.3, -0.92, sx > 0 ? 0.83 : -0.03, 0.37, 0.92, '#7a5230', 'wood');
    for (const lz of [-0.62, 0, 0.62]) B(-0.83, 0.37, lz - 0.04, 0.83, 0.39, lz + 0.04, '#2b2b2b', 'metal');
    for (const sx of [-1, 1]) B(sx * 0.2 - 0.05, 0.37, -0.32, sx * 0.2 + 0.05, 0.44, -0.16, '#3d3d3d', 'metal');
    return;
  }
}
