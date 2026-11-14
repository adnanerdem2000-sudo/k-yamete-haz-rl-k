// Eşya paylaşımı birim testleri: iki envanter arasında yığın bölme/birleştirme/aktarma (yığın, ağırlık ve yuva sınırı,
// yığın verisi ve tazelik), oyuncudan oyuncuya verme (give → grant, host üzerinden), yere bırakma/yerden alma (GroundItems),
// konteyner/ortak depo/bagaj aktarımı (Loot, Build, Vehicles işleyicileri) ve tüccar takası (NPCs). Oturumlar gerçek
// Session sınıfıdır (gerçek emit/applyEvent/act/applyAction ve kayıtlı işleyiciler); oturumlar arası ağ, PeerJS taşıyıcısı
// gibi JSON kopyasıyla ileten küçük bir köprüdür (kişiye özel olay süzgeci Session.applyEvent'in kendisidir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Session } from '../../src/Session.js';
import { Inventory, HOTBAR, stackWeight } from '../../src/systems/Inventory.js';
import { PlayerStats } from '../../src/systems/PlayerStats.js';
import { Loot } from '../../src/systems/Loot.js';
import { GroundItems } from '../../src/systems/GroundItems.js';
import { Build } from '../../src/systems/Build.js';
import { Vehicles } from '../../src/systems/Vehicles.js';
import { NPCs } from '../../src/systems/NPCs.js';
import { Quests } from '../../src/systems/Quests.js';
import { Bots } from '../../src/systems/Bots.js';
import { TimeSystem } from '../../src/systems/TimeSystem.js';
import { CHARACTERS } from '../../src/entities/CharacterFactory.js';
import { ITEMS } from '../../src/data/items.js';

// ---------------------------------------------------------------------------------------------- oyun kabuğu taklitleri
function fakeUI() {
  const log = [];
  const ui = { log, toasts: () => log.filter((x) => x[0] === 'toast').map((x) => x[1]), calls: (n) => log.filter((x) => x[0] === n) };
  for (const n of ['toast', 'itemToast', 'questBanner', 'refreshQuests', 'openStorage', 'refreshStorage', 'updateHotbar', 'refreshInventory', 'refreshTimeline']) ui[n] = (...a) => { log.push([n, ...a]); };
  return ui;
}

function makeGame() {
  return {
    world: {
      spawn: { x: 0, y: 5, z: 0, rot: 0 },
      containers: [
        { id: 'c_dolap', type: 'crate', x: 4, z: 4 },
        { id: 'c_kucuk', type: 'crate', x: 6, z: 4, storage: 3 },
      ],
      doors: [], windows: [], shelters: [], vehicleSpawns: [], buildings: [], buildingById: {}, interactables: [],
      home: { rooms: [], floorY: 0, box: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 } },
      physics: { setEnabled() {}, addBoxC: () => ({}), remove() {}, addFloor() {}, groundHeight: () => 5 },
      terrain: { heightAt: () => 5 },
      regionAt: () => ({ id: 'mahalle', danger: 1 }),
    },
    scene: new THREE.Scene(), phys: null,
    audio: { play() {}, loop() {}, stopLoop() {} },
    env: { weather: { rain: 0, cloud: 0, storm: 0 }, extraLights: [] },
    ui: fakeUI(), net: { active: false, sendToHost() {}, broadcast() {} },
    itemModels: { make: () => new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3)) },
  };
}

function fakePlayer(x = 0, z = 0) {
  return {
    pos: new THREE.Vector3(x, 5, z), yaw: 0, mode: 'ground', aiming: false,
    avatar: { heldId: null, hold(id) { this.heldId = id; }, setFlashlight() {}, play() {} },
    spawnAt(px, py, pz, rot) { this.pos.set(px, py, pz); this.yaw = rot; },
  };
}

/** Gerçek Session; paylaşımla ilgili gerçek alt sistemler (3B model gerektirmeyenler) */
function makeSession(id, name, opts = {}) {
  const game = makeGame();
  const S = new Session(game, { mode: opts.host ? 'host' : 'client', difficulty: 'normal', dayMinutes: 24, seed: 777, localId: id, local: { name, charId: opts.charId || 'mert' } });
  const cdef = CHARACTERS[opts.charId || 'mert'];
  S.localProfile = { id, name, charId: cdef.id, look: { ...cdef.look }, stats: cdef.stats };
  S.localStats = new PlayerStats(cdef.stats);
  S.inventory = new Inventory(30, 30);
  S.equipment = { back: null, body: null, head: null, body2: null, hands: null };
  S.hotbarIndex = 0;
  S.local = fakePlayer(opts.x || 0, opts.z || 0);
  S.loot = new Loot(S);
  S.ground = new GroundItems(S);
  S.build = new Build(S);
  S.build.buildVisual = () => {}; // yapı görseli canvas dokusu ister (TextureFactory → document): Node'da kurulamaz
  S.vehicles = new Vehicles(S);
  S.npcs = new NPCs(S);
  S.quests = new Quests(S);
  S.bots = new Bots(S);
  S.registerCore();
  S.players.set(id, { id, name, charId: cdef.id, isLocal: true, token: id, pos: S.local.pos });
  return S;
}

