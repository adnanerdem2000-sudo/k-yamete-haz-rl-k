// Kayıt/yükleme birim testleri: gerçek kayıt kodunun gidiş-dönüşü — Session.serialize/load/localData/restoreLocal/
// serializeDoors/loadDoors, SaveSystem (localStorage yuvaları, dizin, dışa/içe aktarma, kaydetme kuralları) ve alt
// sistemlerin kendi serialize/load işlevleri (Inventory, PlayerStats, TimeSystem, Quests, MapSystem, Loot, GroundItems,
// Build, Shelters, Zombies, Weather, Events, Timeline, Interact...). Oturum gerçek Session sınıfıdır; yalnız tarayıcı/3B
// kabuğu (oyuncu modeli, sahne, ses, arayüz, dünya verisi) küçük taklitlerle kurulur. Bozuk ve eski sürüm verisi de denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// localStorage taklidi (SaveSystem yuvaları + dizin). quota: kota aşımı denemesi için en uzun değer
const store = new Map();
let quota = Infinity;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    const s = String(v);
    if (s.length > quota) { const e = new Error('Depolama kotası aşıldı'); e.name = 'QuotaExceededError'; throw e; }
    store.set(k, s);
  },
  removeItem: (k) => { store.delete(k); },
};

const THREE = await import('three');
const { Session } = await import('../../src/Session.js');
const { SaveSystem, SLOTS, SLOT_NAMES } = await import('../../src/systems/SaveSystem.js');
const { Inventory } = await import('../../src/systems/Inventory.js');
const { PlayerStats } = await import('../../src/systems/PlayerStats.js');
const { Loot } = await import('../../src/systems/Loot.js');
const { GroundItems } = await import('../../src/systems/GroundItems.js');
const { Build } = await import('../../src/systems/Build.js');
const { Shelters } = await import('../../src/systems/Shelters.js');
const { Zombies } = await import('../../src/systems/Zombies.js');
const { Vehicles } = await import('../../src/systems/Vehicles.js');
const { NPCs } = await import('../../src/systems/NPCs.js');
const { Interact } = await import('../../src/systems/Interact.js');
const { Quests } = await import('../../src/systems/Quests.js');
const { Events } = await import('../../src/systems/Events.js');
const { Endings } = await import('../../src/systems/Endings.js');
const { MapSystem } = await import('../../src/systems/MapSystem.js');
const { Weather } = await import('../../src/systems/Weather.js');
const { Bots } = await import('../../src/systems/Bots.js');
const { Timeline } = await import('../../src/systems/Timeline.js');
const { StoryWorld } = await import('../../src/systems/StoryWorld.js');
const { CHARACTERS } = await import('../../src/entities/CharacterFactory.js');

// ---------------------------------------------------------------------------------------------- oyun kabuğu taklitleri
/** Arayüz: her çağrı kayda geçer (toast metinleri ayrıca sorgulanabilir) */
function fakeUI() {
  const log = [];
  const ui = { log, toasts: () => log.filter((x) => x[0] === 'toast').map((x) => x[1]) };
  for (const n of ['toast', 'itemToast', 'questBanner', 'refreshQuests', 'openStorage', 'refreshStorage', 'updateHotbar', 'refreshInventory', 'refreshTimeline', 'broadcast', 'chatMessage', 'regionBanner', 'phaseBanner', 'openNote', 'alert', 'closeEvent']) ui[n] = (...a) => { log.push([n, ...a]); };
  return ui;
}

/** Dünya verisi: konteynerler (özel içerikli ikisi + bir kasa), kapılar, pencereler, bir sığınak */
function makeWorld() {
  const door = (id, locked = false) => ({ id, locked, target: 0, open01: 0, broken: false, barricade: 0, hp: 120, maxHp: 120, center: { x: 0, y: 0, z: 0 }, inward: { x: 0, z: 1 }, along: { x: 1, z: 0 }, y0: 0, width: 1, kind: 'wood', collider: {} });
  const win = (id, home = false) => ({ id, broken: false, barricade: 0, hp: 40, maxHp: 40, center: { x: 0, y: 1.5, z: 0 }, inward: { x: 0, z: 1 }, along: { x: 1, z: 0 }, width: 1, height: 1.2, paneIndex: 0, collider: {}, building: home ? { id: 'home' } : null });
  return {
    spawn: { x: -282, y: 5, z: 168, rot: 0 },
    containers: [
      { id: 'c_odun', type: 'crate', x: -297.5, z: 118.5, special: 'woodpile', building: 'home' },
      { id: 'c_pilot', type: 'body', x: 40, z: 60, special: 'pilot_log' },
      { id: 'c_kasa', type: 'safe', x: 10, z: 10, building: 'bank' },
    ],
    doors: [door('d_ev'), door('d_kilitli', true), door('d_bar')],
    windows: [win('w_kirik'), win('w_tahta', true)],
    shelters: [{ def: { id: 'sh_ev', lock: 2 }, lights: [{ main: true, on: false }, { emergency: true, on: false }] }],
    vehicleSpawns: [], buildings: [], buildingById: {}, interactables: [],
    home: { rooms: [], floorY: 0, box: { minX: -300, maxX: -260, minZ: 150, maxZ: 190 } },
    physics: { setEnabled() {}, addBoxC: () => ({}), remove() {}, addFloor() {}, groundHeight: () => 5, lineOfSight: () => true },
    doorRenderer: { updateDoor() {} },
    terrain: { heightAt: () => 5 },
    setPaneVisible() {}, regionAt: () => ({ id: 'mahalle', danger: 1 }), buildingAt: () => null,
  };
}

