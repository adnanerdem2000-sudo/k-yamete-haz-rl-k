// Çarpışma dünyası (src/world/Physics.js): AABB/daire ızgarası, itme, örtüşme, ışın, görüş hattı, zemin yüksekliği.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, Collider } from '../../src/world/Physics.js';

/** En küçük sahte arazi: CollisionWorld yalnız heightAt kullanır */
const terrain = (fn = () => 0) => ({ heightAt: fn });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('ekleme/kaldırma/etkinlik onChange bildirir; sorgu yalnız etkin ve örtüşen çarpıştırıcıları bir kez döndürür', () => {
  const P = new CollisionWorld(terrain());
  const log = [];
  P.onChange = (c, on) => log.push([c.id, on]);
  // 8 m'lik ızgarada birden çok hücreye yayılan duvar + daire (ağaç)
  const wall = P.addBox(-10, -1, 10, 1, 0, 3, { kind: 'wall' });
  const tree = P.add({ shape: 'circle', x: 20, z: 0, r: 0.5, kind: 'tree' });
  assert.ok(wall instanceof Collider);
  assert.deepEqual([tree.minX, tree.maxX, tree.minZ, tree.maxZ], [19.5, 20.5, -0.5, 0.5], 'daire AABB\'si yarıçaptan');
  assert.deepEqual(log, [[wall.id, true], [tree.id, true]]);
  assert.ok(wall.cells.length > 1, 'duvar birden çok ızgara hücresinde');
  // geniş sorgu: çok hücreli duvar yine tek kez
  const all = P.query(-30, -30, 30, 30);
  assert.equal(all.length, 2);
  assert.equal(all.filter((c) => c === wall).length, 1);
  // AABB kenarına değen sorgu bulur, kenarın hemen ötesi bulmaz
  assert.deepEqual(P.query(10, 1, 12, 3), [wall]);
  assert.deepEqual(P.query(10.01, -5, 12, 5), []);
  // devre dışı → sorguda yok; aynı duruma yeniden ayarlamak bildirim üretmez
  P.setEnabled(wall, false);
  P.setEnabled(wall, false);
  assert.deepEqual(P.query(-1, -1, 1, 1), []);
  P.setEnabled(wall, true);
  assert.deepEqual(P.query(-1, -1, 1, 1), [wall]);
  // kaldırma: ızgaradan ve kümeden çıkar; ikinci kaldırma ve null sessiz
  P.remove(wall); P.remove(wall); P.remove(null);
  assert.deepEqual(P.query(-30, -30, 30, 30), [tree]);
  assert.ok(!P.all.has(wall));
  assert.equal(wall.cells.length, 0);
  assert.deepEqual(log.slice(2), [[wall.id, false], [wall.id, true], [wall.id, false]]);
});

test('move: kutu yeni hücrelere taşınır, eski yerde bulunmaz; onChange tetiklenmez; dairede merkezi çağıran günceller', () => {
  const P = new CollisionWorld(terrain());
  const box = P.addBox(0, 0, 2, 2, 0, 1.5, { kind: 'prop' });
  let calls = 0;
  P.onChange = () => calls++;
  P.move(box, 30, 30, 32, 32);
  assert.deepEqual([box.minX, box.minZ, box.maxX, box.maxZ], [30, 30, 32, 32]);
  assert.deepEqual(P.query(0, 0, 2, 2), []);
  assert.deepEqual(P.query(31, 31, 31, 31), [box]);
  assert.equal(calls, 0, 'move yol ızgarasını kendisi güncellemez (Vehicles.updateProxy rebuildArea çağırır)');
  // araç vekili gibi: önce x/z, sonra move → itme yeni merkeze göre
  const post = P.add({ shape: 'circle', x: 0, z: 10, r: 0.5 });
  post.x = 5; post.z = 10;
  P.move(post, 4.5, 9.5, 5.5, 10.5);
  const r = P.resolveCircle(5.6, 10, 0.3, 0, 1.8);
  assert.ok(r.hit);
  assert.ok(near(r.x, 5.8, 1e-9) && near(r.z, 10, 1e-9), `yeni merkezden 0,8 m: ${r.x}`);
  assert.equal(P.resolveCircle(0.2, 10, 0.3, 0, 1.8).hit, false, 'eski konumda itme yok');
});