/**
 * Oturumlar arası ağ köprüsü: host'un yayınladığı her olay istemcilere JSON kopyası olarak gider (PeerJS gibi; ortak nesne
 * yok); istemcinin act() isteği host'ta applyAction(…, istemciKimliği) olur. Kişiye özel olayı (to) Session.applyEvent süzer.
 */
function link(host, ...clients) {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  host.net = { active: true, broadcast(msg, except) { for (const c of clients) if (c.localId !== except) c.applyEvent(clone(msg.e)); }, sendToHost() {} };
  for (const c of clients) {
    c.net = { active: true, broadcast() {}, sendToHost(m) { if (m.t === 'req') host.applyAction(m.type, clone(m.p || {}), c.localId); } };
    host.players.set(c.localId, { id: c.localId, name: c.localProfile.name, charId: c.localProfile.charId, token: c.localId, pos: c.local.pos });
  }
}

function watchErrors(t) {
  const errs = [];
  t.mock.method(console, 'error', (...a) => { errs.push(a.map(String).join(' ')); });
  t.mock.method(console, 'warn', (...a) => { errs.push(a.map(String).join(' ')); });
  return errs;
}

const stacksOf = (inv, id) => inv.items().filter((s) => s.id === id);

// ================================================================================================== testler
test('iki envanter arası aktarım: yığın bölünür, alıcıdaki yığına yığın sınırına kadar eklenir, artan boş yuvaya gider; yığın verisi ve eski tazelik korunur', () => {
  const A = new Inventory(10, 100), B = new Inventory(10, 100);
  A.add('nails', 80);
  B.add('nails', 60);
  const part = A.takeAt(A.firstSlotOf('nails'), 50); // bölerek ver
  assert.deepEqual([part.qty, A.count('nails')], [50, 30]);
  assert.equal(B.addStack(part), 0);
  assert.deepEqual(stacksOf(B, 'nails').map((s) => s.qty), [99, 11], '60 → 99 (yığın sınırı), 11 yeni yuvada');
  assert.equal(part.qty, 50, 'verilen yığın nesnesi alıcıda paylaşılmaz (kopya)');
  // bölme + taşıma: aynı envanterde yarıya böl, yarısını öbür envantere ver
  assert.ok(A.split(A.firstSlotOf('nails')));
  assert.deepEqual(stacksOf(A, 'nails').map((s) => s.qty), [15, 15]);
  const half = A.takeAt(A.slots.findIndex((s, i) => s && s.id === 'nails' && i !== A.firstSlotOf('nails')));
  B.addStack(half);
  assert.deepEqual([A.count('nails'), B.count('nails')], [15, 125]);
  assert.deepEqual(stacksOf(B, 'nails').map((s) => s.qty), [99, 26], 'önce mevcut yığın dolar');
  // yığınlanmayanlar: mermi, dayanıklılık, yakıt, not verisiyle; silah hızlı erişim çubuğuna
  A.add('pistol', 1, { ammo: 9, dur: 120 });
  A.add('jerrycan', 1, { fuel: 14 });
  A.add('note', 1, { noteId: 'camp_diary' });
  const w0 = B.weight();
  for (const id of ['pistol', 'jerrycan', 'note']) assert.equal(B.addStack(A.takeAt(A.firstSlotOf(id))), 0);
  assert.deepEqual(B.slots[B.firstSlotOf('pistol')], { id: 'pistol', qty: 1, ammo: 9, dur: 120 });
  assert.ok(B.firstSlotOf('pistol') < HOTBAR);
  assert.equal(B.slots[B.firstSlotOf('jerrycan')].fuel, 14);
  assert.equal(B.slots[B.firstSlotOf('note')].noteId, 'camp_diary');
  assert.ok(Math.abs(B.weight() - w0 - (1 + stackWeight({ id: 'jerrycan', qty: 1, fuel: 14 }))) < 1e-9, 'yakıt ağırlığa eklenir');
  assert.equal(A.count('pistol') + A.count('jerrycan') + A.count('note'), 0);
  // tazelik: eski ekmek taze yığına eklenince eski tazelik (küçük t0) geçerli; yuva taşıyarak birleştirmede de
  const E = new Inventory(10, 100), F = new Inventory(10, 100);
  E.add('bread', 2, { t0: 1000 });
  F.add('bread', 1, { t0: 5000 });
  F.addStack(E.takeAt(E.firstSlotOf('bread')));
  assert.deepEqual(stacksOf(F, 'bread').map((s) => [s.qty, s.t0]), [[3, 1000]]);
  F.slots[20] = { id: 'bread', qty: 1, t0: 300 };
  F.move(20, F.firstSlotOf('bread'));
  assert.deepEqual(stacksOf(F, 'bread').map((s) => [s.qty, s.t0]), [[4, 300]]);
});

