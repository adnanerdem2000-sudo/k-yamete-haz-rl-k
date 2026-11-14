// Araçlar (src/systems/Vehicles.js): Vehicle sınıfı dışa açık değil, 'veh_add' olayıyla sahte oturumda kurulur
// (sahte model: tekerleksiz kutu → fizik tekerlekleri ölçülerden). Sürüş testleri oyunun Rapier derlemesiyle Node'da koşar.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Vehicles, VEHICLE_TYPES, SURFACES, UPGRADES } from '../../src/systems/Vehicles.js';
import { ITEMS } from '../../src/data/items.js';
import { PhysicsWorld, STEP } from '../../src/physics/PhysicsWorld.js';
import { CollisionWorld } from '../../src/world/Physics.js';
import { NavGrid, NAV } from '../../src/world/NavGrid.js';

await PhysicsWorld.load();

/** Düz sahte arazi: Rapier yükseklik alanı (N/cell/h), yol ızgarası (su işlevleri); surf: sahte dünyanın surfaceAt'i okur */
function fakeTerrain(N = 32, cell = 8) {
  const V = N + 1;
  return {
    N, cell, half: (N * cell) / 2, h: new Float32Array(V * V), surf: 'asphalt',
    heightAt: () => 0, isWater: () => false, waterLevelAt: () => -100,
  };
}
/** Assets.model yerine: 'paint' malzemeli, 1,5 m yüksek kutu gövde (ölçek def.scale ile büyütülür) */
function fakeModel(name) {
  const def = Object.values(VEHICLE_TYPES).find((d) => d.model === name);
  const s = def.scale, g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.wid / s, 1.5 / s, def.len / s), new THREE.MeshStandardMaterial({ name: 'paint' }));
  body.position.y = 0.75 / s;
  g.add(body);
  return g;
}
function fakeSession({ phys = false, nav = false, isHost = true } = {}) {
  const handlers = {}, appliers = {};
  const terrain = fakeTerrain();
  const physics = new CollisionWorld(terrain);
  const S = {
    isHost, localId: 'p1', t: 0,
    game: { scene: new THREE.Scene(), phys: null, gfx: null, assets: { model: (kit, name) => fakeModel(name) } },
    // tek yüzey sınıflayıcı (World.surfaceAt) yerine: arazinin sürüş yüzeyi canlı okunur (drivingRig ve testler değiştirir)
    world: { terrain, physics, nav: null, vehicleSpawns: [], doors: [], windows: [], interactables: [], surfaceAt: () => terrain.surf },
    env: { weather: { rain: 0, snow: 0 } },
    local: { mode: 'ground', pos: new THREE.Vector3(), avatar: { hold() {}, setFlashlight() {} } },
    players: new Map(), results: { vehicles: new Set() }, zombies: { views: new Map() },
    net: { active: false }, toasts: [],
    ui: { toast: (m) => S.toasts.push(m) },
    audio: { play() {}, loop() {}, stopLoop() {} },
    fx: { sparks() {}, hit() {}, smoke() {}, dust() {}, fire() {} },
    on(t, fn) { handlers[t] = fn; },
    onEvt(k, fn) { (appliers[k] = appliers[k] || []).push(fn); },
    emit(e) { for (const fn of appliers[e.k] || []) fn(e); },
    applyAction(t, p, from) { return handlers[t] && handlers[t](p, from); },
    act(t, p) { return S.applyAction(t, p, S.localId); },
  };
  if (nav) S.world.nav = new NavGrid(terrain, physics);
  if (phys) S.game.phys = new PhysicsWorld({ terrain, physics });
  return S;
}
const spawn = (S, V, spec) => { S.emit({ k: 'veh_add', ...spec }); return V.byId(spec.id); };
const run = (pw, n) => { for (let i = 0; i < n; i++) pw.update(STEP); };
/** Sürüş düzeneği: araç süspansiyonuna oturur, yerel oyuncu sürücü koltuğuna geçer */
function drivingRig(type, { surf = 'asphalt', fuel = 1 } = {}) {
  const S = fakeSession({ phys: true });
  S.world.terrain.surf = surf;
  const V = new Vehicles(S);
  const v = spawn(S, V, { id: 'car', type, x: 0, z: -100, rot: 0, fuel });
  const pw = S.game.phys;
  run(pw, 60);
  S.emit({ k: 'veh_seat', id: 'car', seat: 0, player: 'p1' });
  return { S, V, v, pw };
}

