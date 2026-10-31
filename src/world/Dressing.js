// Kıyamet sonrası sokak dokusu: şehrin ve mahallelerin "terk edilmiş" görünmesi için
//  - zemin izleri (yağ lekesi, asfalt çatlağı, çöp/kâğıt/gazete, cam kırığı, yanık, fren izi, kuru leke, yaprak,
//    kaldırım dibinde biriken toprak, çakıl/beton kırığı, yola boyanmış SOS): prosedürel doku atlası +
//    tek InstancedMesh (tek çizim çağrısı, gölge alır),
//  - kaldırım kenarlarında, meydan çatlaklarında ve bina diplerinde ot,
//  - kaldırımlarda ve çöp konteynerlerinin yanında çöp torbası yığınları (prosedürel, tek çizim çağrısı),
//  - kutu/şişe çöpü; kaza yerlerinde cam, yağ, çakıl ve yanık izi.
// Yerleşim deterministiktir (tohumlu RNG): her istemci aynı dünyayı görür.
import * as THREE from 'three';
import { ROADS, REGIONS } from './WorldLayout.js';
import { onRoad } from './Roads.js';
import { RNG } from '../core/util.js';

// atlas hücreleri (4×3)
export const DECAL = { oil: 0, crack: 1, litter: 2, glass: 3, scorch: 4, skid: 5, stain: 6, leaves: 7, dirt: 8, sos: 9, papers: 10, gravel: 11 };
const COLS = 4, ROWS = 3, CELL = 256;
// bölge → yol izi yoğunluğu (metre başına), ot, çöp, torba yığını olasılıkları; meydan: düzlükte rastgele iz sayısı
const URBAN = {
  sehir: { per: 0.75, weed: 0.2, litter: 0.05, bags: 0.035, curb: 0.4, plaza: 900 },
  hastane: { per: 0.45, weed: 0.14, litter: 0.03, bags: 0.02, curb: 0.3, plaza: 160 },
  benzin: { per: 0.45, weed: 0.12, litter: 0.03, bags: 0.015, curb: 0.25, plaza: 120 },
  mahalle: { per: 0.22, weed: 0.1, litter: 0.012, bags: 0.008, curb: 0.12, plaza: 0 },
  sanayi: { per: 0.4, weed: 0.16, litter: 0.015, bags: 0.01, curb: 0.3, plaza: 220 },
  liman: { per: 0.3, weed: 0.12, litter: 0.012, bags: 0.01, curb: 0.25, plaza: 120 },
  tatil: { per: 0.16, weed: 0.12, litter: 0.01, bags: 0.004, curb: 0.1, plaza: 0 },
  havaalani: { per: 0.2, weed: 0.14, litter: 0.008, bags: 0.004, curb: 0.12, plaza: 0 },
  cezaevi: { per: 0.16, weed: 0.14, litter: 0.006, bags: 0.004, curb: 0.12, plaza: 0 },
};
const ROAD_KINDS = [['crack', 28], ['oil', 24], ['skid', 9], ['litter', 10], ['papers', 8], ['glass', 6], ['stain', 4], ['gravel', 8], ['scorch', 2]];
const WALK_KINDS = [['litter', 20], ['papers', 14], ['leaves', 18], ['dirt', 18], ['crack', 14], ['stain', 6], ['glass', 5], ['gravel', 8]];
const PLAZA_KINDS = [['crack', 26], ['dirt', 22], ['leaves', 12], ['papers', 10], ['litter', 10], ['stain', 6], ['oil', 6], ['gravel', 8]];
const SIZE = { oil: [1.4, 3.4], crack: [2.2, 5.5], litter: [0.9, 1.8], glass: [0.9, 1.9], scorch: [2.8, 5], skid: [1.0, 1.4], stain: [0.9, 1.9], leaves: [1.2, 2.8], dirt: [1.6, 3.2], sos: [7, 7], papers: [1.2, 2.4], gravel: [1.2, 2.6] };

