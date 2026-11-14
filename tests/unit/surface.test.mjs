// Tek yüzey sınıflayıcı (World.surfaceAt, src/world/WorldBuilder.js): ayak sesleri (STEP_SOUND), araç tutunması
// (Vehicles.driveSurface), Benchmark. Gerçek arazi, gerçek yol şeritleri (buildRoads), gerçek binalar (BuildingGen),
// gerçek sığınaklar (Underground) ve gerçek köprü (World.bridge) Node'da varlıksız kurulur: World.prototype +
// CollisionWorld + UnderZones. Eski iki sınıflayıcının (Session.surfaceAt, Terrain.surfaceAt) özgün kopyaları
// karşılaştırma için aşağıda: yol ve yapı dışında sonuçlar aynı kalmalı, yalnız belgelenen farklar (deniz köşesi kum,
// su üstü araç kum) olabilir.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Terrain, BIOME } from '../../src/world/Terrain.js';
import { CollisionWorld } from '../../src/world/Physics.js';
import { UnderZones, buildShelters } from '../../src/world/Underground.js';
import { buildBuilding, FLOOR_LIFT, FLOOR_SURFACE } from '../../src/world/BuildingGen.js';
import { BUILDINGS, ROADS, BRIDGE, LAKES } from '../../src/world/WorldLayout.js';
import { buildRoads, roadSurfaceAt, onRoad } from '../../src/world/Roads.js';
import { World, SURFACE_MATERIALS } from '../../src/world/WorldBuilder.js';
import { Geo } from '../../src/world/Geo.js';
import { STEP_SOUND } from '../../src/systems/AudioManager.js';
import { SURFACES, driveSurface } from '../../src/systems/Vehicles.js';
import { Build } from '../../src/systems/Build.js';

// kanvas dokuları (tabela, malzeme haritaları) için en küçük belge taklidi: her erişim zincirlenebilir boş nesne
const deep = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'length' ? 0 : k === 'then' ? undefined : deep()), apply: () => deep(), construct: () => deep(), set: () => true });
globalThis.document = { createElement: () => deep() };

/** Rapier karakter denetleyicisinin deri payı (PhysicsWorld CharacterBody: createCharacterController(0.03)): yerel oyuncunun ayağı */
const KCC_SKIN = 0.03;
/** WorldBuilder.build'deki kaldırımlı (kentsel) yol bölgeleri */
const URBAN = ['sehir', 'hastane', 'mahalle', 'benzin', 'tatil', 'havaalani', 'cezaevi', 'ciftlik'];

// ======================================================================= eski sınıflayıcıların özgün kopyaları
/** Eski Terrain.surfaceAt (araç sözlüğü; yüksekliğe kör) */
function oldTerrainSurfaceAt(T, x, z) {
  const ix = Math.round((x + T.half) / T.cell), iz = Math.round((z + T.half) / T.cell);
  const k = T.idx(Math.max(0, Math.min(T.N, ix)), Math.max(0, Math.min(T.N, iz)));
  if (T.roadMask && T.roadMask[k] >= 1) return 'asphalt';
  if (T.roadMask && T.roadMask[k] > 0) return 'dirt'; // toprak yol
  switch (T.biome[k]) {
    case BIOME.URBAN: return 'concrete';
    case BIOME.DIRT: case BIOME.FIELD: return 'dirt';
    case BIOME.SAND: case BIOME.SEA: return 'sand';
    case BIOME.ROCK: return 'rock';
    case BIOME.SNOW: return 'snow';
    default: return 'grass';
  }
}
/** Eski Session.surfaceAt (ayak sesi sözlüğü); world: { terrain, under, buildingAt } */
function oldSessionSurfaceAt(world, p, inside = null) {
  const T = world.terrain;
  const th = T.heightAt(p.x, p.z);
  if (p.y < th - 1 && world.under) { const Z = world.under.zoneAt(p.x, p.y + 0.5, p.z); if (Z) return Z.cave ? 'gravel' : 'hard'; }
  if (p.y - th > 0.35) {
    const b = inside || world.buildingAt(p.x, p.z);
    if (b) { const f = b.tpl && b.tpl.style && b.tpl.style.floor; return f === 'woodfloor' || f === 'wood' ? 'wood' : f === 'tiles' ? 'tile' : 'hard'; }
    return p.y - th > 1.2 ? 'metal' : 'wood'; // araç tavanı, iskele, yapı platformu
  }
  if (T.waterLevelAt(p.x, p.z) > th + 0.05) return 'water';
  const ix = Math.round((p.x + T.half) / T.cell), iz = Math.round((p.z + T.half) / T.cell);
  const k = T.idx(Math.max(0, Math.min(T.N, ix)), Math.max(0, Math.min(T.N, iz)));
  const rm = T.roadMask[k];
  if (rm >= 1) return 'hard';
  if (rm > 0) return 'gravel';
  switch (T.biome[k]) {
    case BIOME.SAND: return 'sand';
    case BIOME.ROCK: return 'hard';
    case BIOME.SNOW: return 'snow';
    case BIOME.URBAN: return 'hard';
    case BIOME.DIRT: case BIOME.FIELD: return 'dirt';
    default: return 'grass';
  }
}
/** Eski onRoad: bütün yolların bütün parçalarını doğrusal tarar */
function oldOnRoad(x, z, margin = 0) {
  for (const road of ROADS) {
    const line = road.line;
    if (!line) continue;
    const hw = road.w / 2 + margin;
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = line[i], b = line[i + 1];
      const vx = b.x - a.x, vz = b.z - a.z;
      const L2 = vx * vx + vz * vz || 1;
      let t = ((x - a.x) * vx + (z - a.z) * vz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + vx * t, pz = a.z + vz * t;
      if ((x - px) ** 2 + (z - pz) ** 2 < hw * hw) return road;
    }
  }
  return null;
}
/** Şeride uzaklığın karesi (en yakın parça) */
function lineD2(road, x, z) {
  let best = Infinity;
  const line = road.line;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const vx = b.x - a.x, vz = b.z - a.z;
    const L2 = vx * vx + vz * vz || 1;
    let t = ((x - a.x) * vx + (z - a.z) * vz) / L2;
    t = Math.max(0, Math.min(1, t));
    const d2 = (x - (a.x + vx * t)) ** 2 + (z - (a.z + vz * t)) ** 2;
    if (d2 < best) best = d2;
  }
  return best;
}

