// Yerel oyuncu birim testleri: gerçek Player (Avatar varlıksız kurulur: modelsiz, klipsiz → eylemler prosedürel yoldan
// avatar.action'a yazılır) gerçek Rapier karakter gövdesiyle düz sahte arazide; Session yöntemleri sahte oturumla.
// Yere serilme kuralları tek yoldan (Session.hitLocal: 'dmg_player' olayı ve hayvanın host'taki kendi oyuncusuna vuruşu),
// kalkış sonrası bağışıklık (hücum zinciri), süreli kilitlerin moddan bağımsız azalması (araç, sırtta taşınma, uyku),
// yere serilmişken kapalı girişler (bırakma, ifade, üretim, eşya kullanma, basılı tutma) ve süren işlerin iptali (balık,
// havadaki vuruş, uzanma), engel atlama/tırmanma çıkışı (kilit inişte kalkar, hız atlayış yolu boyunca).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld.js';
import { CollisionWorld } from '../../src/world/Physics.js';
import { Player } from '../../src/entities/Player.js';
import { PlayerStats } from '../../src/systems/PlayerStats.js';
import { Inventory } from '../../src/systems/Inventory.js';
import { Interact } from '../../src/systems/Interact.js';
import { Crafting } from '../../src/systems/Crafting.js';
import { NPCs, ANIMALS } from '../../src/systems/NPCs.js';
import { Session } from '../../src/Session.js';

await PhysicsWorld.load();
const DT = 1 / 60;

function fakeTerrain(N = 32, cell = 4) {
  const V = N + 1, half = (N * cell) / 2;
  return { N, cell, half, h: new Float32Array(V * V), heightAt: () => 0, waterLevelAt: () => -100, isWater: () => false };
}

/**
 * Sahte oturum (Session.prototype: hitLocal, damageLocal, dropSlot, useItem, handleHotkeys, canEmote gerçek) + gerçek
 * Player + gerçek Interact. build(P): Rapier köprüsünden önce eklenecek oyun çarpıştırıcıları.
 */
function setup(build) {
  const terrain = fakeTerrain(), physics = new CollisionWorld(terrain);
  if (build) build(physics);
  const pw = new PhysicsWorld({ terrain, physics });
  const game = {
    phys: pw, gfx: { camera: new THREE.PerspectiveCamera() },
    charFactory: { create: () => ({ root: new THREE.Group(), model: new THREE.Group(), rig: null, anim: null, clips: {} }) },
  };
  const log = [];
  const S = Object.create(Session.prototype);
  Object.assign(S, {
    game, world: { terrain, physics, doors: [], windows: [], containers: [] }, isHost: true, localId: 'p1', t: 0, handlers: {}, appliers: {},
    diff: { dmg: 1 }, results: { deaths: 0, crafted: 0 }, localProfile: { name: 'Deneme', stats: {} }, overweight: 0, props: null, combat: null, npcs: null,
    time: { total: 0, minuteOfDay: 23 * 60 }, zombies: { threatLevel: 0 }, net: { active: false }, timeline: { onDowned() {} },
    audio: { play() {} }, hotbarIndex: 5,
    ui: {
      toast: (...a) => log.push(['toast', ...a]), cancelProgress: () => log.push(['cancelProgress']), progress: (...a) => log.push(['progress', a[0]]),
      damageFlash() {}, showDowned() {}, showSleep: () => log.push(['showSleep']), setPrompt() {}, openEmotes: () => log.push(['openEmotes']), itemToast() {},
    },
    quests: { readNote: (id) => log.push(['readNote', id]), onCraft() {} }, events: { useRadio: () => log.push(['useRadio']) },
    act: (type, p) => log.push(['act', type, p]),
  });
  S.localStats = new PlayerStats({ health: 100 });
  S.inventory = new Inventory(30, 100);
  S.local = new Player(S, { id: 'p1', name: 'Deneme', look: {}, stats: { speed: 1, stealth: 1 } });
  S.local.updateCamera = () => {};
  S.local.spawnAt(0, 0.02, 0, 0);
  S.interact = new Interact(S);
  S.interact.findTarget = () => null;
  return { S, pl: S.local, pw, log };
}

function makeInput() {
  const held = new Set(), pressed = new Set();
  return { held, pressed, locked: false, mouse: { dx: 0, dy: 0, wheel: 0 }, isDown: (k) => held.has(k), wasPressed: (k) => pressed.has(k), keyDown: () => false, keyPressed: () => false, label: () => 'E' };
}

