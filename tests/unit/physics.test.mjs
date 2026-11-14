// Fizik köprüsü (src/physics/PhysicsWorld.js): oyunun Rapier derlemesi (vendor/rapier, satır içi WASM) Node'da da açılır.
// Sabit 60 Hz adım, statik aynalama, yükseklik alanı, dinamik gövdeler, ışın, patlama itkisi, taşıma, karakter gövdesi.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicsWorld, STEP, GRAVITY, G, ALL, groups, quatYaw, yawOf } from '../../src/physics/PhysicsWorld.js';
import { CollisionWorld } from '../../src/world/Physics.js';
import { Terrain } from '../../src/world/Terrain.js';

await PhysicsWorld.load();

/** Sahte arazi: Terrain ile aynı düzen (h[j·V + i], köşe (i, j) → x = i·cell − half, z = j·cell − half) */
function fakeTerrain(N = 16, cell = 4, hf = () => 0) {
  const V = N + 1, half = (N * cell) / 2;
  const h = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) h[j * V + i] = hf(i * cell - half, j * cell - half);
  return { N, cell, half, h, heightAt: hf };
}
/** Çarpışma dünyası + fizik köprüsü; build(P): köprüden önce eklenecek oyun çarpıştırıcıları */
function world(build) {
  const terrain = fakeTerrain();
  const physics = new CollisionWorld(terrain);
  if (build) build(physics);
  return { terrain, physics, pw: new PhysicsWorld({ terrain, physics }) };
}
const run = (pw, n) => { for (let i = 0; i < n; i++) pw.update(STEP); };
const box = (pw, x, y, z, opts) => pw.addDynamic(null, { type: 'box', hx: 0.2, hy: 0.2, hz: 0.2 }, x, y, z, opts);
const still = (...ds) => { for (const d of ds) { d.body.setLinvel({ x: 0, y: 0, z: 0 }, true); d.body.setAngvel({ x: 0, y: 0, z: 0 }, true); } };

test('sabit 60 Hz adım: biriktirici ve alpha, kare başına en çok 6 adım (spiral önleme), kancalar her adımda STEP ile', () => {
  const { pw } = world();
  const seen = [];
  const offA = pw.addHook((h) => seen.push(['önce', h]));
  const offB = pw.addAfter((h) => seen.push(['sonra', h]));
  assert.equal(STEP, 1 / 60);
  assert.equal(pw.update(1 / 60), 1);
  assert.deepEqual(seen, [['önce', STEP], ['sonra', STEP]]);
  assert.equal(pw.update(0.008), 0, 'yarım adımda adım yok');
  assert.ok(Math.abs(pw.alpha - 0.48) < 1e-9, `alpha ${pw.alpha}`);
  assert.equal(pw.update(0.009), 1, 'birikmiş süre bir adımı tamamlar');
  assert.ok(pw.alpha > 0 && pw.alpha < 0.05);
  assert.equal(pw.update(0.05), 3);
  // takılan kare: dt 0,25 s'ye kırpılır, en çok 6 adım, kalan süre atılır
  assert.equal(pw.update(1.0), 6);
  assert.equal(pw.acc, 0);
  assert.equal(pw.alpha, 0);
  assert.equal(pw.steps, 11);
  offA(); offB(); seen.length = 0;
  pw.update(STEP);
  assert.equal(seen.length, 0, 'kaldırılan kancalar çağrılmaz');
});

test('dinamik kutu düşer ve aynalanan oyun kutusunun üstünde durur; görsel nesne enterpolasyonla izler; uyuyunca onSleep bir kez', () => {
  const { pw } = world((P) => P.addBox(-2, -2, 2, 2, 0, 1, { kind: 'prop' }));
  const obj = new THREE.Object3D();
  let sleeps = 0;
  const d = pw.addDynamic(obj, { type: 'box', hx: 0.25, hy: 0.25, hz: 0.25 }, 0.3, 4, -0.2, { onSleep: () => sleeps++ });
  run(pw, 15);
  // yarım adım: çizim önceki ve güncel konum arasında
  pw.update(STEP / 2);
  const y = d.body.translation().y;
  assert.ok(d.prev.y > y, 'düşüyor');
  assert.ok(Math.abs(obj.position.y - (d.prev.y + y) / 2) < 1e-6, `enterpolasyon: ${obj.position.y}`);
  let minVy = 0;
  for (let i = 0; i < 400; i++) { pw.update(STEP); minVy = Math.min(minVy, d.body.linvel().y); }
  const t = d.body.translation();
  assert.ok(minVy < -7, `yerçekimiyle hızlandı (${GRAVITY} m/s²): ${minVy}`);
  assert.ok(Math.abs(t.y - 1.25) < 0.02 && Math.abs(t.x - 0.3) < 0.05, `platformun üstünde: ${t.x}, ${t.y}`);
  assert.equal(d.body.isSleeping(), true);
  assert.equal(sleeps, 1);
  assert.ok(obj.position.distanceTo(new THREE.Vector3(t.x, t.y, t.z)) < 1e-6);
});