/** Prosedürel iz atlası (canvas): her hücre saydam zeminde bir iz */
function decalAtlas(seed = 'decals') {
  const rng = new RNG(seed);
  const c = document.createElement('canvas');
  c.width = CELL * COLS; c.height = CELL * ROWS;
  const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % COLS) * CELL, Math.floor(i / COLS) * CELL); g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip(); fn(); g.restore(); };
  const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const H = CELL / 2;
  // yağ lekesi: üst üste düzensiz koyu lekeler, kenarda hafif yanardöner halka
  cell(DECAL.oil, () => {
    for (let k = 0; k < 16; k++) blob(H + rng.range(-50, 50), H + rng.range(-40, 40), rng.range(34, 86), `rgba(10,9,8,${rng.range(0.3, 0.5).toFixed(2)})`);
    for (let k = 0; k < 6; k++) blob(H + rng.range(-70, 70), H + rng.range(-60, 60), rng.range(14, 30), `rgba(${rng.int(50, 90)},${rng.int(40, 70)},${rng.int(70, 120)},0.16)`);
  });
  // asfalt çatlağı: dallanan koyu çizgiler, açık renkli kenar (kırık kenarı)
  cell(DECAL.crack, () => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const paths = [];
    const branch = (x, y, a, len, w, depth) => {
      const pts = [[x, y]];
      for (let s = 0; s < len; s += 6) { a += rng.range(-0.55, 0.55); x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); if (depth < 3 && rng.chance(0.09)) branch(x, y, a + rng.range(-1.3, 1.3), len * 0.45, w * 0.6, depth + 1); }
      paths.push([pts, w]);
    };
    branch(12, H + rng.range(-30, 30), rng.range(-0.3, 0.3), 250, 5, 0);
    branch(H, H + rng.range(-20, 20), rng.range(1.2, 2), 110, 3.2, 1);
    for (const [col, extra] of [['rgba(150,145,138,0.35)', 2.5], ['rgba(10,10,10,0.95)', 0]]) {
      g.strokeStyle = col;
      for (const [pts, w] of paths) { g.lineWidth = w + extra; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
    }
  });
  // çöp: ambalajlar, peçeteler, plastik kapaklar
  cell(DECAL.litter, () => {
    // çoğu soluk/nötr (kâğıt, karton, naylon), arada solmuş renkli ambalaj
    const cols = ['#d9d4c7', '#c9c2b0', '#e2ddd2', '#a89c84', '#8a8070', '#6d6a64', '#2b2b2b', '#d9d4c7', '#b5ab95', '#8e4a3c', '#4a6378', '#a8914a'];
    for (let k = 0; k < 30; k++) {
      g.save(); g.translate(rng.range(26, CELL - 26), rng.range(26, CELL - 26)); g.rotate(rng.range(0, 6.28));
      const w = rng.range(10, 28), h = rng.range(8, 20), col = rng.pick(cols);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
      g.fillStyle = col;
      if (rng.chance(0.3)) { g.beginPath(); g.arc(0, 0, h / 2, 0, Math.PI * 2); g.fill(); } else g.fillRect(-w / 2, -h / 2, w, h);
      g.restore();
    }
  });
  // cam kırıkları: küçük açık mavi/beyaz üçgenler
  cell(DECAL.glass, () => {
    for (let k = 0; k < 120; k++) {
      const x = H + rng.range(-1, 1) * rng.range(0, 115), y = H + rng.range(-1, 1) * rng.range(0, 115), s = rng.range(2, 10);
      g.fillStyle = `rgba(${rng.int(200, 240)},${rng.int(225, 248)},${rng.int(240, 255)},${rng.range(0.55, 0.95).toFixed(2)})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-s, s), y + rng.range(-s, s)); g.lineTo(x + rng.range(-s, s), y + rng.range(-s, s)); g.fill();
    }
  });
  // yanık izi: kömürleşmiş merkez, dışa doğru is
  cell(DECAL.scorch, () => {
    blob(H, H, 122, 'rgba(6,5,4,0.85)');
    for (let k = 0; k < 20; k++) blob(H + rng.range(-75, 75), H + rng.range(-75, 75), rng.range(20, 50), 'rgba(4,4,4,0.4)');
    for (let k = 0; k < 12; k++) blob(H + rng.range(-40, 40), H + rng.range(-40, 40), rng.range(6, 14), 'rgba(90,50,20,0.35)');
  });
  // fren izi: iki paralel koyu şerit (ölçekte uzatılır)
  cell(DECAL.skid, () => {
    for (const x0 of [H - 46, H + 46]) {
      for (let y = 0; y < CELL; y += 2) {
        const a = 0.42 + 0.2 * Math.sin(y * 0.05 + x0) - (y < 30 ? (30 - y) / 50 : 0) - (y > CELL - 30 ? (y - CELL + 30) / 50 : 0);
        g.fillStyle = `rgba(10,10,10,${Math.max(0, a).toFixed(2)})`;
        g.fillRect(x0 - 13 + Math.sin(y * 0.02) * 6, y, 26, 2);
      }
    }
  });
  // kurumuş koyu leke (pas kahvesi; ürkütücü ama ölçülü)
  cell(DECAL.stain, () => {
    blob(H, H, 70, 'rgba(58,22,16,0.6)');
    for (let k = 0; k < 18; k++) { const a = rng.range(0, 6.28), r = rng.range(50, 112); blob(H + Math.cos(a) * r, H + Math.sin(a) * r, rng.range(4, 12), 'rgba(52,20,14,0.55)'); }
  });
  // kuru yapraklar ve çalı çırpı
  cell(DECAL.leaves, () => {
    const cols = ['#8a5a2b', '#a0522d', '#b8860b', '#6b4423', '#7a6a3a', '#9c6b30', '#5d4a2a'];
    for (let k = 0; k < 80; k++) {
      g.save(); g.translate(rng.range(16, CELL - 16), rng.range(16, CELL - 16)); g.rotate(rng.range(0, 6.28));
      g.fillStyle = rng.pick(cols);
      g.beginPath(); g.ellipse(0, 0, rng.range(5, 11), rng.range(2.5, 5), 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.strokeStyle = 'rgba(70,50,30,0.85)'; g.lineWidth = 1.6;
    for (let k = 0; k < 10; k++) { g.beginPath(); const x = rng.range(20, CELL - 20), y = rng.range(20, CELL - 20); g.moveTo(x, y); g.lineTo(x + rng.range(-30, 30), y + rng.range(-30, 30)); g.stroke(); }
  });
  // birikmiş toprak/kum: kaldırım dibine ve meydanlara rüzgârın taşıdığı toz, içinde ot lekeleri
  cell(DECAL.dirt, () => {
    for (let k = 0; k < 26; k++) blob(H + rng.range(-80, 80), H + rng.range(-40, 40), rng.range(28, 64), `rgba(${rng.int(92, 118)},${rng.int(78, 96)},${rng.int(56, 70)},${rng.range(0.22, 0.38).toFixed(2)})`);
    for (let k = 0; k < 14; k++) blob(H + rng.range(-90, 90), H + rng.range(-50, 50), rng.range(6, 16), 'rgba(74,92,40,0.45)');
  });
  // yola boyanmış yardım işareti
  cell(DECAL.sos, () => {
    g.font = 'bold 118px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(240,238,230,0.92)'; g.fillText('SOS', H, H + 4);
    // sprey damlaları ve aşınma
    for (let k = 0; k < 60; k++) { g.fillStyle = 'rgba(240,238,230,0.8)'; g.fillRect(rng.range(30, CELL - 30), rng.range(H + 40, H + 70), 2, rng.range(3, 12)); }
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 120; k++) blob(rng.range(0, CELL), rng.range(0, CELL), rng.range(3, 9), 'rgba(0,0,0,0.7)');
    g.globalCompositeOperation = 'source-over';
  });
  // gazete ve broşürler: büyük, yazılı, bir kısmı buruşuk
  cell(DECAL.papers, () => {
    for (let k = 0; k < 9; k++) {
      g.save(); g.translate(rng.range(40, CELL - 40), rng.range(40, CELL - 40)); g.rotate(rng.range(0, 6.28));
      const w = rng.range(34, 60), h = rng.range(26, 44);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);
      g.fillStyle = rng.pick(['#ece6d4', '#e2dccb', '#f2efe6', '#d9cfb6']); g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgba(40,40,40,0.75)'; g.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, 5);
      g.fillStyle = 'rgba(70,70,70,0.45)';
      for (let l = -h / 2 + 13; l < h / 2 - 3; l += 4) { g.fillRect(-w / 2 + 4, l, w / 2 - 6, 1.4); g.fillRect(2, l, w / 2 - 6, 1.4); }
      if (rng.chance(0.4)) { g.fillStyle = 'rgba(120,120,120,0.5)'; g.fillRect(2, -h / 2 + 12, w / 2 - 6, h * 0.35); }
      g.restore();
    }
  });
  // çakıl ve beton kırıntısı
  cell(DECAL.gravel, () => {
    for (let k = 0; k < 140; k++) {
      const x = H + rng.range(-1, 1) * rng.range(0, 115), y = H + rng.range(-1, 1) * rng.range(0, 115), s = rng.range(2, 8), v = rng.int(110, 175);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 1.5, y + 1.5, s, s * 0.8);
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(x, y, s, s * 0.8);
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Zemin izleri: tek örnekli düzlem; her örnek atlas hücresini aCell özniteliğiyle seçer */
export class Decals {
  constructor(parent, list) {
    const n = list.length;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const cellAttr = new Float32Array(Math.max(1, n) * 2);
    const mat = new THREE.MeshStandardMaterial({ map: decalAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, roughness: 0.9 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = (aCell + vMapUv) * vec2(${(1 / COLS).toFixed(5)}, ${(1 / ROWS).toFixed(5)});`);
    };
    mat.customProgramCacheKey = () => 'decals';
    mat.name = 'decals';
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((d, i) => {
      m.compose(p.set(d.x, d.y, d.z), q.setFromAxisAngle(up, d.rot), s.set(d.sx, 1, d.sz));
      this.mesh.setMatrixAt(i, m);
      // atlas satırları üstten alta: canvas'ın üst satırı v=1 tarafında
      cellAttr[i * 2] = d.cell % COLS;
      cellAttr[i * 2 + 1] = ROWS - 1 - Math.floor(d.cell / COLS);
    });
    this.mesh.count = n;
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellAttr, 2));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'decals';
    parent.add(this.mesh);
  }
}