/** Bir oyun karesi, Session.update sırasıyla: süreli kilitler (her modda) → atlayış | araç | girdi → fizik → fizik sonrası */
function frame(pl, pw, input, dt = DT) {
  pl.tickTimers(dt);
  const car = pl.mode === 'drive' || pl.mode === 'seat';
  if (pl.vault) pl.stepVault(dt);
  else if (!car) pl.update(dt, input, false);
  pw.update(dt);
  if (!car) pl.postPhysics(dt);
  input.pressed.clear();
}
const steps = (n, pl, pw, input, each) => { for (let i = 0; i < n; i++) { frame(pl, pw, input); if (each) each(i); } };
const free = (pl, S) => !(pl.knockT > 0) && !(pl.lockMove > 0) && !S.localStats.downed;

test('darbe tek yoldan (Session.hitLocal): itme her zaman serer ve iter; ağır darbe %35; yaralı yerdeyken ve araçtayken serilme/itme yok; yakalanma; "dmg_player" olayı aynı yolu çalıştırır', (t) => {
  let { S, pl } = setup();
  S.hitLocal({ amount: 22, kind: 'heavy', from: 'a1', push: [0, -7, 3] });
  assert.equal(Math.round(S.localStats.health), 78);
  assert.ok(Math.abs(pl.knockT - 1.95) < 1e-9 && pl.avatar.action.type === 'knock' && pl.avatar.lastAct[1] === 'knock', 'itme yere serer');
  assert.ok(Math.abs(pl.vel.z + 7) < 1e-9 && pl.vel.y === 3, 'itme hızı eklenir');
  // ağır darbe (itme yok): %35 olasılık
  ({ S, pl } = setup());
  t.mock.method(Math, 'random', () => 0.2);
  S.hitLocal({ amount: 30, kind: 'heavy', from: 'b' });
  assert.ok(pl.knockT > 0, 'ağır darbe zarı tuttu');
  ({ S, pl } = setup());
  Math.random.mock.mockImplementation(() => 0.5);
  S.hitLocal({ amount: 30, kind: 'heavy', from: 'b' });
  assert.equal(pl.knockT, 0, 'zar tutmadı');
  t.mock.restoreAll();
  // araçta: hasar var, serilme/itme yok
  ({ S, pl } = setup());
  pl.mode = 'drive';
  S.hitLocal({ amount: 10, kind: 'heavy', from: 'a1', push: [7, 0, 3] });
  assert.ok(S.localStats.health < 100 && pl.knockT === 0 && pl.vel.x === 0, 'araçta');
  // yakalanma
  ({ S, pl } = setup());
  S.hitLocal({ amount: 5, kind: 'zombie', from: 'z1', grab: 1 });
  assert.ok(pl.grabT === 1.1 && pl.knockT === 0);
  // istemcideki (ve zombinin host'a) 'dmg_player' olayı da aynı yöntemden geçer
  ({ S, pl } = setup());
  S.registerCore();
  const seen = [];
  const orig = S.hitLocal;
  S.hitLocal = function (e) { seen.push(e); return orig.call(this, e); };
  S.applyEvent({ k: 'dmg_player', to: 'p1', amount: 22, kind: 'heavy', from: 'a1', push: [7, 0, 3] });
  S.applyEvent({ k: 'dmg_player', to: 'p2', amount: 22, kind: 'heavy', from: 'a1', push: [7, 0, 3] });
  assert.equal(seen.length, 1, 'yalnız kendine gelen olay');
  assert.ok(pl.knockT > 0 && pl.vel.x === 7);
});