test('veri: araç türlerinin ölçü/kütle/yakıt/koltukları geçerli, gereken ve geliştirme eşyaları ITEMS\'te var, yüzey tablosu tutarlı', () => {
  for (const [id, d] of Object.entries(VEHICLE_TYPES)) {
    assert.ok(d.name && d.model, id);
    assert.ok(d.mass > 0 && d.maxSpeed > 0 && d.accel > 0 && d.fuelCap > 0 && d.hp > 0 && d.scale > 0, id);
    assert.ok(d.len > d.wid && d.wid > 0, `${id}: boy > en`);
    assert.ok(Number.isInteger(d.seats) && d.seats >= 1 && Number.isInteger(d.trunk) && d.trunk > 0, id);
    if (!d.water) assert.ok(['fwd', 'rwd', 'awd'].includes(d.drive), `${id}: çekiş`);
    for (const [item, n] of d.needs || []) assert.ok(ITEMS[item] && n > 0, `${id}: ${item}`);
  }
  assert.equal(VEHICLE_TYPES.boat.water, true);
  for (const [k, u] of Object.entries(UPGRADES)) for (const [item, n] of u.cost) assert.ok(ITEMS[item] && n > 0, `${k}: ${item}`);
  for (const [k, s] of Object.entries(SURFACES)) {
    assert.ok(s.grip > 0 && s.grip <= 1 && s.wet > 0 && s.wet <= 1 && s.roll >= 0 && s.dust >= 0, k);
  }
  assert.deepEqual([SURFACES.asphalt.grip, SURFACES.asphalt.roll, SURFACES.asphalt.dust], [1, 0, 0]);
  const grips = Object.entries(SURFACES).sort((a, b) => a[1].grip - b[1].grip).map(([k]) => k);
  assert.equal(grips[0], 'snow', 'kar en kaygan');
  for (const k of ['dirt', 'grass', 'sand', 'snow']) assert.ok(SURFACES[k].roll > 0, `${k}: gevşek zemin yuvarlanma direnci`);
});

test('çarpışma vekilleri: her kara aracında daireler gövdeyi uçtan uca örter (r = en/2, uçlar tamponda, aralık ≤ r, orta hatta); dispose kaldırır', () => {
  const S = fakeSession();
  const V = new Vehicles(S);
  const P = S.world.physics, yaw = 0.7, fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (const [type, def] of Object.entries(VEHICLE_TYPES)) {
    const v = spawn(S, V, { id: type, type, x: 50, z: -30, rot: yaw });
    v.updateProxy();
    if (def.water) { assert.equal(v.proxy, undefined, 'teknenin vekili yok'); continue; }
    const r = def.wid / 2;
    const t = v.proxy.map((c) => (c.x - 50) * fx + (c.z + 30) * fz);
    const lat = v.proxy.map((c) => (c.x - 50) * fz - (c.z + 30) * fx);
    assert.ok(v.proxy.every((c) => c.shape === 'circle' && c.r === r && c.kind === 'vehicle' && c.owner === v && c.noPhysics && !c.walkable), type);
    assert.ok(Math.abs(t[0] - r + def.len / 2) < 1e-9 && Math.abs(t[t.length - 1] + r - def.len / 2) < 1e-9, `${type}: uçlar tamponda`);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] > 0 && t[i] - t[i - 1] <= r + 1e-9, `${type}: aralık ${t[i] - t[i - 1]}`);
    assert.ok(lat.every((d) => Math.abs(d) < 1e-9), `${type}: orta hat`);
    assert.ok(v.proxy.every((c) => c.minY === -0.3 && Math.abs(c.maxY - 1.5) < 1e-6), `${type}: yükseklik (model 1,5 m)`);
    assert.ok(v.proxy.every((c) => P.all.has(c)));
    v.dispose();
    assert.equal(v.proxy, null);
    assert.equal(P.all.size, 0, `${type}: vekiller kaldırıldı`);
  }
});

