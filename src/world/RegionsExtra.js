// Genişletilmiş adanın bölgeleri: çiftlik köyü, deniz feneri, sahil tatil köyü, cezaevi, havaalanı,
// dağ köyü (cami), baraj ve santral, köprü başı. Prosedürel yapılar Geo ile, çarpışmalar fizik dünyasına.
import * as THREE from 'three';
import * as P from './Props.js';
import { Geo } from './Geo.js';
import { REGION_BY_ID, RESERVOIR } from './WorldLayout.js';
import { RNG } from '../core/util.js';

const PI = Math.PI;

export function buildExtraRegions(W) {
  const rng = new RNG('extra-regions');
  farm(W, rng);
  lighthouse(W);
  resort(W, rng);
  prison(W);
  airfield(W, rng);
  village(W, rng);
  dam(W);
  bridgeHead(W);
  roadsideWrecks(W, rng);
}

// ----------------------------------------------------------------------------- yardımcılar
/** Eksen hizalı ahşap çit (direkler + iki kat tahta) */
function woodFence(W, ax, az, bx, bz, y = null) {
  const g = W.geo, T = W.terrain;
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.4));
  const a = Math.atan2(bx - ax, bz - az);
  for (let i = 0; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, yy = y ?? T.heightAt(x, z);
    P.rbox(g, 'wood', x, yy, z, a, -0.07, 0, -0.07, 0.07, 1.15, 0.07, '#7a5a3a');
  }
  for (let i = 0; i < n; i++) {
    const x0 = ax + (bx - ax) * i / n, z0 = az + (bz - az) * i / n, x1 = ax + (bx - ax) * (i + 1) / n, z1 = az + (bz - az) * (i + 1) / n;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, yy = y ?? W.terrain.heightAt(mx, mz), seg = L / n;
    for (const h of [0.45, 0.9]) P.rbox(g, 'wood', mx, yy, mz, a, -0.03, h, -seg / 2, 0.03, h + 0.12, seg / 2, '#9c7650');
  }
  const minX = Math.min(ax, bx) - 0.1, maxX = Math.max(ax, bx) + 0.1, minZ = Math.min(az, bz) - 0.1, maxZ = Math.max(az, bz) + 0.1;
  const yb = y ?? W.terrain.heightAt((ax + bx) / 2, (az + bz) / 2);
  W.physics.addBox(minX, minZ, maxX, maxZ, yb - 1, yb + 1.15, { kind: 'fence', walkable: false });
}

function wall(W, ax, az, bx, bz, y, h = 4, t = 0.6, color = '#b5aea3') {
  P.concreteWall(W.geo, ax, az, bx, bz, y, h, t, color);
  const minX = Math.min(ax, bx) - t / 2, maxX = Math.max(ax, bx) + t / 2, minZ = Math.min(az, bz) - t / 2, maxZ = Math.max(az, bz) + t / 2;
  W.physics.addBox(minX, minZ, maxX, maxZ, y - 1, y + h + 0.4, { kind: 'wall', walkable: false });
}

function tower(W, x, y, z, h = 6, name = 'Gözetleme Kulesi') {
  P.watchTower(W.geo, x, y, z, h);
  for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) W.physics.add({ shape: 'circle', x: x + dx, z: z + dz, r: 0.15, minY: y, maxY: y + h, kind: 'prop' });
  W.physics.addFloor(x - 1.7, z - 1.7, x + 1.7, z + 1.7, y + h + 0.15);
  W.interactable('ladder', x + 1.5, y + h / 2, z, { top: y + h + 0.15, bottom: y, name });
  W.lamp(x, y + h + 1.5, z, 'flood', 0xeaf2ff);
}

/** Dikey silindir yığını (kule, silo, minare) */
function column(g, mat, x, y, z, r, h, color, n = 12) { g.cylinder(mat, x, y, z, r, h, color, n, true); }