test('hayvan saldırısı: host\'un (tek oyunculunun) kendi oyuncusu da S.hitLocal yolundan; uzak oyuncuya aynı alanlarla "dmg_player" olayı (hücum eden geyik iter ve serer, ayı itmez)', () => {
  const run = (type, local) => {
    const calls = { hit: [], emit: [], later: [], dmg: [] };
    const near = { x: 0, y: 0, z: 0 }, far = { x: 100, y: 0, z: 100 };
    const S = {
      isHost: true, localId: 'p1', t: 10,
      players: new Map([['p1', { id: 'p1', isLocal: true }], ['p2', { id: 'p2', pos: local ? far : near, anim: null }]]),
      local: { pos: new THREE.Vector3().copy(local ? near : far), vel: new THREE.Vector3(), mode: 'ground' },
      world: { terrain: { heightAt: () => 0, isWater: () => false }, physics: { resolveCircle: (x, z) => ({ x, z }) } },
      emit: (e) => calls.emit.push(e), later: (dt, fn) => calls.later.push(fn), hitLocal: (e) => calls.hit.push(e), damageLocal: (...a) => calls.dmg.push(a),
    };
    const N = Object.create(NPCs.prototype);
    N.s = S; N._spawnT = 1e9;
    const o = () => new THREE.Object3D();
    // hayvan kurbana 1,5 m'de, ona dönük (−z), saldırıda
    N.animals = [{ id: 'a1', type, def: ANIMALS[type], x: 0, y: 0, z: 1.5, yaw: Math.PI, state: 'attack', target: local ? 'p1' : 'p2', atkCd: 0, t: 0, dead: false, phase: 0, root: o(), view: null, legs: [o(), o(), o(), o()], head: o() }];
    N.updateAnimals(DT);
    assert.equal(calls.later.length, 1, `${type}: saldırı zamanlandı`);
    calls.later[0]();
    return calls;
  };
  for (const type of ['stag', 'bear']) {
    const L = run(type, true), R = run(type, false);
    assert.equal(L.hit.length, 1, `${type}: host'un kendi oyuncusu S.hitLocal'dan geçmeli`);
    assert.equal(L.dmg.length, 0, `${type}: ayrı (kuralsız) hasar yolu yok`);
    const ev = R.emit.find((e) => e.k === 'dmg_player');
    assert.ok(ev && ev.to === 'p2' && R.hit.length === 0, `${type}: uzak oyuncuya olay`);
    const { k: _k, to: _to, ...fields } = ev;
    assert.deepEqual(L.hit[0], fields, `${type}: iki yol aynı alanlar`);
    assert.equal(L.hit[0].kind, 'heavy');
    if (type === 'stag') assert.deepEqual(L.hit[0].push, [0, -7, 3], 'hücum itmesi kurbana doğru');
    else assert.equal(L.hit[0].push, undefined, 'ayı itmez');
  }
});

test('hücum zinciri: kalkıştan sonra 3,5 sn yeniden serilmez; 2,2 sn arayla vuran geyik oyuncuyu yerde zincirleyemez, aralarda gerçek denetim penceresi kalır', () => {
  const { S, pl, pw } = setup();
  const input = makeInput();
  input.held.add('forward'); // oyuncu baştan sona kaçmaya çalışıyor
  // doğrudan: 1,95 sn serilme, sonra bağışıklık; süre dolunca yeniden serilebilir
  assert.equal(pl.knockdown(), true);
  steps(132, pl, pw, input); // 2,2 sn
  assert.ok(free(pl, S), 'kalktı');
  assert.equal(pl.knockdown(), false, 'bağışıklıkta serilmez');
  steps(200, pl, pw, input); // toplam 5,53 sn > 1,95 + 3,5
  assert.equal(pl.knockdown(), true, 'bağışıklık bitti');
  // hücum eden geyik (NPCs: atkCd 2,2 sn, hasar 22, itme 7 m/sn, rüzgârlanmadan 0,3 sn sonra) 9 sn boyunca
  const G = setup();
  const inp = makeInput();
  inp.held.add('forward');
  let t = 0, next = 0.3, knocks = 0, ctl = false, from = 0;
  const windows = [];
  for (let i = 0; i < 9 * 60; i++) {
    if (t >= next && !G.S.localStats.downed) {
      next += 2.2;
      const k0 = G.pl.knockT;
      G.S.hitLocal({ amount: 22, kind: 'heavy', from: 'a1', push: [Math.sin(G.pl.yaw) * 7, Math.cos(G.pl.yaw) * 7, 3] });
      if (G.pl.knockT > k0) knocks++;
    }
    frame(G.pl, G.pw, inp);
    t += DT;
    const c = free(G.pl, G.S);
    if (c && !ctl) { ctl = true; from = t; }
    if (!c && ctl) { ctl = false; windows.push(t - from); }
  }
  // pencereler: ilk vuruştan önceki 0,3 sn, sonra iki serilme arası (eskiden her hücum serdiği için ≈ 0,25 sn)
  assert.equal(knocks, 2, `9 sn'de iki serilme (0,3 ve 6,9 sn): ${knocks}`);
  assert.ok(windows.length >= 2 && windows[1] > 4.4, `serilmeler arası denetim penceresi > 4,4 sn: ${windows.map((w) => w.toFixed(2))}`);
});