test('statik aynalama: oyun çarpıştırıcıları Rapier\'e kopyalanır; devre dışı/kaldırma eşlenir, noPhysics atlanır, önceki onChange de çağrılır', () => {
  const terrain = fakeTerrain();
  const physics = new CollisionWorld(terrain);
  const hatch = physics.addBox(-2, -2, 2, 2, 0, 1, { kind: 'door' }); // üstünde kutu duran kapak
  const proxy = physics.add({ shape: 'circle', x: 8, z: 8, r: 1, minY: 0, maxY: 2, kind: 'vehicle' });
  proxy.noPhysics = true; // araç vekili: gövde zaten Rapier'de
  const navCalls = [];
  physics.onChange = (c, on) => navCalls.push([c.kind, on]); // WorldBuilder'ın yol ızgarası kancası
  const pw = new PhysicsWorld({ terrain, physics });
  assert.equal(pw.links.size, 1);
  assert.ok(pw.links.has(hatch) && !pw.links.has(proxy));
  const crate = pw.addDynamic(null, { type: 'box', hx: 0.25, hy: 0.25, hz: 0.25 }, 0, 3, 0);
  run(pw, 240);
  assert.ok(Math.abs(crate.body.translation().y - 1.25) < 0.02);
  physics.setEnabled(hatch, false); // kapak açıldı
  assert.equal(pw.links.get(hatch).isEnabled(), false);
  crate.body.wakeUp();
  run(pw, 120);
  assert.ok(Math.abs(crate.body.translation().y - 0.25) < 0.02, 'kutu araziye düştü');
  physics.setEnabled(hatch, true);
  assert.equal(pw.links.get(hatch).isEnabled(), true);
  // köprüden sonra eklenen ve kaldırılan çarpıştırıcı
  const late = physics.addBox(6, -10, 7, -6, 0, 2, { kind: 'wall' });
  assert.ok(pw.links.has(late));
  pw.update(STEP);
  assert.ok(Math.abs(pw.raycast(6.5, 10, -8, 0, -1, 0, 20).dist - 8) < 1e-3, 'ışın yeni duvarın üstüne çarpar');
  physics.remove(late);
  assert.ok(!pw.links.has(late));
  pw.update(STEP);
  assert.ok(Math.abs(pw.raycast(6.5, 10, -8, 0, -1, 0, 20).dist - 10) < 1e-3, 'kaldırılınca araziye');
  // köprüden sonra seçenekle (noPhysics) eklenen ince zemin (oyuncu halısı): aynalanmaz, kaldırması da sorunsuz
  const rug = physics.addFloor(-8, -8, -6, -6.6, 0.05, { surface: 'carpet', noPhysics: true });
  assert.ok(rug.noPhysics && !pw.links.has(rug));
  pw.update(STEP);
  assert.ok(Math.abs(pw.raycast(-7, 10, -7.3, 0, -1, 0, 20).dist - 10) < 1e-3, 'ışın halıdan geçip araziye');
  physics.remove(rug);
  assert.deepEqual(navCalls, [['door', false], ['door', true], ['wall', true], ['wall', false], ['floor', true], ['floor', false]]);
});

test('yükseklik alanı Terrain.heightAt ile birebir: yön (i↔x, j↔z) ve ters köşegen üçgenleme (gerçek 2048 m ızgara)', () => {
  const N = 512, V = N + 1;
  const h = new Float32Array(V * V);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let j = 250; j <= 262; j++) for (let i = 250; i <= 262; i++) h[j * V + i] = rnd() * 6; // orijin çevresinde tümsekler
  const T = { N, cell: 4, half: 1024, h };
  T.heightAt = (x, z) => Terrain.prototype.heightAt.call(T, x, z);
  const pw = new PhysicsWorld({ terrain: T, physics: new CollisionWorld(T) });
  pw.update(STEP);
  let maxErr = 0;
  for (let k = 0; k < 300; k++) {
    const x = -20 + rnd() * 40, z = -20 + rnd() * 40;
    const r = pw.raycast(x, 50, z, 0, -1, 0, 100);
    maxErr = Math.max(maxErr, Math.abs(50 - r.dist - T.heightAt(x, z)));
  }
  assert.ok(maxErr < 1e-3, `Rapier ile Terrain arasındaki en büyük fark ${maxErr} m`);
});