// ----------------------------------------------------------------------------- ÇİFTLİK KÖYÜ
function farm(W, rng) {
  const g = W.geo, T = W.terrain, y = REGION_BY_ID.ciftlik.h;
  // ambarın arkasında silo ve yem tankı
  for (const [sx, sz, r, h] of [[-574, 182, 3.2, 13], [-566, 172, 2.2, 9]]) {
    column(g, 'metal', sx, y, sz, r, h, '#c4ccd0', 18);
    column(g, 'metal', sx, y + h, sz, r * 0.75, 1.2, '#9aa5ab', 18);
    column(g, 'metal', sx, y + h + 1.2, sz, r * 0.35, 0.9, '#8a959b', 12);
    W.physics.add({ shape: 'circle', x: sx, z: sz, r, minY: y, maxY: y + h + 2, kind: 'prop' });
  }
  // saman balyaları (bazıları üst üste) — siper olarak kullanılabilir
  for (let i = 0; i < 14; i++) {
    const x = -720 + rng.next() * 150, z = 56 + rng.next() * 30;
    const by = T.heightAt(x, z);
    column(g, 'plain', x, by, z, 0.75, 1.1, rng.pick(['#d9b85a', '#cfae4e', '#e0c46a']), 12);
    W.physics.add({ shape: 'circle', x, z, r: 0.75, minY: by, maxY: by + 1.1, kind: 'prop', walkable: true });
  }
  // tarla çitleri
  woodFence(W, -724, 196, -556, 196);
  woodFence(W, -724, 52, -660, 52); woodFence(W, -620, 52, -556, 52);
  woodFence(W, -724, 52, -724, 120); woodFence(W, -724, 140, -724, 196);
  // korkuluk, su yalağı, el arabası
  P.rbox(g, 'metal', -628, y, 186, 0, -1.4, 0, -0.4, 1.4, 0.6, 0.4, '#7f8c8d');
  W.physics.addBoxC(-628, 186, 1.4, 0.4, y, y + 0.6, { kind: 'prop', walkable: true });
  for (const [x, z] of [[-592, 152], [-610, 151], [-688, 150]]) W.container('barrel', x, z, { h: 1.0 });
  W.container('crate', -585, 182, { h: 0.8, label: 'Tohum Sandığı' });
  W.container('cooler', -598, 118, { h: 0.5, label: 'Süt Soğutucusu' });
  W.placeModel('props', 'barrel_small_stack', -606, 182, 0.4, 1.4);
  W.vehicleSpawns.push({ id: 'tractor', type: 'tractor', x: -620, z: 140, rot: PI / 2, fuel: 0.5, health: 0.8 });
  W.vehicleSpawns.push({ id: 'farm_pickup', type: 'pickup', x: -660, z: 118, rot: -PI / 2, fuel: 0.3, health: 0.6 });
  W.lamp(-640, y + 6, 130, 'street');
}

// ----------------------------------------------------------------------------- DENİZ FENERİ
function lighthouse(W) {
  const g = W.geo, reg = REGION_BY_ID.fener, y = reg.h;
  const x = -598, z = 544;
  // çizgili kule (kırmızı-beyaz bantlar), galeri, fener odası
  const bands = 6, H = 20;
  for (let i = 0; i < bands; i++) column(g, 'plaster', x, y + i * (H / bands), z, 3.0 - i * 0.18, H / bands, i % 2 ? '#c0392b' : '#f4f1ea', 20);
  column(g, 'metal', x, y + H, z, 3.4, 0.25, '#2c3e50', 20);
  for (let a = 0; a < 2 * PI; a += PI / 8) P.rbox(g, 'metal', x + Math.cos(a) * 3.2, y + H + 0.25, z + Math.sin(a) * 3.2, -a, -0.04, 0, -0.04, 0.04, 1.0, 0.04, '#2c3e50');
  column(g, 'emissive', x, y + H + 0.25, z, 1.7, 2.4, '#fff3c4', 16);
  column(g, 'metal', x, y + H + 2.65, z, 2.0, 0.4, '#2c3e50', 16);
  column(g, 'metal', x, y + H + 3.05, z, 0.9, 0.9, '#2c3e50', 10);
  W.physics.add({ shape: 'circle', x, z, r: 3.1, minY: y, maxY: y + H + 4, kind: 'wall' });
  // kapı ve iç merdiven yerine: fener odasına tırmanma (ip merdiven)
  P.rbox(g, 'wood', x, y, z + 3.0, 0, -0.6, 0, -0.05, 0.6, 2.1, 0.08, '#5d4037');
  W.physics.addFloor(x - 3.3, z - 3.3, x + 3.3, z + 3.3, y + H + 0.25);
  W.interactable('ladder', x + 0.5, y + H / 2, z + 3.3, { top: y + H + 0.25, bottom: y, name: 'Fener Kulesi', exitX: x + 2.4, exitZ: z });
  W.interactable('lighthouse', x, y + H + 1, z + 1.2, { name: 'Fener Işığı' });
  W.lighthouse = { x, y: y + H + 1.4, z };
  // kayalık burun ve bekçi bahçesi
  for (const [rx, rz, s] of [[-626, 532, 2.2], [-618, 568, 1.6], [-560, 584, 2.6], [-640, 552, 3.0]]) W.placeModel('props', 'formation-large-rock', rx, rz, rx * 0.1, s, { collide: true, kind: 'rock' });
  W.container('fishing_box', -566, 560, { h: 0.5 });
  W.container('crate', -574, 538, { h: 0.8, label: 'Fener Malzeme Sandığı' });
}