test('süreli kilitler moddan bağımsız: serilip araca binen (geç gelen koltuk), sırtta taşınan ya da uyuyan oyuncunun kilidi o modda da işler, inince hemen hareket eder', () => {
  for (const mode of ['drive', 'seat', 'carried', 'sleep']) {
    const { S, pl, pw } = setup();
    const input = makeInput();
    assert.equal(pl.knockdown(), true, mode);
    steps(6, pl, pw, input); // 0,1 sn sonra (host'tan koltuk / taşıyıcı / uyku)
    pl.mode = mode;
    steps(180, pl, pw, input); // 3 sn bu modda
    assert.equal(pl.knockT, 0, `${mode}: serilme süresi işledi`);
    assert.equal(pl.lockMove, 0, `${mode}: hareket kilidi işledi`);
    pl.mode = 'ground';
    pl.spawnAt(pl.pos.x + 2, 0.02, pl.pos.z, 0); // araçtan in / bırakıldı / uyandı
    const z0 = pl.pos.z;
    input.held.add('forward');
    steps(18, pl, pw, input); // 0,3 sn
    assert.ok(free(pl, S) && Math.abs(pl.pos.z - z0) > 0.3, `${mode}: inince kilitsiz yürür (${(pl.pos.z - z0).toFixed(2)} m)`);
  }
});

test('yere serilmişken kapalı girişler (bırakma, ifade kısayolu, üretim, eşya kullanma, basılı tutma) ve iptal edilen süren işler (balık, havadaki vuruş, uzanma); kalkınca açılır', () => {
  const { S, pl, pw, log } = setup();
  const input = makeInput();
  S.inventory.add('canned_food', 2); S.inventory.add('note', 1); S.inventory.add('radio', 1); S.inventory.add('sleeping_bag', 1);
  S.inventory.add('cloth', 4); S.inventory.add('fishing_rod', 1); S.inventory.add('bait', 1);
  const slot = (id) => S.inventory.firstSlotOf(id);
  // süren işler: balık (olta atılmış), havadaki vuruş, yerden alma uzanması
  const N = Object.create(NPCs.prototype);
  N.s = S; N.fishing = null;
  S.npcs = N;
  S.game.input = { wasPressed: (k) => input.pressed.has(k) };
  N.startFishing({ water: 'lake' });
  assert.equal(pl.avatar.action.type, 'fish');
  S.combat = { swing: { t: 0.1, dur: 0.55, hitDone: false } };
  let picked = 0;
  S.interact.later(0.42, () => picked++);
  assert.equal(pl.knockdown(), true);
  assert.ok(N.fishing === null && S.combat.swing === null && S.interact.pending.length === 0, 'balık, vuruş ve uzanma iptal');
  const knockAct = pl.avatar.action;
  assert.equal(knockAct.type, 'knock');
  // vurgun gelse de E ile balık gelmez
  N.updateFishing(9); input.pressed.add('interact'); N.updateFishing(0.05); input.pressed.clear();
  S.interact.update(0.5, input, false);
  assert.equal(picked, 0, 'yerden alma gerçekleşmez');
  assert.equal(S.inventory.count('raw_fish'), 0, 'balık gelmez');
  const inv0 = JSON.stringify(S.inventory.serialize());
  // bırakma (X ya da envanterdeki "Bırak"), ifade kısayolu (G) ve çarkı
  S.dropSlot(slot('canned_food'), 1);
  input.pressed.add('emote'); input.pressed.add('drop');
  S.hotbarIndex = slot('canned_food');
  S.handleHotkeys(input, false);
  input.pressed.clear();
  assert.equal(S.canEmote(), false);
  // üretim (K paneli), eşya kullanma (yemek, not, telsiz, uyku tulumu), basılı tutma (yerleştirme sonrası otomatik inşa)
  const C = new Crafting(S);
  C.check = () => ({ ok: true });
  S.giveLocal = () => {};
  assert.equal(C.craft('bandage'), false, 'üretim başlamaz');
  for (const id of ['canned_food', 'note', 'radio', 'sleeping_bag']) S.useItem(slot(id));
  S.interact.startHold('İnşa ediliyor…', 2, () => {}, 'hammer');
  assert.equal(S.interact.hold, null, 'basılı tutma başlamaz');
  assert.equal(pl.avatar.action, knockAct, 'yere serilme eylemi sürer');
  assert.equal(pl.avatar.lastAct[1], 'knock', 'yansıtılan eylem değişmez');
  assert.equal(pl.mode, 'ground', 'uyku tulumu uyutmaz');
  assert.equal(JSON.stringify(S.inventory.serialize()), inv0, 'envanter değişmez');
  assert.deepEqual(log.filter((l) => ['openEmotes', 'readNote', 'useRadio', 'showSleep', 'progress'].includes(l[0]) || (l[0] === 'act' && l[1] === 'ground_drop')), [], 'hiçbir giriş çalışmaz');
  // kalkınca açılır
  steps(120, pl, pw, input);
  assert.ok(free(pl, S) && S.canEmote());
  S.hotbarIndex = 5;
  S.dropSlot(slot('canned_food'), 1);
  assert.ok(log.some((l) => l[0] === 'act' && l[1] === 'ground_drop') && pl.avatar.action.type === 'pickup', 'kalkınca bırakılır');
  // yaralı yerdeyken ifade yok
  S.localStats.downed = true;
  assert.equal(S.canEmote(), false);
});