test('overlapsBox: kutu ve daire örtüşmesi, dikey aralık (sınıra değmek örtüşme değil) ve süzgeç', () => {
  const P = new CollisionWorld(terrain());
  const owner = { ad: 'araç' };
  const crate = P.addBox(0, 0, 1, 1, 0, 1, { kind: 'prop', owner });
  const tree = P.add({ shape: 'circle', x: 10, z: 0, r: 1, minY: 0, maxY: 6, kind: 'tree' });
  assert.equal(P.overlapsBox(0.5, 0.5, 2, 2, 0.2, 1.8), crate);
  assert.equal(P.overlapsBox(0.5, 0.5, 2, 2, 1, 2), null, 'kasanın üstü');
  assert.equal(P.overlapsBox(0.5, 0.5, 2, 2, -2, 0), null, 'kasanın altı');
  assert.equal(P.overlapsBox(0.5, 0.5, 2, 2, 0.2, 1.8, (c) => c.owner !== owner), null, 'süzgeç sahibini yok sayar');
  // daire: AABB'ler örtüşse de kutunun en yakın noktası dairenin dışındaysa örtüşme yok
  assert.equal(P.overlapsBox(10.8, 0.8, 12, 2, 0, 2), null);
  assert.equal(P.overlapsBox(10.5, 0.5, 12, 2, 0, 2), tree);
  assert.equal(P.overlapsBox(9.5, -0.2, 9.8, 0.2, 0, 2), tree);
  assert.equal(P.overlapsBox(9.5, -0.2, 9.8, 0.2, 6, 8), null, 'gövdenin üstü');
});

test('resolveCircle: kutudan en yakın yüzeye, merkez içerideyse en kısa eksenden, daireden radyal itilir', () => {
  const P = new CollisionWorld(terrain());
  const wall = P.addBox(0, 0, 4, 1, 0, 3, { kind: 'wall' });
  // yüzeye 0,1 m gömülmüş karakter (r 0,3) yüzeyden tam r uzağa itilir
  let r = P.resolveCircle(2, 1.2, 0.3, 0, 1.8);
  assert.ok(r.hit);
  assert.equal(r.hits[0], wall);
  assert.ok(near(r.x, 2) && near(r.z, 1.3), `${r.x}, ${r.z}`);
  // dış köşe: köşeden r uzağa
  r = P.resolveCircle(4.1, 1.1, 0.3, 0, 1.8);
  assert.ok(near(Math.hypot(r.x - 4, r.z - 1), 0.3, 1e-9));
  // merkez kutunun içinde: en yakın kenar minZ (0,2 m) → z = minZ - r
  r = P.resolveCircle(1.5, 0.2, 0.3, 0, 1.8);
  assert.ok(near(r.x, 1.5) && near(r.z, -0.3), `${r.x}, ${r.z}`);
  // temas yoksa konum aynen döner
  r = P.resolveCircle(2, 2, 0.3, 0, 1.8);
  assert.equal(r.hit, false);
  assert.equal(r.hits.length, 0);
  assert.deepEqual([r.x, r.z], [2, 2]);
  // daire (ağaç gövdesi): merkezden dışa, toplam yarıçap uzağa
  P.add({ shape: 'circle', x: 10, z: 10, r: 0.5, kind: 'tree' });
  r = P.resolveCircle(10.3, 10.4, 0.3, 0, 1.8);
  assert.ok(near(Math.hypot(r.x - 10, r.z - 10), 0.8, 1e-9));
  assert.ok(near(Math.atan2(r.z - 10, r.x - 10), Math.atan2(0.4, 0.3), 1e-9), 'itme yönü merkezden dışa');
});