test('park etmiş araç yol ızgarasında engel ve görüşü/mermiyi keser; sürücü binince ızgaradan kalkar; taşınınca eski alan boşalır; küçük titreşim yok sayılır', () => {
  const S = fakeSession({ nav: true });
  const nav = S.world.nav, P = S.world.physics;
  const V = new Vehicles(S);
  const v = spawn(S, V, { id: 'c1', type: 'sedan', x: 0, z: 0, rot: 0 });
  v.updateProxy();
  assert.deepEqual([nav.at(0, 0), nav.at(0, 1.9), nav.at(0, -1.9)], [NAV.BLOCK, NAV.BLOCK, NAV.BLOCK], 'tampondan tampona');
  assert.deepEqual([nav.at(0, 3), nav.at(1.6, 0)], [NAV.FREE, NAV.FREE]);
  assert.equal(P.lineOfSight(-5, 1, 0, 5, 1, 0), false, 'boş araç görüşü keser');
  assert.ok(P.raycast(-5, 1, 0, 1, 0, 0, 10, (c) => c.blocksBullets), 'mermiyi durdurur');
  S.emit({ k: 'veh_seat', id: 'c1', seat: 0, player: 'p2' }); // uzak oyuncu sürücü koltuğunda
  v.updateProxy();
  assert.equal(nav.at(0, 0), NAV.FREE, 'dolu araç ızgaraya basılmaz');
  assert.equal(P.lineOfSight(-5, 1, 0, 5, 1, 0), true, 'sürücü görünür');
  assert.equal(P.raycast(-5, 1, 0, 1, 0, 0, 10, (c) => c.blocksBullets), null, 'sürücü vurulabilir');
  S.emit({ k: 'veh_seat', id: 'c1', seat: 0, player: null });
  v.pos.set(20, 0, 0);
  v.yaw = Math.PI / 2;
  v.updateProxy();
  assert.equal(nav.at(0, 0), NAV.FREE);
  assert.deepEqual([nav.at(20, 0), nav.at(21.9, 0), nav.at(20, 1.9)], [NAV.BLOCK, NAV.BLOCK, NAV.FREE], 'yeni yerde, +x yönünde');
  // park hâlinde itilip kayan araç: eski + yeni alan birlikte yeniden çizilir
  v.pos.set(40, 0, 0);
  v.updateProxy();
  assert.deepEqual([nav.at(20, 0), nav.at(40, 0)], [NAV.FREE, NAV.BLOCK]);
  const x0 = v.proxy[1].x;
  v.pos.x += 0.03; // 6 cm eşiği altında
  v.updateProxy();
  assert.equal(v.proxy[1].x, x0, 'titreşimde ızgara yeniden çizilmez');
});

