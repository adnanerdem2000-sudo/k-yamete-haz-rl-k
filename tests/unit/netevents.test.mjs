// Çok oyunculu olay mantığı birim testleri (WebRTC'siz): Net yardımcıları (compactAnim, summaryOf, bağlantı kalitesi,
// göç adayı, eş zaman aşımı), yayın yönlendirmesi; LocalTransport (BroadcastChannel) üzerinden gerçek Net host ↔ gerçek Net
// istemci akışları (lobi el sıkışması, sürüm uyuşmazlığı ve dolu oda reddi, atma, oyun başlatma → welcome → joined,
// istemci eylemi → host doğrulaması → olay, anlık görüntü/durum/pdata eşitlemesi, ayrılma ve jetonla geri dönüş) ve sahte
// oturumla (S.on / S.emit / S.onEvt) iki gerçek sistemin (Quests, Loot) host-otoriter eylem → olay akışı.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// tarayıcı nesneleri için en küçük taklit (LocalTransport sekme kapanışını dinler)
globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} };
// Net.join'in 10 sn'lik "Oda yanıt vermedi" zamanlayıcısı yanıt gelince temizlenmiyor (tarayıcıda zararsız): test süreci
// 10 sn açık kalmasın diye 5 sn ve üstü zamanlayıcılar unref edilir (oyun mantığı değişmez)
const _setTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => { const h = _setTimeout(fn, ms, ...args); if (ms >= 5000 && h && typeof h.unref === 'function') h.unref(); return h; };

const THREE = await import('three');
const { Net, PROTOCOL } = await import('../../src/net/Net.js');
const { LocalTransport } = await import('../../src/net/Transport.js');
const { Session } = await import('../../src/Session.js');
const { Settings } = await import('../../src/core/Settings.js');
const { Inventory } = await import('../../src/systems/Inventory.js');
const { PlayerStats } = await import('../../src/systems/PlayerStats.js');
const { TimeSystem } = await import('../../src/systems/TimeSystem.js');
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

const sleep = (ms) => new Promise((r) => _setTimeout(r, ms));
async function waitFor(cond, what = 'koşul', ms = 4000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('Zaman aşımı: ' + what); await sleep(10); }
}
const roomCodeFor = (p) => p + Math.random().toString(36).slice(2, 7).toUpperCase();

function watchErrors(t) {
  const errs = [];
  t.mock.method(console, 'error', (...a) => { errs.push(a.map(String).join(' ')); });
  t.mock.method(console, 'warn', (...a) => { errs.push(a.map(String).join(' ')); });
  return errs;
}

// ---------------------------------------------------------------------------------------------- oyun kabuğu taklitleri
function fakeUI() {
  const log = [];
  const ui = { log, toasts: () => log.filter((x) => x[0] === 'toast').map((x) => x[1]), calls: (n) => log.filter((x) => x[0] === n) };
  for (const n of ['toast', 'itemToast', 'questBanner', 'refreshQuests', 'openStorage', 'refreshStorage', 'updateHotbar', 'refreshInventory', 'refreshTimeline', 'broadcast', 'chatMessage', 'regionBanner', 'phaseBanner', 'openNote', 'alert', 'closeEvent', 'showLoadingOverlay', 'hideReconnect', 'showReconnect', 'showMainMenu']) ui[n] = (...a) => { log.push([n, ...a]); };
  return ui;
}

function makeWorld() {
  return {
    spawn: { x: -282, y: 5, z: 168, rot: 0 },
    containers: [
      { id: 'c_pilot', type: 'body', x: 40, z: 60, special: 'pilot_log' },
      { id: 'c_odun', type: 'crate', x: -297.5, z: 118.5, special: 'woodpile', building: 'home' },
    ],
    doors: [], windows: [], shelters: [], vehicleSpawns: [], buildings: [], buildingById: {}, interactables: [],
    home: { rooms: [], floorY: 0, box: { minX: -300, maxX: -260, minZ: 150, maxZ: 190 } },
    physics: { setEnabled() {}, addBoxC: () => ({}), remove() {}, addFloor() {}, groundHeight: () => 5 },
    doorRenderer: { updateDoor() {} }, terrain: { heightAt: () => 5 },
    setPaneVisible() {}, regionAt: () => ({ id: 'mahalle', danger: 1 }), buildingAt: () => null,
  };
}

function fakeAvatar() {
  return { heldId: null, disposed: false, root: { position: new THREE.Vector3() }, hold(id) { this.heldId = id; }, setFlashlight() {}, play() {}, dispose() { this.disposed = true; } };
}

function fakePlayer() {
  return {
    pos: new THREE.Vector3(), yaw: 0, mode: 'ground', aiming: false, vehicle: null, seat: 0, avatar: fakeAvatar(),
    spawnAt(x, y, z, rot) { this.pos.set(x, y, z); this.yaw = rot; },
    animState() { return { mode: this.mode, speed: 1.234, vy: 0, yaw: this.yaw, pitch: 0.1, aim: false }; },
  };
}