test('ağırlık ve yuva sınırı: alıcı kaldıramadığını geri verir, veren artanı geri alır; hiçbir eşya kaybolmaz', () => {
  const giver = new Inventory(10, 100), recv = new Inventory(3, 10);
  giver.add('log', 5); // 3 kg/adet
  recv.add('axe', 1); // 1,6 kg → 8,4 kg boş → 2 kütük
  const st = giver.takeAt(giver.firstSlotOf('log'));
  assert.equal(recv.canAdd('log', st.qty), 2);
  const left = recv.addStack(st);
  assert.equal(left, 3);
  assert.equal(giver.addStack({ ...st, qty: left }), 0, 'artan verene döner');
  assert.deepEqual([giver.count('log'), recv.count('log')], [3, 2]);
  assert.ok(recv.weight() <= recv.maxWeight);
  // yuva sınırı: 3 yuvadan biri boş → iki bıçaktan biri sığar
  const knives = new Inventory(5, 100);
  knives.add('knife', 2);
  let back = 0;
  for (let i = 0; i < 2; i++) back += recv.addStack(knives.takeAt(knives.firstSlotOf('knife')));
  assert.equal(back, 1);
  assert.equal(recv.freeSlots(), 0);
  assert.equal(recv.count('knife'), 1);
  // ağırlıksız eşya (para) ağırlık sınırına takılmaz ama yığın ve yuva sınırına uyar
  const wallet = new Inventory(2, 0.01);
  assert.equal(wallet.add('money', 25000), 25000 - 9999 * 2);
  assert.deepEqual(stacksOf(wallet, 'money').map((s) => s.qty), [9999, 9999]);
});

test('eşya verme (give → grant): istemciden istemciye host üzerinden; yalnız alıcı alır ve bilgilenir; ağırlığı aşan kısım alıcının ayağına düşer', (t) => {
  const errs = watchErrors(t);
  const H = makeSession('p_h', 'Hakan', { host: true });
  const C1 = makeSession('p_1', 'Cem', { x: 10, z: 0 });
  const C2 = makeSession('p_2', 'Derya', { x: 20, z: 3 });
  link(H, C1, C2);
  // Journal'daki "…'a ver" düğmesi: takeAt + act('give')
  C1.inventory.add('nails', 30);
  const st = C1.inventory.takeAt(C1.inventory.firstSlotOf('nails'), 25);
  C1.act('give', { to: 'p_2', stack: st });
  assert.deepEqual([C1.inventory.count('nails'), C2.inventory.count('nails'), H.inventory.count('nails')], [5, 25, 0]);
  assert.deepEqual(C2.game.ui.toasts(), ['Cem sana Çivi verdi.']);
  assert.deepEqual(C2.game.ui.calls('itemToast').map((c) => [c[1], c[2]]), [['nails', 25]]);
  assert.deepEqual([C1.game.ui.toasts(), H.game.ui.toasts()], [[], []], 'bildirim yalnız alıcıya');
  // host'tan istemciye: tabanca mermisi ve dayanıklılığıyla
  H.inventory.add('pistol', 1, { ammo: 5, dur: 260 });
  H.act('give', { to: 'p_1', stack: H.inventory.takeAt(H.inventory.firstSlotOf('pistol')) });
  assert.deepEqual(C1.inventory.slots[C1.inventory.firstSlotOf('pistol')], { id: 'pistol', qty: 1, ammo: 5, dur: 260 });
  assert.equal(H.inventory.count('pistol'), 0);
  // alıcı ağır yüklü: 4 kütükten 2'si sığar, 2'si alıcının konumunda yere düşer (herkes görür)
  C2.inventory.maxWeight = C2.inventory.weight() + 7;
  C1.inventory.add('log', 4, null, true);
  C1.act('give', { to: 'p_2', stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('log')) });
  assert.equal(C2.inventory.count('log'), 2);
  assert.ok(C2.game.ui.toasts().includes('Envanter dolu! Eşya yere bırakıldı.'));
  for (const S of [H, C1, C2]) {
    const items = [...S.ground.items.values()];
    assert.equal(items.length, 1, `${S.localId} yerdeki eşyayı görür`);
    assert.deepEqual(items[0].stack, { id: 'log', qty: 2 });
    assert.deepEqual([items[0].x, items[0].z], [20, 3], 'alıcının ayağına');
  }
  assert.equal(C1.inventory.count('log'), 0);
  assert.deepEqual(errs, []);
});