function makeGame() {
  return {
    world: makeWorld(), scene: new THREE.Scene(), phys: null,
    audio: { played: [], play(name) { this.played.push(name); }, loop() {}, stopLoop() {}, listener: { x: 0, y: 0, z: 0 } },
    env: { weather: { type: 'clear', rain: 0, cloud: 0, fog: 0, wind: 1, snow: 0, storm: 0 }, extraLights: [], redMist: 0, streetPower: true, doom: 0 },
    ui: fakeUI(), net: { active: false, sendToHost() {}, broadcast() {} },
    itemModels: { make: () => new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3)) },
    input: { label: () => 'R' },
  };
}

/** Oyuncu modeli (Player) yerine: konum, yön ve elde tutma çağrıları */
function fakePlayer() {
  return {
    pos: new THREE.Vector3(), yaw: 0, mode: 'ground', aiming: false, vehicle: null, seat: 0,
    avatar: { heldId: null, light: false, hold(id) { this.heldId = id; }, setFlashlight(on) { this.light = !!on; }, play() {} },
    spawnAt(x, y, z, rot) { this.pos.set(x, y, z); this.yaw = rot; },
  };
}

/** Gerçek Session + Session.start()'taki sırayla gerçek alt sistemler (3B/fizik isteyenler hariç) */
function makeSession(game, cfg = {}) {
  const S = new Session(game, { mode: 'single', difficulty: 'normal', dayMinutes: 24, local: { name: 'Ayla', charId: 'mert' }, ...cfg });
  const prof = S.cfg.local;
  const cdef = CHARACTERS[prof.charId] || CHARACTERS.mert;
  S.localProfile = { id: S.localId, name: prof.name, charId: cdef.id, look: { ...cdef.look, ...(prof.look || {}) }, stats: cdef.stats };
  S.localStats = new PlayerStats(cdef.stats, S.diff.needs);
  S.inventory = new Inventory(30, 30 * (cdef.stats.carry || 1));
  S.equipment = { back: null, body: null, head: null, body2: null, hands: null };
  S.hotbarIndex = 0;
  S.local = fakePlayer();
  S.fx = { calls: [], hit(...a) { this.calls.push(['hit', ...a]); }, dust() {}, emit() {}, ping() {}, fire() {} };
  S.props = { calls: [], burst(...a) { this.calls.push(['burst', ...a]); }, explosion() {} };
  S.loot = new Loot(S);
  S.ground = new GroundItems(S);
  S.shelters = new Shelters(S);
  S.build = new Build(S);
  S.zombies = new Zombies(S);
  S.vehicles = new Vehicles(S);
  S.npcs = new NPCs(S);
  S.npcs.init = () => {}; // NPC'lerin dünyaya yerleşmesi bina yerleşimi + Avatar (3B model) ister: Node'da kurulamaz
  S.interact = new Interact(S);
  S.quests = new Quests(S);
  S.events = new Events(S);
  S.endings = new Endings(S);
  S.map = new MapSystem(S);
  S.weather = new Weather(S);
  S.bots = new Bots(S);
  S.saves = new SaveSystem(S);
  S.timeline = new Timeline(S);
  S.storyWorld = new StoryWorld(S);
  S.registerCore();
  S.players.set(S.localId, { id: S.localId, name: prof.name, charId: cdef.id, look: S.localProfile.look, isLocal: true, token: S.token, pos: S.local.pos, summary: null });
  return S;
}

/** Eylem/olay işleyicilerindeki hatalar Session tarafından yutulup console.error'a yazılır: testte toplanır */
function watchErrors(t) {
  const errs = [];
  t.mock.method(console, 'error', (...a) => { errs.push(a.map(String).join(' ')); });
  t.mock.method(console, 'warn', (...a) => { errs.push(a.map(String).join(' ')); });
  return errs;
}

function savedPlayer(charId, name, fill) {
  const inv = new Inventory(30, 30);
  fill(inv);
  return { charId, name, look: {}, pos: [1, 2, 3], yaw: 0.3, stats: new PlayerStats(CHARACTERS[charId].stats).serialize(), inv: inv.serialize(), equip: { back: null, body: null, head: null, body2: null, hands: null } };
}