// ----------------------------------------------------------------------------- TATİL KÖYÜ
function resort(W, rng) {
  const g = W.geo, T = W.terrain, y = REGION_BY_ID.tatil.h;
  // otel havuzu
  const px = -180, pz = 716;
  P.rbox(g, 'tiles', px, y, pz, 0, -8, -0.02, -4, 8, 0.12, 4, '#e8f0f2');
  P.rbox(g, 'glass', px, y, pz, 0, -7, 0.13, -3, 7, 0.16, 3, '#3fb1d6');
  W.physics.addFloor(px - 8, pz - 4, px + 8, pz + 4, y + 0.12);
  // plaj şemsiyeleri ve şezlonglar
  for (let i = 0; i < 9; i++) {
    const x = -276 + i * 24 + rng.next() * 6, z = 752 + rng.next() * 18;
    const by = T.heightAt(x, z);
    if (by < 0.2) continue;
    P.rbox(g, 'metal', x, by, z, 0, -0.04, 0, -0.04, 0.04, 2.3, 0.04, '#ecf0f1');
    column(g, 'plain', x, by + 2.2, z, 1.4, 0.12, rng.pick(['#e74c3c', '#f1c40f', '#3498db', '#1abc9c']), 10);
    for (const s of [-1, 1]) P.rbox(g, 'wood', x + s * 1.1, by, z + 0.3, 0.2, -0.3, 0.25, -0.9, 0.3, 0.32, 0.9, '#f5f5f5');
    if (rng.chance(0.4)) W.container(rng.chance(0.5) ? 'cooler' : 'backpack', x + 0.6, z - 0.9, { h: 0.4, label: rng.chance(0.5) ? 'Plaj Soğutucusu' : 'Unutulmuş Plaj Çantası' });
  }
  // cankurtaran kulesi ve iskele
  P.watchTower(g, -150, T.heightAt(-150, 770), 770, 3.2);
  W.physics.addFloor(-151.7, 768.3, -148.3, 771.7, T.heightAt(-150, 770) + 3.35);
  W.interactable('ladder', -148.5, T.heightAt(-150, 770) + 1.6, 770, { top: T.heightAt(-150, 770) + 3.35, bottom: T.heightAt(-150, 770), name: 'Cankurtaran Kulesi' });
  P.dock(g, -205, 776, 1.4, 60, 3, 0);
  for (let i = 0; i < 10; i++) { const x = -284 + i * 22 + rng.next() * 8, z = 744 + rng.next() * 8; W.placeModel('props', rng.chance(0.5) ? 'palm-long' : 'palm-short', x, z, rng.next() * 6, 6 + rng.next() * 2, { collide: false }); }
  W.physics.addFloor(-206.5, 776, -203.5, 836, 1.4);
  W.interactable('fishing_spot', -205, 1.7, 832, { name: 'Balık Tutma Noktası (İskele)', water: 'sea' });
  W.vehicleSpawns.push({ id: 'resort_van', type: 'van', x: -228, z: 660, rot: PI / 2, fuel: 0.45, health: 0.75 });
  W.vehicleSpawns.push({ id: 'resort_car', type: 'sedan', x: -130, z: 660, rot: -PI / 2, fuel: 0.2, health: 0.5 });
  for (const x of [-260, -200, -140, -100]) W.lamp(x, y + 5, 654, 'street');
}