test('yere bırakma / yerden alma: bırakılan yığın herkeste görünür; aynı eşyayı iki oyuncu isterse yalnız ilki alır (çift eşya yok)', (t) => {
  const errs = watchErrors(t);
  const H = makeSession('p_h', 'Hakan', { host: true });
  const C1 = makeSession('p_1', 'Cem', { x: 2, z: 2 });
  const C2 = makeSession('p_2', 'Derya', { x: 3, z: 2 });
  link(H, C1, C2);
  C1.inventory.add('bandage', 6);
  C1.dropSlot(C1.inventory.firstSlotOf('bandage'), 4); // X tuşu / sürükle-bırak: takeAt + ground_drop
  assert.equal(C1.inventory.count('bandage'), 2);
  const ids = [H, C1, C2].map((S) => [...S.ground.items.keys()]);
  assert.equal(ids[0].length, 1);
  assert.deepEqual(ids[1], ids[0]);
  assert.deepEqual(ids[2], ids[0]);
  const gid = ids[0][0];
  const it = H.ground.items.get(gid);
  assert.deepEqual(it.stack, { id: 'bandage', qty: 4 });
  assert.ok(Math.abs(it.y - 5.9) < 1e-9, 'bırakılan yerin 0,9 m üstünden düşer');
  assert.deepEqual(H.ground.serialize(), [{ id: gid, s: { id: 'bandage', qty: 4 }, p: [Math.round(it.x * 100) / 100, 5.9, Math.round(it.z * 100) / 100] }]);
  // iki oyuncu aynı anda alır: host ilk isteği uygular, ikincisinde eşya yok
  C2.act('ground_pickup', { id: gid });
  C1.act('ground_pickup', { id: gid });
  assert.deepEqual([C1.inventory.count('bandage'), C2.inventory.count('bandage')], [2, 4]);
  for (const S of [H, C1, C2]) assert.equal(S.ground.items.size, 0);
  // düşen çanta (ground_drop_many): her yığın ayrı yer eşyası
  H.act('ground_drop_many', { stacks: [{ id: 'plank', qty: 3 }, { id: 'axe', qty: 1, dur: 20 }], x: 5, y: 5, z: 5, label: 'Düşen Çanta' });
  for (const S of [H, C1, C2]) assert.deepEqual([...S.ground.items.values()].map((g) => g.stack.id).sort(), ['axe', 'plank']);
  assert.deepEqual(errs, []);
});