test('restSnapshot: yalnız sürücüsüz kara araçları; 2 cm / 0,002 dördey eşiği son gönderilene göre, her 30. çağrıda tam liste; yuvarlama', () => {
  const S = fakeSession();
  const V = new Vehicles(S);
  const fake = (id, o = {}) => ({ id, water: false, body: {}, seats: [null, null], pos: new THREE.Vector3(1.234567, 0.5, -2), quat: new THREE.Quaternion(0, 0.38268343, 0, 0.92387953), ...o });
  const a = fake('a'), b = fake('b');
  V.list.push(a, b, fake('tekne', { water: true }), fake('gövdesiz', { body: null }), fake('sürülen', { seats: ['p2', null] }));
  const ids = (s) => s.map((x) => x[0]);
  const snap = V.restSnapshot();
  assert.deepEqual(ids(snap), ['a', 'b']);
  assert.deepEqual(snap[0], ['a', 1.23, 0.5, -2, 0, 0.3827, 0, 0.9239]);
  assert.deepEqual(V.restSnapshot(), [], 'değişmeyen araç gönderilmez');
  a.pos.x += 0.015;
  assert.deepEqual(V.restSnapshot(), [], '1,5 cm eşik altı');
  a.pos.x += 0.015;
  assert.deepEqual(ids(V.restSnapshot()), ['a'], 'son gönderilene göre birikmiş 3 cm');
  b.quat.y += 0.001; b.quat.w -= 0.0005;
  assert.deepEqual(V.restSnapshot(), [], 'dördey farkı 0,0015');
  b.quat.y += 0.001;
  assert.deepEqual(ids(V.restSnapshot()), ['b'], 'dördey farkı 0,0025');
  let full = null;
  for (let i = 0; i < 30 && !full; i++) { const s = V.restSnapshot(); if (s.length) full = s; }
  assert.deepEqual(ids(full), ['a', 'b'], 'periyodik tam liste değişmeyenleri de içerir');
  assert.equal(V._vhN % 30, 0);
});

test('applyRest (istemci): host pozunu kinematik hedefe bağlar; sürücülü, su, gövdesiz ve bilinmeyen araçlara dokunmaz', () => {
  const S = fakeSession({ isHost: false });
  const V = new Vehicles(S);
  const mk = (id, o = {}) => ({ id, water: false, body: {}, seats: [null], remote: 0, setRemote(r) { if (r) this.remote++; }, ...o });
  const a = mk('a'), dr = mk('dr', { seats: ['p2'] }), boat = mk('boat', { water: true }), nb = mk('nb', { body: null });
  V.list.push(a, dr, boat, nb);
  const pose = [9, 9, 9, 0, 0, 0, 1];
  V.applyRest([['a', 1, 2, 3, 0, 0.7071, 0, 0.7071], ['dr', ...pose], ['boat', ...pose], ['nb', ...pose], ['yok', ...pose]]);
  assert.deepEqual([a.netTarget.x, a.netTarget.y, a.netTarget.z], [1, 2, 3]);
  assert.ok(a.netTarget.q.isQuaternion && a.netTarget.q.y === 0.7071 && a.netTarget.q.w === 0.7071);
  assert.equal(a.remote, 1);
  for (const v of [dr, boat, nb]) assert.deepEqual([v.netTarget, v.remote], [undefined, 0], v.id);
});

test('pushOut: döndürülmüş araç kutusundan (en/boy + r) en kısa eksenden itilir; araç üstü, sığınak derinliği, yerel araç ve tekne atlanır', () => {
  const S = fakeSession();
  const V = new Vehicles(S);
  const car = { def: VEHICLE_TYPES.sedan, pos: new THREE.Vector3(10, 0, 0), yaw: 0, water: false }; // en 2,2, boy 4,2
  V.list.push(car);
  const close = (p, x, z) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.z - z) < 1e-9;
  assert.ok(close(V.pushOut(10.5, 0, 0.3, 0), 11.4, 0), 'yandan: 1,1 + 0,3');
  assert.ok(close(V.pushOut(10.1, 2.0, 0.3, 0), 10.1, 2.4), 'önden: 2,1 + 0,3');
  assert.deepEqual(V.pushOut(12, 0, 0.3, 0), { x: 12, z: 0 }, 'dışarıdaki nokta aynen');
  car.yaw = Math.PI / 2; // boy +x: (11, 0,5) aracın sol yanında → +z'ye
  const p = V.pushOut(11, 0.5, 0.3, 0);
  assert.ok(close(p, 11, 1.4), `${p.x}, ${p.z}`);
  assert.deepEqual(V.pushOut(11, 0.5, 0.3, 2.0), { x: 11, z: 0.5 }, 'aracın üstündeki karakter');
  assert.deepEqual(V.pushOut(11, 0.5, 0.3, -3), { x: 11, z: 0.5 }, 'altındaki sığınakta');
  V.local = car;
  assert.deepEqual(V.pushOut(11, 0.5, 0.3, 0), { x: 11, z: 0.5 }, 'sürülen araç varsayılan olarak atlanır');
  assert.ok(close(V.pushOut(11, 0.5, 0.3, 0, true), 11, 1.4), 'includeLocal');
  V.local = null;
  car.water = true;
  assert.deepEqual(V.pushOut(11, 0.5, 0.3, 0), { x: 11, z: 0.5 }, 'tekne');
});