test('raycast: arazi/kutu mesafesi ve normali, yön normalleştirilir, grup süzgeci (enkaz varsayılan ışında yok), dışlama, dynamicAt', () => {
  const { physics, pw } = world((P) => P.addBox(-2, -2, 2, 2, 0, 1, { kind: 'prop' }));
  const plat = pw.links.get([...physics.all][0]);
  const deb = pw.addDynamic(null, { type: 'box', hx: 0.5, hy: 0.5, hz: 0.5 }, 8, 0.5, -8);
  pw.update(STEP);
  let r = pw.raycast(1, 10, 1, 0, -1, 0, 50);
  assert.ok(Math.abs(r.dist - 9) < 1e-3);
  assert.ok(Math.abs(r.normal.y - 1) < 1e-6);
  assert.equal(r.collider, plat);
  r = pw.raycast(1, 10, 1, 0, -40, 0, 50); // birim olmayan yön
  assert.ok(Math.abs(r.dist - 9) < 1e-3 && Math.abs(r.point.y - 1) < 1e-3 && r.point.x === 1);
  r = pw.raycast(-10, 0.5, 0, 1, 0, 0, 50); // yan yüz
  assert.ok(Math.abs(r.dist - 8) < 1e-3 && r.normal.x < -0.99);
  r = pw.raycast(1, 10, 1, 0, -1, 0, 50, undefined, plat); // dışlanan çarpıştırıcı
  assert.ok(Math.abs(r.dist - 10) < 1e-3, 'platform dışlanınca araziye');
  r = pw.raycast(8, 10, -8, 0, -1, 0, 50);
  assert.ok(Math.abs(r.dist - 10) < 1e-3, 'enkaz (DEBRIS) varsayılan süzgeçte yok');
  r = pw.raycast(8, 10, -8, 0, -1, 0, 50, groups(ALL, G.STATIC | G.DEBRIS));
  assert.ok(Math.abs(r.dist - 9) < 0.02);
  assert.equal(pw.dynamicAt(r.collider), deb);
  assert.equal(pw.dynamicAt(plat), null);
  assert.equal(pw.raycast(8, 10, -8, 0, -1, 0, 5), null, 'menzil dışı');
});

test('patlama itkisi: yarıçap içindekiler merkezden dışa ve yukarı itilir, uzaklıkla azalır; dışarıdakiler etkilenmez', () => {
  const { pw } = world();
  const nearB = box(pw, 2, 0.2, 0), farB = box(pw, 0, 0.2, -6), outB = box(pw, 12, 0.2, 0);
  run(pw, 60);
  still(nearB, farB, outB);
  const hit = pw.impulse(0, 0.2, 0, 10, 8);
  assert.equal(hit.length, 2);
  assert.ok(hit.includes(nearB) && hit.includes(farB) && !hit.includes(outB));
  const vn = nearB.body.linvel(), vf = farB.body.linvel(), vo = outB.body.linvel();
  assert.ok(vn.x > 0 && Math.abs(vn.z) < 1e-3, 'yakın kutu +x yönünde');
  assert.ok(vf.z < 0 && Math.abs(vf.x) < 1e-3, 'uzak kutu −z yönünde');
  assert.ok(vn.y > 0 && vf.y > 0, 'yukarı bileşen');
  assert.ok(Math.hypot(vn.x, vn.z) > 1.5 * Math.hypot(vf.x, vf.z), 'yakındaki daha hızlı (1 − d/R: 0,8 / 0,4)');
  assert.ok(Math.hypot(vo.x, vo.y, vo.z) < 1e-6, 'yarıçap dışı');
});

test('patlama itkisi: aynı uzaklıkta hafif cisim ağır cisimden daha hızlı fırlamalı', { skip: 'OYUN HATASI (bildirildi): PhysicsWorld.impulse itkiyi gövde kütlesiyle çarpıyor (k = güç·(1−d/R)·body.mass()); Δv = itki/kütle olduğundan her cisim kütlesinden bağımsız aynı hızı alıyor — 6,4 kg ve 128 kg kasa aynı uzaklıkta birebir aynı hızla (3,2 m/s yatay, 1,6 m/s dikey) fırlıyor. Araç dalı da v.mass() ile çarpıyor: 6,2 t kamyon ile 280 kg motosiklet aynı Δv alıyor.' }, () => {
  const { pw } = world();
  const light = box(pw, 6, 0.2, 0, { density: 100 });
  const heavy = box(pw, 0, 0.2, 6, { density: 2000 });
  run(pw, 60);
  still(light, heavy);
  assert.ok(heavy.body.mass() > 10 * light.body.mass());
  pw.impulse(0, 0.2, 0, 10, 8);
  const vl = light.body.linvel(), vh = heavy.body.linvel();
  const sl = Math.hypot(vl.x, vl.y, vl.z), sh = Math.hypot(vh.x, vh.y, vh.z);
  assert.ok(sl > 1.5 * sh, `hafif ${sl.toFixed(2)} m/s, ağır ${sh.toFixed(2)} m/s`);
});