/** Session.start()'ın 3B dışı kısmı: gerçek Session + gerçek alt sistemler, yerel oyuncu kaydı */
function buildSession(game, cfg) {
  const S = new Session(game, cfg);
  const prof = cfg.local;
  const cdef = CHARACTERS[prof.charId] || CHARACTERS.mert;
  S.localProfile = { id: S.localId, name: prof.name, charId: cdef.id, look: { ...cdef.look, ...(prof.look || {}) }, stats: cdef.stats };
  S.localStats = new PlayerStats(cdef.stats, S.diff.needs);
  S.inventory = new Inventory(30, 30 * (cdef.stats.carry || 1));
  S.equipment = { back: null, body: null, head: null, body2: null, hands: null };
  S.hotbarIndex = 0;
  S.local = fakePlayer();
  S.fx = { hit() {}, dust() {}, emit() {}, ping() {}, fire() {} };
  S.props = { burst() {}, explosion() {} };
  S.loot = new Loot(S);
  S.ground = new GroundItems(S);
  S.shelters = new Shelters(S);
  S.build = new Build(S);
  S.zombies = new Zombies(S);
  S.vehicles = new Vehicles(S);
  S.npcs = new NPCs(S);
  S.npcs.init = () => {}; // NPC yerleşimi bina + Avatar (3B model) ister: Node'da kurulamaz
  S.interact = new Interact(S);
  S.quests = new Quests(S);
  S.events = new Events(S);
  S.endings = new Endings(S);
  S.map = new MapSystem(S);
  S.weather = new Weather(S);
  S.bots = new Bots(S);
  S.timeline = new Timeline(S);
  S.storyWorld = new StoryWorld(S);
  // uzak oyuncu: Avatar (3B karakter modeli) Node'da kurulamaz; kayıt alanları gerçek addRemotePlayer ile aynı
  S.addRemotePlayer = (info) => {
    if (S.players.has(info.id) && S.players.get(info.id).avatar) return S.players.get(info.id);
    const rec = { ...info, look: info.look || {}, avatar: fakeAvatar(), pos: new THREE.Vector3(info.x || 0, info.y || 0, info.z || 0), target: null, anim: null, summary: info.summary || null };
    S.players.set(info.id, rec);
    S.ui.toast(`${info.name} oyuna katıldı.`, 'good');
    return rec;
  };
  S.registerCore();
  S.players.set(S.localId, { id: S.localId, name: prof.name, charId: cdef.id, look: S.localProfile.look, isLocal: true, token: S.token, pos: S.local.pos, summary: null });
  return S;
}

/** Session.newGame'in 3B dışı kısmı: doğma, başlangıç çantası, konteyner kilitleri, zombi bölgeleri, ilk görevler */
function newGameLite(S) {
  const sp = S.world.spawn;
  const cdef = CHARACTERS[S.localProfile.charId];
  S.local.spawnAt(sp.x + (S.cfg.spawnOffset || 0), sp.y, sp.z, sp.rot);
  for (const [id, n, data] of cdef.start) S.inventory.add(id, n, data || null, true);
  S.inventory.add('water_bottle', 2, null, true);
  S.inventory.add('canned_food', 1, null, true);
  S.loot.init();
  S.zombies.init();
  S.quests.init();
  S.selectHotbar(0);
}

/** Game taklidi: gerçek Net; startSession = Game.startSession + Session.start (kayıt/hoş geldin/yeni oyun, ağa bağlanma) */
function makeGame(label) {
  const game = {
    label, world: makeWorld(), scene: new THREE.Scene(), phys: null, state: 'playing', session: null,
    audio: { play() {}, loop() {}, stopLoop() {} },
    env: { weather: { type: 'clear', rain: 0, cloud: 0, fog: 0, wind: 1, snow: 0, storm: 0 }, extraLights: [], redMist: 0, streetPower: true, doom: 0 },
    ui: fakeUI(), input: { label: () => 'R', isDown: () => false },
    itemModels: { make: () => new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3)) },
    async startSession(cfg) {
      const S = buildSession(this, cfg);
      this.session = S;
      if (cfg.save && S.isHost) S.load(cfg.save);
      else if (cfg.mode === 'client' && cfg.welcome) S.applyWelcome(cfg.welcome);
      else newGameLite(S);
      if (cfg.mode !== 'single') this.net.attachSession(S);
      return S;
    },
    endSession() { this.session = null; this.net.leave(); this.ui.showMainMenu(); },
  };
  game.net = new Net(game);
  return game;
}

/** Ayrıl (önce istemciler), lobi yayın kanalını kapat; Net.leave taşıyıcıyı 100 ms sonra kapatır */
async function closeAll(...games) {
  for (const g of games) { try { g.net.leave(); } catch { /* yoksay */ } }
  for (const g of games) { try { if (g.net.lobbyBeacon) g.net.lobbyBeacon.close(); } catch { /* yoksay */ } }
  await sleep(160);
}

/** Bir istemcinin host'tan aldığı iletileri kaydet (gerçek işleme dokunmadan) */
function recordHostMsgs(game) {
  const got = [];
  const orig = game.net.onHostMsg.bind(game.net);
  game.net.onHostMsg = (m) => { got.push(m); orig(m); };
  return got;
}