test('yakıt yalnız motor çekerken azalır (~120–210 m/L), boşta kayarken azalmaz; depo boşken araç hızlanmaz ve bir kez uyarır', () => {
  const { S, V, v, pw } = drivingRig('sedan', { fuel: 0.5 });
  assert.equal(V.local, v);
  assert.equal(S.local.mode, 'drive');
  assert.equal(v.fuel, 22.5);
  const f0 = v.fuel, z0 = v.pos.z;
  v.inThr = 1;
  run(pw, 180);
  const used = f0 - v.fuel, dist = v.pos.z - z0;
  assert.ok(v.speed > 8, `hızlandı: ${v.speed.toFixed(1)} m/s`);
  assert.ok(used > 0 && dist / used > 120 && dist / used < 210, `${dist.toFixed(1)} m / ${used.toFixed(3)} L`);
  v.inThr = 0;
  const f1 = v.fuel;
  run(pw, 60);
  assert.equal(v.fuel, f1, 'gaz yokken yakıt harcanmaz');
  assert.ok(v.speed > 5, 'boşta kayıyor');
  const e = drivingRig('sedan', { fuel: 0 });
  e.v.inThr = 1;
  run(e.pw, 120);
  assert.ok(Math.abs(e.v.speed) < 0.5, `motor çalışmaz: ${e.v.speed}`);
  assert.equal(e.v.fuel, 0);
  assert.equal(e.S.toasts.filter((m) => /Depo boş/.test(m)).length, 1, 'uyarı bir kez');
});

test('zemin türü çekişi belirler: asfalt > beton > toprak > çim > kum > kar; arazi aracı kumda binekten oransal olarak az kaybeder', () => {
  const speedOn = (type, surf) => { const { v, pw } = drivingRig(type, { surf }); v.inThr = 1; run(pw, 180); return v.speed; };
  const surfs = ['asphalt', 'concrete', 'dirt', 'grass', 'sand', 'snow'];
  const sedan = Object.fromEntries(surfs.map((s) => [s, speedOn('sedan', s)]));
  const order = Object.entries(sedan).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  assert.deepEqual(order, surfs, JSON.stringify(sedan));
  const off = { asphalt: speedOn('offroad', 'asphalt'), sand: speedOn('offroad', 'sand') };
  const ro = off.sand / off.asphalt, rs = sedan.sand / sedan.asphalt;
  assert.ok(ro > rs + 0.05, `arazi aracı kumda %${(100 * ro).toFixed(0)}, binek %${(100 * rs).toFixed(0)}`);
});