/** 4. gün 14.30'da, çok şey yapılmış bir host oturumu: gerçek eylemlerle (act/applyAction) kurulur */
function playedSession() {
  const A = makeSession(makeGame(), { difficulty: 'hard', dayMinutes: 36, token: 'tok_host', seed: 123456, local: { name: 'Ayla', charId: 'bora' } });
  A.time.set(3 * 1440 + 14 * 60 + 30);
  A.loot.init();
  A.zombies.init();
  A.quests.init(); // m1_home + s_bunker
  A.local.spawnAt(10, 3, -20, 1.25);
  // ---- envanter: yığınlar ve yığın verisi
  const inv = A.inventory;
  inv.add('pistol', 1, { ammo: 7, dur: 211 });
  inv.add('axe', 1, { dur: 37 });
  inv.add('nails', 150); // 99 + 51
  inv.add('bread', 3, { t0: 4000 });
  inv.add('jerrycan', 1, { fuel: 12.5 });
  inv.add('note', 1, { noteId: 'camp_diary' });
  inv.add('water_bottle', 2);
  inv.move(inv.firstSlotOf('water_bottle'), 29); // son yuva
  A.equipment.back = 'backpack_small';
  A.equipment.body = 'vest';
  Object.assign(A.localStats, { health: 72.5, hunger: 41.5, thirst: 55, energy: 33, morale: 61, temp: 36.8 });
  A.localStats.cond.bleeding = 0.4;
  A.localStats.cond.infection = 12;
  A.localStats.buffs.painkiller = 60;
  // ---- bayraklar, ilişkiler, sonuçlar
  A.act('flag', { flag: 'radio_heard', value: 1 });
  A.act('rel', { faction: 'military', delta: 15 });
  A.results.kills = 12;
  A.results.vehicles.add('pickup1');
  A.results.choices.push('Köprüyü tuttuk');
  // ---- görevler: arama kancası, dinamik görev, okunan not
  A.act('search_done', { id: 'c_odun' }); // ev konteyneri → m1_home "dolapları ara" 1/4
  A.quests.addDynamic('dyn_av', { kind: 'random', title: 'Avcı Gecesi', desc: 'Üç zombi.', objs: [{ t: 'kill', count: 3, label: 'Zombi öldür' }], reward: [['bandage', 2]] });
  A.quests.onKill('runner');
  A.act('note_read', { id: 'camp_diary' });
  // ---- harita: keşif, kalıcı ve geçici işaret, görülen bölgeler
  A.map.revealAround(200, -150, 80);
  A.map.addUserMarker(10, 20, 'Zula');
  A.map.addMarker(50, 60, 'Geçici', 'quest', 120); // süreli: kayda girmez
  A.map.seenRegions = new Set(['mahalle', 'sehir']);
  // ---- yağma: özel konteyner aranır, mermiden 5'i alınır (3 kalır); kasa kilitli kalır
  A.act('search_done', { id: 'c_pilot' });
  A.act('loot_take', { id: 'c_pilot', slot: 3, qty: 5 });
  // ---- yere bırakılan eşyalar
  A.act('ground_drop', { stack: { id: 'plank', qty: 4 }, x: 3.456, y: 5, z: -7.891 });
  A.act('ground_drop', { stack: { id: 'rifle', qty: 1, ammo: 2, dur: 150 }, x: -1, y: 5, z: 2 });
  // ---- kapı / pencere
  A.act('door', { id: 'd_ev', open: true });
  A.act('door', { id: 'd_kilitli', open: true, unlock: true });
  A.act('door_reinforce', { id: 'd_bar' });
  A.act('door_reinforce', { id: 'd_bar' });
  A.act('window_damage', { id: 'w_kirik', dmg: 500 });
  A.act('window_board', { id: 'w_tahta' }); // ev penceresi → window_boarded bayrağı
  // ---- hava, zombi bölgeleri, üs, sığınak, olaylar
  A.weather.set('rain', 120);
  A.zombies.zones[0].pop = 3;
  A.zombies.zones[0].killed = 7;
  A.act('gen', { fixed: true, fuel: 15, on: true });
  A.act('bunker', { stage: 2, progress: 0.4 }); // → s_bunker ilerler
  A.act('shelter', { id: 'sh_ev', op: 'unlock' });
  A.act('shelter', { id: 'sh_ev', op: 'power', on: true });
  A.emit({ k: 'broadcast', day: 4, title: '📻 Acil Durum Yayını', text: 'Köprü kapandı.' });
  A.events.done.add('market_riot');
  A.events.schedule.push({ at: 6000, kind: 'event', id: 'night_horde' });
  // ---- çok oyunculu: bağlı bir oyuncunun yedeği + çevrimdışı bir oyuncu
  A.players.set('p_b', { id: 'p_b', token: 'tok_b', name: 'Bulut', charId: 'elif', isLocal: false, saved: savedPlayer('elif', 'Bulut', (i) => { i.add('bow', 1, { dur: 99 }); i.add('arrow', 15); }) });
  A.offlinePlayers = { tok_c: savedPlayer('ceren', 'Cemre', (i) => { i.add('first_aid', 2); }) };
  return A;
}