test('konteyner aktarımı (Loot): koyunca yığınlar birleşir, boş yuvaya taşar, sığmayan sessizce geri verilir; kısmi alma, tümünü alma; istemci host ile aynı içeriği görür', (t) => {
  const errs = watchErrors(t);
  const H = makeSession('p_h', 'Hakan', { host: true });
  const C1 = makeSession('p_1', 'Cem');
  link(H, C1);
  // 3 yuvalık küçük konteyner (storage: 3); depo panelinde yuvaya tıklamak o yuvanın tamamını koyar (takeAt)
  C1.inventory.add('canned_food', 40, null, true); // 12 + 12 + 12 + 4
  const idx = C1.inventory.slots.map((s, i) => (s && s.id === 'canned_food' ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(idx.map((i) => C1.inventory.slots[i].qty), [12, 12, 12, 4]);
  const put = (i) => C1.act('loot_put', { id: 'c_kucuk', stack: C1.inventory.takeAt(i) });
  put(idx[0]); put(idx[1]); put(idx[3]);
  assert.deepEqual(H.loot.get('c_kucuk').slots.map((s) => s && s.qty), [12, 12, 4], 'dolu yığına eklenmez, boş yuvaya gider');
  put(idx[2]); // 4 → 12 (+8), 4 sığmaz → koyana sessizce geri
  assert.deepEqual(H.loot.get('c_kucuk').slots.map((s) => s && s.qty), [12, 12, 12]);
  assert.equal(C1.inventory.count('canned_food'), 4);
  assert.equal(C1.game.ui.calls('itemToast').length, 0, 'geri verilen artan için bildirim yok (silent)');
  assert.deepEqual(C1.loot.get('c_kucuk').slots, H.loot.get('c_kucuk').slots, 'istemci aynı içeriği görür');
  // kısmi ve tam alma
  C1.act('loot_take', { id: 'c_kucuk', slot: 0, qty: 5 });
  assert.deepEqual(H.loot.get('c_kucuk').slots.map((s) => s && s.qty), [7, 12, 12]);
  C1.act('loot_take', { id: 'c_kucuk', slot: 1 });
  assert.deepEqual(H.loot.get('c_kucuk').slots.map((s) => s && s.qty), [7, null, 12]);
  assert.equal(C1.inventory.count('canned_food'), 4 + 5 + 12);
  C1.act('loot_take', { id: 'c_kucuk', slot: 1 }); // boş yuva: olay yok
  assert.equal(C1.inventory.count('canned_food'), 21);
  // farklı eşyalar + tümünü al (tek grant olayında birden çok yığın)
  H.act('loot_put', { id: 'c_dolap', stack: { id: 'axe', qty: 1, dur: 44 } });
  H.act('loot_put', { id: 'c_dolap', stack: { id: 'water_bottle', qty: 3 } });
  assert.equal(H.loot.get('c_dolap').slots.length, 12, 'aranmamış konteynere koyunca 12 yuvalık durum kurulur');
  C1.act('loot_take_all', { id: 'c_dolap' });
  assert.deepEqual([C1.inventory.slots[C1.inventory.firstSlotOf('axe')].dur, C1.inventory.count('water_bottle')], [44, 3]);
  assert.ok(H.loot.get('c_dolap').slots.every((s) => s === null));
  assert.deepEqual(C1.loot.get('c_dolap').slots, H.loot.get('c_dolap').slots);
  assert.deepEqual(errs, []);
});

test('ortak depo (sandık) ve araç bagajı aktarımı: birleştirme, kısmi alma, tümünü alma, dolu bagajda artanın iadesi; değişiklik herkese yayılır', (t) => {
  const errs = watchErrors(t);
  const H = makeSession('p_h', 'Hakan', { host: true });
  const C1 = makeSession('p_1', 'Cem');
  link(H, C1);
  // üste kurulmuş 20 yuvalık sandık (host'un build_place doğrulamasından sonra yayınladığı olay)
  H.emit({ k: 'struct_add', id: 'st_sandik', type: 'storage_crate', x: 0, y: 5, z: 0, rot: 0, built: 1, hp: 150 });
  const slotsH = () => H.build.structures.get('st_sandik').data.slots;
  const slotsC = () => C1.build.structures.get('st_sandik').data.slots;
  assert.equal(slotsC().length, 20);
  C1.inventory.add('nails', 60);
  C1.act('store_put', { id: 'st_sandik', stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('nails'), 45) });
  C1.act('store_put', { id: 'st_sandik', stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('nails'), 15) });
  H.act('store_put', { id: 'st_sandik', stack: { id: 'axe', qty: 1, dur: 80 } });
  assert.deepEqual(slotsH().filter(Boolean).map((s) => [s.id, s.qty]), [['nails', 60], ['axe', 1]]);
  assert.deepEqual(slotsC(), slotsH());
  C1.act('store_take', { id: 'st_sandik', slot: 0, qty: 20 });
  assert.deepEqual([slotsH()[0].qty, C1.inventory.count('nails')], [40, 20]);
  C1.act('store_take_all', { id: 'st_sandik' });
  assert.ok(slotsH().every((s) => s === null) && slotsC().every((s) => s === null));
  assert.deepEqual([C1.inventory.count('nails'), C1.inventory.slots[C1.inventory.firstSlotOf('axe')].dur], [60, 80]);
  // araç bagajı: Vehicle varlığı 3B model ister (Node'da kurulamaz) → bagaj alanlarıyla küçük araç kaydı; işleyiciler gerçek
  for (const S of [H, C1]) S.vehicles.list.push({ id: 'v_kamyonet', trunk: new Array(4).fill(null), trunkSize: 4, pos: new THREE.Vector3() });
  const trunk = (S) => S.vehicles.byId('v_kamyonet').trunk;
  C1.inventory.add('plank', 30, null, true); // 20 + 10
  C1.act('trunk_put', { id: 'v_kamyonet', stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('plank'), 15) }); // bölerek: 15
  C1.act('trunk_put', { id: 'v_kamyonet', stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('plank')) }); // kalan 5: 15 → 20
  C1.act('trunk_put', { id: 'v_kamyonet', stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('plank')) }); // 10: yeni yuva
  assert.equal(C1.inventory.count('plank'), 0);
  assert.deepEqual(trunk(H).map((s) => s && s.qty), [20, 10, null, null]);
  C1.inventory.add('knife', 3);
  for (let i = 0; i < 3; i++) C1.act('trunk_put', { id: 'v_kamyonet', stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('knife')) });
  assert.deepEqual(trunk(H).map((s) => s && s.id), ['plank', 'plank', 'knife', 'knife']);
  assert.equal(C1.inventory.count('knife'), 1, 'dolu bagaja sığmayan bıçak geri döner');
  assert.deepEqual(trunk(C1), trunk(H));
  C1.act('trunk_take', { id: 'v_kamyonet', slot: 0 });
  assert.deepEqual([trunk(H)[0], trunk(C1)[0], C1.inventory.count('plank')], [null, null, 20]);
  assert.deepEqual(errs, []);
});