// ----------------------------------------------------------------------------- CEZAEVİ
function prison(W) {
  const g = W.geo, y = REGION_BY_ID.cezaevi.h;
  const [x0, z0, x1, z1] = [634, -128, 768, 6];
  // yüksek duvarlar + dikenli tel; batıda kapı (z -66..-54)
  const hw = 5.2;
  wall(W, x0, z0, x1, z0, y, hw); wall(W, x0, z1, x1, z1, y, hw); wall(W, x1, z0, x1, z1, y, hw);
  wall(W, x0, z0, x0, -66, y, hw); wall(W, x0, -54, x0, z1, y, hw);
  for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x1, z0, x1, z1], [x0, z0, x0, -66], [x0, -54, x0, z1]]) {
    const L = Math.hypot(bx - ax, bz - az), a = Math.atan2(bx - ax, bz - az);
    for (let t = 0; t < L; t += 1.2) {
      const px = ax + (bx - ax) * t / L, pz = az + (bz - az) * t / L;
      P.rbox(g, 'metal', px, y + hw, pz, a, -0.02, 0, -0.5, 0.02, 0.5, 0.5, '#9aa5ab');
    }
  }
  P.barrierArm(g, x0, y, -60, -PI / 2);
  for (const [tx, tz] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x0 + 4, z1 - 4], [x1 - 4, z1 - 4]]) tower(W, tx, y, tz, 7, 'Cezaevi Gözetleme Kulesi');
  // avlu: basketbol potaları, banklar
  for (const [bx, bz] of [[690, -70], [720, -50]]) P.logBench(g, bx, y, bz, 0);
  for (const s of [-1, 1]) { P.rbox(g, 'metal', 700 + s * 14, y, -60, 0, -0.08, 0, -0.08, 0.08, 3.0, 0.08, '#7f8c8d'); P.rbox(g, 'plain', 700 + s * 14, y + 3, -60, 0, -0.6, 0, -0.05, 0.6, 1.0, 0.05, '#ecf0f1'); }
  W.container('locker', 646, -40, { h: 1.8, label: 'Emanet Dolabı' });
  W.container('weapon_locker', 760, -40, { h: 1.8, label: 'Gardiyan Silah Dolabı', locked: 1 });
  W.vehicleSpawns.push({ id: 'prison_police', type: 'police', x: 618, z: -44, rot: PI, fuel: 0.4, health: 0.6 });
  W.vehicleSpawns.push({ id: 'prison_bus', type: 'van', x: 616, z: -78, rot: 0, fuel: 0.15, health: 0.4, broken: true });
}

// ----------------------------------------------------------------------------- HAVAALANI
function airfield(W, rng) {
  const g = W.geo, T = W.terrain, y = REGION_BY_ID.havaalani.h;
  const rz = -770;
  // pist işaretleri: orta çizgi, eşik şeritleri, numaralar
  const ry = (x) => T.heightAt(x, rz) + 0.04;
  for (let x = -100; x < 340; x += 18) P.rbox(g, 'plain', x, ry(x), rz, PI / 2, -0.3, 0, 0, 0.3, 0.02, 9, '#f5f5f5');
  for (const ex of [-112, 352]) for (let k = -12; k <= 12; k += 3) P.rbox(g, 'plain', ex, ry(ex), rz + k, PI / 2, -0.7, 0, -3, 0.7, 0.02, 3, '#f5f5f5');
  // pist kenar ışıkları
  for (let x = -116; x <= 356; x += 24) for (const s of [-1, 1]) { P.rbox(g, 'emissive', x, ry(x), rz + s * 15.5, 0, -0.12, 0, -0.12, 0.12, 0.3, 0.12, s > 0 ? '#ffd27f' : '#9fe0ff'); }
  // rüzgâr tulumu
  P.rbox(g, 'metal', 380, T.heightAt(380, -740), -740, 0, -0.06, 0, -0.06, 0.06, 6, 0.06, '#7f8c8d');
  P.rbox(g, 'plain', 380, T.heightAt(380, -740) + 5.6, -740, PI / 2, -0.35, -0.3, 0, 0.35, 0.3, 2.4, '#e67e22');
  // küçük uçak (önlükte) ve pist sonunda kaza yapmış uçak
  plane(W, 140, -742, -PI / 2, false);
  plane(W, 318, -790, 2.6, true);
  // yakıt tankı ve itfaiye aracı
  P.fuelTank(g, 260, y, -744, 2.2, 5, '#ecf0f1');
  W.physics.add({ shape: 'circle', x: 260, z: -744, r: 2.3, minY: y, maxY: y + 5, kind: 'prop' });
  W.interactable('fuel_pump', 262.8, y + 1, -744, { name: 'Uçak Yakıtı Tankı' });
  W.placeModel('vehicles', 'firetruck', 2, -742, PI / 2, 4.6, { collide: true, kind: 'vehicle' });
  for (let i = 0; i < 4; i++) W.container('crate', 40 + i * 6, -742, { h: 0.8, label: 'Kargo Sandığı' });
  W.vehicleSpawns.push({ id: 'air_moto', type: 'motorcycle', x: 296, z: -704, rot: 0, fuel: 0.6, health: 0.8 });
  W.vehicleSpawns.push({ id: 'air_offroad', type: 'offroad', x: 330, z: -700, rot: PI / 2, fuel: 0.35, health: 0.7 });
  for (let x = -80; x <= 340; x += 60) W.lamp(x, y + 6, -706, 'street');
  void rng;
}