// ======================================================================= dünya (varlıksız)
const T = new Terrain();
const scene = new THREE.Scene();
buildRoads(T, scene, (p) => { const r = T.regionAt(p.x, p.z); return !!r && URBAN.includes(r.id); });
/** Varlıksız dünya: yalnız sınıflayıcının okuduğu alanlar (+ istenirse köprü/sığınak kurucularının yazdıkları) */
function bareWorld() {
  const W = Object.create(World.prototype);
  W.terrain = T; W.physics = new CollisionWorld(T); W.under = W.physics.under = new UnderZones();
  W.geo = new Geo(); W.root = new THREE.Group(); W.interactables = []; W.containers = []; W.lamps = []; W.buildings = [];
  return W;
}
const W = bareWorld();
const ctx = { assets: {}, physics: W.physics, instancer: { add() {}, place() {} }, terrain: T, scene, panes: [], doors: [], windows: [], containers: [] };
const B = {};
for (const id of ['home', 'kule2', 'kule9', 'office', 'hospital']) { B[id] = buildBuilding(BUILDINGS.find((b) => b.id === id), ctx); W.buildings.push(B[id]); }
buildShelters(W);
W.bridge();
// deterministik rastgele (LCG)
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const stepAt = (Wd, x, y, z) => STEP_SOUND[Wd.surfaceAt(x, y, z)];

test('tablolar: her yüzey malzemesinin ayak sesi ve sürüş karşılığı var; bina zemin anahtarları bilinen malzemeye eşlenir', () => {
  assert.equal(new Set(SURFACE_MATERIALS).size, 13);
  for (const m of SURFACE_MATERIALS) {
    assert.ok(STEP_SOUND[m], `${m}: STEP_SOUND`);
    assert.ok(SURFACES[driveSurface(m)], `${m}: SURFACES[driveSurface]`);
  }
  // sürüş: tablodaki malzeme kendisi; çakıl → toprak, su → kum, ahşap/karo/halı → beton, metal → asfalt
  assert.deepEqual(['asphalt', 'concrete', 'dirt', 'grass', 'sand', 'rock', 'snow'].map(driveSurface), ['asphalt', 'concrete', 'dirt', 'grass', 'sand', 'rock', 'snow']);
  assert.deepEqual(['gravel', 'water', 'wood', 'tile', 'carpet', 'metal'].map(driveSurface), ['dirt', 'sand', 'concrete', 'concrete', 'concrete', 'asphalt']);
  // ayak sesi: sert zeminler 'hard', halı kendi sesiyle (çim sesine düşmez)
  assert.deepEqual(['asphalt', 'concrete', 'rock'].map((m) => STEP_SOUND[m]), ['hard', 'hard', 'hard']);
  assert.equal(STEP_SOUND.carpet, 'carpet');
  for (const v of Object.values(FLOOR_SURFACE)) assert.ok(SURFACE_MATERIALS.includes(v), v);
  for (const b of Object.values(B)) for (const r of b.rooms) assert.ok(SURFACE_MATERIALS.includes(r.surface), `${b.id}/${r.id}: ${r.surface}`);
  for (const c of W.physics.all) if (c.surface) assert.ok(SURFACE_MATERIALS.includes(c.surface), `etiket ${c.surface}`);
});