/** Düşük çokgenli çöp torbası: basık, düğümlü boyun, buruşuk yüzey (köşeleri tohumla bozulmuş ikosahedron) */
function bagGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 9.1 + z * 4.3 + y * 2.1) * 0.06 + Math.sin(y * 11.7 + x * 6.1) * 0.05;
    y = y < 0 ? y * 0.5 : y * 0.8;
    x *= 1 + n; z *= 1 + n;
    if (y > 0.3) { x *= 0.35; z *= 0.35; y += 0.1; }
    p.setXYZ(i, x, y + 0.25, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Çöp torbası yığınları: tek InstancedMesh, örnek başına renk */
export class TrashBags {
  constructor(parent, list) {
    const n = list.length;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0 });
    mat.name = 'trash_bags';
    this.mesh = new THREE.InstancedMesh(bagGeometry(), mat, Math.max(1, n));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((b, i) => {
      m.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e.set(b.tilt, b.rot, b.tilt * 0.6)), s.set(b.s * b.w, b.s * b.h, b.s));
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, c.set(b.color));
    });
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'trash_bags';
    parent.add(this.mesh);
  }
}

const BAG_COLORS = ['#141416', '#1c1d20', '#232427', '#1d2a1e', '#2a2b30', '#1b2433', '#3a3530'];