/** A'yı yuvaya kaydet, yuvadan oku, MenuScreens.loadSlot'un yaptığı gibi yeni oturum kur ve yükle */
function roundTrip(slot = '2') {
  const A = playedSession();
  assert.equal(A.saves.save(slot), true, 'host kaydı alınmalı');
  const data = SaveSystem.read(slot);
  const me = data.players[data.hostToken] || Object.values(data.players)[0];
  const B = makeSession(makeGame(), { difficulty: data.cfg.difficulty, dayMinutes: data.cfg.dayMinutes, token: data.hostToken, seed: data.seed, save: data, local: { name: me.name, charId: me.charId, look: me.look } });
  B.load(data);
  return { A, B, data };
}

const slotOf = (S, id) => S.inventory.slots[S.inventory.firstSlotOf(id)];

// ================================================================================================== testler
test('gidiş-dönüş: yerel oyuncunun envanteri (yığın, dayanıklılık, mermi, yakıt, tazelik, not), kuşanılanları, durumu ve konumu korunur', (t) => {
  const errs = watchErrors(t);
  const { A, B } = roundTrip();
  assert.deepEqual(B.inventory.serialize(), A.inventory.serialize(), 'yuvalar yuva yuva aynı');
  assert.equal(B.inventory.size, 30);
  assert.equal(B.inventory.maxWeight, A.inventory.maxWeight);
  assert.deepEqual({ ammo: slotOf(B, 'pistol').ammo, dur: slotOf(B, 'pistol').dur }, { ammo: 7, dur: 211 });
  assert.equal(slotOf(B, 'axe').dur, 37);
  assert.deepEqual(B.inventory.items().filter((s) => s.id === 'nails').map((s) => s.qty).sort((a, b) => b - a), [99, 51], 'yığın sınırı (99) korunur');
  assert.equal(slotOf(B, 'bread').t0, 4000, 'tazelik başlangıcı');
  assert.equal(slotOf(B, 'jerrycan').fuel, 12.5);
  assert.equal(slotOf(B, 'note').noteId, 'camp_diary');
  assert.equal(B.inventory.slots[29].id, 'water_bottle', 'yuva yeri korunur');
  assert.equal(B.inventory.count('ammo_9mm'), 5, 'konteynerden alınan mermi');
  assert.deepEqual(B.equipment, { back: 'backpack_small', body: 'vest', head: null, body2: null, hands: null });
  assert.deepEqual(B.localStats.serialize(), A.localStats.serialize());
  assert.equal(B.localStats.cond.bleeding, 0.4);
  assert.equal(B.localStats.buffs.painkiller, 60);
  assert.equal(B.localStats.maxHealth, CHARACTERS.bora.stats.health, 'karakter istatistiği karakterden');
  // yeniden doğarken zemine gömülmemek için 0,2 m yukarıdan
  assert.ok(Math.abs(B.local.pos.x - 10) < 1e-9 && Math.abs(B.local.pos.y - 3.2) < 1e-9 && Math.abs(B.local.pos.z + 20) < 1e-9);
  assert.equal(B.local.yaw, 1.25);
  assert.equal(B.local.avatar.heldId, 'pistol', 'yükleme sonrası 1. yuva elde (selectHotbar)');
  assert.ok(B.game.ui.toasts().some((m) => /Kayıt yüklendi: 4\. gün/.test(m)));
  assert.deepEqual(errs, []);
});