test('eski iki sınıflayıcıyla özdeşlik: yol, kaldırım ve yapı dışında yalnız belgelenen iki fark (deniz köşesi kum, su üstü araç kum)', (t) => {
  const W0 = bareWorld(); // çarpıştırıcısız: yalnız arazi, su, yol, biyom
  const world0 = { terrain: T, under: null, buildingAt: () => null };
  let n = 0, seaSand = 0, waterSand = 0;
  const bad = [];
  seed = 777;
  while (n < 20000) {
    const x = (rnd() * 2 - 1) * 1000, z = (rnd() * 2 - 1) * 1000, th = T.heightAt(x, z);
    if (th < -1) continue; // açık deniz
    const k = T.idx(Math.round((x + T.half) / T.cell), Math.round((z + T.half) / T.cell));
    if (T.roadMask[k] > 0 || roadSurfaceAt(x, z) !== null) continue; // eski ızgara yolu ya da yeni şerit/kaldırım
    n++;
    // ayak sesi (oyuncu ayağı arazinin 3 cm üstünde)
    const fNew = stepAt(W0, x, th + KCC_SKIN, z), fOld = oldSessionSurfaceAt(world0, { x, y: th + KCC_SKIN, z });
    if (fNew !== fOld) {
      if (fOld === 'grass' && fNew === 'sand' && T.biome[k] === BIOME.SEA) seaSand++;
      else bad.push(['ayak', x, z, fOld, fNew]);
    }
    // araç (yoklama arazi yüksekliğinde, reach sınırsız)
    const vNew = driveSurface(W0.surfaceAt(x, th, z, Infinity)), vOld = oldTerrainSurfaceAt(T, x, z);
    if (vNew !== vOld) {
      if (vNew === 'sand' && T.waterLevelAt(x, z) > th + 0.05) waterSand++;
      else bad.push(['araç', x, z, vOld, vNew]);
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `belgelenmemiş fark: ${bad.length}`);
  // belgelenen farklar seyrek (kıyı şeridi, göl kenarı)
  assert.ok(seaSand < n * 0.05 && waterSand < n * 0.05, `deniz köşesi ${seaSand}, su üstü ${waterSand} / ${n}`);
  t.diagnostic(`${n} nokta: ayak sesi deniz köşesi çim→kum ${seaSand}, araç su üstü →kum ${waterSand}, belgelenmemiş fark ${bad.length}`);
});

test('ev zemin katı: FLOOR_LIFT ve karakter denetleyicisi payıyla oda oda doğru malzeme (oyuncu, bot/NPC, ağ gecikmesi); eşik, veranda, basamak', () => {
  const h = B.home, fr = h.frame;
  assert.ok(Math.abs(h.floorY - fr.baseY - FLOOR_LIFT) < 1e-9);
  const at = (tx, tz, y) => { const p = fr.pt(tx, tz); return W.surfaceAt(p.x, y, p.z); };
  const want = [['living', 5, 9, 'wood'], ['kitchen', 14, 9, 'tile'], ['bath', 7.5, 3, 'tile'], ['bed1', 3, 3, 'wood'], ['bed2', 11.5, 3, 'wood'],
    ['storage', 16, 3, 'wood'], ['garage', 21, 6, 'concrete']];
  for (const [room, tx, tz, mat] of want) {
    // oyuncu (+0,03), bot/NPC/zombi (çarpıştırıcı üstü, +0), uzak oyuncunun ara değerleme gecikmesi (−0,15)
    for (const dy of [KCC_SKIN, 0, -0.15]) assert.equal(at(tx, tz, h.floorY + dy), mat, `${room} dy=${dy}`);
    const p = fr.pt(tx, tz);
    assert.equal(h.roomAt(p.x, p.z).id, room);
  }
  // eski sınıflayıcı salonda araziyi okuyordu (0,30 + 0,03 < 0,35 eşiği): ayak sesi çimdi
  { const p = fr.pt(5, 9); assert.equal(oldSessionSurfaceAt({ terrain: T, under: null, buildingAt: () => null }, { x: p.x, y: h.floorY + KCC_SKIN, z: p.z }), 'grass'); }
  // dış kapı boşluğu: duvar kalınlığı döşemenin ve basamağın dışında; adım araziyi (çim) değil odanın zeminini okur
  assert.equal(at(5, 13.06, h.floorY + KCC_SKIN), 'wood', 'ön kapı eşiği');
  assert.equal(at(21.5, 13.06, h.floorY + KCC_SKIN), 'concrete', 'garaj kapısı eşiği');
  assert.equal(at(16, -0.06, h.floorY + KCC_SKIN), 'wood', 'arka kapı eşiği');
  // veranda (zeminin 5 cm altında, ahşap) ve verandasız kapının beton basamağı
  assert.equal(at(5, 14.6, fr.baseY + FLOOR_LIFT - 0.05 + KCC_SKIN), 'wood', 'veranda');
  { const st = h.colliders.find((c) => c.kind === 'prop' && c.surface === 'concrete' && c.maxY < h.floorY); assert.ok(st, 'kapı basamağı');
    const x = (st.minX + st.maxX) / 2, z = (st.minZ + st.maxZ) / 2; assert.equal(W.surfaceAt(x, st.maxY + KCC_SKIN, z), 'concrete'); }
  // ön bahçe: bina dışı, arazi
  { const p = fr.pt(5, 17); assert.equal(W.surfaceAt(p.x, T.heightAt(p.x, p.z) + KCC_SKIN, p.z), 'grass'); }
});

test('binalar: oda zemini binanın genel stilinden değil odanın çizilen malzemesinden (ofis halı, hastane karo/depo beton)', () => {
  const room = (b, type) => { const r = b.rooms.find((q) => q.type === type); return W.surfaceAt((r.minX + r.maxX) / 2, b.floorY + KCC_SKIN, (r.minZ + r.maxZ) / 2); };
  assert.equal(room(B.office, 'lobby'), 'carpet');
  assert.equal(room(B.office, 'office'), 'carpet');
  assert.equal(room(B.hospital, 'ward'), 'tile');
  assert.equal(room(B.hospital, 'storage'), 'concrete');
  assert.equal(STEP_SOUND[room(B.office, 'office')], 'carpet');
});

test('kit kulesi: zemin araziden ~1 m yukarıda (yükseltilmiş kat), oda oda malzeme; kapı basamakları ve eşik beton', () => {
  for (const [id, rooms] of [['kule9', { living: 'wood', bedroom: 'wood', kitchen: 'tile', bathroom: 'tile' }], ['kule2', { cafe_hall: 'tile', kitchen: 'tile', bathroom: 'tile' }]]) {
    const b = B[id];
    assert.ok(b.floorY - b.frame.baseY > 1, `${id}: yükseltilmiş zemin`);
    for (const [type, mat] of Object.entries(rooms)) {
      const r = b.rooms.find((q) => q.type === type);
      const x = (r.minX + r.maxX) / 2, z = (r.minZ + r.maxZ) / 2;
      for (const dy of [KCC_SKIN, 0, -0.15]) assert.equal(W.surfaceAt(x, b.floorY + dy, z), mat, `${id}/${type} dy=${dy}`);
    }
    // kapı önü basamakları (5 kademe) ve duvar kalınlığındaki eşik
    const steps = b.colliders.filter((c) => c.kind === 'prop' && c.walkable && c.maxY < b.floorY - 0.01);
    assert.ok(steps.length >= 5, `${id}: basamaklar`);
    for (const c of steps) assert.equal(W.surfaceAt((c.minX + c.maxX) / 2, c.maxY + KCC_SKIN, (c.minZ + c.maxZ) / 2), 'concrete', `${id}: basamak ${c.maxY - b.frame.baseY}`);
  }
  // kule2: stil ahşap ama bütün odalar karo (eski sınıflayıcı stilden 'wood' okuyordu)
  assert.equal(B.kule2.tpl.style.floor, 'woodfloor');
});

test('yükseltilmiş yüzeyler ve bilinmeyen destek: etiket, tür varsayılanı, oyuncu yapısı; çarpışma dünyasında olmayan destekte eski yükseklik kuralı', () => {
  const W1 = bareWorld();
  const x0 = -227.5, z0 = 160, th = T.heightAt(x0, z0);
  const P = W1.physics;
  P.addFloor(x0 - 1.7, z0 - 1.7, x0 + 1.7, z0 + 1.7, th + 6.15, { surface: 'wood' });      // gözetleme kulesi
  P.addFloor(x0 + 8, z0 - 3, x0 + 14, z0 + 3, th + 20.25, { surface: 'metal' });            // fener galerisi
  P.addFloor(x0 + 20, z0 - 3, x0 + 26, z0 + 3, th + 0.13);                                  // helikopter pisti (etiketsiz zemin)
  P.addBoxC(x0 - 10, z0, 1, 1, th, th + 0.8, { kind: 'prop' });                             // etiketsiz kasa
  P.addBoxC(x0 - 14, z0, 3, 1.2, th, th + 2.6, { kind: 'prop', surface: 'metal' });        // konteyner
  P.addBoxC(x0 - 20, z0, 1.5, 1.5, th, th + 1.2, { kind: 'rock' });
  P.addBoxC(x0 - 24, z0, 1, 2, th, th + 1.4, { kind: 'vehicle' });                          // yanmış araç enkazı
  P.addBoxC(x0, z0 + 10, 1.1, 0.2, th, th + 1.2, { kind: 'structure', owner: { type: 'barricade_metal' } });
  P.addBoxC(x0, z0 + 14, 1.1, 0.2, th, th + 1.2, { kind: 'structure', owner: { type: 'barricade_wood' } });
  const on = (x, z, top, dy = KCC_SKIN) => W1.surfaceAt(x, top + dy, z);
  assert.equal(on(x0, z0, th + 6.15), 'wood', 'kule platformu');
  assert.equal(on(x0 + 11, z0, th + 20.25), 'metal', 'fener galerisi');
  assert.equal(on(x0 + 23, z0, th + 0.13), 'concrete', 'etiketsiz zemin: beton');
  assert.equal(on(x0 - 10, z0, th + 0.8), 'wood', 'etiketsiz kasa');
  assert.equal(on(x0 - 14, z0, th + 2.6), 'metal', 'konteyner');
  assert.equal(on(x0 - 20, z0, th + 1.2), 'rock');
  assert.equal(on(x0 - 24, z0, th + 1.4), 'metal', 'araç enkazı');
  assert.equal(on(x0, z0 + 10, th + 1.2), 'metal', 'metal barikat');
  assert.equal(on(x0, z0 + 14, th + 1.2), 'wood', 'tahta barikat');
  // çarpışma dünyasında olmayan destek (araç tavanı, dinamik kasa): eski kural, 1,2 m üstü metal
  assert.equal(on(x0, z0 - 8, th + 1.5, 0), 'metal');
  assert.equal(on(x0, z0 - 8, th + 0.8, 0), 'wood');
  // kulenin altında (zeminde) yürüyen kişi kulenin platformunu değil zemini okur
  assert.equal(on(x0, z0, th), 'grass');
});

test('oyuncunun halısı gerçek inşa yolundan (Build, struct_add): ince zemini halı okur (dönüşüyle); hareketi, yol bulmayı, görüşü ve mermiyi kesmez, Rapier\'e aynalanmaz; yıkım ve kayıt yükleme temizler', () => {
  const W1 = bareWorld(), W0 = bareWorld(), P = W1.physics;
  // Build'in okuduğu en küçük oturum: olaylar (S.emit → onEvt) gerçek addStructure/removeStructure/load yolunu çalıştırır
  const appliers = {};
  const S = {
    world: W1, isHost: true, localId: 'p1', seed: 's', flags: {}, game: { scene: new THREE.Scene(), assets: { model: () => new THREE.Group(), has: () => false } },
    env: { extraLights: [], weather: { rain: 0 } }, audio: { play() {} }, fx: { hit() {}, dust() {} }, props: { burst() {} }, ui: { toast() {} }, quests: { onFlag() {} },
    levelOf: () => null, on() {}, onEvt(k, fn) { (appliers[k] = appliers[k] || []).push(fn); }, emit(e) { for (const fn of appliers[e.k] || []) fn(e); },
  };
  const Bd = new Build(S);
  Bd.refreshPower = () => {};
  const x0 = -227.5, z0 = 178, th = T.heightAt(x0, z0), x1 = x0 + 6, th1 = T.heightAt(x1, z0);
  const n0 = P.all.size;
  S.emit({ k: 'struct_add', id: 'r1', type: 'rug', x: x0, y: th, z: z0, rot: 0, built: 1 }); // 2,1 m x boyunca
  S.emit({ k: 'struct_add', id: 'r2', type: 'rug', x: x1, y: th1, z: z0, rot: 1, built: 1 }); // 2,1 m z boyunca
  const rugs = () => [...P.all].filter((c) => c.owner && c.owner.type === 'rug');
  assert.equal(P.all.size - n0, 2, 'halı başına tek çarpıştırıcı');
  for (const c of rugs()) {
    assert.ok(c.kind === 'floor' && c.walkable && !c.blocksNav && !c.blocksSight && !c.blocksBullets, 'engellemeyen zemin');
    assert.ok(c.noPhysics, "Rapier'e aynalanmaz");
    assert.ok(Math.abs(c.maxY - (c.owner.y + 0.05)) < 1e-9 && c.owner.colliders.includes(c), 'üst yüz halının üstünde, yapının çarpıştırıcılarında');
  }
  // ayak: Rapier'deki oyuncu halının altındaki zeminde (deri payıyla), YZ/zombi/uzak kopya halının üstünde
  for (const [x, z, h] of [[x0, z0, th], [x0 + 1.0, z0 + 0.6, th], [x1 + 0.6, z0 + 1.0, th1]]) {
    for (const dy of [KCC_SKIN, 0.05, 0]) assert.equal(W1.surfaceAt(x, h + dy, z), 'carpet', `halı (${(x - x0).toFixed(1)}, ${(z - z0).toFixed(1)}) dy=${dy}`);
  }
  // halının dışı halısız dünyayla aynı (dönük halıda uzun kenar z boyunca: x'te 1 m ötesi dışarıda)
  for (const [x, z, h] of [[x0, z0 + 0.95, th], [x0 + 1.25, z0, th], [x1 + 1.0, z0, th1], [x1, z0 + 1.25, th1]]) {
    assert.equal(W1.surfaceAt(x, h + KCC_SKIN, z), W0.surfaceAt(x, h + KCC_SKIN, z), `halı dışı (${(x - x0).toFixed(2)}, ${(z - z0).toFixed(2)})`);
    assert.notEqual(W1.surfaceAt(x, h + KCC_SKIN, z), 'carpet');
  }
  // hareket, görüş, mermi: oyundaki en küçük basamak payıyla (fırlatılan nesne 0,1 m; zombi/NPC/bot 0,5–0,6 m) itmez,
  // yerleştirme/doğma yoklamalarında (zeminden +0,1 m ve üstü) engel sayılmaz, ayak hizasındaki ışını kesmez
  for (const step of [0.1, 0.5]) {
    const r = P.resolveCircle(x0 + 0.2, z0, 0.3, th, th + 1.7, step);
    assert.ok(!r.hit && r.x === x0 + 0.2 && r.z === z0, `yürüyeni itmez (basamak ${step})`);
  }
  assert.equal(P.overlapsBox(x0 - 0.3, z0 - 0.3, x0 + 0.3, z0 + 0.3, th + 0.1, th + 1.8), null, 'yerleştirmede engel sayılmaz');
  assert.ok(P.lineOfSight(x0 - 3, th + 0.02, z0, x0 + 3, th + 0.02, z0), 'görüşü kesmez');
  assert.equal(P.raycast(x0 - 3, th + 0.02, z0, 1, 0, 0, 6, (c) => c.blocksBullets), null, 'mermiyi kesmez');
  // yıkım zemini kaldırır; kayıt yükleme (iki kez) halıyı bir kez kurar (sızıntı yok)
  S.emit({ k: 'struct_remove', id: 'r1', destroyed: true });
  assert.equal(rugs().length, 1);
  assert.equal(W1.surfaceAt(x0, th + KCC_SKIN, z0), W0.surfaceAt(x0, th + KCC_SKIN, z0));
  for (let i = 0; i < 2; i++) Bd.load({ structs: [{ id: 'r3', type: 'rug', x: x0, y: th, z: z0, rot: 0, built: 1 }] });
  assert.equal(rugs().length, 1, 'yüklemede yalnız kayıttaki halı');
  assert.equal(W1.surfaceAt(x0, th + KCC_SKIN, z0), 'carpet');
});

test('yer altı sığınakları: beton ve mağara bölgeleri; ev sığınağının aşamaya göre zemini; giriş kapakları', () => {
  const sh = (id) => W.shelters.find((q) => q.def.id === id);
  for (const [id, mat] of [['sehir', 'concrete'], ['hastane', 'concrete'], ['lab', 'concrete'], ['orman', 'gravel'], ['dag', 'gravel']]) {
    const s = sh(id), sp = s.zone.spawn;
    for (const dy of [KCC_SKIN, 0]) assert.equal(W.surfaceAt(sp.x, s.floorY + dy, sp.z), mat, `${id} dy=${dy}`);
    // eski sınıflayıcıyla aynı ayak sesi (beton 'hard', mağara 'gravel')
    assert.equal(STEP_SOUND[mat], oldSessionSurfaceAt({ terrain: T, under: W.under, buildingAt: () => null }, { x: sp.x, y: s.floorY + KCC_SKIN, z: sp.z }));
  }
  // ev sığınağı bölgesi (Build.updateBunkerRoom): 1. aşama toprak, beton dökülünce beton
  const x = 300, z = 640, fy = T.heightAt(x, z) - 7;
  const Z = W.under.add({ id: 'ev', floorY: fy, ceilY: fy + 3, rooms: [{ minX: x - 4, maxX: x + 4, minZ: z - 3, maxZ: z + 3 }], minX: x - 4, maxX: x + 4, minZ: z - 3, maxZ: z + 3, surface: 'dirt' });
  W.physics.addFloor(x - 4, z - 3, x + 4, z + 3, fy);
  assert.equal(W.surfaceAt(x, fy + KCC_SKIN, z), 'dirt');
  Z.surface = 'concrete';
  assert.equal(W.surfaceAt(x, fy + KCC_SKIN, z), 'concrete');
  W.under.remove('ev');
  // yüzey girişleri: çiftlik kapağı metal, fener mahzen kapağı ahşap
  for (const [id, mat] of [['ciftlik', 'metal'], ['fener', 'wood']]) {
    const d = sh(id).def, top = W.physics.groundHeight(d.x, d.z, T.heightAt(d.x, d.z) + 1);
    assert.equal(W.surfaceAt(d.x, top + KCC_SKIN, d.z), mat, id);
  }
});

test('köprü: denizin üstündeki asfalt tabliye araçta asfalt (eskisi çoğunlukla kum), ayakta sert zemin (eskisi metal)', (t) => {
  const S0 = BRIDGE.start, E0 = BRIDGE.end, L = Math.hypot(E0.x - S0.x, E0.z - S0.z);
  const ux = (E0.x - S0.x) / L, uz = (E0.z - S0.z) / L, deck = BRIDGE.deck + 0.25;
  let n = 0, oldSand = 0;
  for (let t = 1; t < L - 1; t += 1.4) {
    const x = S0.x + ux * t, z = S0.z + uz * t;
    n++;
    assert.equal(driveSurface(W.surfaceAt(x, deck + 0.5, z, Infinity)), 'asphalt', `araç t=${t.toFixed(1)}`);
    assert.equal(STEP_SOUND[W.surfaceAt(x, deck + KCC_SKIN, z)], 'hard', `ayak t=${t.toFixed(1)}`);
    if (oldTerrainSurfaceAt(T, x, z) === 'sand') oldSand++;
  }
  assert.ok(oldSand > n / 2, `eski sınıflayıcı tabliyenin çoğunda kum okuyordu (${oldSand}/${n})`);
  t.diagnostic(`tabliye ${n} örnek: yeni asfalt ${n}, eski araç sınıflayıcısı kum ${oldSand}`);
});

test('yol şeridi: roadSurfaceAt kaba kuvvet uzaklıkla birebir (şerit asfalt/çakıl, kentsel asfaltın kaldırımı beton); kenarda deterministik', (t) => {
  const walks = ROADS.filter((r) => r.walk);
  assert.ok(walks.length >= 10 && walks.every((r) => r.type === 'asphalt'), `kaldırımlı yollar: ${walks.length}`);
  assert.ok(ROADS.find((r) => r.id === 'mah_w').walk, 'mahalle batı yolu kaldırımlı');
  seed = 4242;
  const counts = {};
  for (let i = 0; i < 5000; i++) {
    const r = ROADS[Math.floor(rnd() * ROADS.length)], p = r.line[Math.floor(rnd() * r.line.length)];
    const x = p.x + (rnd() * 2 - 1) * (r.w / 2 + 5), z = p.z + (rnd() * 2 - 1) * (r.w / 2 + 5);
    let want = null;
    for (const q of ROADS) if (lineD2(q, x, z) < (q.w / 2) ** 2) { want = q.type === 'asphalt' ? 'asphalt' : 'gravel'; break; }
    if (!want && walks.some((q) => lineD2(q, x, z) < (q.w / 2 + 2.2) ** 2)) want = 'concrete';
    assert.equal(roadSurfaceAt(x, z), want, `(${x}, ${z})`);
    counts[want] = (counts[want] || 0) + 1;
  }
  assert.ok(counts.asphalt > 500 && counts.gravel > 200 && counts.concrete > 100 && counts.null > 500, JSON.stringify(counts));
  t.diagnostic(`5000 nokta: ${JSON.stringify(counts)}; kaldırımlı yol ${walks.length}`);
  // kenardan 1 cm içerisi şerit, 1 cm dışarısı kaldırım (kentsel) ya da yol dışı; ±0,1 mm kayma sonucu değiştirmez
  const mw = ROADS.find((r) => r.id === 'mah_w'), a = mw.line[10], b = mw.line[11];
  const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz), nx = -tz / tl, nz = tx / tl;
  const edge = (o) => roadSurfaceAt(a.x + nx * o, a.z + nz * o);
  assert.equal(edge(mw.w / 2 - 0.01), 'asphalt');
  assert.equal(edge(mw.w / 2 + 0.01), 'concrete');
  assert.equal(edge(mw.w / 2 + 2.19), 'concrete');
  assert.equal(edge(mw.w / 2 + 2.21), null);
  for (const o of [mw.w / 2 - 0.3, mw.w / 2 + 0.3, mw.w / 2 + 3]) for (const e of [-1e-4, 1e-4]) assert.equal(roadSurfaceAt(a.x + nx * o + e, a.z + nz * o - e), edge(o));
});