test('dünyanın dışına düşen dinamik gövde (y < −40) kaldırılır ve onLost bir kez çağrılır', () => {
  const { pw } = world();
  let lost = 0;
  const ball = pw.addDynamic(null, { type: 'ball', r: 0.2 }, 40, 2, 40); // arazi ±32 m: dışında
  ball.onLost = (d) => { lost++; assert.equal(d, ball); };
  run(pw, 240);
  assert.equal(lost, 1);
  assert.equal(pw.dynamic.has(ball), false);
});

test('taşıma: gövde kinematiğe geçer ve hedefi izler; bırakınca dinamik olur, fırlatma hızını alır; placeAtRest uyutur', () => {
  const { pw } = world();
  const obj = new THREE.Object3D();
  const d = pw.addDynamic(obj, { type: 'box', hx: 0.2, hy: 0.2, hz: 0.2 }, -8, 0.2, -8, { group: G.PROP });
  pw.setCarried(d, true);
  assert.equal(d.body.isKinematic(), true);
  assert.equal(d.carried, true);
  for (let i = 0; i < 10; i++) { pw.moveCarried(d, { x: -7, y: 1.5, z: -8 }, quatYaw(Math.PI / 2)); pw.update(STEP); }
  const t = d.body.translation();
  assert.ok(Math.hypot(t.x + 7, t.y - 1.5, t.z + 8) < 1e-4, 'taşıyanın elindeki hedefte');
  assert.ok(Math.abs(yawOf(d.body.rotation()) - Math.PI / 2) < 1e-4);
  pw.setCarried(d, false, { x: 3, y: 1, z: 0 });
  assert.equal(d.body.isKinematic(), false);
  assert.equal(d.carried, false);
  const v = d.body.linvel();
  assert.ok(Math.abs(v.x - 3) < 1e-6 && Math.abs(v.y - 1) < 1e-6);
  run(pw, 120);
  assert.ok(d.body.translation().x > -6, 'fırlatılan kutu ilerledi');
  pw.placeAtRest(d, [2, 0.2, 2, 0, 0, 0, 1]);
  assert.equal(d.body.isSleeping(), true);
  pw.update(STEP);
  assert.ok(obj.position.distanceTo(new THREE.Vector3(2, 0.2, 2)) < 1e-3, 'görsel dinlenme pozuna');
  pw.moveCarried(d, { x: 9, y: 9, z: 9 }, { x: 0, y: 0, z: 0, w: 1 }); // taşınmayan gövdeye etkisiz
  pw.update(STEP);
  assert.ok(d.body.translation().x < 3);
});

test('taşınan kutu taşıyanın kapsülünü durdurmaz (oyunun sırası: kare içinde adımlar, kare sonunda tutma hedefi); duvar ve yerdeki kutu durdurur', async () => {
  const { carryTarget } = await import('../../src/systems/PhysProps.js');
  // kare başına n adım (60 fps → 1, 10 fps → 6): Player.physicsStep her adımda yürür, Player.updateCarry kare sonunda tutar
  const walk = (wallZ, carried, fps) => {
    const { pw } = world((P) => { if (wallZ != null) P.addBox(-3, wallZ, 3, wallZ + 0.4, -1, 3, { kind: 'wall' }); });
    const ch = pw.createCharacter(0, 0, 0);
    const def = { h: 0.75 }, tv = new THREE.Vector3(), tq = new THREE.Quaternion();
    carryTarget(def, ch.feet, 0, tv, tq);
    const d = pw.addDynamic(null, { type: 'box', hx: 0.375, hy: 0.375, hz: 0.375 }, tv.x, carried ? tv.y : 0.375, tv.z, { group: G.PROP, mass: 12 });
    if (carried) pw.setCarried(d, true);
    for (let i = 0; i < 30; i++) { ch.move(0, -0.05, 0); pw.update(STEP); }
    const z0 = ch.feet.z, n = Math.round(60 / fps);
    for (let f = 0; f < fps; f++) {
      for (let i = 0; i < n; i++) { ch.move(0, -0.02, 2.9 * STEP); pw.update(STEP); }
      if (carried) { carryTarget(def, ch.feet, 0, tv, tq); pw.moveCarried(d, tv, tq); }
    }
    return ch.feet.z - z0;
  };
  for (const fps of [60, 20, 10]) {
    const z = walk(null, true, fps);
    assert.ok(z > 2.7, `${fps} fps: kutuyla 1 sn × 2,9 m/sn yürüyüş ${z.toFixed(2)} m (kutu kapsülü durdurmamalı)`);
  }
  assert.ok(walk(2.0, true, 60) < 1.75, 'taşırken duvar yine durdurur (kapsül duvarın önünde)');
  // yerdeki (taşınmayan, dinamik) kutu kapsülle çarpışır: KCC onu iter ya da ona takılır, içinden geçmez
  const { pw } = world();
  const ch = pw.createCharacter(0, 0, 0);
  const d = pw.addDynamic(null, { type: 'box', hx: 0.375, hy: 0.375, hz: 0.375 }, 0, 0.375, 1.2, { group: G.PROP, mass: 12 });
  for (let i = 0; i < 90; i++) { ch.move(0, -0.02, 2.0 * STEP); pw.update(STEP); }
  const t = d.body.translation();
  assert.ok(t.z - ch.feet.z > 0.3, `yerdeki kutu kapsülün önünde kalır (itilir), içinden geçilmez: kutu z ${t.z.toFixed(2)}, oyuncu z ${ch.feet.z.toFixed(2)}`);
});