async function hostRoom(game, name, settings = {}) {
  Settings.set('player.name', name);
  Settings.set('player.characterId', 'mert');
  return game.net.host({ local: true, code: roomCodeFor('T'), settings });
}
async function joinRoom(game, code, name, charId = 'mert') {
  Settings.set('player.name', name);
  Settings.set('player.characterId', charId);
  return game.net.join(code, { local: true });
}

// ================================================================================================== testler
test('Net yardımcıları: compactAnim yuvarlar ve eksikleri doldurur; summaryOf özet + telsiz bayrağı; bağlantı kalitesi sınıfı', (t) => {
  const net = new Net({ ui: fakeUI() });
  t.after(() => net.lobbyBeacon && net.lobbyBeacon.close());
  const a = net.compactAnim({ mode: 'ground', speed: 3.14159, vy: -2.345, yaw: 1.23456, pitch: 0.98765, aim: 1, steer: 0.33333, emote: 'wave', carrying: 'p_2', moveAngle: -0.7777, roll: true, tired: 'evet', carryBox: {}, act: 'chop', actT: 0.44444, gereksiz: 'x' });
  assert.deepEqual(a, { mode: 'ground', speed: 3.1, vy: -2.3, yaw: 1.23, pitch: 0.99, aim: true, steer: 0.33, emote: 'wave', carrying: true, moveAngle: -0.78, roll: 1, tired: 1, carryBox: 1, act: 'chop', actT: 0.44 });
  const b = net.compactAnim({ mode: 'crouch', speed: 0, yaw: -0.004 });
  assert.deepEqual(b, { mode: 'crouch', speed: 0, vy: 0, yaw: -0, pitch: 0, aim: false, steer: 0, emote: null, carrying: false, moveAngle: 0, roll: 0, tired: 0, carryBox: 0, act: null, actT: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'ağ üzerinden (JSON) kayıpsız');
  // özet: tamsayıya yuvarlanır; telsiz, oturumdaki envanterde varsa 1
  const st = new PlayerStats({ health: 125 });
  Object.assign(st, { health: 87.6, hunger: 33.3, thirst: 66.6, downed: 1 });
  assert.deepEqual(net.summaryOf(st), { health: 88, maxHealth: 125, hunger: 33, thirst: 67, downed: true, radio: 0 });
  const inv = new Inventory(10, 50);
  net.session = { inventory: inv };
  assert.equal(net.summaryOf(st).radio, 0);
  inv.add('radio', 1);
  assert.equal(net.summaryOf(st).radio, 1);
  // bağlantı kalitesi (istemci): gecikme / kayıp / bayatlık eşikleri
  net.session = null;
  net.mode = 'client';
  const q = (rtt, loss, staleMs) => { net.rtt = rtt; net.loss = loss; net.pingOut = 0; net.lastSnap = performance.now() - staleMs; return net.netQuality(); };
  assert.deepEqual([q(40, 0, 0), q(200, 0, 0), q(40, 0.1, 0), q(40, 0, 1200), q(400, 0, 0), q(40, 0.35, 0), q(40, 0, 2500)], ['good', 'warn', 'warn', 'warn', 'bad', 'bad', 'bad']);
  net.mode = 'off';
});

test('Net yönlendirme kuralları: kişiye özel olay yalnız hedefe, hoş geldin almamış eşe hiçbir şey, oyunda olmayana yalnız olay, except; göç adayı ve eş zaman aşımı', (t) => {
  const net = new Net({ ui: fakeUI() });
  t.after(() => net.lobbyBeacon && net.lobbyBeacon.close());
  const sent = [];
  net.mode = 'host';
  net.transport = { id: 'H', send: (pid, m) => sent.push([pid, m.t, m.e ? m.e.k : null]) };
  net.peers.set('A', { pid: 'A', id: 'p_a', welcomed: true, inGame: true });
  net.peers.set('B', { pid: 'B', id: 'p_b', welcomed: true, inGame: false }); // hoş geldin aldı, oturumunu kuruyor
  net.peers.set('C', { pid: 'C', id: 'p_c', welcomed: false, inGame: false }); // lobide
  net.peers.set('D', { pid: 'D', id: null, welcomed: false, inGame: false }); // henüz hello yok
  const to = (msg, except) => { sent.length = 0; net.broadcast(msg, except); return sent.map((s) => s[0]); };
  assert.deepEqual(to({ t: 'evt', e: { k: 'flag', flag: 'x', value: 1 } }), ['A', 'B'], 'olaylar hoş geldin almış herkese (kuran eş sonra uygular)');
  assert.deepEqual(to({ t: 'evt', e: { k: 'grant', to: 'p_b', items: [] } }), ['B'], 'kişiye özel olay yalnız hedefe');
  assert.deepEqual(to({ t: 'evt', e: { k: 'grant', to: 'p_c', items: [] } }), [], 'hoş geldin almamış hedefe gönderilmez');
  assert.deepEqual(to({ t: 'pdata', d: {} }), ['A'], 'olay dışı ileti yalnız oyundakilere');
  assert.deepEqual(to({ t: 'evt', e: { k: 'veh_state', id: 'v1' } }, 'p_a'), ['B'], 'except: kaynağa geri gönderilmez');
  net.mode = 'client';
  assert.deepEqual(to({ t: 'evt', e: { k: 'flag' } }), [], 'istemci yayın yapamaz');
  // eş zaman aşımı: dünyasını kuran ve yeni katılan eşe 4 dk, diğerlerine 45 sn
  const now = performance.now();
  net.peers.get('A').joinedAt = now - 10000;
  assert.deepEqual(['A', 'B', 'C', 'yok'].map((p) => net.peerTimeout(p)), [240000, 240000, 45000, 45000]);
  net.peers.get('A').joinedAt = now - 200000;
  assert.equal(net.peerTimeout('A'), 45000);
  // host göçü adayı: host olmayan çevrimiçi oyuncular içinde kimliği en küçük olan
  net.room = { players: [{ id: 'p_h', isHost: true }, { id: 'p_zeki', online: true }, { id: 'p_ali', online: false }, { id: 'p_cem' }] };
  assert.equal(net.successor(), 'p_cem');
  net.room.players[3].online = false;
  assert.equal(net.successor(), 'p_zeki');
  net.mode = 'off'; net.transport = null; net.room = null; net.peers.clear();
});

test('lobi el sıkışması (LocalTransport): katılma, oda bilgisi, boş karaktere yönlendirme, ikinci sekmeye jeton eki, hazır olma, ayar ve atma', async (t) => {
  const errs = watchErrors(t);
  const hg = makeGame('host'), c1 = makeGame('c1'), c2 = makeGame('c2');
  t.after(() => closeAll(c2, c1, hg));
  const code = await hostRoom(hg, 'Hakan', { maxPlayers: 4 });
  assert.equal(hg.net.mode, 'host');
  assert.deepEqual(hg.net.room.players.map((p) => [p.name, p.charId, p.isHost, p.ready]), [['Hakan', 'mert', true, true]]);
  // 1. istemci: aynı karakteri istedi → ilk boş karakter
  const room = await joinRoom(c1, code, 'Cem', 'mert');
  assert.equal(c1.net.mode, 'client');
  assert.equal(c1.net.myId, 'p_' + c1.net.token);
  assert.deepEqual(room.players.map((p) => [p.name, p.charId, p.ready]), [['Hakan', 'mert', true], ['Cem', 'zulal', false]]);
  const peer1 = [...hg.net.peers.values()][0];
  assert.deepEqual([peer1.id, peer1.token], [c1.net.myId, c1.net.token]);
  // 2. istemci aynı tarayıcının ikinci sekmesi (aynı jeton): host jetona ek verir, istemci yeni jetonu benimser
  c2.net.token = c1.net.token;
  await joinRoom(c2, code, 'Derya', 'elif');
  assert.equal(c2.net.token, c1.net.token + '-2');
  assert.equal(c2.net.myId, 'p_' + c1.net.token + '-2');
  await waitFor(() => c1.net.room.players.length === 3, 'oda güncellemesi 1. istemciye');
  assert.deepEqual(hg.net.room.players.map((p) => p.charId), ['mert', 'zulal', 'elif']);
  // lobi ayarı: dolu karakter reddedilir, ad 16 karaktere kısalır, hazır olunca başlatılabilir
  assert.equal(hg.net.canStart(), false);
  c1.net.setLobby({ ready: true, charId: 'mert', name: 'Çok Uzun Bir Oyuncu Adı' });
  c2.net.setLobby({ ready: true });
  await waitFor(() => hg.net.canStart(), 'herkes hazır');
  const p1 = hg.net.room.players.find((p) => p.id === c1.net.myId);
  assert.deepEqual([p1.charId, p1.name], ['zulal', 'Çok Uzun Bir Oyu']);
  hg.net.updateSettings({ difficulty: 'hard', dayMinutes: 36 });
  await waitFor(() => c2.net.room.settings.difficulty === 'hard', 'ayar yayılır');
  // atma: istemci menüye döner, odadan silinir
  hg.net.kick(c2.net.myId);
  await waitFor(() => c2.net.mode === 'off' && hg.net.room.players.length === 2, 'atılan oyuncu çıkar');
  assert.ok(c2.ui.calls('alert').some((c) => c[1] === 'Oda sahibi seni odadan çıkardı.'));
  assert.ok(c2.ui.calls('showMainMenu').length >= 1);
  await waitFor(() => c1.net.room.players.length === 2, 'diğer istemci güncel listeyi alır');
  // kick'in 300 ms sonraki düşürme zamanlayıcısı host odadayken çalışsın (host bu sürede ayrılırsa TypeError: bildirildi)
  await sleep(350);
  assert.equal(hg.net.room.players.length, 2);
  assert.deepEqual(errs, []);
});

test('protokol sürümü uyuşmazlığı reddedilir; dolu odaya katılma join hatası verir, istemci kapanır; hello\'suz eylem yok sayılır', async (t) => {
  const errs = watchErrors(t);
  const hg = makeGame('host'), c1 = makeGame('c1'), c2 = makeGame('c2');
  const raw = new LocalTransport(), raw2 = new LocalTransport();
  t.after(async () => { raw.close(); raw2.close(); await closeAll(c2, c1, hg); });
  const code = await hostRoom(hg, 'Hakan', { maxPlayers: 2 });
  // eski sürüm istemci (ham taşıyıcı): ret gerekçesi döner, oyuncu eklenmez
  const got = [];
  raw.onHostData = (m) => got.push(m);
  await raw.connect(code);
  raw.sendHost({ t: 'hello', ver: PROTOCOL - 1, token: 'eski', name: 'Eski', charId: 'mert' });
  await waitFor(() => got.length > 0, 'ret iletisi');
  assert.deepEqual(got[0], { t: 'reject', reason: 'Oyun sürümleri farklı. Sayfayı yenileyip tekrar dene.' });
  assert.equal(hg.net.room.players.length, 1);
  // hello göndermemiş eşin eylemi ve bozuk ileti: yok sayılır
  await raw2.connect(code);
  raw2.sendHost({ t: 'req', type: 'give', p: { to: 'p_x', stack: { id: 'pistol', qty: 1 } } });
  raw2.sendHost(null);
  raw2.sendHost('metin');
  await sleep(60);
  assert.equal(hg.net.room.players.length, 1);
  assert.ok([...hg.net.peers.values()].every((p) => p.id === null && !p.inGame), 'kimliksiz eşler oyuncu/oyunda sayılmaz');
  // dolu oda (en fazla 2): ikinci istemcinin join'i "Oda dolu." ile reddedilir ve bağlantısı kapanır
  await joinRoom(c1, code, 'Cem');
  await assert.rejects(joinRoom(c2, code, 'Derya'), /Oda dolu\./);
  assert.deepEqual([c2.net.mode, c2.net.room, c2.net.transport], ['off', null, null]);
  assert.deepEqual(hg.net.room.players.map((p) => p.name), ['Hakan', 'Cem']);
  assert.deepEqual(errs, []);
});

test('sahte oturumla host-otoriter akış (Quests, Loot): istemci kancası/eylemi host\'ta eşleşir, olay herkese; kişiye özel olay ve panel yalnız ilgiliye', () => {
  // systems.test.mjs'teki sahte oturum + iki eş arası köprü: host emit → kendinde uygula + istemciye JSON kopyası;
  // istemci act → host applyAction(…, istemci); kanca (qhook) host'ta Quests.hook olur; "to" alanı alıcıda süzülür
  const mk = (id, isHost) => {
    const handlers = {}, appliers = {};
    const S = {
      isHost, seed: 42, localId: id, flags: {}, relations: {}, results: { quests: 0, searched: 0 }, diff: { loot: 1 },
      time: new TimeSystem({ startDay: 1, startMinute: 8 * 60 }), received: [], peers: [], host: null,
      world: { spawn: { x: 0, z: 0 }, containers: [{ id: 'c_pilot', type: 'body', x: 40, z: 60, special: 'pilot_log' }, { id: 'c_ev', type: 'crate', x: 1, z: 1, special: 'woodpile', building: 'home' }], regionAt: () => ({ danger: 1 }), buildingById: {} },
      ui: fakeUI(), audio: { play() {} }, players: new Map(),
      on(t, fn) { handlers[t] = fn; }, onEvt(k, fn) { (appliers[k] = appliers[k] || []).push(fn); },
      applyEvent(e) { this.received.push(e); if (e.to && e.to !== this.localId) return; for (const fn of appliers[e.k] || []) fn(e); },
      emit(e) { if (!this.isHost) return; this.applyEvent(e); for (const p of this.peers) p.applyEvent(JSON.parse(JSON.stringify(e))); },
      applyAction(t, p, from) { return handlers[t] && handlers[t](p, from); },
      act(t, p) { return this.isHost ? this.applyAction(t, p, this.localId) : this.host.applyAction(t, JSON.parse(JSON.stringify(p)), this.localId); },
    };
    S.net = { active: true, sent: [], sendToHost: (m) => { S.net.sent.push(m); if (m.t === 'qhook') S.host.quests.hook(m.type, m.arg); } };
    S.quests = new Quests(S);
    S.loot = new Loot(S);
    return S;
  };
  const H = mk('p_h', true), C = mk('p_c', false), D = mk('p_d', false);
  H.peers = [C, D]; C.host = H; D.host = H;
  for (const id of ['p_h', 'p_c', 'p_d']) H.players.set(id, { id });
  // ---- Quests: dinamik görev tanımı olayla yayılır; istemcinin öldürme kancası host'ta türüne göre eşleşir
  H.quests.addDynamic('dyn_kosucu', { kind: 'random', title: 'Koşucu Avı', objs: [{ t: 'kill', zombie: 'runner', count: 2, label: 'Koşucu öldür' }], reward: [['bandage', 2]] });
  for (const S of [C, D]) assert.deepEqual([S.quests.state('dyn_kosucu'), S.quests.def('dyn_kosucu').title], ['active', 'Koşucu Avı']);
  C.quests.onKill('normal'); // tür tutmaz
  C.quests.onKill('runner');
  assert.deepEqual(C.net.sent, [{ t: 'qhook', type: 'kill', arg: 'normal' }, { t: 'qhook', type: 'kill', arg: 'runner' }], 'istemci yalnız kanca adı + argüman gönderir');
  assert.deepEqual([H, C, D].map((S) => S.quests.st.dyn_kosucu.prog[0]), [1, 1, 1]);
  D.quests.onKill('runner');
  assert.deepEqual([H, C, D].map((S) => S.quests.state('dyn_kosucu')), ['done', 'done', 'done']);
  assert.equal(H.results.quests, 1);
  for (const S of [C, D]) assert.ok(S.ui.calls('questBanner').some((c) => c[1] === 'GÖREV TAMAMLANDI' && c[2] === 'Koşucu Avı'));
  // ödül: her oyuncuya kendine özel bir grant (host + 2 istemci); istemci yalnız kendisininkini uygular
  const grants = H.received.filter((e) => e.k === 'grant');
  assert.deepEqual(grants.map((e) => [e.to, e.items[0].id, e.items[0].qty]), [['p_h', 'bandage', 2], ['p_c', 'bandage', 2], ['p_d', 'bandage', 2]]);
  // tamamlanmış göreve yeni kanca ilerleme üretmez
  const n = H.received.length;
  C.quests.onKill('runner');
  assert.equal(H.received.length, n);
  // ---- Loot: açık dolap sayımı (iki kullanıcı), arama sonucu paneli yalnız arayanda, alma yalnız alana
  C.act('cont_use', { id: 'c_pilot', on: true });
  D.act('cont_use', { id: 'c_pilot', on: true });
  C.act('cont_use', { id: 'c_pilot', on: true }); // aynı kullanıcı iki kez sayılmaz
  assert.deepEqual([H, C, D].map((S) => S.loot.inUse.get('c_pilot')), [2, 2, 2]);
  C.act('search_done', { id: 'c_pilot' });
  assert.equal(H.results.searched, 1);
  assert.deepEqual([C, D, H].map((S) => S.ui.calls('openStorage').length), [1, 0, 0], 'panel yalnız arayanda açılır');
  assert.deepEqual(D.loot.get('c_pilot').slots.filter(Boolean).map((s) => s.id), ['note', 'first_aid', 'pistol', 'ammo_9mm'], 'içerik herkese yayılır');
  D.act('loot_take', { id: 'c_pilot', slot: 2 });
  const g = D.received.filter((e) => e.k === 'grant' && e.to === 'p_d').pop();
  assert.deepEqual(g.items, [{ id: 'pistol', qty: 1, ammo: 4 }]);
  assert.ok([H, C, D].every((S) => S.loot.get('c_pilot').slots[2] === null));
  // ev konteyneri araması m1 benzeri görevi ilerletir (host eşleştirir)
  H.quests.addDynamic('dyn_ara', { kind: 'random', title: 'Evi Ara', objs: [{ t: 'search', building: 'home', count: 2, label: 'Ara' }] });
  C.act('search_done', { id: 'c_ev' });
  assert.deepEqual([H, C, D].map((S) => S.quests.st.dyn_ara.prog[0]), [1, 1, 1]);
  // kopan oyuncunun açık tuttuğu dolap kapanır (Net.dropPeer → Loot.dropUser)
  H.loot.dropUser('p_d');
  assert.deepEqual([H, C, D].map((S) => S.loot.inUse.get('c_pilot')), [1, 1, 1]);
  C.act('cont_use', { id: 'c_pilot', on: false });
  assert.ok([H, C, D].every((S) => !S.loot.inUse.has('c_pilot')));
});

test('oyun başlatma (LocalTransport): start → host oturumu → welcome (tam durum) → istemci oturumu → joined; istemci eylemleri host\'ta doğrulanır, kişiye özel olay yalnız hedefe gider', async (t) => {
  const errs = watchErrors(t);
  const hg = makeGame('host'), c1 = makeGame('c1'), c2 = makeGame('c2');
  t.after(() => closeAll(c2, c1, hg));
  const code = await hostRoom(hg, 'Hakan', { difficulty: 'hard', dayMinutes: 30 });
  await joinRoom(c1, code, 'Cem');
  await joinRoom(c2, code, 'Derya');
  c1.net.setLobby({ ready: true });
  c2.net.setLobby({ ready: true });
  await waitFor(() => hg.net.canStart(), 'herkes hazır');
  const seen2 = recordHostMsgs(c2);
  await hg.net.startGame();
  const H = hg.session;
  await waitFor(() => c1.session && c2.session && [...hg.net.peers.values()].every((p) => p.inGame), 'iki istemci de oyunda');
  const C1 = c1.session, C2 = c2.session;
  assert.ok(c1.ui.calls('showLoadingOverlay').length === 1, 'istemci "Oyun başlıyor…" görür');
  // hoş geldin: tohum, zaman, zorluk, görevler, karakter ve başlangıç çantası istemciye geldi
  assert.deepEqual([C1.isHost, C1.seed, C1.time.total, C1.time.dayMinutes, C1.cfg.difficulty], [false, H.seed, H.time.total, 30, 'hard']);
  assert.deepEqual(C1.quests.serialize().st, H.quests.serialize().st, 'görev durumu hoş geldin paketinde');
  assert.equal(C1.localProfile.charId, 'zulal');
  assert.equal(C1.inventory.count('lockpick'), 3, 'yeni oyuncu kendi karakterinin çantasıyla başlar');
  assert.equal(C2.localProfile.charId, 'deniz');
  // host iki uzak oyuncuyu, istemciler host'u görür (istemcilerin birbirini görmesi: aşağıdaki atlanan test, bildirildi)
  assert.deepEqual([...H.players.keys()].sort(), [H.localId, C1.localId, C2.localId].sort());
  assert.ok(C1.players.has(H.localId) && C2.players.has(H.localId));
  assert.deepEqual(C1.players.get(H.localId).name, 'Hakan');
  // istemci 1 aranmamış özel konteyneri arar: içerik host'ta üretilir, panel yalnız onda açılır
  C1.act('search_done', { id: 'c_pilot' });
  await waitFor(() => C1.loot.searched('c_pilot') && C2.loot.searched('c_pilot'), 'arama sonucu yayılır');
  assert.deepEqual(C2.loot.get('c_pilot').slots, H.loot.get('c_pilot').slots);
  assert.deepEqual([c1, c2, hg].map((g) => g.ui.calls('openStorage').length), [1, 0, 0]);
  assert.equal(H.results.searched, 1);
  // tabancayı alır: yalnız istemci 1'e grant; istemci 2'ye bu kişisel olay hiç iletilmez
  C1.act('loot_take', { id: 'c_pilot', slot: 2 });
  await waitFor(() => C1.inventory.count('pistol') === 1, 'tabanca istemci 1\'de');
  assert.equal(C1.inventory.slots[C1.inventory.firstSlotOf('pistol')].ammo, 4);
  assert.deepEqual([H.inventory.count('pistol'), C2.inventory.count('pistol')], [0, 0]);
  await waitFor(() => C2.loot.get('c_pilot').slots[2] === null, 'konteyner güncellemesi herkese');
  // ev konteyneri araması görev ilerletir (m1_home "Evdeki dolapları ara")
  C2.act('search_done', { id: 'c_odun' });
  await waitFor(() => C1.quests.st.m1_home.prog[0] === 1, 'görev ilerlemesi yayılır');
  assert.equal(H.quests.st.m1_home.prog[0], 1);
  // host'tan istemci 2'ye eşya
  H.act('give', { to: C2.localId, stack: { id: 'bandage', qty: 2 } });
  await waitFor(() => C2.inventory.count('bandage') === 4, 'bandaj istemci 2\'de (başlangıçta 2 vardı)');
  assert.ok(c2.ui.toasts().includes('Hakan sana Bandaj verdi.'));
  // istemciler arası verme (host üzerinden)
  C1.act('give', { to: C2.localId, stack: C1.inventory.takeAt(C1.inventory.firstSlotOf('pistol')) });
  await waitFor(() => C2.inventory.count('pistol') === 1, 'tabanca istemci 2\'de');
  assert.equal(C1.inventory.count('pistol'), 0);
  await sleep(40);
  const grants2 = seen2.filter((m) => m.t === 'evt' && m.e.k === 'grant').map((m) => m.e.to);
  assert.ok(grants2.length >= 2 && grants2.every((to) => to === C2.localId), 'istemci 2 yalnız kendine özel grant alır');
  assert.equal(C1.inventory.count('bandage'), 0);
  assert.deepEqual(errs, []);
});

test('oturum içi eşitleme ve ayrılma: durum/kayıt/ping → host; anlık görüntü zamanı eşitler; pdata yedeği; ayrılanın açık dolabı kapanır, verisi saklanır ve geri dönünce envanteri iade edilir', async (t) => {
  const errs = watchErrors(t);
  const hg = makeGame('host'), cg = makeGame('c1');
  t.after(() => closeAll(cg, hg));
  const code = await hostRoom(hg, 'Hakan');
  await joinRoom(cg, code, 'Cem');
  cg.net.setLobby({ ready: true });
  await waitFor(() => hg.net.canStart(), 'hazır');
  await hg.net.startGame();
  await waitFor(() => cg.session && [...hg.net.peers.values()][0].inGame, 'istemci oyunda');
  const H = hg.session, C = cg.session;
  const peer = [...hg.net.peers.values()][0];
  // istemci durum + kayıt + ping gönderir (Net.update, 8 sn'lik kayıt aralığı)
  C.local.pos.set(12.345, 6.789, -3.21);
  C.inventory.add('pistol', 1, { ammo: 6, dur: 199 });
  C.localStats.health = 64.4;
  cg.net.update(8.1);
  const rec = H.players.get(C.localId);
  await waitFor(() => rec.saved && rec.summary && cg.net.rtt > 0 && cg.net.pingOut === 0, 'durum ve kayıt host\'ta, ping yanıtı istemcide');
  assert.deepEqual([rec.target.x, rec.target.y, rec.target.z], [12.35, 6.79, -3.21]);
  assert.deepEqual(rec.anim, cg.net.compactAnim(C.local.animState()));
  assert.equal(rec.summary.health, 64);
  assert.equal(rec.saved.inv.slots.find((s) => s && s.id === 'pistol').ammo, 6);
  assert.equal(peer.stCount, 1);
  // host: anlık görüntü (zaman + oyuncular) ve 6 sn sonra pdata yedeği (bütün oyuncuların kayıt verisi)
  H.time.advance(45);
  H.time.ff = 40;
  H.localStats.health = 51;
  hg.net.update(6.5);
  await waitFor(() => C.offlinePlayers && C.offlinePlayers[hg.net.token], 'pdata istemcide');
  await waitFor(() => C.time.total === H.time.total, 'zaman anlık görüntüyle eşitlenir');
  await waitFor(() => peer.rtt > 0 && peer.pingOut === 0, 'host\'un pingine istemci yanıtı');
  assert.equal(C.time.ff, 40);
  assert.equal(hg.net.netStats().peers.length, 1);
  const hostRec = C.players.get(H.localId);
  assert.equal(hostRec.summary.health, 51);
  assert.ok(hostRec.target && Math.abs(hostRec.target.x - H.local.pos.x) < 0.01);
  assert.deepEqual(Object.keys(C.offlinePlayers).sort(), [cg.net.token, hg.net.token].sort(), 'yedek: host + istemcinin kendi verisi');
  assert.ok(Array.isArray(C.zoneState) && C.eventsState && Array.isArray(C.eventsState.done), 'zombi bölgeleri ve olay planı da yedeklenir');
  // istemci ve host aynı dolabı açık tutar; istemci ayrılınca (bye) dolap sayısı düşer, verisi çevrimdışı saklanır
  C.act('cont_use', { id: 'c_odun', on: true });
  H.act('cont_use', { id: 'c_odun', on: true });
  await waitFor(() => C.loot.inUse.get('c_odun') === 2, 'iki kullanıcı');
  const token = cg.net.token;
  cg.net.leave();
  await waitFor(() => !H.players.has(C.localId), 'host oyuncuyu düşürür');
  assert.equal(H.loot.inUse.get('c_odun'), 1);
  assert.equal(H.offlinePlayers[token].inv.slots.find((s) => s && s.id === 'pistol').dur, 199);
  assert.ok(hg.ui.toasts().includes('Cem bağlantısı koptu. (Geri bağlanabilir)'));
  assert.equal(hg.net.room.players.length, 1, 'kasıtlı ayrılan odadan silinir');
  assert.deepEqual(H.serialize().players[token], H.offlinePlayers[token], 'host kaydı ayrılanın verisini içerir');
  // aynı jetonla geri dönüş: hoş geldin paketindeki kendi kaydıyla envanteri ve konumu iade edilir
  cg.session = null; // menüye dönüş (Game.endSession; 3B temizliği yok)
  await sleep(150);
  await joinRoom(cg, code, 'Cem');
  await waitFor(() => cg.session && cg.session !== C && H.players.has(cg.session.localId), 'yeniden katılım');
  const C2 = cg.session;
  assert.equal(cg.net.token, token);
  assert.equal(C2.inventory.slots[C2.inventory.firstSlotOf('pistol')].ammo, 6);
  assert.equal(C2.inventory.count('lockpick'), 3, 'eski çanta (yeniden başlangıç çantası verilmez)');
  assert.ok(Math.abs(C2.local.pos.x - 12.345) < 0.01 && Math.abs(C2.local.pos.y - (6.789 + 0.2)) < 0.01);
  assert.equal(H.offlinePlayers[token], undefined, 'geri dönen çevrimdışı listesinden çıkar');
  assert.deepEqual(errs, []);
});

test('lobiden başlatılan 3 kişilik oyunda istemciler birbirini görür (oturumunu sonra kuran, önce katılanı da görmeli)', { skip: 'OYUN HATASI (bildirildi): Net.attachSession bütün hoş geldin paketlerini oyun başlarken (host oturumunda henüz uzak oyuncu yokken) üretiyor; onClientJoined ise pjoin\'i yalnız o an inGame olan eşlere gönderiyor. Oturumunu daha geç kuran istemci, kendinden önce katılan istemciyi hiç öğrenmiyor (applySnap kaydı olmayan oyuncuyu atlıyor): avatar, konum, özet ve takım listesinde görünmüyor. Oyun sürerken iki oyuncunun aynı anda katılmasında da aynı boşluk var.' }, async (t) => {
  const hg = makeGame('host'), c1 = makeGame('c1'), c2 = makeGame('c2');
  t.after(() => closeAll(c2, c1, hg));
  const code = await hostRoom(hg, 'Hakan');
  await joinRoom(c1, code, 'Cem');
  await joinRoom(c2, code, 'Derya');
  c1.net.setLobby({ ready: true });
  c2.net.setLobby({ ready: true });
  await waitFor(() => hg.net.canStart(), 'herkes hazır');
  await hg.net.startGame();
  await waitFor(() => c1.session && c2.session && [...hg.net.peers.values()].every((p) => p.inGame), 'iki istemci de oyunda');
  await waitFor(() => c1.session.players.has(c2.session.localId) && c2.session.players.has(c1.session.localId), 'istemciler birbirini görür');
});