test('yol ve kıyı sondaları: asfalt, toprak yol çakıl, kaldırım beton, çim, göl su, kumsal kum/su', () => {
  const s = (x, z) => W.surfaceAt(x, T.heightAt(x, z) + KCC_SKIN, z);
  assert.equal(s(-200, 170), 'asphalt');
  assert.equal(STEP_SOUND[s(-200, 170)], 'hard');
  assert.equal(s(-326, 100), 'gravel', 'orman toprak yolu');
  assert.equal(s(-229.5, 120), 'concrete', 'mahalle batı yolu kaldırımı');
  assert.equal(s(-227.5, 120), 'grass', 'kaldırımın ötesi çim');
  assert.equal(s(-196, -100), 'water', 'göl');
  assert.ok(['sand', 'water'].includes(s(-150, 760)), 'kumsal');
  // göl iskelesi gibi su üstü platform suyu değil kendi malzemesini okur
  const W2 = bareWorld(), L0 = LAKES[0];
  W2.physics.addFloor(L0.x - 2, L0.z - 2, L0.x + 2, L0.z + 2, L0.level + 0.35, { surface: 'wood' });
  assert.equal(W2.surfaceAt(L0.x, L0.level + 0.35 + KCC_SKIN, L0.z), 'wood');
  assert.equal(W2.surfaceAt(L0.x + 6, T.heightAt(L0.x + 6, L0.z) + KCC_SKIN, L0.z), 'water');
});