test('engel atlama ve tırmanma: girdi kilidi inişte kalkar (duran atlayış, tırmanma); koşarak atlayışın çıkış hızı atlayış yolu boyunca (atlayışta vurunca yönelim kameraya dönse de)', () => {
  const obstacle = (h, behind) => (P) => {
    P.addBox(-1.5, 0.6, 1.5, 1.0, -0.5, h, { kind: 'prop', walkable: true }); // ön yüz z = 0,6
    if (behind) P.addBox(-1.5, 1.0, 1.5, 3.0, -0.5, h, { kind: 'prop', walkable: true }); // arkası dolu: üstüne çık
  };
  for (const [name, h, behind, climb] of [['duran atlayış 0,8 m', 0.8, false, false], ['1 m bloğa tırmanma', 1.0, true, true]]) {
    const { pl, pw } = setup(obstacle(h, behind));
    const input = makeInput();
    steps(20, pl, pw, input);
    input.pressed.add('jump');
    frame(pl, pw, input);
    assert.ok(pl.vault && !!pl.vault.climb === climb, `${name}: başladı`);
    input.held.add('forward');
    let landed = null;
    for (let i = 0; i < 120 && landed === null; i++) { const was = !!pl.vault; frame(pl, pw, input); if (was && !pl.vault) landed = { lock: pl.lockMove, z: pl.pos.z }; }
    assert.ok(landed && landed.lock === 0, `${name}: inişte kilit kalkar (${landed && landed.lock})`);
    steps(6, pl, pw, input); // 0,1 sn
    assert.ok(pl.pos.z - landed.z > 0.05, `${name}: inişten hemen sonra W ile ilerler (${(pl.pos.z - landed.z).toFixed(3)} m)`);
  }
  // koşarak atlayış (+z), atlayışın ortasında saldırı: yönelim yana (Combat.melee: yaw = kamera)
  const { S, pl, pw } = setup((P) => P.addBox(-1.5, 6.0, 1.5, 6.4, -0.5, 0.8, { kind: 'prop', walkable: true }));
  const input = makeInput();
  pl.camYaw = Math.PI;
  steps(20, pl, pw, input);
  S.localStats.stamina = 100;
  input.held.add('forward'); input.held.add('sprint');
  let jumped = false, swung = false, out = null;
  for (let i = 0; i < 400 && !out; i++) {
    if (!jumped && 6.0 - pl.pos.z < 0.95 && 6.0 - pl.pos.z > 0.5) { input.pressed.add('jump'); jumped = true; }
    if (pl.vault && !swung && pl.vault.t > 0.4) { pl.yaw = Math.PI / 2; swung = true; }
    const was = !!pl.vault;
    frame(pl, pw, input);
    if (was && !pl.vault) out = { vx: pl.vel.x, vz: pl.vel.z, lock: pl.lockMove };
  }
  assert.ok(swung && out, 'koşarak atlayış oldu');
  assert.ok(out.vz > 3 && Math.abs(out.vx) < 0.05 && out.lock === 0, `çıkış hızı atlayış yolu boyunca: (${out.vx.toFixed(2)}, ${out.vz.toFixed(2)})`);
});