test('karakter gövdesi: duvarda durur, 0,3 m basamağa çıkar, yere basar; alçak tavan altında ayağa kalkamaz', () => {
  const { pw } = world((P) => {
    P.addBox(-3, 4.8, 3, 5.2, 0, 3, { kind: 'wall' });   // duvar yüzü z = 4,8
    P.addBox(-3, -8, 3, -4, 0, 0.3, { kind: 'prop' });   // 0,3 m basamak
    P.addBox(8, -3, 14, 3, 1.4, 1.8, { kind: 'wall' });  // alçak tavan (alt yüzü 1,4 m)
  });
  pw.update(STEP);
  const g = GRAVITY * STEP * STEP; // adım başına yerçekimi payı
  const walk = 4 * STEP;           // 4 m/s
  const a = pw.createCharacter(0, 0, 2);
  for (let i = 0; i < 90; i++) { a.move(0, g, walk); pw.update(STEP); }
  assert.equal(a.grounded, true);
  assert.ok(a.feet.z > 4.3 && a.feet.z < 4.5, `duvarın önünde (r 0,3 + pay): ${a.feet.z}`);
  assert.ok(a.collisions.length > 0);
  const b = pw.createCharacter(0, 0, -2);
  let maxY = 0;
  for (let i = 0; i < 60; i++) { b.move(0, g, -walk); pw.update(STEP); maxY = Math.max(maxY, b.feet.y); }
  assert.ok(maxY > 0.28 && b.feet.z < -4.5, `basamağa çıktı: y ${maxY.toFixed(3)}, z ${b.feet.z.toFixed(2)}`);
  const c = pw.createCharacter(11, 0, 0);
  assert.equal(c.setStance('crouch'), true);
  assert.equal(c.height, 1.22);
  pw.update(STEP);
  assert.equal(c.setStance('stand'), false, 'tavan ayağa kalkmayı engeller');
  assert.equal(c.stance, 'crouch');
  c.teleport(-11, 0, 0);
  pw.update(STEP);
  assert.equal(c.setStance('stand'), true);
  assert.equal(c.height, 1.74);
});

test('quatYaw ↔ yawOf gidiş-dönüş; clearDynamic dinamik gövdeleri ve kancaları temizler, statik dünya kalır', () => {
  for (const y of [-3, -1.2, 0, 0.7, 2.5, 3.1]) assert.ok(Math.abs(yawOf(quatYaw(y)) - y) < 1e-9, `yaw ${y}`);
  const { pw } = world((P) => P.addBox(-1, -1, 1, 1, 0, 1));
  pw.addDynamic(null, { type: 'ball', r: 0.3 }, 0, 3, 0);
  pw.addHook(() => {});
  pw.addAfter(() => {});
  pw.update(0.01);
  pw.clearDynamic();
  assert.equal(pw.dynamic.size, 0);
  assert.equal(pw.hooks.size, 0);
  assert.equal(pw.after.size, 0);
  assert.equal(pw.acc, 0);
  assert.equal(pw.links.size, 1, 'statik dünya korunur');
  pw.update(STEP);
  assert.ok(Math.abs(pw.raycast(0, 5, 0, 0, -1, 0, 10).dist - 4) < 1e-3);
});