test('gidiş-dönüş: bayraklar, ilişkiler, sonuçlar, görevler (dinamik + not), zaman, harita sisi ve zaman çizelgesi korunur', (t) => {
  const errs = watchErrors(t);
  const { A, B, data } = roundTrip();
  assert.deepEqual(B.flags, A.flags);
  for (const [k, v] of [['radio_heard', 1], ['window_boarded', 1], ['note:camp_diary', 1], ['generator_fixed', true], ['bunker_stage', 2]]) assert.equal(B.flags[k], v, k);
  assert.equal(B.relations.military, 15);
  assert.equal(B.results.kills, 12);
  assert.equal(B.results.searched, 2);
  assert.ok(B.results.vehicles instanceof Set && B.results.vehicles.has('pickup1'), 'araç kümesi diziden geri kurulur');
  assert.deepEqual(B.results.choices, ['Köprüyü tuttuk']);
  // görevler: durum, ilerleme, dinamik tanım, okunan notlar, izlenen
  assert.deepEqual(B.quests.serialize(), A.quests.serialize());
  assert.equal(B.quests.state('m1_home'), 'active');
  assert.equal(B.quests.st.m1_home.prog[0], 1, 'ev konteyneri araması sayıldı');
  assert.equal(B.quests.st.s_bunker.prog[0], 2, 'sığınak aşaması bayraktan');
  assert.equal(B.quests.def('dyn_av').title, 'Avcı Gecesi');
  assert.deepEqual(B.quests.st.dyn_av.prog, [1]);
  assert.ok(B.quests.notesRead.has('camp_diary'));
  assert.equal(B.quests.tracked, A.quests.tracked);
  // zaman: gün/saat ve gün uzunluğu (kayıttaki cfg.dayMinutes ile kurulur)
  assert.equal(B.time.total, A.time.total);
  assert.deepEqual([B.time.day, B.time.hour, B.time.minute, B.time.dayMinutes], [4, 14, 30, 36]);
  assert.equal(data.time.dayMinutes, 36);
  // harita: sis birebir, yalnız kalıcı işaretler, görülen bölgeler
  assert.deepEqual([...B.map.fog], [...A.map.fog]);
  assert.ok(B.map.explored(200, -150) && B.map.explored(-282, 168));
  assert.ok(!B.map.explored(600, 600));
  assert.deepEqual(B.map.markers.map((m) => m.label), ['Zula'], 'süreli işaret kayda girmez');
  assert.deepEqual([...B.map.seenRegions].sort(), ['mahalle', 'sehir']);
  // zaman çizelgesi (görev, not, yayın kayıtları); JSON'da tanımsız "key" alanı düşer
  assert.deepEqual(B.timeline.list, JSON.parse(JSON.stringify(A.timeline.serialize())));
  assert.ok(B.timeline.list.some((e) => e.kind === 'note') && B.timeline.list.some((e) => e.kind === 'broadcast'));
  assert.deepEqual(errs, []);
});

test('gidiş-dönüş: dünya — yağma konteynerleri, yerdeki eşyalar (yeniden alınabilir), kapı/pencere, hava, zombi bölgeleri, üs, sığınak, olaylar', (t) => {
  const errs = watchErrors(t);
  const { A, B } = roundTrip();
  // yağma: aranmış özel konteyner (kalan mermi 3), aranmış odun yığını, kilitli kasa
  assert.deepEqual(B.loot.serialize(), A.loot.serialize());
  assert.ok(B.loot.searched('c_pilot') && B.loot.searched('c_odun'));
  const pilot = B.loot.get('c_pilot').slots;
  assert.deepEqual(pilot.filter(Boolean).map((s) => [s.id, s.qty]), [['note', 1], ['first_aid', 1], ['pistol', 1], ['ammo_9mm', 3]]);
  assert.equal(pilot[2].ammo, 4);
  assert.equal(B.loot.get('c_kasa').locked, 2, 'kasa kilitli kalır');
  // yerdeki eşyalar: konum (cm) ve yığın verisi; yüklenen eşya alınabilir
  assert.deepEqual(B.ground.serialize(), A.ground.serialize());
  const plank = [...B.ground.items.values()].find((it) => it.stack.id === 'plank');
  assert.deepEqual([plank.x, plank.y, plank.z], [3.46, 5.9, -7.89]);
  const rifle = [...B.ground.items.values()].find((it) => it.stack.id === 'rifle');
  assert.deepEqual({ ammo: rifle.stack.ammo, dur: rifle.stack.dur }, { ammo: 2, dur: 150 });
  B.act('ground_pickup', { id: plank.id });
  assert.equal(B.inventory.count('plank'), 4);
  assert.equal(B.ground.items.size, 1);
  // kapı / pencere
  const door = (id) => B.world.doors.find((d) => d.id === id);
  const win = (id) => B.world.windows.find((w) => w.id === id);
  assert.equal(door('d_ev').target, 1);
  assert.deepEqual([door('d_kilitli').target, door('d_kilitli').locked], [1, false]);
  assert.equal(door('d_bar').barricade, 2);
  assert.ok(door('d_bar').boards, 'barikat tahtaları kurulur');
  assert.deepEqual([win('w_kirik').broken, win('w_kirik').hp], [true, 0]);
  assert.equal(win('w_tahta').barricade, 1);
  // hava, zombi bölgeleri, üs, sığınak, olaylar
  assert.deepEqual([B.weather.type, B.weather.remaining, B.env.weather.type], ['rain', 120, 'rain']);
  assert.deepEqual(B.zombies.serialize(), A.zombies.serialize());
  assert.deepEqual([B.zombies.zones[0].pop, B.zombies.zones[0].killed], [3, 7]);
  assert.deepEqual(B.build.gen, { fixed: true, fuel: 15, on: true });
  assert.deepEqual(B.build.bunker, { stage: 2, progress: 0.4 });
  assert.deepEqual(B.shelters.state.get('sh_ev'), { locked: 0, power: true, seen: false });
  assert.equal(B.world.shelters[0].lights[0].on, true, 'sığınak ana ışığı yanar');
  assert.equal(B.events.broadcasts[0].title, '📻 Acil Durum Yayını');
  assert.ok(B.events.done.has('market_riot'));
  assert.deepEqual(B.events.schedule, [{ at: 6000, kind: 'event', id: 'night_horde' }]);
  assert.equal(B.env.streetPower, false, '4. günden sonra şebeke elektriği kesik');
  assert.deepEqual(errs, []);
});