/**
 * Tek motorlu küçük uçak gövdesi: yerel koordinatlarda (burun +Z, tekerlek tabanı y=-1), dönüş a ile
 * (cx,cy,cz) noktasına yerleştirilir. Hikâye sahneleri (düşen uçak, kalkış) de bunu kullanır.
 */
export function planeGeo(g, wrecked, cx = 0, cy = 0, cz = 0, a = 0, colors = null) {
  const body = colors ? colors.body : wrecked ? '#9a9a9a' : '#f4f6f7', stripe = colors ? colors.stripe : wrecked ? '#5a5a5a' : '#c0392b';
  const B = (mat, x0, y0, z0, x1, y1, z1, col) => P.rbox(g, mat, cx, cy, cz, a, x0, y0, z0, x1, y1, z1, col);
  B('metal', -0.75, 0, -4.2, 0.75, 1.5, 3.6, body);
  B('metal', -0.55, 0.2, 3.6, 0.55, 1.25, 4.6, body);
  B('metal', -0.76, 0.6, -4.2, 0.76, 0.85, 3.6, stripe);
  B('glass', -0.7, 1.15, 1.2, 0.7, 1.9, 2.8, '#9fd4ef');
  B('metal', wrecked ? -3.5 : -5.6, 1.45, 0.6, 5.6, 1.6, 2.2, body);
  B('metal', -2.0, 1.0, -4.6, 2.0, 1.12, -3.6, body);
  B('metal', -0.06, 1.12, -4.6, 0.06, 2.6, -3.7, stripe);
  if (!wrecked) {
    for (const s of [-1, 1]) B('metal', s * 1.2 - 0.12, -1.0, 1.4, s * 1.2 + 0.12, 0, 1.8, '#2c3e50');
    B('metal', -0.1, -1.0, 3.8, 0.1, 0, 4.1, '#2c3e50');
  }
}

/** Pervane (yerel; pervane göbeği orijinde, Z ekseni etrafında döner) */
export function propellerGeo(g) { P.rbox(g, 'plain', 0, 0, 0, 0, -1.4, -0.1, -0.04, 1.4, 0.1, 0.04, '#2c3e50'); P.rbox(g, 'metal', 0, 0, 0, 0, -0.12, -0.12, -0.06, 0.12, 0.12, 0.1, '#95a5a6'); }