test('tüccar takası: stok host\'ta düşer ve herkeste güncellenir; alıcı öder ve eşyayı alır; parası yetmeyen iade ister (bir kez); tükenen ürün reddedilir', (t) => {
  const errs = watchErrors(t);
  const H = makeSession('p_h', 'Hakan', { host: true });
  const C1 = makeSession('p_1', 'Cem');
  const C2 = makeSession('p_2', 'Derya');
  link(H, C1, C2);
  const day = H.time.day;
  const stock = (S) => S.npcs.tradeStock('hasan', day);
  assert.deepEqual(stock(C1), stock(H), 'tohum + gün → herkeste aynı başlangıç stoğu');
  assert.ok(stock(H).every((x) => ITEMS[x.id]), 'tanımsız eşyalar (ör. tea) stoktan elenir');
  const it = stock(H).find((x) => x.qty >= 2 && !ITEMS[x.id].spoil && x.id !== 'money');
  const q0 = it.qty;
  // alıcı 1: parası var
  C1.inventory.add('money', 100);
  C1.act('trade_buy', { npc: 'hasan', day, id: it.id, price: 7.4 });
  for (const S of [H, C1, C2]) assert.equal(stock(S).find((x) => x.id === it.id).qty, q0 - 1, `${S.localId} stok`);
  assert.deepEqual([C1.inventory.count('money'), C1.inventory.count(it.id)], [93, 1]);
  assert.deepEqual([C2.inventory.count(it.id), H.inventory.count(it.id)], [0, 0], 'eşya yalnız alıcıya');
  // alıcı 2: parası yok → "Yeterli paran yok" + iade isteği → stok geri gelir; tekrar iade isteği yok sayılır
  C2.act('trade_buy', { npc: 'hasan', day, id: it.id, price: 7 });
  assert.ok(C2.game.ui.toasts().includes('Yeterli paran yok.'));
  assert.equal(C2.inventory.count(it.id), 0);
  for (const S of [H, C1, C2]) assert.equal(stock(S).find((x) => x.id === it.id).qty, q0 - 1, 'iade sonrası stok');
  C2.act('trade_refund', { npc: 'hasan', day, id: it.id });
  assert.equal(stock(H).find((x) => x.id === it.id).qty, q0 - 1, 'kayıtlı satış olmadan ikinci iade yok');
  // stok tükenir → sonraki satın alma reddedilir, para kesilmez
  C1.inventory.add('money', 1000);
  for (let i = 0; i < q0 - 1; i++) C1.act('trade_buy', { npc: 'hasan', day, id: it.id, price: 1 });
  assert.equal(stock(C1).find((x) => x.id === it.id).qty, 0);
  const money = C1.inventory.count('money');
  C1.act('trade_buy', { npc: 'hasan', day, id: it.id, price: 1 });
  assert.ok(C1.game.ui.toasts().includes('Bu ürün stokta kalmadı.'));
  assert.deepEqual([C1.inventory.count('money'), C1.inventory.count(it.id)], [money, q0]);
  assert.deepEqual(errs, []);
});

test('depoya konan eski yiyecek, depodaki taze yığınla birleşince eski tazeliği taşımalı (envanterdeki gibi)', (t) => {
  const errs = watchErrors(t);
  const H = makeSession('p_h', 'Hakan', { host: true });
  H.act('loot_put', { id: 'c_dolap', stack: { id: 'bread', qty: 1, t0: 5000 } });
  H.act('loot_put', { id: 'c_dolap', stack: { id: 'bread', qty: 2, t0: 0 } });
  assert.deepEqual(H.loot.get('c_dolap').slots.filter(Boolean).map((s) => [s.qty, s.t0]), [[3, 0]]);
  H.emit({ k: 'struct_add', id: 'st1', type: 'storage_crate', x: 0, y: 5, z: 0, rot: 0, built: 1, hp: 150 });
  H.act('store_put', { id: 'st1', stack: { id: 'apple', qty: 1, t0: 9000 } });
  H.act('store_put', { id: 'st1', stack: { id: 'apple', qty: 1, t0: 100 } });
  assert.deepEqual(H.build.structures.get('st1').data.slots.filter(Boolean).map((s) => [s.qty, s.t0]), [[2, 100]]);
  assert.deepEqual(errs, []);
});

test('yağmalama olayı (3./12./20. gün) aranmamış hikâye konteynerlerini (özel içerik) boşaltmamalı', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const handlers = {}, appliers = {};
    const S = {
      isHost: true, seed, localId: 'p1', flags: {}, results: { searched: 0 }, diff: { loot: 1 }, time: new TimeSystem({ startDay: 1 }),
      world: { containers: [{ id: 'c_lab', type: 'lab_bench', x: 0, z: 0, special: 'lab_sample', building: 'lab' }], regionAt: () => ({ danger: 3 }), buildingById: {} },
      ui: { openStorage() {}, refreshStorage() {} }, quests: { onSearch() {} },
      on(k, fn) { handlers[k] = fn; }, onEvt(k, fn) { (appliers[k] = appliers[k] || []).push(fn); },
      emit(e) { for (const fn of appliers[e.k] || []) fn(e); },
    };
    const L = new Loot(S);
    L.init();
    for (const d of [3, 12, 20]) L.onDay(d);
    handlers.search_done({ id: 'c_lab' }, 'p1');
    assert.ok(L.get('c_lab').slots.some((s) => s && s.id === 'lab_sample'), `tohum ${seed}: virüs numunesi yerinde olmalı`);
  }
});