test('onRoad dizini eski doğrusal taramayla birebir: kullanılan bütün paylarda (0 … 3 m) aynı ilk yol; büyük payda doğrusal tarama', (t) => {
  seed = 99;
  const margins = [0, 0.5, 1, 2, 2.3, 2.5, 3, 6];
  let hits = 0, tNew = 0, tOld = 0;
  for (let i = 0; i < 100000; i++) {
    const r = ROADS[Math.floor(rnd() * ROADS.length)], p = r.line[Math.floor(rnd() * r.line.length)];
    const x = p.x + (rnd() * 2 - 1) * 12, z = p.z + (rnd() * 2 - 1) * 12, m = margins[i % margins.length];
    const t0 = performance.now(), got = onRoad(x, z, m), t1 = performance.now(), want = oldOnRoad(x, z, m);
    tNew += t1 - t0; tOld += performance.now() - t1;
    if (got !== want) assert.fail(`(${x}, ${z}) pay ${m}: ${got && got.id} ≠ ${want && want.id}`);
    if (got) hits++;
  }
  assert.ok(hits > 30000 && hits < 90000, `isabet ${hits}`);
  t.diagnostic(`100000 nokta, isabet ${hits}; dizinli ${(tNew / 100).toFixed(2)} µs/çağrı, doğrusal ${(tOld / 100).toFixed(2)} µs/çağrı (ölçüm payı dahil)`);
});