/**
 * Dünyaya kıyamet sonrası dokusunu ekle. W: WorldBuilder (terrain, instancer, vegetation, buildingAt, assets).
 * spots: kaza yerleri / yanmış araçlar [{x, z, kinds:[...], r, rubble}]
 */
export function buildDressing(W, spots = []) {
  const T = W.terrain, rng = new RNG('dressing');
  const list = [], bags = [];
  const regionOf = (x, z) => { const r = T.regionAt(x, z); return r ? URBAN[r.id] : null; };
  // iz yüksekliği: asfalt şeridi (+0.09), kaldırım (+0.12) ya da çıplak zemin üstünde
  const surfY = (x, z) => T.heightAt(x, z) + (onRoad(x, z, 0) ? 0.1 : onRoad(x, z, 2.3) ? 0.135 : 0.035);
  const pickKind = (table) => { let tot = 0; for (const [, w] of table) tot += w; let r = rng.next() * tot; for (const [k, w] of table) { r -= w; if (r <= 0) return k; } return table[0][0]; };
  const push = (kind, x, z, y, rot, scale = 1, stretch = 1) => {
    if (W.buildingAt(x, z)) return;
    const [a, b] = SIZE[kind];
    const sz = rng.range(a, b) * scale;
    const sx = kind === 'skid' ? sz : sz * rng.range(0.85, 1.15);
    const sl = kind === 'skid' ? rng.range(3.5, 7) : sz * stretch;
    list.push({ cell: DECAL[kind], x, z, y, rot, sx, sz: sl });
  };
  const bagPile = (x, z, n, spread = 1.1) => {
    for (let k = 0; k < n; k++) {
      const bx = x + rng.range(-spread, spread), bz = z + rng.range(-spread * 0.6, spread * 0.6);
      if (W.buildingAt(bx, bz)) continue;
      const s = rng.range(0.62, 1.05), stacked = k > 2 && rng.chance(0.35);
      bags.push({ x: bx, z: bz, y: T.heightAt(bx, bz) + 0.12 + (stacked ? 0.35 * s : 0), rot: rng.range(0, 6.28), tilt: rng.range(-0.25, 0.25), s, w: rng.range(0.9, 1.2), h: rng.range(0.8, 1.15), color: rng.pick(BAG_COLORS) });
    }
  };
  let weeds = 0, litter = 0;
  const weed = (x, z, y, s = 1) => {
    if (!W.vegetation || W.buildingAt(x, z)) return;
    W.vegetation.add(rng.chance(0.78) ? 'grass' : 'fern', x, z, rng.range(0, 6.28), rng.range(0.35, 0.75) * s, y);
    weeds++;
  };
  const LITTER = [['props', 'Can_A', 0.13], ['props', 'Can_B', 0.13], ['props', 'bottle_A_brown', 0.28], ['props', 'bottle_A_green', 0.28]].filter(([k, n]) => W.assets.has(k, n));
  const can = (x, z) => {
    if (!LITTER.length || W.buildingAt(x, z)) return;
    const [kit, name, h] = rng.pick(LITTER);
    const box = W.assets.bbox(kit, name), sc = h / Math.max(0.01, box.max.y - box.min.y);
    const lying = rng.chance(0.7); // devrilmiş ya da dik
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, T.heightAt(x, z) + 0.12 + (lying ? (box.max.x - box.min.x) * sc * 0.5 : -box.min.y * sc), z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(lying ? Math.PI / 2 : 0, rng.range(0, 6.28), 0, 'YXZ')),
      new THREE.Vector3(sc, sc, sc));
    W.instancer.add(kit, name, m, { noShadow: true });
    litter++;
  };
  // ---- yollar boyunca
  for (const road of ROADS) {
    if (road.type !== 'asphalt' || !road.line) continue;
    const line = road.line, hw = road.w / 2;
    let acc = 0, curbAcc = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const d = a.distanceTo(b);
      if (d < 0.01) continue;
      const tx = (b.x - a.x) / d, tz = (b.z - a.z) / d, nx = -tz, nz = tx, dir = Math.atan2(tx, tz);
      for (let s = 0; s < d; s += 1) {
        const px = a.x + tx * s, pz = a.z + tz * s;
        const R = regionOf(px, pz);
        if (!R) continue;
        acc += R.per;
        while (acc >= 1) {
          acc -= 1;
          const onWalk = rng.chance(0.42);
          const side = rng.chance(0.5) ? 1 : -1;
          const off = onWalk ? (hw + rng.range(0.4, 2.1)) * side : rng.range(-hw + 0.6, hw - 0.6);
          const x = px + nx * off, z = pz + nz * off;
          const kind = pickKind(onWalk ? WALK_KINDS : ROAD_KINDS);
          const rot = kind === 'skid' ? dir + rng.range(-0.25, 0.25) : rng.range(0, Math.PI * 2);
          push(kind, x, z, T.heightAt(x, z) + (onWalk ? 0.135 : 0.1), rot);
        }
        // kaldırım dibinde biriken toprak (yol boyunca uzatılmış)
        curbAcc += R.curb;
        if (curbAcc >= 1) {
          curbAcc -= 1;
          const side = rng.chance(0.5) ? 1 : -1, off = (hw - 0.35) * side;
          const x = px + nx * off, z = pz + nz * off;
          push(rng.chance(0.8) ? 'dirt' : 'leaves', x, z, T.heightAt(x, z) + 0.1, dir + Math.PI / 2 + rng.range(-0.15, 0.15), 0.55, 0.45);
        }
        // kaldırım kenarı ve bina dibinde ot (bitki sistemi çizer; ayar kapalıysa görünmez)
        if (rng.chance(R.weed)) {
          const side = rng.chance(0.5) ? 1 : -1;
          const off = (rng.chance(0.55) ? hw + 0.12 : hw + 2.15 + rng.range(0, 0.4)) * side;
          weed(px + nx * off, pz + nz * off, T.heightAt(px + nx * off, pz + nz * off) + 0.12);
        }
        if (rng.chance(R.litter)) { const side = rng.chance(0.5) ? 1 : -1, off = (hw + rng.range(0.3, 2.0)) * side; can(px + nx * off, pz + nz * off); }
        // kaldırımda çöp torbası yığını (yanında taşmış çöp)
        if (rng.chance(R.bags)) {
          const side = rng.chance(0.5) ? 1 : -1, off = (hw + rng.range(0.7, 1.4)) * side;
          const x = px + nx * off, z = pz + nz * off;
          if (!W.buildingAt(x, z)) { bagPile(x, z, rng.int(2, 6)); push(rng.chance(0.5) ? 'litter' : 'papers', x, z, T.heightAt(x, z) + 0.135, rng.range(0, 6.28)); }
        }
      }
    }
  }
  // ---- meydanlar ve otoparklar (bölge düzlükleri): yollardan ve binalardan uzak rastgele izler + çatlak otları
  for (const reg of REGIONS) {
    const R = URBAN[reg.id];
    if (!R || !R.plaza || !reg.plateau) continue;
    const [x0, z0, x1, z1] = reg.plateau;
    for (let k = 0; k < R.plaza; k++) {
      const x = rng.range(x0, x1), z = rng.range(z0, z1);
      if (W.buildingAt(x, z) || W.blocked(x, z, 0.2)) continue;
      const kind = pickKind(PLAZA_KINDS);
      push(kind, x, z, surfY(x, z), rng.range(0, 6.28));
      if (kind === 'crack' && rng.chance(0.45)) weed(x + rng.range(-1, 1), z + rng.range(-1, 1), null, 0.8);
    }
  }
  // ---- çöp konteynerlerinin yanında torba yığınları
  for (const g of W.instancer.groups.values()) {
    if (g.kit !== 'props' || g.name !== 'dumpster') continue;
    for (const mm of g.matrices) {
      const x = mm.elements[12], z = mm.elements[14], a = rng.range(0, 6.28);
      bagPile(x + Math.cos(a) * 2.2, z + Math.sin(a) * 2.2, rng.int(3, 7), 1.3);
      push('litter', x + Math.cos(a) * 1.8, z + Math.sin(a) * 1.8, surfY(x + Math.cos(a) * 1.8, z + Math.sin(a) * 1.8), rng.range(0, 6.28), 1.2);
    }
  }
  // ---- kaza yerleri / yanmış araçlar: yanık, cam, yağ ve moloz
  let rubble = 0;
  for (const sp of spots) {
    for (const kind of sp.kinds) {
      const n = kind === 'scorch' ? 1 : kind === 'glass' ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const a = rng.range(0, 6.28), r = kind === 'scorch' ? 0 : rng.range(0.5, sp.r || 3);
        const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
        push(kind, x, z, surfY(x, z), rng.range(0, 6.28), kind === 'scorch' ? 1.4 : 1);
      }
    }
    if (sp.rubble) {
      // yanan aracın çevresine saçılmış parça ve kül
      for (let k = 0; k < 2; k++) { const a = rng.range(0, 6.28), x = sp.x + Math.cos(a) * 2.8, z = sp.z + Math.sin(a) * 2.8; push('gravel', x, z, surfY(x, z), rng.range(0, 6.28), 1.3); }
      rubble++;
    }
  }
  // ---- yardım işaretleri: otoparkta ve hastane yolunda boyanmış SOS
  for (const [x, z, rot] of [[35, -47, 0.05], [-60, -33, Math.PI / 2]]) push('sos', x, z, surfY(x, z) + 0.01, rot, 1, 0.5);
  const decals = new Decals(W.root, list);
  const bagMesh = new TrashBags(W.root, bags);
  const fac = [];
  for (const b of W.buildings || []) if (b.facade) fac.push(...b.facade);
  const facade = new FacadeDecals(W.root, fac);
  return { decals, bags: bagMesh, facade, count: list.length, bagCount: bags.length, facadeCount: fac.length, weeds, litter, rubble };
}