test('eşya verilen oyuncu bu arada oyundan çıktıysa (ya da yoksa) eşya verene geri döner; geçersiz istek yok sayılır', (t) => {
  const errs = watchErrors(t);
  const H = makeSession('p_h', 'Hakan', { host: true });
  const C1 = makeSession('p_1', 'Cem', { x: 10, z: 0 });
  link(H, C1);
  C1.inventory.add('nails', 30);
  C1.act('give', { to: 'p_gitti', stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('nails'), 20) });
  assert.equal(C1.inventory.count('nails'), 30, 'çıkmış oyuncuya verilen eşya kaybolmaz');
  assert.ok(C1.game.ui.toasts().includes('Alıcı artık oyunda değil; eşya sende kaldı.'));
  C1.act('give', { to: 'bot_yok', stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('nails'), 5) });
  assert.equal(C1.inventory.count('nails'), 30, 'olmayan bota verilen eşya da geri döner');
  // bozuk istek (bilinmeyen eşya, miktarsız) host'ta yok sayılır, hata yok
  C1.act('give', { to: 'p_h', stack: { id: 'yok_boyle_esya', qty: 1 } });
  C1.act('give', { to: 'p_h', stack: { id: 'nails', qty: -3 } });
  assert.equal(H.inventory.count('nails'), 0);
  assert.deepEqual(errs, []);
});

test('alma miktarı doğrulanır: negatif/kesirli/aşırı istek konteyner, sandık ya da envanterde eşya çoğaltmaz', (t) => {
  const errs = watchErrors(t);
  const H = makeSession('p_h', 'Hakan', { host: true });
  const C1 = makeSession('p_1', 'Cem', { x: 10, z: 0 });
  link(H, C1);
  H.act('loot_put', { id: 'c_dolap', stack: { id: 'nails', qty: 10 } });
  C1.act('loot_take', { id: 'c_dolap', slot: 0, qty: -5 });
  assert.equal(H.loot.get('c_dolap').slots[0], null, 'negatif istek: yığın çoğalmaz (tamamı alınır)');
  assert.equal(C1.inventory.count('nails'), 10);
  H.act('loot_put', { id: 'c_dolap', stack: { id: 'nails', qty: 10 } });
  C1.act('loot_take', { id: 'c_dolap', slot: 0, qty: 2.7 });
  C1.act('loot_take', { id: 'c_dolap', slot: 0, qty: 99 });
  assert.equal(C1.inventory.count('nails'), 20, 'kesirli istek tam sayıya, aşırı istek yığına kırpılır');
  assert.equal(H.loot.get('c_dolap').slots[0], null);
  H.emit({ k: 'struct_add', id: 'st1', type: 'storage_crate', x: 0, y: 5, z: 0, rot: 0, built: 1, hp: 150 });
  H.act('store_put', { id: 'st1', stack: { id: 'nails', qty: 6 } });
  C1.act('store_take', { id: 'st1', slot: 0, qty: -100 });
  assert.equal(C1.inventory.count('nails'), 26);
  assert.equal(H.build.structures.get('st1').data.slots[0], null);
  // bilinmeyen eşya ve sıfır/negatif miktar konteynere konmaz
  H.act('loot_put', { id: 'c_dolap', stack: { id: 'yok_boyle_esya', qty: 1 } });
  H.act('loot_put', { id: 'c_dolap', stack: { id: 'nails', qty: -4 } });
  assert.deepEqual(H.loot.get('c_dolap').slots.filter(Boolean), []);
  assert.deepEqual(errs, []);
});

test('yağmalama olayı kasaları ve kilitli konteynerleri boşaltmaz; olay sıradan konteynerlerde sürer (40 tohum)', () => {
  let looted = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const handlers = {}, appliers = {};
    const S = {
      isHost: true, seed, localId: 'p1', flags: {}, results: { searched: 0 }, diff: { loot: 1 }, time: new TimeSystem({ startDay: 1 }),
      world: {
        containers: [
          { id: 'c_kasa', type: 'safe', x: 0, z: 0, building: 'bank' },
          { id: 'c_kilit', type: 'crate', x: 1, z: 0, locked: 1, building: 'shop' },
          ...Array.from({ length: 12 }, (_, i) => ({ id: 'c_' + i, type: 'crate', x: 2 + i, z: 0, building: 'shop' })),
        ],
        regionAt: () => ({ danger: 1 }), buildingById: {},
      },
      ui: { openStorage() {}, refreshStorage() {} }, quests: { onSearch() {} },
      on(k, fn) { handlers[k] = fn; }, onEvt(k, fn) { (appliers[k] = appliers[k] || []).push(fn); },
      emit(e) { for (const fn of appliers[e.k] || []) fn(e); },
    };
    const L = new Loot(S);
    L.init();
    for (const d of [3, 12, 20]) L.onDay(d);
    assert.equal(L.get('c_kasa').locked, 2, `tohum ${seed}: kasa kilitli kalır`);
    assert.ok(!L.get('c_kasa').looted && !L.get('c_kilit').looted, `tohum ${seed}: kasa/kilitli konteyner yağmalanmaz`);
    looted += Array.from({ length: 12 }, (_, i) => L.get('c_' + i)).filter((s) => s && s.looted).length;
  }
  assert.ok(looted > 20, `yağmalama olayı sıradan konteynerlerde hâlâ çalışır (${looted}/480)`);
});