/** Tek motorlu küçük uçak. Sağlam uçak ayrı bir grup (kalkış sekansında hareket eder), enkaz statik geometri */
function plane(W, x, z, a, wrecked) {
  const by = W.terrain.heightAt(x, z) + (wrecked ? 0.2 : 1.0);
  const c = Math.cos(a), s = Math.sin(a);
  const cols = [];
  for (let t = -4; t <= 4.5; t += 1.5) cols.push(W.physics.add({ shape: 'circle', x: x + s * t, z: z + c * t, r: 0.85, minY: by - 1, maxY: by + 1.6, kind: 'vehicle', walkable: true }));
  for (const sd of [-1, 1]) for (let t = 1.5; t <= 5.5; t += 1.5) cols.push(W.physics.add({ shape: 'circle', x: x + s * 1.4 + c * sd * t, z: z + c * 1.4 - s * sd * t, r: 0.6, minY: by + 1.3, maxY: by + 1.7, kind: 'prop', walkable: true }));
  if (wrecked) {
    planeGeo(W.geo, true, x, by, z, a);
    W.container('body', x + 3, z + 2, { h: 0.3, label: 'Pilotun Cesedi', special: 'pilot_log' });
    return;
  }
  const grp = new THREE.Group();
  grp.name = 'plane';
  const pg = new Geo();
  planeGeo(pg, false);
  W.addGeo(pg, grp);
  const prop = new THREE.Group();
  const pr = new Geo();
  propellerGeo(pr);
  W.addGeo(pr, prop);
  prop.position.set(0, 0.75, 4.66);
  grp.add(prop);
  grp.position.set(x, by, z);
  grp.rotation.y = a;
  W.root.add(grp);
  W.interactable('plane', x, by + 1, z, { name: 'Tek Motorlu Uçak' });
  W.plane = { x, z, a, y: by, group: grp, prop, colliders: cols };
}

// ----------------------------------------------------------------------------- DAĞ KÖYÜ
function village(W, rng) {
  const g = W.geo, y = REGION_BY_ID.dagkoy.h;
  // cami: harim artık girilebilir prosedürel bina (WorldLayout BUILDINGS 'cami', şablon 'mosque'); burada yalnız
  // düz damın üstündeki kubbe kasnağı, kademeli kubbe ve alem (kat yüksekliği: zemin 0,3 + duvar 6 = 6,3)
  const mx = -640, mz = -528, top = y + 6.3;
  P.rbox(g, 'plaster', mx, top, mz, 0, -5.4, 0, -5.4, 5.4, 0.25, 5.4, '#d9d4c6');
  for (let i = 0; i < 6; i++) column(g, 'metal', mx, top + 0.25 + i * 0.75, mz, 5.2 * Math.cos(i / 6 * PI / 2) + 0.2, 0.75, '#6f8a9a', 20);
  column(g, 'metal', mx, top + 4.75, mz, 0.15, 1.6, '#d4af37', 6);
  const nx = mx + 7.6, nz = mz - 5;
  column(g, 'plaster', nx, y, nz, 0.95, 20, '#f2efe6', 12);
  column(g, 'plaster', nx, y + 15, nz, 1.35, 0.5, '#d9d4c6', 12);
  column(g, 'metal', nx, y + 20, nz, 0.7, 1.5, '#6f8a9a', 12);
  column(g, 'metal', nx, y + 21.5, nz, 0.25, 1.8, '#6f8a9a', 8);
  column(g, 'metal', nx, y + 23.3, nz, 0.06, 0.8, '#d4af37', 6);
  W.physics.add({ shape: 'circle', x: nx, z: nz, r: 1.0, minY: y, maxY: y + 22, kind: 'wall' });
  // köy meydanı çeşmesi ve çınar
  P.rbox(g, 'concrete', -640, y, -462, 0, -1.6, 0, -0.5, 1.6, 2.2, 0.5, '#c9c2b0');
  P.rbox(g, 'glass', -640, y, -462, 0, -1.2, 0.2, 0.5, 1.2, 0.5, 1.2, '#4aa3c7');
  W.physics.addBoxC(-640, -462, 1.6, 0.5, y, y + 2.2, { kind: 'prop' });
  W.interactable('water_spring', -640, y + 0.8, -461, { name: 'Köy Çeşmesi' });
  W.vegetation && W.vegetation.add && W.vegetation.add('oak', -628, -466, 0.7, 1.6);
  for (const [x, z] of [[-660, -470], [-618, -470]]) P.logBench(g, x, y, z, 0);
  // taş duvarlar ve saman
  for (const [ax, az, bx, bz] of [[-704, -544, -660, -544], [-620, -544, -576, -544]]) wall(W, ax, az, bx, bz, y, 1.0, 0.6, '#9b9282');
  W.vehicleSpawns.push({ id: 'village_offroad', type: 'offroad', x: -594, z: -480, rot: -PI / 2, fuel: 0.4, health: 0.65, broken: true });
  W.container('cabin_chest', -676, -462, { h: 0.6, label: 'Köylü Sandığı' });
  void rng;
}

