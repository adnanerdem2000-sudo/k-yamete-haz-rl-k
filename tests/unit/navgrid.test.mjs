// Yol bulma ızgarası (src/world/NavGrid.js): rasterleştirme (tür, öncelik, pay, yer altı, su), alan yeniden çizimi,
// pencereli A* (tam/kısmi yol, kırılabilir kapı), en yakın boş hücre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid, NAV } from '../../src/world/NavGrid.js';
import { CollisionWorld } from '../../src/world/Physics.js';

/** Düz sahte arazi (y = 0); su dikdörtgenleri: [x0, z0, x1, z1, taban yüksekliği], su seviyesi 0 */
function fakeTerrain(waters = []) {
  const inW = (x, z) => waters.find(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  return {
    heightAt: (x, z) => { const w = inW(x, z); return w ? w[4] : 0; },
    isWater: (x, z) => !!inW(x, z),
    waterLevelAt: () => 0,
  };
}
function setup(waters) {
  const T = fakeTerrain(waters);
  const P = new CollisionWorld(T);
  return { T, P, nav: new NavGrid(T, P) };
}
/** WorldBuilder'daki bağlantı: çarpıştırıcı eklenince/kaldırılınca/açılıp kapanınca çevresi yeniden çizilir */
function hookNav(P, nav) {
  P.onChange = (c) => {
    if (c.isFloor || (!c.blocksNav && !c.navType)) return;
    nav.rebuildArea(c.minX - 0.6, c.minZ - 0.6, c.maxX + 0.6, c.maxZ + 0.6);
  };
}
/** (cx, cz) merkezli, yarı boyu h kapalı oda (0,3 m duvar); door: -z duvarında 1,2 m kapı (pervazlar navPad = 0, BuildingGen gibi) */
function room(P, cx, cz, h, door = false) {
  const t = 0.3;
  P.addBox(cx - h, cz + h - t, cx + h, cz + h, 0, 3, { kind: 'wall' });
  P.addBox(cx - h, cz - h, cx - h + t, cz + h, 0, 3, { kind: 'wall' });
  P.addBox(cx + h - t, cz - h, cx + h, cz + h, 0, 3, { kind: 'wall' });
  if (!door) { P.addBox(cx - h, cz - h, cx + h, cz - h + t, 0, 3, { kind: 'wall' }); return; }
  const l = P.addBox(cx - h, cz - h, cx - 0.6, cz - h + t, 0, 3, { kind: 'wall' });
  const r = P.addBox(cx + 0.6, cz - h, cx + h, cz - h + t, 0, 3, { kind: 'wall' });
  l.navPad = 0; r.navPad = 0;
  const d = P.addBox(cx - 0.6, cz - h + 0.03, cx + 0.6, cz - h + 0.27, 0, 2.1, { kind: 'door' });
  d.navType = NAV.DOOR; // BuildingGen: add() navType'ı taşımadığı için sonradan atanır
}
const pathLen = (p) => { let s = 0; for (let k = 1; k < p.length; k++) s += Math.hypot(p[k].x - p[k - 1].x, p[k].z - p[k - 1].z); return s; };

test('rasterize: duvar BLOCK, işaretli kapı/pencere/yapı kendi türüyle; alçak, baş üstü, devre dışı, blocksNav=false ve döşeme basılmaz', () => {
  const { P, nav } = setup();
  const mark = (c, t) => { c.navType = t; return c; };
  P.addBox(0.1, 0.1, 0.9, 0.9, 0, 3, { kind: 'wall' });
  mark(P.addBox(4.1, 0.1, 4.9, 0.9, 0, 2.1, { kind: 'door' }), NAV.DOOR);
  mark(P.addBox(8.1, 0.1, 8.9, 0.9, 0.9, 2.1, { kind: 'window' }), NAV.WINDOW);
  mark(P.addBox(12.1, 0.1, 12.9, 0.9, 0, 2.6, { kind: 'structure' }), NAV.STRUCT);
  P.addBox(16.1, 0.1, 16.9, 0.9, 0, 0.3, { kind: 'prop' });                     // kaldırım (zemin + 0,5 altı)
  P.addBox(20.1, 0.1, 20.9, 0.9, 2.2, 3, { kind: 'prop' });                     // baş üstü kiriş (zemin + 1,9 üstü)
  P.setEnabled(P.addBox(24.1, 0.1, 24.9, 0.9, 0, 3, { kind: 'wall' }), false);  // açık kapı gibi devre dışı
  P.addBox(28.1, 0.1, 28.9, 0.9, 0, 3, { kind: 'vehicle', blocksNav: false });  // sürülen araç vekili
  P.addFloor(32.1, 0.1, 32.9, 0.9, 0.6);
  mark(P.addBox(36.1, 0.1, 36.9, 0.9, 2.2, 3, { kind: 'door' }), NAV.DOOR);     // yüksekte ama işaretli → yine basılır
  nav.rebuildArea(-2, -2, 40, 3);
  assert.equal(nav.at(0.5, 0.5), NAV.BLOCK);
  assert.equal(nav.at(4.5, 0.5), NAV.DOOR);
  assert.equal(nav.at(8.5, 0.5), NAV.WINDOW);
  assert.equal(nav.at(12.5, 0.5), NAV.STRUCT);
  for (const x of [16.5, 20.5, 24.5, 28.5, 32.5]) assert.equal(nav.at(x, 0.5), NAV.FREE, `x=${x} basılmamalı`);
  assert.equal(nav.at(36.5, 0.5), NAV.DOOR);
  assert.equal(nav.at(2.5, 2.5), NAV.FREE);
  // ızgara dışı engel sayılır
  assert.equal(nav.get(-1, 0), NAV.BLOCK);
  assert.equal(nav.at(5000, 0), NAV.BLOCK);
  // kırılabilir hücre yalnız allowBreak ile yürünür, engel hiçbir zaman
  const di = nav.toCell(4.5), dj = nav.toCell(0.5);
  assert.equal(nav.walkable(di, dj, false), false);
  assert.equal(nav.walkable(di, dj, true), true);
  assert.equal(nav.walkable(nav.toCell(0.5), dj, true), false);
});

test('rasterize önceliği: engel > yapı > pencere > kapı; ekleme sırası sonucu değiştirmez', () => {
  const { P, nav } = setup();
  const put = (x, type) => { const c = P.addBox(x + 0.1, 0.1, x + 0.9, 0.9, 0, 2.5, { kind: 'structure' }); if (type) c.navType = type; };
  // [ilk, ikinci, beklenen] — null: işaretsiz (BLOCK)
  const cases = [
    [NAV.DOOR, NAV.WINDOW, NAV.WINDOW], [NAV.WINDOW, NAV.DOOR, NAV.WINDOW],
    [NAV.WINDOW, NAV.STRUCT, NAV.STRUCT], [NAV.STRUCT, NAV.WINDOW, NAV.STRUCT],
    [NAV.DOOR, NAV.STRUCT, NAV.STRUCT], [NAV.STRUCT, NAV.DOOR, NAV.STRUCT],
    [NAV.DOOR, null, NAV.BLOCK], [null, NAV.DOOR, NAV.BLOCK], [null, NAV.STRUCT, NAV.BLOCK], [NAV.STRUCT, null, NAV.BLOCK],
  ];
  cases.forEach(([a, b], k) => { put(k * 4, a); put(k * 4, b); });
  nav.rebuildArea(-2, -2, cases.length * 4 + 2, 3);
  cases.forEach(([a, b, want], k) => assert.equal(nav.at(k * 4 + 0.5, 0.5), want, `${a} sonra ${b}`));
});

test('navPad: varsayılan 0,22 m, kapı/pencere 0,05 m, çarpıştırıcı başına geçersiz kılınır; 1,2 m kapıyı pervaz payı yutar, navPad=0 açık bırakır', () => {
  const { P, nav } = setup();
  P.addBox(0.1, 0.1, 0.9, 0.9, 0, 3, { kind: 'wall' });
  P.addBox(10.1, 0.1, 10.9, 0.9, 0, 3, { kind: 'wall' }).navPad = 0;
  P.addBox(20.1, 0.1, 20.9, 0.9, 0, 2.1, { kind: 'door' }).navType = NAV.DOOR;
  nav.rebuildArea(-2, -2, 25, 3);
  // 0,1..0,9 kutu: 0,22 m pay komşu hücreleri de (-0,5..0 ve 1..1,5) engeller
  assert.deepEqual([-0.75, -0.25, 1.25, 1.75].map((x) => nav.at(x, 0.5)), [NAV.FREE, NAV.BLOCK, NAV.BLOCK, NAV.FREE]);
  // navPad = 0: yalnız kutunun kendi hücreleri
  assert.deepEqual([9.75, 10.25, 10.75, 11.25].map((x) => nav.at(x, 0.5)), [NAV.FREE, NAV.BLOCK, NAV.BLOCK, NAV.FREE]);
  // kapı: 0,05 m pay
  assert.deepEqual([19.75, 20.25, 20.75, 21.25].map((x) => nav.at(x, 0.5)), [NAV.FREE, NAV.DOOR, NAV.DOOR, NAV.FREE]);
  // duvardaki 1,2 m kapı: yan duvarların 0,22 m payı kapı hücrelerinin hepsini BLOCK yapar
  const doorway = (x0, pad) => {
    const l = P.addBox(x0, 10, x0 + 2.4, 10.3, 0, 3, { kind: 'wall' });
    const r = P.addBox(x0 + 3.6, 10, x0 + 6, 10.3, 0, 3, { kind: 'wall' });
    if (pad !== undefined) { l.navPad = pad; r.navPad = pad; }
    P.addBox(x0 + 2.4, 10.03, x0 + 3.6, 10.27, 0, 2.1, { kind: 'door' }).navType = NAV.DOOR;
  };
  doorway(30);
  doorway(40, 0);
  nav.rebuildArea(28, 8, 48, 12);
  const doorCells = (x0) => {
    let n = 0;
    for (let x = x0 + 2.25; x < x0 + 3.8; x += 0.5) for (let z = 9.75; z < 10.8; z += 0.5) if (nav.at(x, z) === NAV.DOOR) n++;
    return n;
  };
  assert.equal(doorCells(30), 0, 'varsayılan payla kapı engel hücrelerinin altında kaldı');
  assert.ok(doorCells(40) >= 2, 'pervaz payı 0 iken kapı hücreleri DOOR');
  assert.equal(nav.at(42.75, 10.25), NAV.DOOR, 'duvar hizasında 1 m geçit');
});

test('yer altı ve su: toprağın 2 m\'den fazla altındaki çarpıştırıcı (işaretli kapı bile) basılmaz; derin su WATER, sığ su boş, su içindeki direk BLOCK', () => {
  const { P, nav } = setup([[20, -5, 30, 5, -3], [40, -5, 50, 5, -0.5]]);
  P.addBox(0.1, 0.1, 0.9, 0.9, -6, -3, { kind: 'wall' });                       // sığınak duvarı
  P.addBox(4.1, 0.1, 4.9, 0.9, -6, -3.8, { kind: 'door' }).navType = NAV.DOOR;   // sığınak kapısı
  P.addBox(25.1, 0.1, 25.9, 0.9, -3, 1, { kind: 'prop' });                       // iskele direği (su tabanından)
  nav.rebuildArea(-2, -6, 52, 6);
  assert.equal(nav.at(0.5, 0.5), NAV.FREE);
  assert.equal(nav.at(4.5, 0.5), NAV.FREE);
  assert.equal(nav.at(22, 0), NAV.WATER);
  assert.equal(nav.at(25.5, 0.5), NAV.BLOCK, 'su hücresinin üstüne engel basılır');
  assert.equal(nav.at(45, 0), NAV.FREE, 'sığ su yürünür');
  assert.equal(nav.at(31, 0), NAV.FREE);
  assert.equal(nav.walkable(nav.toCell(22), nav.toCell(0), true), false, 'su kırılabilir değil');
});

test('rebuildArea: kapı açılınca/kapanınca, çarpıştırıcı taşınınca ve kaldırılınca hücreler yeniden hesaplanır (komşu engel korunur)', () => {
  const { P, nav } = setup();
  const door = P.addBox(20.1, 0.1, 20.9, 0.34, 0, 2.1, { kind: 'door' });
  door.navType = NAV.DOOR;
  nav.rebuildArea(-5, -5, 30, 5); // buildAll gibi: dünya kurulduktan sonra
  hookNav(P, nav);
  assert.equal(nav.at(20.5, 0.25), NAV.DOOR);
  P.setEnabled(door, false); // Interact: kapı açıldı
  assert.equal(nav.at(20.5, 0.25), NAV.FREE);
  P.setEnabled(door, true);
  assert.equal(nav.at(20.5, 0.25), NAV.DOOR);
  // yeni engel ekleme anında basılır
  const crate = P.addBox(0.1, 0.1, 0.9, 0.9, 0, 1.2, { kind: 'prop' });
  assert.equal(nav.at(0.5, 0.5), NAV.BLOCK);
  // taşıma onChange çağırmaz: çağıran eski + yeni alanı yeniden çizer (Vehicles.updateProxy gibi)
  const old = [crate.minX, crate.minZ, crate.maxX, crate.maxZ];
  P.move(crate, 10.1, 0.1, 10.9, 0.9);
  assert.equal(nav.at(0.5, 0.5), NAV.BLOCK, 'yeniden çizilmeden eski hücre engelli kalır');
  assert.equal(nav.at(10.5, 0.5), NAV.FREE);
  nav.rebuildArea(old[0] - 0.6, old[1] - 0.6, old[2] + 0.6, old[3] + 0.6);
  nav.rebuildArea(crate.minX - 0.6, crate.minZ - 0.6, crate.maxX + 0.6, crate.maxZ + 0.6);
  assert.equal(nav.at(0.5, 0.5), NAV.FREE);
  assert.equal(nav.at(10.5, 0.5), NAV.BLOCK);
  // kaldırma: alan boşalır, aynı alana taşan komşu duvar yeniden basılır
  P.addBox(11.5, 0.1, 12.3, 0.9, 0, 2, { kind: 'wall' });
  assert.equal(nav.at(11.25, 0.5), NAV.BLOCK);
  P.remove(crate);
  assert.equal(nav.at(10.5, 0.5), NAV.FREE);
  assert.equal(nav.at(11.25, 0.5), NAV.BLOCK, 'komşu duvarın pay hücresi korunur');
});

test('findPath: duvarın etrafından tam yol; ara noktalar boş hücrede, ardışık noktalar arası düz hat açık', () => {
  const { P, nav } = setup();
  P.addBox(5, -10, 6, 10, 0, 3, { kind: 'wall' });
  nav.rebuildArea(-20, -20, 30, 20);
  assert.equal(nav.lineClear(0, 0, 12, 0), false, 'düz hat duvarla kesilir');
  const path = nav.findPath(0, 0, 12, 0);
  assert.ok(path && path.length >= 3, 'yol bulundu');
  assert.equal(path.complete, true);
  assert.ok(Math.hypot(path[0].x, path[0].z) < 0.5, 'başlangıç hücresi');
  const last = path[path.length - 1];
  assert.ok(Math.hypot(last.x - 12, last.z) < 0.5, `hedef hücresi: ${last.x}, ${last.z}`);
  assert.ok(path.some((p) => Math.abs(p.z) > 10), 'duvarın ucundan dolaşır');
  for (const p of path) assert.equal(nav.at(p.x, p.z), NAV.FREE);
  for (let k = 1; k < path.length; k++) assert.ok(nav.lineClear(path[k - 1].x, path[k - 1].z, path[k].x, path[k].z), `parça ${k} açık`);
  const L = pathLen(path);
  assert.ok(L > 20 && L < 32, `yol uzunluğu ${L.toFixed(1)} m`);
  assert.equal(nav.searches, 1);
});

test('findPath: hedef kapalı bir odadaysa en yakın noktaya kısmi yol (complete=false)', () => {
  const { P, nav } = setup();
  room(P, 30, 0, 3);
  nav.rebuildArea(-10, -15, 45, 15);
  const path = nav.findPath(0, 0, 30, 0);
  assert.ok(path && path.length >= 2, 'kısmi yol döner (null değil)');
  assert.equal(path.complete, false);
  const last = path[path.length - 1];
  const d = Math.hypot(last.x - 30, last.z);
  assert.ok(d > 3 && d < 4.5, `odanın dışında, duvarın dibinde: ${d.toFixed(2)} m`);
  assert.equal(nav.at(last.x, last.z), NAV.FREE);
});

test('findPath: allowBreak (varsayılan) kapı hücresinden geçen tam yol verir ve kapıyı işaretler; allowBreak=false odaya giremez', () => {
  const { P, nav } = setup();
  room(P, 0, 40, 3, true);
  nav.rebuildArea(-10, 25, 10, 50);
  assert.equal(nav.lineClear(0, 30, 0, 40, false), false);
  assert.equal(nav.lineClear(0, 30, 0, 40, true), true, 'kırılabilir hücreler allowBreak ile açık');
  const p = nav.findPath(0, 30, 0, 40);
  assert.ok(p && p.complete, 'kapıdan girildi');
  assert.ok(p.some((q) => q.type === NAV.DOOR), 'yol kapı hücresini taşır (zombi orada kapıyı zorlar)');
  const last = p[p.length - 1];
  assert.ok(Math.hypot(last.x, last.z - 40) < 0.5);
  const q = nav.findPath(0, 30, 0, 40, { allowBreak: false });
  assert.ok(q, 'kısmi yol');
  assert.equal(q.complete, false);
  assert.ok(q.every((w) => w.type === NAV.FREE));
  const e = q[q.length - 1];
  const inside = Math.abs(e.x) < 3 && e.z > 37 && e.z < 43;
  assert.ok(!inside && Math.hypot(e.x, e.z - 40) > 3, `odanın dışında, duvar dibinde kalır: ${e.x}, ${e.z}`);
  assert.equal(nav.at(e.x, e.z), NAV.FREE);
});

test('findPath: engel içindeki hedef en yakın yürünebilir hücreye çekilir; 3,5 m içinde boş hücre yoksa null', () => {
  const { P, nav } = setup();
  P.addBox(5, -10, 5.3, 10, 0, 3, { kind: 'wall' });  // ince duvar
  P.addBox(20, -5, 30, 5, 0, 3, { kind: 'wall' });    // 10×10 m dolu blok
  nav.rebuildArea(-10, -15, 35, 15);
  const tgt = { x: 4.85, z: 0.3 }; // duvara yaslanmış oyuncu: duvar payının içinde
  assert.equal(nav.at(tgt.x, tgt.z), NAV.BLOCK);
  const p = nav.findPath(0, 0, tgt.x, tgt.z);
  assert.ok(p && p.complete);
  const last = p[p.length - 1];
  assert.ok(last.x < 5 && Math.hypot(last.x - tgt.x, last.z - tgt.z) < 1, `duvarın bu yanında: ${last.x}, ${last.z}`);
  assert.equal(nav.findPath(0, 0, 25, 0), null);
});

test('nearestFree: boş hücrenin kendisi; engel ve derin su içinden kenardaki boş hücre; menzilde yoksa null; kapı hücresi sayılmaz', () => {
  const { P, nav } = setup([[40, -5, 50, 5, -3]]);
  P.addBox(20, -5, 30, 5, 0, 3, { kind: 'wall' });
  P.addBox(60.1, 0.1, 60.9, 0.34, 0, 2.1, { kind: 'door' }).navType = NAV.DOOR;
  nav.rebuildArea(10, -10, 70, 10);
  assert.deepEqual(nav.nearestFree(0.3, 0.3), { x: 0.25, z: 0.25 });
  const cheb = (p, x, z) => Math.max(Math.abs(p.x - x), Math.abs(p.z - z));
  const a = nav.nearestFree(25, 0);
  assert.ok(a && nav.at(a.x, a.z) === NAV.FREE);
  assert.ok(cheb(a, 25, 0) > 5 && cheb(a, 25, 0) <= 6, `bloğun hemen dışı: ${a.x}, ${a.z}`);
  assert.equal(nav.nearestFree(25, 0, 2), null, '2 m içinde boş hücre yok');
  const w = nav.nearestFree(45, 0);
  assert.ok(w && nav.at(w.x, w.z) === NAV.FREE && cheb(w, 45, 0) <= 6, 'sudan kıyıya');
  const d = nav.nearestFree(60.5, 0.2);
  assert.ok(d && nav.at(d.x, d.z) === NAV.FREE, 'kapı hücresi doğma yeri sayılmaz');
  assert.ok(cheb(d, 60.5, 0.2) <= 1);
});

test('add() seçeneğiyle verilen navType korunmalı: oyuncu yapısı (Build.js gibi) ızgarada STRUCT olarak basılmalı', { skip: 'OYUN HATASI (bildirildi): Collider yapıcısı navType seçeneğini kopyalamıyor ve physics.onChange (WorldBuilder → nav.rebuildArea) ekleme anında çalışıyor. Build.js kapılı duvarın yan parçaları ve kapı çarpıştırıcısı { navType: NAV.STRUCT } ile ekleniyor ama alan kayboluyor → ızgarada BLOCK; düz duvar/çit/barikatta c.navType = STRUCT ekleme SONRASI atanıyor, onChange çizimi çoktan BLOCK yapmış oluyor (alan başka nedenle yeniden çizilene dek, kayıttan yüklemede de). Zombilerin A* araması oyuncu yapılarını kırılabilir (STRUCT, maliyet 30) değil aşılmaz engel sayıyor.' }, () => {
  const { P, nav } = setup();
  hookNav(P, nav);
  // kapılı duvar yan parçası: Build.js satır 192/194 gibi
  const side = P.addBoxC(0, 0, 0.5, 0.125, 0, 2.6, { kind: 'structure', navType: NAV.STRUCT });
  assert.equal(side.navType, NAV.STRUCT);
  assert.equal(nav.at(0, 0), NAV.STRUCT);
  // düz duvar: Build.js satır 200-201 gibi (navType ekleme sonrası atanır)
  const wall = P.addBoxC(10, 0, 1.1, 0.125, 0, 2.6, { kind: 'structure', navType: NAV.STRUCT });
  wall.navType = NAV.STRUCT;
  assert.equal(nav.at(10, 0), NAV.STRUCT);
});