test('yeniden kaydetme kararlı: yüklenen oturum aynı kaydı üretir (yalnız kayıt anı ve +0,2 m doğma payı farklı)', (t) => {
  const errs = watchErrors(t);
  const { B, data } = roundTrip();
  const again = JSON.parse(JSON.stringify(B.serialize()));
  const ref = JSON.parse(JSON.stringify(data));
  assert.ok(Math.abs(again.players.tok_host.pos[1] - ref.players.tok_host.pos[1] - 0.2) < 1e-9);
  for (const o of [again, ref]) { delete o.savedAt; o.players.tok_host.pos[1] = 0; }
  assert.deepEqual(again, ref);
  assert.deepEqual(errs, []);
});

test('çok oyunculu kayıt: oyuncular jetonla saklanır; yüklemede yerel oyuncu jetonla seçilir, diğerleri çevrimdışı listesine döner', (t) => {
  const errs = watchErrors(t);
  const { A, B, data } = roundTrip();
  assert.deepEqual(Object.keys(data.players).sort(), ['tok_b', 'tok_c', 'tok_host']);
  assert.equal(data.hostToken, 'tok_host');
  assert.deepEqual(data.players.tok_b, A.players.get('p_b').saved, 'bağlı oyuncunun son yedeği');
  const meta = SaveSystem.meta(data);
  assert.deepEqual({ day: meta.day, minute: meta.minute, players: meta.players, multiplayer: meta.multiplayer, charId: meta.charId, name: meta.name, difficulty: meta.difficulty },
    { day: 4, minute: 870, players: 3, multiplayer: true, charId: 'bora', name: 'Ayla', difficulty: 'hard' });
  // host yükledi: diğer iki oyuncu çevrimdışı listesinde (geri bağlanınca envanterleri iade edilir)
  assert.deepEqual(Object.keys(B.offlinePlayers).sort(), ['tok_b', 'tok_c']);
  assert.deepEqual(B.offlinePlayers.tok_c, data.players.tok_c);
  // aynı kaydı tok_b jetonlu oturum yüklerse kendi oyuncusu seçilir
  const C = makeSession(makeGame(), { token: 'tok_b', difficulty: 'hard', dayMinutes: 36, local: { name: 'Bulut', charId: 'elif' } });
  C.load(data);
  assert.equal(C.inventory.count('arrow'), 15);
  assert.equal(slotOf(C, 'bow').dur, 99);
  assert.equal(C.inventory.count('pistol'), 0);
  assert.deepEqual(Object.keys(C.offlinePlayers).sort(), ['tok_c', 'tok_host']);
  assert.deepEqual(errs, []);
});

test('SaveSystem yuvaları: dizin meta + boyut, list/hasAny/remove, otomatik kayıt, dışa → içe aktarma; istemci, bitmiş oyun ve dolu depolama kaydetmez', async (t) => {
  const errs = watchErrors(t);
  store.clear();
  assert.equal(SaveSystem.hasAny(), false);
  assert.deepEqual(SaveSystem.list().map((s) => [s.slot, s.name, s.meta]), SLOTS.map((s) => [s, SLOT_NAMES[s], null]));
  const A = playedSession();
  const ui = A.game.ui;
  assert.equal(A.saves.save('1'), true);
  assert.ok(ui.toasts().includes('Oyun kaydedildi (Kayıt 1).'));
  const raw = store.get('kiyamet_save_1');
  const m1 = SaveSystem.list().find((s) => s.slot === '1').meta;
  assert.deepEqual({ day: m1.day, minute: m1.minute, players: m1.players, size: m1.size }, { day: 4, minute: 870, players: 3, size: raw.length });
  assert.equal(SaveSystem.hasAny(), true);
  // otomatik kayıt: ayrı yuva, ayrı bildirim
  const n = ui.toasts().length;
  A.saves.autosave();
  assert.ok(SaveSystem.read('auto'));
  assert.deepEqual(ui.toasts().slice(n), ['💾 Otomatik kayıt alındı.']);
  // istemci kaydedemez (host alır); oyun bittiyse kaydedilmez
  A.isHost = false;
  assert.equal(A.saves.save('3'), false);
  assert.ok(ui.toasts().includes('Kaydı oda sahibi (host) alır.'));
  A.saves.clearAutosave();
  assert.ok(SaveSystem.read('auto'), 'istemci otomatik kaydı silemez');
  A.isHost = true;
  A.endings.finished = true;
  assert.equal(A.saves.save('3'), false);
  assert.equal(SaveSystem.read('3'), null);
  A.endings.finished = false;
  // depolama dolu: hata yakalanır, eski kayıt bozulmaz
  quota = 64;
  try {
    assert.equal(A.saves.save('1'), false);
  } finally { quota = Infinity; }
  assert.ok(ui.toasts().includes('Kayıt başarısız: depolama alanı dolu olabilir.'));
  assert.equal(store.get('kiyamet_save_1'), raw);
  assert.equal(errs.length, 1, 'kota hatası console.error ile raporlanır');
  errs.length = 0;
  // dışa aktarma (indirme bağlantısı; 2 sn sonra URL bırakılır) → aynı dosyayı içe aktarma
  let blob = null;
  const clicked = [];
  t.mock.method(URL, 'createObjectURL', (b) => { blob = b; return 'blob:test'; });
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
  globalThis.document = { createElement: () => ({ click() { clicked.push(this.download); }, remove() {} }), body: { appendChild() {} } };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    assert.equal(SaveSystem.exportFile('1'), true);
    assert.equal(SaveSystem.exportFile('3'), false, 'boş yuva dışa aktarılamaz');
    t.mock.timers.tick(2000);
  } finally { t.mock.timers.reset(); delete globalThis.document; }
  assert.deepEqual(clicked, ['kiyametten-once-gun4-1.json']);
  assert.deepEqual(revoke.mock.calls.map((c) => c.arguments[0]), ['blob:test']);
  const imported = await SaveSystem.importFile(blob);
  assert.deepEqual(imported, JSON.parse(raw));
  assert.equal(store.get('kiyamet_save_3'), raw, 'içe aktarılan kayıt 3. yuvaya yazılır');
  // silme
  SaveSystem.remove('1');
  assert.equal(SaveSystem.read('1'), null);
  assert.equal(SaveSystem.list().find((s) => s.slot === '1').meta, null);
  A.saves.clearAutosave();
  assert.equal(SaveSystem.read('auto'), null);
  assert.deepEqual(errs, []);
});