// ----------------------------------------------------------------------------- BARAJ
function dam(W) {
  const g = W.geo, T = W.terrain, y = REGION_BY_ID.baraj.h;
  const top = RESERVOIR.level + 2.2;
  // baraj gövdesi: rezervuarın doğu kıyısında kuzey-güney
  const dx = -494, z0 = -236, z1 = -104;
  for (let z = z0; z < z1; z += 4) {
    const base = Math.min(T.heightAt(dx, z), T.heightAt(dx + 4, z)) - 1;
    P.rbox(g, 'concrete', dx, base, z + 2, 0, -2.4, 0, -2, 2.4, top - base, 2, '#b8b2a4');
  }
  P.rbox(g, 'concrete', dx, top, (z0 + z1) / 2, 0, -2.6, 0, -(z1 - z0) / 2, -2.2, 1.0, (z1 - z0) / 2, '#9e978a');
  P.rbox(g, 'concrete', dx, top, (z0 + z1) / 2, 0, 2.2, 0, -(z1 - z0) / 2, 2.6, 1.0, (z1 - z0) / 2, '#9e978a');
  W.physics.addBox(dx - 2.4, z0, dx + 2.4, z1, y - 8, top, { kind: 'wall', walkable: true });
  W.physics.addFloor(dx - 2.2, z0, dx + 2.2, z1, top);
  W.physics.addBox(dx - 2.6, z0, dx - 2.2, z1, top, top + 1, { kind: 'wall', walkable: false });
  W.physics.addBox(dx + 2.2, z0, dx + 2.6, z1, top, top + 1, { kind: 'wall', walkable: false });
  // savak ağzı ve cebri borular (santrale)
  for (const pz of [-200, -192]) {
    P.rbox(g, 'metal', -478, y, pz, PI / 2, -0.8, 0.2, -14, 0.8, 1.8, 0, '#56656c');
    W.physics.addBox(-492, pz - 0.8, -478, pz + 0.8, y, y + 1.8, { kind: 'prop', walkable: true });
  }
  // trafo sahası
  P.chainFence(g, -446, -236, -436, -236, y, 2.2); P.chainFence(g, -436, -236, -436, -222, y, 2.2);
  for (const [tx, tz] of [[-443, -232], [-439, -228]]) { P.rbox(g, 'metal', tx, y, tz, 0, -1, 0, -0.8, 1, 2.2, 0.8, '#6b7b84'); W.physics.addBoxC(tx, tz, 1, 0.8, y, y + 2.2, { kind: 'prop' }); }
  for (let i = 0; i < 6; i++) P.powerPole(g, -430 + i * 30, T.heightAt(-430 + i * 30, -150 + i * 8), -150 + i * 8, 0.26);
  W.interactable('dam_control', -470, y + 1, -216, { name: 'Santral Kontrol Paneli' });
  W.lamp(-494, top + 4, -170, 'street');
}

// ----------------------------------------------------------------------------- KÖPRÜ BAŞI
function bridgeHead(W) {
  const g = W.geo, y = REGION_BY_ID.kopru.h;
  P.sandbags(g, 506, -540, 506, -520, y, 1.1);
  P.sandbags(g, 536, -566, 556, -566, y, 1.0);
  W.physics.addBox(505.6, -540, 506.4, -520, y, y + 1.1, { kind: 'prop' });
  W.placeModel('vehicles', 'vehicle-truck-green', 526, -512, 0.7, 2.0, { collide: true, kind: 'vehicle' });
  W.container('military_crate', 532, -506, { h: 0.9 });
  W.vehicleSpawns.push({ id: 'bridge_truck', type: 'military', x: 512, z: -556, rot: PI * 0.75, fuel: 0.2, health: 0.55, broken: true });
}

// ----------------------------------------------------------------------------- yol kenarı enkazları
function roadsideWrecks(W, rng) {
  const spots = [[-450, 158, 1.4], [-520, -60, 2.6], [228, -480, 0.3], [400, -60, 1.55], [-60, 420, 2.0], [460, -440, 0.6], [-600, -360, 2.2]];
  for (const [x, z, r] of spots) W.abandonedCar(x, z, r, rng, rng.chance(0.4));
}