test('resolveCircle: basamak altındaki ve baş üstündeki engeller itmez; ignore çarpıştırıcıyı ya da sahibini atlar; köşede iki duvardan da çıkılır', () => {
  const P = new CollisionWorld(terrain());
  P.addBox(0, 0, 4, 1, 0, 0.5, { kind: 'prop' });       // 0,5 m kaldırım: varsayılan basamak (0,55) altında
  P.addBox(0, 2, 4, 3, 2.0, 2.4, { kind: 'prop' });     // baş üstü tabela
  const owner = {};
  const car = P.addBox(0, 5, 4, 6, 0, 1.6, { kind: 'vehicle', owner });
  assert.equal(P.resolveCircle(2, 0.5, 0.3, 0, 1.8).hit, false, 'kaldırıma çıkılır');
  assert.equal(P.resolveCircle(2, 0.5, 0.3, 0, 1.8, 0.4).hit, true, 'basamak 0,4 m iken kaldırım engel');
  assert.equal(P.resolveCircle(2, 2.5, 0.3, 0, 1.8).hit, false, 'tabela başın üstünde');
  assert.equal(P.resolveCircle(2, 2.5, 0.3, 0.5, 2.3).hit, true, 'yükseltide başı tabelaya çarpar');
  assert.equal(P.resolveCircle(2, 5.5, 0.3, 0, 1.8).hit, true);
  assert.equal(P.resolveCircle(2, 5.5, 0.3, 0, 1.8, 0.55, car).hit, false, 'ignore: çarpıştırıcının kendisi');
  assert.equal(P.resolveCircle(2, 5.5, 0.3, 0, 1.8, 0.55, owner).hit, false, 'ignore: sahibi (araç vekilleri)');
  // iç köşe: iki duvara birden gömülü karakter yinelemeli çözümle ikisinden de çıkar
  P.addBox(20, 20, 25, 20.2, 0, 3);
  P.addBox(20, 20, 20.2, 25, 0, 3);
  const r = P.resolveCircle(20.3, 20.3, 0.3, 0, 1.8);
  assert.ok(r.hit && new Set(r.hits).size === 2);
  assert.ok(r.x >= 20.5 - 1e-9 && r.z >= 20.5 - 1e-9, `köşeden çıkış: ${r.x}, ${r.z}`);
});

test('raycast: en yakın kutu/daire, yön normalleştirilir, süzgeçle pencere geçilir, menzil ve başlangıç kutusu', () => {
  const P = new CollisionWorld(terrain(() => -10));
  const win = P.addBox(4, -1, 4.2, 1, 0, 3, { kind: 'window', blocksSight: false, blocksBullets: false });
  const wall = P.addBox(10, -1, 10.4, 1, 0, 3, { kind: 'wall' });
  const tree = P.add({ shape: 'circle', x: 20, z: 3, r: 0.5, minY: 0, maxY: 8, kind: 'tree' });
  let h = P.raycast(0, 1, 0, 1, 0, 0, 50);
  assert.equal(h.collider, win);
  assert.equal(h.terrain, false);
  assert.ok(near(h.dist, 4));
  assert.deepEqual(h.point, { x: 4, y: 1, z: 0 });
  // birim olmayan yön: mesafe yine metre
  h = P.raycast(0, 1, 0, 25, 0, 0, 50);
  assert.equal(h.collider, win);
  assert.ok(near(h.dist, 4));
  // mermi süzgeci (blocksBullets): pencere geçilir, duvar durdurur
  const bullets = (c) => c.blocksBullets;
  h = P.raycast(0, 1, 0, 1, 0, 0, 50, bullets);
  assert.equal(h.collider, wall);
  assert.ok(near(h.dist, 10));
  // görüş süzgeci (blocksSight) de pencereyi geçer
  assert.equal(P.raycast(0, 1, 0, 1, 0, 0, 50, (c) => c.blocksSight).collider, wall);
  assert.equal(P.raycast(0, 1, 0, 1, 0, 0, 9, bullets), null, 'menzil dışı');
  assert.equal(P.raycast(0, 3.5, 0, 1, 0, 0, 15, bullets), null, 'duvarın üstünden');
  // daire: gövdeye yüzeyinden çarpar
  h = P.raycast(20, 1, -5, 0, 0, 1, 20);
  assert.equal(h.collider, tree);
  assert.ok(near(h.dist, 7.5));
  // çapraz ışın: nokta = başlangıç + yön·mesafe
  h = P.raycast(17, 1, 0, 3, 0, 2.5, 20);
  assert.equal(h.collider, tree);
  const L = Math.hypot(3, 2.5);
  assert.ok(near(h.point.x, 17 + 3 / L * h.dist) && near(h.point.z, 2.5 / L * h.dist));
  assert.ok(near(Math.hypot(h.point.x - 20, h.point.z - 3), 0.5, 1e-6), 'çarpma noktası gövde yüzeyinde');
  // başlangıç noktası kutunun içindeyse o kutu yok sayılır (arkada engel yok)
  assert.equal(P.raycast(10.2, 1, 0, 1, 0, 0, 50), null);
});