test('bozuk veri: bozuk yuva ve bozuk dizin çökertmez; içe aktarma eski sürüm/eksik/bozuk dosyayı reddeder ve yuvaya dokunmaz', async () => {
  store.clear();
  store.set('kiyamet_save_2', '{"v":1,"time":');
  assert.equal(SaveSystem.read('2'), null, 'bozuk JSON okunamaz → null');
  assert.equal(SaveSystem.read('1'), null, 'olmayan yuva → null');
  store.set('kiyamet_saves_index', 'bozuk{dizin');
  assert.deepEqual(SaveSystem.list().map((s) => s.meta), [null, null, null, null]);
  assert.equal(SaveSystem.hasAny(), false);
  // bozuk dizin yazınca onarılır
  const ok = { v: 1, seed: 1, time: { total: 1440 + 60 }, players: { a: { charId: 'elif', name: 'Ece' } }, hostToken: 'a', cfg: { difficulty: 'easy' } };
  SaveSystem.write('auto', ok);
  assert.equal(SaveSystem.hasAny(), true);
  assert.deepEqual([SaveSystem.list()[0].meta.day, SaveSystem.list()[0].meta.difficulty], [2, 'easy']);
  // içe aktarma doğrulaması (MenuScreens hatayı "İçe aktarılamadı: …" diye gösterir)
  const file = (text) => ({ text: async () => text });
  store.set('kiyamet_save_3', 'eski');
  await assert.rejects(SaveSystem.importFile(file(JSON.stringify({ ...ok, v: 0 }))), /Geçersiz kayıt dosyası/, 'eski sürüm');
  await assert.rejects(SaveSystem.importFile(file(JSON.stringify({ v: 1, players: {} }))), /Geçersiz kayıt dosyası/, 'zaman yok');
  await assert.rejects(SaveSystem.importFile(file(JSON.stringify({ v: 1, time: { total: 0 } }))), /Geçersiz kayıt dosyası/, 'oyuncu yok');
  await assert.rejects(SaveSystem.importFile(file('null')), /Geçersiz kayıt dosyası/);
  await assert.rejects(SaveSystem.importFile(file('bu bir kayıt değil')), SyntaxError);
  assert.equal(store.get('kiyamet_save_3'), 'eski', 'reddedilen dosya yuvayı değiştirmez');
  // meta: host jetonu bozuksa ilk oyuncu, zorluk yoksa normal
  const meta = SaveSystem.meta({ time: { total: 30 }, players: { x: { charId: 'deniz', name: 'D' } }, hostToken: 'yok' });
  assert.deepEqual([meta.day, meta.charId, meta.difficulty, meta.multiplayer], [1, 'deniz', 'normal', false]);
});