// ======================================================================= cepheler
// Bina dış duvarlarında yaşlanma: grafiti, afet arama ekiplerinin kapı yanına boyadığı "X" işareti, yırtık
// afişler, yağmur/pas akıntısı, pencere üstünde is, duvar çatlağı, boyanmış uyarılar. Konumlar BuildingGen'de
// açıklıklara (kapı/pencere) çakışmadan seçilir (planFacade); hepsi tek InstancedMesh (FacadeDecals).
export const FACADE = { graffiti: 0, xcode: 1, posters: 2, streaks: 3, soot: 4, cracks: 5, warn: 6, help: 7 };
const FCOLS = 4, FROWS = 2, FCW = 512, FCH = 256;

function facadeAtlas(seed = 'facade') {
  const rng = new RNG(seed);
  const c = document.createElement('canvas');
  c.width = FCW * FCOLS; c.height = FCH * FROWS;
  const g = c.getContext('2d');
  // lw×lh mantıksal tuval hücreyi doldurur (dörtgenin en/boy oranında çizilir, hücreye gerilir)
  const cell = (i, lw, lh, fn) => { g.save(); g.translate((i % FCOLS) * FCW, Math.floor(i / FCOLS) * FCH); g.beginPath(); g.rect(0, 0, FCW, FCH); g.clip(); g.scale(FCW / lw, FCH / lh); fn(lw, lh); g.restore(); };
  const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const spray = (text, x, y, size, fill, stroke) => {
    g.font = `bold ${size}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = size * 0.16; g.strokeStyle = stroke; g.strokeText(text, x, y);
    g.fillStyle = fill; g.fillText(text, x, y);
  };
  const drips = (x0, x1, y, col, n) => { g.fillStyle = col; for (let k = 0; k < n; k++) { const x = rng.range(x0, x1); g.fillRect(x, y, 2.2, rng.range(6, 26)); } };
  // grafiti: kalın konturlu harfler (rastgele isim/sembol), sprey sisi ve damlalar
  cell(FACADE.graffiti, 512, 256, (W, H) => {
    blob(W / 2, H / 2, 210, `rgba(${rng.int(20, 80)},${rng.int(20, 80)},${rng.int(20, 80)},0.18)`);
    spray(rng.pick(['KAOS', 'SON', 'Z-23', 'ÖLÜM', 'BİZ']), W / 2, H / 2, 128, rng.pick(['#c0392b', '#2980b9', '#8e44ad', '#16a085', '#d35400']), 'rgba(15,15,15,0.9)');
    drips(90, W - 90, H / 2 + 50, 'rgba(20,20,20,0.6)', 40);
    g.strokeStyle = 'rgba(240,240,240,0.7)'; g.lineWidth = 7; g.beginPath(); g.moveTo(60, H - 40); g.bezierCurveTo(180, H - 90, 320, H - 10, W - 50, H - 60); g.stroke();
  });
  // afet arama işareti (X kodu): çeyreklerde tarih, ekip, tehlike, bulunan sayısı
  cell(FACADE.xcode, 256, 256, (W, H) => {
    g.strokeStyle = 'rgba(214,72,30,0.92)'; g.lineWidth = 13; g.lineCap = 'round';
    g.beginPath(); g.moveTo(40, 40); g.lineTo(W - 40, H - 40); g.moveTo(W - 40, 40); g.lineTo(40, H - 40); g.stroke();
    g.fillStyle = 'rgba(214,72,30,0.95)'; g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('3/11', W / 2, 46); g.fillText('E-2', 50, H / 2); g.fillText('Z!', W - 50, H / 2); g.fillText(rng.pick(['0', '2', '1+']), W / 2, H - 44);
    drips(60, W - 60, H / 2 + 10, 'rgba(214,72,30,0.55)', 12);
  });
  // yırtık afişler: üst üste kâğıtlar, başlık ve resim blokları, köşeleri kopuk
  cell(FACADE.posters, 256, 256, (W, H) => {
    for (let k = 0; k < 4; k++) {
      g.save(); g.translate(W / 2 + rng.range(-50, 50), H / 2 + rng.range(-40, 40)); g.rotate(rng.range(-0.12, 0.12));
      const w = rng.range(90, 140), h = rng.range(110, 160);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-w / 2 + 4, -h / 2 + 4, w, h);
      g.fillStyle = rng.pick(['#e8e2d0', '#d9c9a3', '#efe9dc', '#c8b48a', '#b9c4c9']); g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = rng.pick(['#8e2a1f', '#1f3a5c', '#2b2b2b', '#5c4a1f']); g.fillRect(-w / 2 + 8, -h / 2 + 8, w - 16, 22);
      g.fillStyle = 'rgba(80,80,80,0.55)'; g.fillRect(-w / 2 + 12, -h / 2 + 40, w - 24, h * 0.35);
      for (let l = 0; l < 4; l++) g.fillRect(-w / 2 + 12, h * 0.05 + l * 9, (w - 24) * rng.range(0.5, 1), 3);
      // yırtık köşe
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 - rng.range(20, 50), h / 2); g.lineTo(w / 2, h / 2 - rng.range(20, 60)); g.fill(); g.globalCompositeOperation = 'source-over';
      g.restore();
    }
  });
  // yağmur ve pas akıntıları: üstten aşağı inceltilmiş koyu çizgiler
  cell(FACADE.streaks, 128, 256, (W, H) => {
    for (let k = 0; k < 22; k++) {
      const x = rng.range(6, W - 6), len = rng.range(H * 0.3, H * 0.95), w = rng.range(2, 7);
      const gr = g.createLinearGradient(0, 0, 0, len);
      const rust = rng.chance(0.35);
      gr.addColorStop(0, rust ? 'rgba(110,60,25,0.55)' : 'rgba(25,25,22,0.5)'); gr.addColorStop(1, 'rgba(25,25,22,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, len);
    }
  });
  // is: pencere üstünden yukarı açılan kara duman izi
  cell(FACADE.soot, 256, 256, (W, H) => {
    for (let k = 0; k < 26; k++) { const t = k / 26; blob(W / 2 + rng.range(-40, 40) * (1 + t), H - 20 - t * (H - 40), 40 + t * 60, `rgba(8,8,8,${(0.32 * (1 - t * 0.7)).toFixed(2)})`); }
  });
  // duvar çatlağı: dallanan çizgi, açık kenarlı
  cell(FACADE.cracks, 256, 256, (W, H) => {
    const paths = [];
    const branch = (x, y, a, len, w, depth) => {
      const pts = [[x, y]];
      for (let s = 0; s < len; s += 5) { a += rng.range(-0.5, 0.5); x += Math.cos(a) * 5; y += Math.sin(a) * 5; pts.push([x, y]); if (depth < 3 && rng.chance(0.1)) branch(x, y, a + rng.range(-1.2, 1.2), len * 0.45, w * 0.6, depth + 1); }
      paths.push([pts, w]);
    };
    branch(W * 0.2, 10, 1.2, 240, 4, 0);
    g.lineCap = 'round';
    for (const [col, extra] of [['rgba(200,195,185,0.4)', 2.5], ['rgba(20,18,16,0.9)', 0]]) { g.strokeStyle = col; for (const [pts, w] of paths) { g.lineWidth = w + extra; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); } }
  });
  // boyanmış uyarılar
  cell(FACADE.warn, 640, 256, (W, H) => {
    spray('GİRMEYİN', W / 2, H * 0.36, 92, 'rgba(178,34,34,0.92)', 'rgba(0,0,0,0)');
    spray('ENFEKTE', W / 2, H * 0.74, 78, 'rgba(178,34,34,0.92)', 'rgba(0,0,0,0)');
    drips(80, W - 80, H * 0.45, 'rgba(178,34,34,0.6)', 26);
  });
  cell(FACADE.help, 640, 256, (W, H) => {
    spray('YARDIM EDİN', W / 2, H * 0.4, 84, 'rgba(236,234,226,0.92)', 'rgba(0,0,0,0)');
    spray('3 KİŞİYİZ', W / 2, H * 0.76, 60, 'rgba(236,234,226,0.9)', 'rgba(0,0,0,0)');
    drips(80, W - 80, H * 0.5, 'rgba(236,234,226,0.55)', 22);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Dikey cephe izleri: tek örnekli düzlem (+Z normal), örnek başına atlas hücresi */
export class FacadeDecals {
  constructor(parent, list) {
    const n = list.length;
    const geo = new THREE.PlaneGeometry(1, 1);
    const cellAttr = new Float32Array(Math.max(1, n) * 2);
    const mat = new THREE.MeshStandardMaterial({ map: facadeAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, roughness: 0.85 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\nvMapUv = (aCell + vMapUv) * vec2(${(1 / FCOLS).toFixed(5)}, ${(1 / FROWS).toFixed(5)});`);
    };
    mat.customProgramCacheKey = () => 'facade-decals';
    mat.name = 'facade_decals';
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((d, i) => {
      m.compose(p.set(d.x, d.y, d.z), q.setFromAxisAngle(up, d.ry), s.set(d.w, d.h, 1));
      this.mesh.setMatrixAt(i, m);
      cellAttr[i * 2] = d.cell % FCOLS;
      cellAttr[i * 2 + 1] = FROWS - 1 - Math.floor(d.cell / FCOLS);
    });
    this.mesh.count = n;
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellAttr, 2));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'facade_decals';
    parent.add(this.mesh);
  }
}