test('raycast arazi: tepeye çarpar (ikiye bölme ile hassas), collider null; lineOfSight duvar/tepe keser, pencere/alçak çit kesmez', () => {
  // x 40..50 arası 5 m'lik tepe
  const P = new CollisionWorld(terrain((x) => (x > 40 && x < 50 ? 5 : 0)));
  P.addBox(10, -1, 10.3, 1, 0, 3, { kind: 'wall' });
  P.addBox(20, -1, 20.1, 1, 0, 3, { kind: 'window', blocksSight: false, blocksBullets: false });
  P.addBox(30, 4, 30.3, 6, 0, 1.0, { kind: 'fence' });
  P.addBox(70, -1, 70.24, 1, 0, 2.2, { kind: 'door' });
  const h = P.raycast(35, 1.6, 0, 1, 0, 0, 30);
  assert.equal(h.terrain, true);
  assert.equal(h.collider, null);
  assert.ok(h.dist > 5 && h.dist < 5.05, `tepe yamacı x≈40: ${h.dist}`);
  assert.equal(P.lineOfSight(0, 1.6, 0, 8, 1.6, 0), true);
  assert.equal(P.lineOfSight(0, 1.6, 0, 12, 1.6, 0), false, 'duvar keser');
  assert.equal(P.lineOfSight(15, 1.6, 0, 25, 1.6, 0), true, 'pencere görüşü kesmez');
  assert.equal(P.lineOfSight(25, 1.6, 5, 35, 1.6, 5), true, 'alçak çitin üstünden görülür');
  assert.equal(P.lineOfSight(25, 0.5, 5, 35, 0.5, 5), false, 'alçak göz çite takılır');
  assert.equal(P.lineOfSight(35, 1.6, 0, 55, 1.6, 0), false, 'tepe keser');
  assert.equal(P.lineOfSight(35, 9, 0, 55, 9, 0), true, 'tepenin üstünden');
  assert.equal(P.lineOfSight(3, 1, 3, 3.005, 1, 3), true, 'aynı nokta');
  // hedefin dibindeki son 0,3 m sayılmaz: kapı eşiğinde duran hedefi kapının kendi çarpıştırıcısı gizlemez
  assert.equal(P.lineOfSight(62, 1.6, 0, 70.12, 1.6, 0), true);
  assert.equal(P.lineOfSight(62, 1.6, 0, 71.2, 1.6, 0), false, 'kapının 1 m arkası görünmez');
});

test('groundHeight: arazi, katlar, basamak sınırı, walkable, yarıçap, devre dışı yüzey ve yer altı sığınağı', () => {
  assert.ok(near(new CollisionWorld(terrain((x, z) => 0.1 * x + 0.2 * z)).groundHeight(5, 10), 2.5), 'eğimli arazi');
  const P = new CollisionWorld(terrain(() => 0));
  const floor1 = P.addFloor(0, 0, 10, 10, 0.2);
  const floor2 = P.addFloor(0, 0, 10, 10, 3.2);
  P.addBox(20, 0, 21, 1, 0, 0.5, { kind: 'prop' });                         // kasa
  P.addBox(30, 0, 31, 1, 0, 0.8, { kind: 'prop' });                         // masa
  P.addBox(40, 0, 41, 0.2, 0, 2.2, { kind: 'door', walkable: false });      // kapı
  P.add({ shape: 'circle', x: 50, z: 0, r: 0.4, minY: 0, maxY: 0.4 });      // kütük
  assert.equal(P.groundHeight(60, 60), 0);
  assert.equal(P.lastSurface, null);
  // varsayılan ayak (1e9): en yüksek yüzey
  assert.equal(P.groundHeight(5, 5), 3.2);
  assert.equal(P.lastSurface, floor2);
  // zemin katta: üst kat ayak+basamağın üstünde kalır
  assert.equal(P.groundHeight(5, 5, 0.2), 0.2);
  assert.equal(P.lastSurface, floor1);
  // basamak: 0,5 m kasaya çıkılır, 0,8 m masaya çıkılmaz (basamak 0,9 iken çıkılır)
  assert.equal(P.groundHeight(20.5, 0.5, 0), 0.5);
  assert.equal(P.groundHeight(30.5, 0.5, 0), 0);
  assert.equal(P.groundHeight(30.5, 0.5, 0, 0.9), 0.8);
  assert.equal(P.groundHeight(40.5, 0.1, 2.0), 0, 'walkable=false kapı üstü yüzey değil');
  // yarıçap: kasanın 0,2 m dışındaki 0,3 m'lik ayak kasaya basar
  assert.equal(P.groundHeight(21.2, 0.5, 0), 0);
  assert.equal(P.groundHeight(21.2, 0.5, 0, 0.55, 0.3), 0.5);
  // daire: merkezden r içinde
  assert.equal(P.groundHeight(50.3, 0, 0), 0.4);
  assert.equal(P.groundHeight(50.5, 0, 0, 0.55, 0.05), 0);
  P.setEnabled(floor2, false);
  assert.equal(P.groundHeight(5, 5), 0.2, 'devre dışı kat sayılmaz');
  // yer altı: ayak arazinin 1 m'den fazla altında ve boşluktaysa zemin sığınak döşemesi
  const Q = new CollisionWorld(terrain(() => 0));
  Q.under = { cavityAt: (x, y) => x > 100 && x < 110 && y < -1 };
  const shelter = Q.addFloor(100, 0, 110, 10, -4);
  assert.equal(Q.groundHeight(105, 5, -4), -4);
  assert.equal(Q.lastSurface, shelter);
  assert.equal(Q.groundHeight(105, 5, 0), 0, 'yüzeydeki oyuncu için arazi');
});