test('eski/eksik kayıt yüklenir: eksik bölümler varsayılanla, bilinmeyen eşya ve hava türü atlanır, farklı sis çözünürlüğü yok sayılır', (t) => {
  const errs = watchErrors(t);
  const old = {
    v: 1, seed: 99, time: { total: 2 * 1440 + 600 }, hostToken: 'tok_eski',
    players: { tok_eski: { charId: 'mert', name: 'Eski', pos: [5, 6, 7], yaw: 0.5, stats: { health: 55, hunger: 30, cond: { bleeding: 0.2 } }, inv: { slots: [{ id: 'pistol', qty: 1, ammo: 3 }, { id: 'lazer_tufegi', qty: 1 }, null, { id: 'bandage', qty: 4 }], maxWeight: 28 } } },
    loot: { c_odun: { s: 1 } },
    map: { n: 100, f0: 1, runs: [10000], markers: [{ id: 'm1', x: 1, z: 2, label: 'Eski işaret', icon: 'pin', until: 0, user: true }] },
    weather: { type: 'asit_yagmuru', rem: 30 },
    results: { kills: 3 },
    // araç listesi olmayan kayıtta Vehicles.init() 3B araç modeli kurar (Node'da yok); her sürümde kayıtta araç listesi vardır
    vehicles: [],
  };
  const B = makeSession(makeGame(), { token: 'tok_eski' });
  const fog0 = [...B.map.fog];
  B.load(old);
  // envanter: 30 yuvaya büyür, tanınmayan eşya düşer, yığın verisi korunur
  assert.equal(B.inventory.size, 30);
  assert.equal(B.inventory.maxWeight, 28);
  assert.deepEqual(B.inventory.slots.slice(0, 4).map((s) => (s ? [s.id, s.qty] : null)), [['pistol', 1], null, null, ['bandage', 4]]);
  assert.equal(slotOf(B, 'pistol').ammo, 3);
  // durum: kayıttakiler + eksik alanlar varsayılan
  assert.deepEqual([B.localStats.health, B.localStats.hunger, B.localStats.cond.bleeding, B.localStats.cond.infection, B.localStats.thirst], [55, 30, 0.2, 0, 85]);
  assert.deepEqual(B.localStats.buffs, {});
  // eksik bölümler
  assert.deepEqual(B.flags, {});
  assert.deepEqual(B.relations, { neighbors: 10, military: 0, traders: 10, raiders: -10 });
  assert.equal(B.results.kills, 3);
  assert.ok(B.results.vehicles instanceof Set && B.results.vehicles.size === 0);
  assert.deepEqual(B.results.choices, []);
  assert.deepEqual(B.quests.st, {});
  assert.deepEqual(B.timeline.list, []);
  assert.ok(B.zombies.zones.every((z) => z.pop === Math.round(z.base * B.diff.zombies)), 'zombi bölgeleri baştan');
  // yağma: aranmış ama içerik dizisi yok → boş
  assert.equal(B.loot.searched('c_odun'), true);
  assert.deepEqual(B.loot.get('c_odun').slots, []);
  // harita: başka çözünürlükteki sis uygulanmaz (başlangıç keşfi kalır), işaretler yüklenir
  assert.deepEqual([...B.map.fog], fog0);
  assert.deepEqual(B.map.markers.map((m) => m.label), ['Eski işaret']);
  // bilinmeyen hava türü → açık
  assert.deepEqual([B.weather.type, B.weather.remaining], ['clear', 30]);
  assert.deepEqual([B.time.day, B.time.hour], [3, 10]);
  assert.equal(B.env.streetPower, true, '4. günden önce elektrik var');
  assert.ok(Math.abs(B.local.pos.y - 6.2) < 1e-9);
  const meta = SaveSystem.meta(old);
  assert.deepEqual([meta.difficulty, meta.players, meta.multiplayer], ['normal', 1, false]);
  assert.deepEqual(errs, []);
});

test('kayıttan yüklenen kapılar sessizce uygulanır (ses, kıymık efekti ve fiziksel enkaz üretilmez)', { skip: 'OYUN HATASI (bildirildi): Session.loadDoors kapılara applyDoorState(…, silent=false) uyguluyor (pencereler silent=true). Kayıt yüklenirken/katılımda açık kapılar açılma sesi çalıp animasyonla açılıyor, barikatlı kapılar "build" sesi, kırık kapılar "bash" sesi + vuruş efekti + props.burst ile fiziksel enkaz üretiyor.' }, () => {
  const A = playedSession();
  A.act('door_damage', { id: 'd_ev', dmg: 1000 }); // kırık kapı
  const data = JSON.parse(JSON.stringify(A.serialize()));
  const B = makeSession(makeGame(), { token: data.hostToken, difficulty: 'hard', dayMinutes: 36, local: { name: 'Ayla', charId: 'bora' } });
  B.load(data);
  assert.equal(B.world.doors.find((d) => d.id === 'd_ev').broken, true);
  assert.deepEqual(B.game.audio.played.filter((n) => /door|bash|build|barricade/.test(n)), [], 'yüklemede kapı sesi yok');
  assert.deepEqual(B.props.calls, [], 'yüklemede enkaz yok');
  assert.deepEqual(B.fx.calls, [], 'yüklemede vuruş efekti yok');
  assert.equal(B.world.doors.find((d) => d.id === 'd_kilitli').open01, 1, 'açık kapı açık konumda başlar (animasyonsuz)');
});