const FACADE_URBAN = new Set(['sehir', 'sanayi', 'liman', 'hastane', 'benzin', 'cezaevi', 'havaalani']);

/**
 * Bir binanın dış duvarlarında cephe izi konumları (BuildingGen çağırır). openings: { F|B|L|R: [{s, e, y0, y1, door|win}] }
 * (y'ler zemin döşemesine göre). Dönüş: [{x, y, z, ry, w, h, cell}] dünya koordinatında.
 */
export function planFacade(spec, tpl, fr, openings, F, H, t) {
  if (spec.id === 'home') return [];
  const rng = new RNG('facade:' + spec.id);
  const urban = FACADE_URBAN.has(spec.region);
  const table = urban
    ? [['graffiti', 26], ['posters', 16], ['streaks', 22], ['cracks', 14], ['warn', 5], ['help', 3]]
    : [['streaks', 50], ['cracks', 30], ['graffiti', 10], ['posters', 8]];
  const pick = () => { let tot = 0; for (const [, w] of table) tot += w; let r = rng.next() * tot; for (const [k, w] of table) { r -= w; if (r <= 0) return k; } return table[0][0]; };
  const out = [];
  const sides = { F: { len: tpl.w, n: [0, 1] }, B: { len: tpl.w, n: [0, -1] }, L: { len: tpl.d, n: [-1, 0] }, R: { len: tpl.d, n: [1, 0] } };
  for (const side of ['F', 'B', 'L', 'R']) {
    const S = sides[side], ops = openings[side] || [];
    const nw = fr.dir(S.n[0], S.n[1]), ry = Math.atan2(nw.x, nw.z), off = t / 2 + 0.02;
    const at = (u, y, w, h, kind) => {
      const tp = side === 'F' ? [u, tpl.d + off] : side === 'B' ? [u, -off] : side === 'L' ? [-off, u] : [tpl.w + off, u];
      const p = fr.pt(tp[0], tp[1]);
      out.push({ x: p.x, y: fr.baseY + F + y, z: p.z, ry, w, h, cell: FACADE[kind] });
    };
    const free = (u0, u1, y0, y1) => u0 > 0.25 && u1 < S.len - 0.25 && y0 > 0.05 && y1 < H - 0.2
      && !ops.some((o) => u1 > o.s - 0.15 && u0 < o.e + 0.15 && y1 > o.y0 - 0.12 && y0 < o.y1 + 0.12)
      && !out.some((d) => d.side === side && Math.abs(d.u - (u0 + u1) / 2) < (d.w + u1 - u0) / 2 && Math.abs(d.yl - (y0 + y1) / 2) < (d.h + y1 - y0) / 2);
    const place = (u, y, w, h, kind) => { at(u, y, w, h, kind); Object.assign(out[out.length - 1], { side, u, yl: y }); };
    // açıklıkların [u0,u1] aralığındaki en yüksek üst kenarı (akıntı ve üst bant yerleşimi için)
    const topIn = (u0, u1) => ops.reduce((m, o) => (u1 > o.s - 0.15 && u0 < o.e + 0.15 ? Math.max(m, o.y1) : m), 0);
    const n = Math.round((S.len / (urban ? 3.6 : 9)) * rng.range(0.7, 1.3));
    let placed = 0;
    for (let k = 0; k < n * 5 && placed < n; k++) {
      const kind = pick();
      let w, h, y;
      if (kind === 'graffiti') { w = rng.range(1.0, 2.8); h = w * 0.5; y = rng.range(0.3, 1.0) + h / 2; }
      else if (kind === 'warn' || kind === 'help') { w = rng.range(1.8, 2.8); h = w * 0.4; y = rng.range(0.5, 1.2) + h / 2; }
      else if (kind === 'posters') { w = rng.range(0.8, 1.4); h = w * rng.range(0.9, 1.1); y = rng.range(0.9, 1.4) + h / 2 - 0.3; }
      else if (kind === 'streaks') { w = rng.range(0.6, 1.4); h = rng.range(1.2, 2.8); y = 0; }
      else { w = rng.range(0.8, 1.6); h = w; y = rng.range(0.4, H - 0.6 - h / 2); }
      const u = rng.range(0.3 + w / 2, S.len - 0.3 - w / 2);
      const top = topIn(u - w / 2, u + w / 2);
      if (kind === 'streaks') {
        // saçaktan aşağı; altındaki pencere/kapının üstünde biter
        h = Math.min(h, H - 0.25 - (top ? top + 0.15 : 0.1));
        if (h < 0.6) continue;
        y = H - 0.25 - h / 2;
      } else if (top && !free(u - w / 2, u + w / 2, y - h / 2, y + h / 2) && kind !== 'cracks') {
        // pencere bandına çarptı: pencerelerin üstündeki bantta dene
        y = top + 0.25 + h / 2;
        if (y + h / 2 > H - 0.2) continue;
      }
      if (free(u - w / 2, u + w / 2, y - h / 2, y + h / 2)) { place(u, y, w, h, kind); placed++; }
    }
    for (const o of ops) {
      // pencere üstünde is (yangın görmüş bina), kapı yanında arama ekibi işareti
      if (o.win && urban && rng.chance(0.16)) { const w = o.e - o.s + 0.5, h = Math.min(1.3, H - o.y1 - 0.2); if (h > 0.5) place((o.s + o.e) / 2, o.y1 + h / 2 - 0.05, w, h, 'soot'); }
      if (o.door && urban && rng.chance(0.45)) { const u = o.s - 0.7; if (free(u - 0.45, u + 0.45, 1.1, 2.0)) place(u, 1.55, 0.9, 0.9, 'xcode'); }
    }
  }
  for (const d of out) { delete d.side; delete d.u; delete d.yl; }
  return out;
}