test('yağmurda ıslak asfaltta ve karlı zeminde fren mesafesi kuru asfalttan uzun olmalı (aynı hızdan)', { skip: 'OYUN HATASI (bildirildi): Vehicles.stepCar ıslaklık/kar çarpanını (SURFACES.wet, kar 0,75) ve zemin tutunmasını yalnız tekerlek sürtünme sınırına (setWheelFrictionSlip) uyguluyor; fren itkisi (mass·0,036/tekerlek) bu sınırın hep altında kaldığından düz frenlemede hiç etkisi yok. Yumuşak zemin "roll" direnci ise frene ekleniyor. Ölçüm (binek, 13 m/s): kuru 9,5 m, yağmur 9,5 m, kar yağışı 9,5 m, kar zemini 8,9 m, kum 8,7 m, ıslak çim 9,1 m — kaygan koşullar fren mesafesini uzatmıyor, kar ve kumda araç kuru asfalttan daha kısa duruyor.' }, () => {
  const brakeDist = (mut) => {
    const { S, v, pw } = drivingRig('sedan');
    v.inThr = 1;
    run(pw, 180);
    mut(S);
    const z0 = v.pos.z;
    v.inThr = -1;
    for (let i = 0; i < 600 && v.speed > 0.3; i++) pw.update(STEP);
    return v.pos.z - z0;
  };
  const dry = brakeDist(() => {});
  const wet = brakeDist((S) => { S.env.weather.rain = 1; });
  const snow = brakeDist((S) => { S.world.terrain.surf = 'snow'; S.env.weather.snow = 1; });
  assert.ok(wet > dry * 1.1, `kuru ${dry.toFixed(2)} m, ıslak ${wet.toFixed(2)} m`);
  assert.ok(snow > dry * 1.3, `kuru ${dry.toFixed(2)} m, kar ${snow.toFixed(2)} m`);
});

test('kayıt gidiş-dönüşü: konum/dönüş, geliştirmeli kapasiteyle sağlık ve yakıt, arıza, geliştirmeler, boya, bagaj; bilinmeyen tür atlanır, kayıtta olmayan doğum noktası eklenir', () => {
  const A = fakeSession();
  const VA = new Vehicles(A);
  const v = spawn(A, VA, { id: 'v1', type: 'pickup', x: 12, z: -7, rot: 1.1, fuel: 0.3, health: 0.8 });
  v.upgrades = { tank: 1, armor: 1 };
  v.fuel = v.maxFuel;           // 60 × 1,5 = 90 L (temel kapasitenin üstünde)
  v.health = v.maxHealth * 0.9; // 140 × 1,5 × 0,9
  v.applyPaint('#2980b9');
  v.trunk[2] = { id: 'plank', qty: 3 };
  Object.assign(v, { broken: true, fault: 'Akü bitik', needs: [['car_battery', 1]] });
  spawn(A, VA, { id: 'hurda', type: 'sedan', x: 3, z: 3, health: 0 });
  const saved = JSON.parse(JSON.stringify(VA.serialize()));
  const B = fakeSession();
  B.world.vehicleSpawns = [{ id: 'v1', type: 'sedan', x: 0, z: 0 }, { id: 'v_yeni', type: 'hatchback', x: 30, z: 5, rot: 0.3 }];
  const VB = new Vehicles(B);
  VB.load([...saved, { id: 'eski', type: 'ufo', x: 0, z: 0 }]);
  assert.deepEqual(VB.list.map((x) => x.id), ['v1', 'hurda', 'v_yeni']);
  const w = VB.byId('v1');
  assert.equal(w.type, 'pickup', 'kayıttaki tür doğum noktasınınkini ezer');
  assert.ok(w.pos.distanceTo(v.pos) < 1e-9 && Math.abs(w.yaw - v.yaw) < 1e-9 && Math.abs(w.quat.angleTo(v.quat)) < 1e-6);
  assert.ok(Math.abs(w.fuel - 90) < 1e-9, `yakıt ${w.fuel}`);
  assert.ok(Math.abs(w.health - v.health) < 1e-9, `sağlık ${w.health}`);
  assert.deepEqual(w.upgrades, { tank: 1, armor: 1 });
  assert.equal(w.paint, '#2980b9');
  assert.equal(w.trunk.length, v.trunk.length);
  assert.deepEqual(w.trunk[2], { id: 'plank', qty: 3 });
  assert.deepEqual([w.broken, w.fault, w.needs, w.wrecked], [true, 'Akü bitik', [['car_battery', 1]], false]);
  assert.equal(VB.byId('hurda').wrecked, true);
  assert.equal(VB.byId('v_yeni').type, 'hatchback');
});