test('yağmalanan belge tutucuda binanın hikâye belgesi kalır (karakol masası: güvenlik kamerası kaydı, 60 tohum)', () => {
  let lootedN = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const handlers = {}, appliers = {};
    const S = {
      isHost: true, seed, localId: 'p1', flags: {}, results: { searched: 0 }, diff: { loot: 1 }, time: new TimeSystem({ startDay: 1 }),
      world: { containers: [{ id: 'c_masa', type: 'desk', x: 0, z: 0, building: 'police' }], regionAt: () => ({ danger: 2 }), buildingById: {} },
      ui: { openStorage() {}, refreshStorage() {} }, quests: { onSearch() {} },
      on(k, fn) { handlers[k] = fn; }, onEvt(k, fn) { (appliers[k] = appliers[k] || []).push(fn); },
      emit(e) { for (const fn of appliers[e.k] || []) fn(e); },
    };
    const L = new Loot(S);
    L.init();
    for (const d of [3, 12, 20]) L.onDay(d);
    if (L.get('c_masa') && L.get('c_masa').looted) lootedN++;
    handlers.search_done({ id: 'c_masa' }, 'p1');
    assert.ok(L.get('c_masa').slots.some((s) => s && s.id === 'note' && s.noteId === 'cctv'), `tohum ${seed}: belge masada`);
  }
  assert.ok(lootedN > 0, `en az bir tohumda masa yağmalandı (${lootedN}/60): yağmalanmış yolu da sınandı`);
});

test('kilitli başlayan kasa/dolap açılınca içeriği üretilir (eskiden hep boştu); kayıtta açılmamış kasa yüklemeden sonra da üretilir; eski yağmanın boşalttığı hikâye konteyneri onarılır', () => {
  let dolu = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const handlers = {}, appliers = {};
    const S = {
      isHost: true, seed, localId: 'p1', flags: {}, results: { searched: 0 }, diff: { loot: 1 }, time: new TimeSystem({ startDay: 1 }),
      world: {
        containers: [{ id: 'c_kasa', type: 'safe', x: 0, z: 0, building: 'bank' }, { id: 'c_dolap', type: 'locker', x: 2, z: 0, locked: 1, building: 'prison_admin' },
          { id: 'c_lab', type: 'lab_bench', x: 4, z: 0, special: 'lab_sample', building: 'lab' }, { id: 'c_masa', type: 'desk', x: 6, z: 0, building: 'police' }],
        regionAt: () => ({ danger: 3 }), buildingById: {},
      },
      ui: { openStorage() {}, refreshStorage() {} }, quests: { onSearch() {} },
      on(k, fn) { handlers[k] = fn; }, onEvt(k, fn) { (appliers[k] = appliers[k] || []).push(fn); },
      emit(e) { for (const fn of appliers[e.k] || []) fn(e); },
    };
    const L = new Loot(S);
    L.init();
    assert.equal(L.get('c_kasa').locked, 2);
    handlers.unlock({ id: 'c_kasa' }, 'p1');
    handlers.search_done({ id: 'c_kasa' }, 'p1');
    if (L.get('c_kasa').slots.some(Boolean)) dolu++;
    assert.equal(L.get('c_kasa').locked, 0);
    // kayıt: kilitli dolap açılmadan kaydedildi; eski sürümün yağması hikâye konteynerini ve karakol masasını boşaltmıştı
    const save = L.serialize();
    save.c_lab = { s: 0, l: 0, i: new Array(12).fill(0) };
    save.c_masa = { s: 0, l: 0, i: new Array(12).fill(0) };
    const S2 = { ...S, flags: {} }, h2 = {};
    S2.on = (k, fn) => { h2[k] = fn; };
    const L2 = new Loot(S2);
    L2.load(JSON.parse(JSON.stringify(save)));
    assert.ok(L2.get('c_dolap') && L2.get('c_dolap').pending, 'açılmamış kilitli dolap yüklemeden sonra da üretilecek');
    h2.unlock({ id: 'c_dolap' }, 'p1');
    assert.equal(L2.get('c_dolap').pending, undefined);
    assert.equal(L2.get('c_lab'), undefined, 'eski yağmanın boşalttığı hikâye konteyneri hiç kurulmamış sayılır');
    h2.search_done({ id: 'c_lab' }, 'p1');
    assert.ok(L2.get('c_lab').slots.some((x) => x && x.id === 'lab_sample'), 'virüs numunesi geri geldi');
    assert.ok(L2.get('c_masa').slots.some((x) => x && x.id === 'note' && x.noteId === 'cctv'), 'silinen karakol belgesi geri kondu');
  }
  assert.ok(dolu >= 15, `açılan kasaların çoğu dolu (${dolu}/30); eskiden hepsi boştu`);
});