test('addBoxC/addFloor/add: merkez-yarı boyut kutusu, döşeme bayrakları ve varsayılanlar', () => {
  const P = new CollisionWorld(terrain());
  const b = P.addBoxC(10, 20, 1.5, 0.5, 0, 2, { kind: 'structure' });
  assert.deepEqual([b.minX, b.maxX, b.minZ, b.maxZ, b.minY, b.maxY], [8.5, 11.5, 19.5, 20.5, 0, 2]);
  assert.equal(b.kind, 'structure');
  const f = P.addFloor(0, 0, 4, 4, 3);
  assert.equal(f.kind, 'floor');
  assert.deepEqual([f.minY, f.maxY], [2.7, 3]);
  assert.deepEqual([f.walkable, f.blocksNav, f.blocksSight, f.blocksBullets], [true, false, false, false]);
  const c = P.add({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 });
  assert.deepEqual([c.shape, c.kind, c.minY, c.maxY, c.owner], ['box', 'static', -50, 100, null]);
  assert.deepEqual([c.walkable, c.blocksNav, c.blocksSight, c.blocksBullets, c.enabled], [true, true, true, true, true]);
  assert.ok(c.id !== b.id && c.id !== f.id, 'kimlikler benzersiz');
});

test('addFloor döşemesi isFloor işaretini taşımalı: itme, örtüşme ve ışınlar döşemeyi atlamalı', { skip: 'OYUN HATASI (bildirildi): Collider yapıcısı seçeneklerdeki isFloor alanını kopyalamıyor (navType/navPad da kopyalanmıyor); addFloor\'un verdiği isFloor:true kayboluyor. resolveCircle/overlapsBox/raycast içindeki "c.isFloor" atlamaları ölü kod: döşeme levhası altından geçen karakteri yatay itiyor, overlapsBox döşemeyi engel sayıyor, süzgeçsiz ışın döşemeye çarpıyor; Build.js yerleştirme ışını "(c) => c.isFloor || …" döşemeleri hiç vurmuyor (üst katta/iskelede hayalet yere düşüyor).' }, () => {
  const P = new CollisionWorld(terrain());
  const f = P.addFloor(0, 0, 4, 4, 3);
  assert.equal(f.isFloor, true);
  // üst kat döşemesinin altında, başı levhaya giren karakter yatay itilmemeli
  assert.equal(P.resolveCircle(1, 1, 0.3, 2.0, 3.8).hit, false);
  // yerleştirme/çıkış denetimi döşemeyi engel saymamalı
  assert.equal(P.overlapsBox(1, 1, 2, 2, 2.5, 3.5), null);
  // süzgeçsiz ışın döşemeyi (mermi geçirir) atlayıp araziye çarpmalı
  const h = P.raycast(2, 6, 2, 0, -1, 0, 10);
  assert.ok(h && h.terrain && h.collider === null);
  // Build.js yerleştirme süzgeci döşemeyi vurmalı
  assert.equal(P.raycast(2, 6, 2, 0, -1, 0, 10, (c) => c.isFloor || c.kind === 'wall').collider, f);
});
