// Oturum: bir oyunun tüm dinamik durumu ve sistemleri.
// Mimari: ev sahibi (host) otoritedir. Her durum değişikliği bir "eylem" (act) ile istenir;
// host eylemi doğrular, sonucu "olay" (evt) olarak üretir ve tüm oyunculara yayınlar. Tek oyunculu
// modda oyuncu kendi host'udur: aynı kod yolu çalışır (ileride dedicated server'a taşınabilir).
import * as THREE from 'three';
import { RNG, clamp, dist, uid } from './core/util.js';
import { Settings } from './core/Settings.js';
import { TimeSystem } from './systems/TimeSystem.js';
import { PlayerStats } from './systems/PlayerStats.js';
import { Inventory } from './systems/Inventory.js';
import { Player } from './entities/Player.js';
import { Avatar } from './entities/Avatar.js';
import { ITEMS, makeStack } from './data/items.js';
import { CHARACTERS } from './entities/CharacterFactory.js';
import { Loot } from './systems/Loot.js';
import { GroundItems } from './systems/GroundItems.js';
import { PhysProps } from './systems/PhysProps.js';
import { DoorPhysics } from './physics/DoorPhysics.js';
import { Drawers } from './physics/Drawers.js';
import { Fronts } from './systems/Fronts.js';
import { DayThreats } from './systems/DayThreats.js';
import { installBuoyancy } from './physics/Buoyancy.js';
import { ContactSounds } from './physics/ContactSounds.js';
import { Interact } from './systems/Interact.js';
import { Effects } from './systems/Effects.js';
import { Birds, SmokeColumns } from './world/LivingWorld.js';
import { Papers, HangingSigns } from './world/StreetLife.js';
import { SMOKE_SITES } from './world/WorldLayout.js';
import { Combat } from './systems/Combat.js';
import { Zombies } from './systems/Zombies.js';
import { Build } from './systems/Build.js';
import { Vehicles } from './systems/Vehicles.js';
import { NPCs } from './systems/NPCs.js';
import { Quests } from './systems/Quests.js';
import { Events } from './systems/Events.js';
import { Endings } from './systems/Endings.js';
import { MapSystem } from './systems/MapSystem.js';
import { Weather } from './systems/Weather.js';
import { Bots } from './systems/Bots.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { Crafting } from './systems/Crafting.js';
import { Timeline } from './systems/Timeline.js';
import { StoryWorld } from './systems/StoryWorld.js';
import { BIOME } from './world/Terrain.js';

export const DIFFICULTY = {
  easy: { name: 'Kolay', zombies: 0.7, dmg: 0.65, needs: 0.8, loot: 1.3 },
  normal: { name: 'Normal', zombies: 1, dmg: 1, needs: 1, loot: 1 },
  hard: { name: 'Zor', zombies: 1.35, dmg: 1.35, needs: 1.2, loot: 0.8 },
};

export class Session {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.world = game.world;
    this.audio = game.audio;
    this.ui = game.ui;
    this.env = game.env;
    this.net = game.net;
    this.isHost = cfg.mode !== 'client';
    this.seed = cfg.seed || Math.floor(Math.random() * 1e9);
    this.rng = new RNG(this.seed);
    this.diff = DIFFICULTY[cfg.difficulty || 'normal'];
    this.time = new TimeSystem({ dayMinutes: cfg.dayMinutes || Settings.get('gameplay.dayMinutes') || 24, startDay: 1, startMinute: 8 * 60 });
    this.handlers = {};
    this.appliers = {};
    this.flags = {};
    this.relations = { neighbors: 10, military: 0, traders: 10, raiders: -10 };
    this.results = { kills: 0, searched: 0, resources: 0, quests: 0, rescued: 0, vehicles: new Set(), choices: [], built: 0, deaths: 0, crafted: 0 };
    this.players = new Map(); // id → kayıt
    this.localId = cfg.localId || 'p_' + uid();
    this.token = cfg.token || this.localId;
    this.t = 0;
    this.paused = false;
    this.disposed = false;
    this.sleepVotes = new Set();
  }

  async start() {
    const cfg = this.cfg;
    // ---- yerel oyuncu
    const prof = cfg.local;
    const cdef = CHARACTERS[prof.charId] || CHARACTERS.mert;
    const look = { ...cdef.look, ...(prof.look || {}) };
    this.localProfile = { id: this.localId, name: prof.name, charId: cdef.id, look, stats: cdef.stats };
    this.localStats = new PlayerStats(cdef.stats, this.diff.needs);
    this.inventory = new Inventory(30, 30 * (cdef.stats.carry || 1));
    this.equipment = { back: null, body: null, head: null, body2: null, hands: null };
    this.hotbarIndex = 0;
    this.local = new Player(this, this.localProfile);
    this.game.scene.add(this.local.root);
    // ---- sistemler
    this.fx = new Effects(this);
    // yaşayan dünya: karga sürüleri ve yanan enkazlardan tüten duman sütunları
    // kuşların konabileceği yerler: bina çatıları (sürü ara ara iner, oyuncu yaklaşınca havalanır)
    const perches = [];
    for (const b of this.world.buildings) if (b.box && b.roofTopY) perches.push({ x: (b.box.minX + b.box.maxX) / 2, y: b.roofTopY + 0.08, z: (b.box.minZ + b.box.maxZ) / 2, r: Math.max(1.5, Math.min(b.box.maxX - b.box.minX, b.box.maxZ - b.box.minZ) * 0.3) });
    const T = this.world.terrain;
    const URBAN_IDS = new Set(['sehir', 'hastane', 'benzin', 'mahalle', 'liman', 'sanayi', 'tatil', 'havaalani']);
    // asma dükkân tabelaları: tabela konumlarının yanında, duvara dik (sırayla sağ/sol)
    const hang = [];
    (this.world.signSpots || []).forEach((sp, i) => {
      if (sp.kind !== 'sign' || i % 2) return;
      const side = (i >> 1) % 2 ? 1 : -1, ax = Math.cos(sp.ry) * side, az = -Math.sin(sp.ry) * side;
      hang.push({ x: sp.x + ax * 1.6, y: Math.min(sp.y - 0.2, T.heightAt(sp.x, sp.z) + 3.1), z: sp.z + az * 1.6, ry: sp.ry });
    });
    this.living = {
      birds: new Birds(this.game.scene, [
        { x: 100, z: -20, alt: 42, r: 34, n: 14, v: 7 }, { x: -235, z: -160, alt: 36, r: 40, n: 12, v: 6, dir: -1 },
        { x: -640, z: 120, alt: 30, r: 36, n: 10, v: 6 }, { x: -205, z: 185, alt: 34, r: 26, n: 8, v: 5.5, dir: -1 },
        { x: 330, z: 300, alt: 26, r: 30, n: 10, v: 6.5 }, { x: 120, z: -760, alt: 40, r: 50, n: 12, v: 7, dir: -1 },
      ], perches),
      smoke: new SmokeColumns(this.game.scene, SMOKE_SITES.map(([x, z], i) => ({ x, z, y: this.world.terrain.heightAt(x, z) + 0.8, h: 34 + i * 3, life: 14 + i, size: 2.8 + (i % 3) * 0.6, dense: 0.95 })), 26),
      papers: new Papers(this.game.scene, 40, (x, z) => T.heightAt(x, z), (x, z) => { const r = T.regionAt(x, z); return !!(r && URBAN_IDS.has(r.id)); }),
      signs: new HangingSigns(this.game.scene, hang.slice(0, 96)),
    };
    this.loot = new Loot(this);
    this.ground = new GroundItems(this);
    if (this.game.phys) {
      this.contacts = new ContactSounds(this.game.phys, () => this.audio);
      this.buoyancyOff = installBuoyancy(this.game.phys, this.world.terrain);
    }
    this.props = new PhysProps(this);
    this.doorPhys = this.game.phys ? new DoorPhysics(this) : null;
    this.drawers = this.game.phys ? new Drawers(this) : null;
    this.fronts = new Fronts(this); // dolap kanatları, buzdolabı/fırın kapakları, sandık kapakları (görsel, eşitlenir)
    this.dayThreats = new DayThreats(this); // gündüz: yağmacı devriyeleri, başıboş köpekler, alacakaranlık/şafak duyuruları
    this.build = new Build(this);
    this.zombies = new Zombies(this);
    this.vehicles = new Vehicles(this);
    this.npcs = new NPCs(this);
    this.combat = new Combat(this);
    this.interact = new Interact(this);
    this.quests = new Quests(this);
    this.events = new Events(this);
    this.endings = new Endings(this);
    this.map = new MapSystem(this);
    this.weather = new Weather(this);
    this.bots = new Bots(this);
    this.saves = new SaveSystem(this);
    this.crafting = new Crafting(this);
    this.timeline = new Timeline(this);
    this.storyWorld = new StoryWorld(this);
    this.registerCore();
    this.storyWorld.init();
    // ses oklüzyonu: dinleyici ile kaynak arasında görüşü kesen yapı var mı
    this.audio.occluder = (at) => { const L = this.audio.listener; return !this.world.physics.lineOfSight(L.x, L.y, L.z, at.x, (at.y ?? L.y) + 0.8, at.z); };
    this.players.set(this.localId, { id: this.localId, name: prof.name, charId: cdef.id, look, isLocal: true, token: this.token, pos: this.local.pos, summary: null });
    // ---- başlangıç
    if (cfg.save && this.isHost) {
      this.load(cfg.save);
    } else if (cfg.mode === 'client' && cfg.welcome) {
      this.applyWelcome(cfg.welcome);
    } else {
      this.newGame(cdef);
    }
    this.time.on((type, d) => this.onTime(type, d));
    if (cfg.mode !== 'single') this.net.attachSession(this);
    this.game.input.wantLock = true;
    this.ui.toast(cfg.mode === 'client' ? 'Odaya bağlanıldı. İyi şanslar!' : '30 günün kaldı. Arkadaşlarını topla. Hazırlan. Hayatta kal.', 'story', 6);
  }

  /** Pencerelerin başlangıç durumu: bina durumuna göre (InteriorDress) bir kısmı kırık ya da tahtalı. Yeni oyunda ve
   *  kayıt yüklenmeden önce uygulanır; kayıt yalnız bu tabandan sapan pencereleri taşır. */
  applyInitialWindows() {
    for (const w of this.world.windows) this.interact.applyWindowState(w, { broken: !!w.initBroken, barricade: w.initBarricade || 0, hp: w.maxHp }, true);
  }

  newGame(cdef) {
    this.applyInitialWindows();
    const sp = this.world.spawn;
    const off = this.cfg.spawnOffset || 0;
    this.local.spawnAt(sp.x + off, sp.y, sp.z, sp.rot);
    for (const [id, n, data] of cdef.start) this.inventory.add(id, n, data || null, true);
    this.inventory.add('water_bottle', 2, null, true);
    this.inventory.add('canned_food', 1, null, true);
    if (cdef.id === 'deniz') this.equip('vest');
    this.loot.init();
    this.build.init();
    this.zombies.init();
    this.vehicles.init();
    this.npcs.init();
    this.quests.init();
    this.events.init();
    if (this.cfg.aiTeammates) this.bots.spawn(this.cfg.aiTeammates);
    this.selectHotbar(0);
  }

  // ======================================================================= eylem hattı
  on(type, fn) { this.handlers[type] = fn; }
  onEvt(k, fn) { (this.appliers[k] = this.appliers[k] || []).push(fn); }

  /** Durum değiştiren bir eylem iste */
  act(type, payload = {}) {
    if (this.isHost) return this.applyAction(type, payload, this.localId);
    this.net.sendToHost({ t: 'req', type, p: payload });
    return null;
  }

  applyAction(type, p, from) {
    const h = this.handlers[type];
    if (!h) { console.warn('Bilinmeyen eylem', type); return null; }
    try { return h(p, from); } catch (e) { console.error('Eylem hatası', type, e); return null; }
  }

  /** Host: olay üret → yerelde uygula + yayınla */
  emit(evt, opts = {}) {
    if (!this.isHost) return;
    this.applyEvent(evt);
    if (this.net.active) this.net.broadcast({ t: 'evt', e: evt }, opts.except);
  }

  applyEvent(evt) {
    if (evt.to && evt.to !== this.localId) return;
    const list = this.appliers[evt.k];
    if (list) for (const fn of list) { try { fn(evt); } catch (e) { console.error('Olay uygulama hatası', evt.k, e); } }
  }

  registerCore() {
    // eşya verme (belirli oyuncuya)
    this.onEvt('grant', (e) => {
      for (const s of e.items) {
        if (ITEMS[s.id] && ITEMS[s.id].spoil && s.t0 === undefined) s.t0 = Math.round(this.time.total);
        const left = this.inventory.addStack({ ...s });
        if (left > 0) { this.act('ground_drop', { stack: { ...s, qty: left }, x: this.local.pos.x, y: this.local.pos.y, z: this.local.pos.z }); this.ui.toast('Envanter dolu! Eşya yere bırakıldı.', 'warn'); }
        else if (!e.silent) this.ui.itemToast(s.id, s.qty);
        this.results.resources += s.qty;
        this.quests.onCollect(s.id);
      }
    });
    this.onEvt('flag', (e) => { this.flags[e.flag] = e.value; this.quests.onFlag(e.flag); });
    this.onEvt('rel', (e) => { this.relations[e.faction] = clamp((this.relations[e.faction] || 0) + e.delta, -100, 100); this.quests.onFlag('rel:' + e.faction); });
    this.onEvt('toast', (e) => this.ui.toast(e.text, e.kind || 'info', e.dur));
    this.onEvt('noise', (e) => { if (this.zombies) this.zombies.hearNoise(e.x, e.z, e.r, e.src); if (e.r > 25 && this.living) this.living.birds.scare(e.x, e.z, e.r); });
    this.onEvt('dmg_player', (e) => { this.damageLocal(e.amount, e.kind, e.from); if (Array.isArray(e.push) && !this.localStats.downed && this.local.mode !== 'drive') { this.local.vel.x += e.push[0]; this.local.vel.z += e.push[1]; this.local.vel.y = Math.max(this.local.vel.y, e.push[2] || 0); } if (e.grab && !this.localStats.downed && this.local.mode !== 'drive') { this.local.grabT = 1.1; this.ui.toast('Bir zombi seni yakaladı! Kurtul!', 'danger', 1.2); } });
    this.onEvt('revived', (e) => {
      if (e.target === this.localId) { this.audio.play('revive', { vol: 0.7 }); this.localStats.revive(e.hp || 30); this.local.mode = 'ground'; this.local.carriedBy = null; if (this.local.body && !this.local.body.enabled) { this.local.body.setEnabled(true); this.local.pos.y = this.world.physics.groundHeight(this.local.pos.x, this.local.pos.z, this.local.pos.y + 0.5); this.local.syncBody(); } this.ui.toast(`${e.byName} seni ayağa kaldırdı!`, 'good'); }
      if (this.local.carrying === e.target) { this.local.carrying = null; this.selectHotbar(this.hotbarIndex); }
    });
    this.onEvt('time', (e) => { this.time.set(e.total); });
    this.onEvt('sleep', (e) => { this.time.ff = e.ff; this.sleepState = e; });
    this.on('flag', (p, from) => { const v = p.add ? (this.flags[p.flag] || 0) + p.add : p.value ?? true; this.emit({ k: 'flag', flag: p.flag, value: v }); });
    this.on('rel', (p) => this.emit({ k: 'rel', faction: p.faction, delta: p.delta }));
    this.on('noise', (p) => this.emit({ k: 'noise', x: p.x, z: p.z, r: p.r, src: p.src }));
    this.on('revive', (p, from) => {
      const fromName = this.players.get(from)?.name || this.bots.byId(from)?.name || 'Takım arkadaşı';
      this.emit({ k: 'revived', target: p.target, hp: p.hp || 30, byName: fromName });
      if (p.target.startsWith('bot_')) this.bots.revive(p.target);
    });
    // yaralı arkadaşı sırtlama: hedef yerdeyse taşıyıcı atanır; bırakınca serbest kalır
    this.on('carry', (p, from) => {
      if (p.drop) { this.emit({ k: 'carry', target: p.target, by: null, from }); return; }
      const bot = this.bots.byId(p.target);
      const rec = this.players.get(p.target);
      const downed = bot ? bot.stats.downed : rec ? (rec.isLocal ? this.localStats.downed : rec.summary && rec.summary.downed) : false;
      if (!downed || (bot && bot.carriedBy) || (rec && rec.carriedBy)) return;
      this.emit({ k: 'carry', target: p.target, by: from });
    });
    this.onEvt('carry', (e) => {
      const name = (id) => (this.players.get(id) || this.bots.byId(id) || {}).name || 'Takım arkadaşı';
      if (e.by === this.localId) { this.local.carrying = e.target; this.local.avatar.hold(null); this.ui.toast(`${name(e.target)} sırtında. Güvenli yere götür, ${this.game.input.label('reload')} ile bırak, E ile kaldır.`, 'info', 5); }
      if (!e.by && this.local.carrying === e.target) { this.local.carrying = null; this.selectHotbar(this.hotbarIndex); }
      if (e.target === this.localId) { this.local.carriedBy = e.by; if (e.by) this.ui.toast(`${name(e.by)} seni sırtladı.`, 'good'); else if (this.local.mode === 'carried') this.local.mode = 'downed'; }
      const rec = this.players.get(e.target); if (rec) rec.carriedBy = e.by;
      const bot = this.bots.byId(e.target); if (bot) bot.carriedBy = e.by;
    });
    this.on('sleep_vote', (p, from) => this.sleepVote(from, p.on));
    this.on('chat', (p, from) => this.emit({ k: 'chat', from, name: this.players.get(from)?.name || '?', text: String(p.text).slice(0, 160) }));
    this.onEvt('chat', (e) => this.ui.chatMessage(e.name, e.text));
    this.on('ping', (p, from) => this.emit({ k: 'ping', from, x: p.x, y: p.y, z: p.z, label: p.label, name: this.players.get(from)?.name || '?' }));
    this.onEvt('ping', (e) => { this.fx.ping(e.x, e.y, e.z, e.name, e.label); this.map.addPing(e.x, e.z, e.name); this.audio.play('click', { vol: 0.6 }); });
    this.on('give', (p, from) => {
      // eşyayı başka oyuncuya ilet
      if (p.to.startsWith('bot_')) { this.bots.receive(p.to, p.stack); return; }
      this.emit({ k: 'grant', to: p.to, items: [p.stack] });
      this.emit({ k: 'toast', to: p.to, text: `${this.players.get(from)?.name || 'Biri'} sana ${ITEMS[p.stack.id]?.name} verdi.`, kind: 'good' });
    });
  }

  // ======================================================================= ana güncelleme
  /** Oyun zamanına bağlı gecikmeli çağrı (duraklatmada bekler; oturum kapanınca iptal) */
  later(sec, fn) { (this.timers || (this.timers = [])).push({ t: sec, fn }); }

  updateTimers(dt) {
    const L = this.timers;
    if (!L || !L.length) return;
    for (let i = L.length - 1; i >= 0; i--) {
      L[i].t -= dt;
      if (L[i].t <= 0) { const f = L[i].fn; L.splice(i, 1); try { f(); } catch (e) { console.error(e); } }
    }
  }

  update(dt) {
    if (this.disposed) return;
    const ui = this.ui;
    const input = this.game.input;
    const blocking = ui.isBlocking();
    input.wantLock = !blocking && !this.endings.active;
    if (blocking && input.locked) input.releaseLock();
    if (this.paused && !this.net.active) { this.renderOnly(dt); return; }
    this.t += dt;
    // zaman (host)
    if (this.isHost) {
      const mins = this.time.update(dt);
      this.tickNeeds(mins);
      this.build.tick(mins, dt);
      this.weather.update(dt, mins);
    } else {
      this.time.total += dt * this.time.rate * this.time.ff;
      this.tickNeeds(dt * this.time.rate * this.time.ff);
      this.weather.blend(dt);
    }
    // yerel oyuncu
    const pl = this.local;
    if (pl.vault) pl.stepVault(dt);
    else if (pl.mode === 'drive' || pl.mode === 'seat') this.vehicles.updateLocalDriving(dt, input, blocking);
    else pl.update(dt, input, blocking);
    // sabit adımlı fizik (oyuncu kapsülü, araçlar, dinamik nesneler) + enterpolasyonlu çizim
    this.game.phys.update(dt);
    if (this.doorPhys) this.doorPhys.update(dt);
    if (this.drawers) this.drawers.update(dt);
    if (this.fronts) this.fronts.update(dt);
    this.updateTimers(dt);
    if (pl.mode === 'drive' || pl.mode === 'seat') this.vehicles.postPhysicsLocal(dt);
    else pl.postPhysics(dt);
    if (pl.carriedBy) this.followCarrier(pl);
    if (pl.carryProp) pl.updateCarry(); // taşınan nesne: oyuncunun bu karedeki son konumuyla
    this.local.inside = this.world.buildingAt(pl.pos.x, pl.pos.z, pl.pos.y);
    this.combat.update(dt, input, blocking);
    this.interact.update(dt, input, blocking);
    this.handleHotkeys(input, blocking);
    this.build.localUpdate(dt);
    pl.avatar.update(dt, pl.animState());
    // dünya sistemleri
    this.zombies.update(dt);
    this.dayThreats.update(dt);
    this.vehicles.update(dt);
    this.npcs.update(dt);
    this.bots.update(dt);
    this.ground.update(dt);
    this.props.update(dt);
    this.storyWorld.update(dt);
    this.fx.update(dt);
    this.quests.update(dt);
    this.events.update(dt);
    this.endings.update(dt);
    this.map.update(dt);
    this.updateRemotes(dt);
    this.props.followRemoteCarriers();
    this.updateDowned(dt);
    this.renderOnly(dt);
  }

  /** Taşınan (yerdeki) yerel oyuncu taşıyıcının omzunda */
  followCarrier(pl) {
    const c = this.players.get(pl.carriedBy);
    const cpos = c ? (c.isLocal ? this.local.pos : c.pos) : null;
    if (!cpos || !this.localStats.downed) {
      pl.carriedBy = null;
      if (pl.mode === 'carried') pl.mode = this.localStats.downed ? 'downed' : 'ground';
      if (pl.body) { pl.body.setEnabled(true); pl.pos.y = this.world.physics.groundHeight(pl.pos.x, pl.pos.z, pl.pos.y + 0.5); pl.syncBody(); }
      return;
    }
    const yaw = c.anim ? c.anim.yaw || 0 : c.isLocal ? this.local.yaw : 0;
    pl.pos.set(cpos.x - Math.sin(yaw) * 0.1, cpos.y + 1.2, cpos.z - Math.cos(yaw) * 0.1);
    pl.vel.set(0, 0, 0);
    pl.root.position.copy(pl.pos);
    pl.yaw = yaw + Math.PI / 2;
    pl.mode = 'carried';
    if (pl.body && pl.body.enabled) pl.body.setEnabled(false); // taşıyanı itmesin
    pl.updateCamera(1 / 60);
  }

  renderOnly(dt) {
    const pl = this.local;
    const cam = this.game.gfx.camera;
    const region = this.world.regionAt(pl.pos.x, pl.pos.z);
    this.region = region;
    this.env.update(dt, this.game.time, this.time.minuteOfDay, pl.pos, region);
    this.world.vegetation.update(cam.position, Settings.get('graphics.viewDistance'), Settings.get('graphics.grass'), dt, Settings.get('graphics.quality'));
    if (this.living) {
      const windMul = this.env && this.env.weather ? 1 + this.env.weather.storm * 2 + this.env.weather.rain * 0.5 : 1;
      this.living.birds.update(dt, (x, z) => this.world.terrain.heightAt(x, z), pl.pos);
      this.living.smoke.update(dt, windMul);
      this.living.papers.update(dt, pl.pos, windMul);
      this.living.signs.update(dt, windMul);
    }
    this.world.instancer.cull(cam.position, Settings.get('graphics.viewDistance'));
    this.world.cullInteriors(cam.position, dt);
    this.updateRoofs();
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, Math.atan2(cam.position.x - pl.pos.x, cam.position.z - pl.pos.z) + Math.PI);
    this.audio.setEnvironment(!!pl.inside);
    this.updateAmbience(dt);
  }

  /** İçindeki binanın çatısını gizle (kesit görünüm; birleşik çatılarda gölgelendirici kırpar) */
  updateRoofs() {
    this.world.setRoofHidden(this.local.inside || null);
  }

  updateAmbience(dt) {
    const a = this.audio;
    const W = this.env.weather;
    const night = this.time.isNight;
    a.loop('amb_wind', 'wind', { vol: 0.08 + W.storm * 0.35 + W.rain * 0.05, bus: 'ambient' });
    a.loop('amb_rain', 'rain', { vol: W.rain * 0.45 * (this.local.inside ? 0.5 : 1), bus: 'ambient' });
    a.loop('amb_day', 'ambience', { vol: night ? 0.05 : 0.22 * (1 - W.rain), bus: 'ambient' });
    this._sirenT = (this._sirenT ?? 20) - dt;
    if (this._sirenT < 0) { this._sirenT = 25 + Math.random() * 40; if (this.time.day < 20) a.play('siren', { vol: 0.5, bus: 'ambient' }); }
    // uzaktan gelen olay sesleri (köpek havlaması, tek tük silah, çığlık, inilti, korna): görüş dışındaki dünya da
    // yaşıyor; 140–300 m ötede rastgele yönde konumlanır (süzgeçli, yönlü), oyunun gürültü sistemine girmez
    this._distT = (this._distT ?? 15) - dt;
    if (this._distT < 0) {
      this._distT = 16 + Math.random() * 32;
      const p = this.local.pos, ang = Math.random() * Math.PI * 2, r = 140 + Math.random() * 160;
      const table = night ? [['bark', 3], ['rifle', 2], ['pistol', 2], ['scream', 1], ['groan', 3]] : [['bark', 4], ['rifle', 1], ['pistol', 1], ['horn', 1], ['groan', 1]];
      let w = Math.random() * table.reduce((s, [, k]) => s + k, 0), name = table[0][0];
      for (const [n, k] of table) { w -= k; if (w <= 0) { name = n; break; } }
      if (!(this.endings && this.endings.active)) a.play(name, { at: { x: p.x + Math.cos(ang) * r, y: p.y + 4, z: p.z + Math.sin(ang) * r }, range: 520, vol: name === 'bark' || name === 'groan' ? 0.55 : 0.4, bus: 'ambient', vary: 0.2 });
    }
    // dinamik müzik yoğunluğu
    const threat = this.zombies.threatLevel || 0;
    const inBase = this.isInBase(this.local.pos);
    a.setIntensity(clamp(threat + (this.endings.active ? 0.6 : 0) - (inBase && threat < 0.3 ? 0.2 : 0), 0, 1));
  }

  isInBase(p) {
    const h = this.world.home;
    return p.x > h.box.minX - 22 && p.x < h.box.maxX + 12 && p.z > h.box.minZ - 42 && p.z < h.box.maxZ + 12;
  }

  // ======================================================================= ihtiyaçlar
  tickNeeds(mins) {
    if (mins <= 0) return;
    const st = this.localStats;
    const pl = this.local;
    const W = this.env.weather;
    const inside = !!pl.inside;
    const nearFire = this.build.nearFire(pl.pos);
    const raincoat = this.equipment.body2 === 'raincoat';
    // öğle güneşi: açıkta (bina/sığınak/araç dışı), açık havada, 10.30–17.30 arası, sıcaklık 23 °C üstünde
    const md = this.time.minuteOfDay, sunUp = !this.time.isNight && md > 630 && md < 1050;
    const sun = sunUp && !inside && pl.mode !== 'drive' && pl.mode !== 'seat' && W.rain < 0.15 && (W.cloud || 0) < 0.7
      ? Math.max(0, Math.min(1, (this.weather.temperature - 23) / 8)) * Math.sin(((md - 630) / 420) * Math.PI) : 0;
    this.sunExposure = sun;
    const env = {
      ambient: this.weather.temperature, wet: inside || raincoat ? 0 : W.rain, sheltered: inside, nearFire, sun,
      sleeping: pl.mode === 'sleep', comfort: this.isInBase(pl.pos) ? this.build.comfort01() : 0, inBase: this.isInBase(pl.pos),
      night: this.time.isNight, alone: this.players.size + this.bots.count() <= 1 && !this.flags.dog_found,
      warmth: (this.equipment.body2 === 'warm_jacket' ? 6 : 0) + (raincoat ? 2 : 0),
    };
    const ev = st.tick(mins, env);
    if (ev.includes('sick')) this.ui.toast('Hastalandın! Antibiyotik bul.', 'danger');
    if (ev.includes('heat')) this.ui.toast('☀️ Güneş çarpması riski! Gölgeye ya da bir binaya gir, su iç.', 'warn', 5);
    if (ev.includes('heatstroke')) this.ui.toast('🥵 Güneş çarptı: can kaybediyorsun! Hemen içeri gir ve su iç.', 'danger', 5);
    // akşam uyarısı
    if (st.hunger < 15 && !this._warnHunger) { this._warnHunger = true; this.ui.toast('Çok açsın!', 'warn'); }
    if (st.hunger > 30) this._warnHunger = false;
    if (st.thirst < 15 && !this._warnThirst) { this._warnThirst = true; this.ui.toast('Çok susadın!', 'warn'); }
    if (st.thirst > 30) this._warnThirst = false;
    // ekipman etkileri
    let armor = 0;
    if (this.equipment.body === 'vest') armor += 0.25;
    if (this.equipment.head === 'helmet') armor += 0.1;
    st.armor = armor;
    const extra = (this.equipment.back ? ITEMS[this.equipment.back].wear.carry : 0);
    this.inventory.maxWeight = (30 + extra) * (this.localProfile.stats.carry || 1);
    this.overweight = Math.max(0, this.inventory.weight() - this.inventory.maxWeight);
    // görsel efektler
    const g = this.game.gfx.grade;
    g.uDanger.value = st.downed ? 0.9 : clamp((45 - st.health) / 45, 0, 1) * 0.7;
    g.uBlur.value = st.energy < 12 ? (12 - st.energy) / 12 : st.cond.poisoned > 0 ? 0.5 : 0;
    g.uDesat.value = st.downed ? 0.7 : 0;
    if (st.health < 30 && !st.downed) { this._hb = (this._hb || 0) - mins; if (this._hb <= 0) { this._hb = 1.2 * this.time.rate; this.audio.play('heartbeat', { vol: 0.6 }); } }
  }

  // ======================================================================= hasar / yere düşme
  damageLocal(amount, kind = 'zombie', from = null) {
    const st = this.localStats;
    if (st.downed || this.local.mode === 'sleep' && kind === 'internal') return;
    const res = st.damage(amount * this.diff.dmg, kind);
    if (amount >= 3 && this.t - (this._hurtT || -9) > 0.6) { this._hurtT = this.t; this.audio.play('hurt', { vol: Math.min(0.8, 0.35 + amount / 40), vary: 0.18 }); }
    this.onLocalDamaged(amount, kind);
    if (res.bleed) this.ui.toast('Kanıyorsun! Bandaj kullan.', 'danger');
    if (res.infected) this.ui.toast('Isırık enfekte olabilir…', 'danger');
    if (res.downed) this.onDowned();
    if (this.local.mode === 'sleep') { this.local.mode = 'ground'; this.ui.toast('Uyandın! Saldırı altındasın!', 'danger'); }
  }

  onLocalDamaged(amount, kind) {
    this.local.avatar.flinch(1);
    this.local.camShake = Settings.get('gameplay.cameraShake') ? Math.min(1, amount / 25) : 0;
    this.ui.damageFlash();
    if (this.localStats.downed && !this._downNotified) this.onDowned();
  }

  onDowned() {
    if (this._downNotified) return;
    this._downNotified = true;
    this.audio.play('downed', { vol: 0.8 });
    this.timeline.onDowned(this.localProfile.name);
    this.local.mode = 'downed';
    if (this.local.carrying) this.act('carry', { target: this.local.carrying, drop: true });
    this.results.deaths++;
    if (this.local.vehicle) this.vehicles.exitLocal();
    this.ui.showDowned();
    this.audio.play('zdeath', { vol: 0.8, rate: 1.4 });
    this.net.active && this.net.sendToHost({ t: 'downed' });
  }

  updateDowned(dt) {
    const st = this.localStats;
    if (!st.downed) { if (this._downNotified) { this._downNotified = false; this.ui.hideDowned(); } return; }
    st.downTime += dt;
    // yapay zekâ arkadaş kaldırabilir; tek başına: süre dolunca üste yeniden doğ
    if (st.downTime > 75) this.respawnLocal();
  }

  respawnLocal() {
    const st = this.localStats;
    if (this.local.carriedBy) { this.act('carry', { target: this.localId, drop: true }); this.local.carriedBy = null; }
    // sırt çantasını düşür (ceza): yarısı yere
    const dropped = [];
    for (let i = 6; i < this.inventory.size; i++) {
      const s = this.inventory.slots[i];
      if (s && this.rng.chance(0.5)) { dropped.push(s); this.inventory.slots[i] = null; }
    }
    this.inventory.changed();
    if (dropped.length) this.act('ground_drop_many', { stacks: dropped, x: this.local.pos.x, y: this.local.pos.y, z: this.local.pos.z, label: 'Düşen Çanta' });
    const bed = this.build.respawnPoint();
    st.revive(50);
    st.hunger = Math.max(st.hunger, 35); st.thirst = Math.max(st.thirst, 35);
    this.local.spawnAt(bed.x, bed.y, bed.z, bed.rot || 0);
    this.local.mode = 'ground';
    if (this.isHost) this.time.advance(120);
    this.ui.toast('Üste geri döndün. Eşyalarının bir kısmı düştüğün yerde kaldı. (2 saat geçti)', 'warn', 6);
    this.map.addMarker(this.local.pos.x, this.local.pos.z, 'Düşen Çanta', 'bag');
  }

  // ======================================================================= envanter işlemleri
  giveLocal(id, qty = 1, data = null) {
    if (ITEMS[id] && ITEMS[id].spoil && !(data && data.t0 !== undefined)) data = { ...(data || {}), t0: Math.round(this.time.total) };
    const left = this.inventory.add(id, qty, data);
    if (left > 0) this.act('ground_drop', { stack: makeStack(id, left, data), x: this.local.pos.x, y: this.local.pos.y, z: this.local.pos.z });
    return qty - left;
  }

  selectHotbar(i) {
    this.hotbarIndex = i;
    const s = this.inventory.slots[i];
    const id = s ? s.id : null;
    const def = id ? ITEMS[id] : null;
    const holdable = def && (def.gun || def.melee || def.hold || def.throwable || def.cat === 'food' || def.cat === 'drink' || def.cat === 'med');
    this.local.avatar.hold(holdable ? id : null);
    this.local.aiming = false;
    this.ui.updateHotbar && this.ui.updateHotbar();
    if (def && def.id === 'flashlight') this.local.avatar.setFlashlight(this.flashlightOn !== false);
    else this.local.avatar.setFlashlight(false);
    if (this.net.active) this.net.sendToHost({ t: 'hold', id: holdable ? id : null });
  }

  get heldStack() { return this.inventory.slots[this.hotbarIndex] || null; }

  /** Yiyecek tazeliği: kalan gün (negatif = bozulmuş) */
  freshDays(s) {
    const def = ITEMS[s.id];
    if (!def || !def.spoil || s.t0 === undefined) return null;
    return def.spoil - (this.time.total - s.t0) / 1440;
  }
  isSpoiled(s) { const d = this.freshDays(s); return d !== null && d < 0; }

  /** Eşya kullanımı (yeme, içme, tedavi, okuma, giyme) */
  useItem(slot, target = null) {
    const s = this.inventory.slots[slot];
    if (!s) return;
    const def = ITEMS[s.id];
    if (def.wear) { this.equip(s.id, slot); return; }
    if (s.id === 'note' || def.cat === 'misc' && s.noteId) { this.quests.readNote(s.noteId || 'random_diary'); return; }
    if (s.id === 'radio') { this.events.useRadio(); return; }
    if (s.id === 'sleeping_bag') { this.trySleep(null); return; }
    if (s.id === 'seeds' || s.id === 'empty_bottle' || s.id === 'jerrycan') { this.ui.toast(s.id === 'seeds' ? 'Tohumları bahçe parseline ekmek için parselin yanına gidip E\'ye bas.' : s.id === 'jerrycan' ? 'Benzin pompası ya da yakıt tankının yanında doldur, aracın yanında E ile aktar.' : 'Bir su kaynağının (göl, yağmur deposu, kaynak) yanında E ile doldur.', 'info'); return; }
    if (!def.use) { this.ui.toast('Bu eşya doğrudan kullanılamaz.', 'warn'); return; }
    if (this._using) return;
    let use = def.use;
    // bozulmuş yiyecek: daha az doyurur, zehirleme riski yüksek
    const spoiled = this.isSpoiled(s);
    if (spoiled) use = { ...use, hunger: Math.round((use.hunger || 0) * 0.5), morale: -3, poison: Math.max(use.poison || 0, 0.6) };
    const dur = (use.time || 1) / (use.heal && this.localProfile.stats.heal ? this.localProfile.stats.heal : 1);
    this._using = true;
    const anim = def.cat === 'med' ? 'bandage' : def.cat === 'drink' ? 'drink' : 'consume';
    this.local.avatar.play(anim, dur);
    this.audio.play(def.cat === 'drink' ? 'splash' : def.cat === 'med' ? 'click' : 'eat', { vol: 0.5 });
    this.ui.progress(def.cat === 'food' ? 'Yiyor…' : def.cat === 'drink' ? 'İçiyor…' : 'Tedavi ediliyor…', dur, () => {
      this._using = false;
      const cur = this.inventory.slots[slot];
      if (!cur || cur.id !== s.id) return;
      this.inventory.takeAt(slot, 1);
      const mul = use.heal ? this.localProfile.stats.heal || 1 : 1;
      const out = this.localStats.consume(use, mul);
      if (out.includes('poisoned')) this.ui.toast('Midesi bulanıyor… Zehirlendin!', 'danger');
      if (use.gives) this.giveLocal(use.gives, 1);
      if (s.id === 'stew' && this.isInBase(this.local.pos)) { this.act('team_morale', { amount: 8 }); }
      this.ui.toast(spoiled ? `${def.name} bozulmuştu… Tadı berbattı.` : `${def.name} kullanıldı.`, spoiled ? 'warn' : 'good', 2);
    }, () => { this._using = false; });
  }

  equip(id, slot = -1) {
    const def = ITEMS[id];
    if (!def || !def.wear) return;
    const ws = def.wear.slot;
    if (slot >= 0) this.inventory.takeAt(slot, 1);
    else if (!this.inventory.remove(id, 1)) { /* başlangıç ekipmanı */ }
    const old = this.equipment[ws];
    this.equipment[ws] = id;
    if (old) this.giveLocal(old, 1);
    if (ws === 'back') { const extra = ITEMS[id].wear.carry; this.ui.toast(`${def.name} kuşanıldı (+${extra} kg).`, 'good'); }
    else this.ui.toast(`${def.name} kuşanıldı.`, 'good');
    this.ui.refreshInventory && this.ui.refreshInventory();
  }

  unequip(ws) {
    const id = this.equipment[ws];
    if (!id) return;
    this.equipment[ws] = null;
    this.giveLocal(id, 1);
  }

  dropSlot(slot, qty = Infinity) {
    const s = this.inventory.takeAt(slot, qty);
    if (!s) return;
    if (slot === this.hotbarIndex) this.selectHotbar(slot);
    const p = this.local.pos;
    const fx = Math.sin(this.local.yaw), fz = Math.cos(this.local.yaw);
    this.act('ground_drop', { stack: s, x: p.x + fx * 0.8, y: p.y, z: p.z + fz * 0.8 });
    this.local.avatar.play('pickup', 0.5);
  }

  // ======================================================================= kısayollar
  handleHotkeys(input, blocking) {
    if (blocking) return;
    for (let i = 0; i < 6; i++) if (input.keyPressed('Digit' + (i + 1))) this.selectHotbar(i);
    if (input.mouse.wheel && !this.build.placing) this.selectHotbar((this.hotbarIndex + (input.mouse.wheel > 0 ? 1 : 5)) % 6);
    if (input.wasPressed('inventory')) this.ui.openJournal('inventory');
    if (input.wasPressed('crafting')) this.ui.openJournal('crafting');
    if (input.wasPressed('quests')) this.ui.openJournal('quests');
    if (input.wasPressed('character')) this.ui.openJournal('character');
    if (input.wasPressed('map')) this.ui.openJournal('map');
    if (input.wasPressed('team')) this.ui.openTeam();
    if (input.wasPressed('build') && this.local.mode !== 'drive') this.build.toggleMenu();
    if (input.wasPressed('pause') && !this.build.placing) this.ui.openPause();
    if (input.wasPressed('chat')) this.ui.openChat();
    if (input.wasPressed('emote')) this.ui.openEmotes();
    if (input.wasPressed('flashlight')) this.toggleFlashlight();
    if (input.wasPressed('quickHeal') && this.local.mode !== 'drive') this.quickHeal();
    if (input.wasPressed('drop') && this.heldStack) this.dropSlot(this.hotbarIndex, 1);
    if (input.wasPressed('ping')) this.pingAim();
  }

  toggleFlashlight() {
    const has = this.inventory.has('flashlight');
    if (!has) { this.ui.toast('El fenerin yok.', 'warn'); return; }
    this.flashlightOn = !this.local.avatar.flashlight;
    this.local.avatar.setFlashlight(this.flashlightOn);
    this.audio.play('click', { vol: 0.6 });
  }

  quickHeal() {
    for (const id of ['bandage', 'first_aid', 'painkiller']) {
      const i = this.inventory.firstSlotOf(id);
      if (i >= 0 && (id !== 'bandage' || this.localStats.cond.bleeding > 0 || this.localStats.health < this.localStats.maxHealth)) { this.useItem(i); return; }
    }
    this.ui.toast('Tedavi malzemen yok.', 'warn');
  }

  pingAim() {
    const r = this.local.aimRay();
    const hit = this.world.physics.raycast(r.o.x, r.o.y, r.o.z, r.d.x, r.d.y, r.d.z, 150);
    const p = hit ? hit.point : { x: r.o.x + r.d.x * 40, y: r.o.y + r.d.y * 40, z: r.o.z + r.d.z * 40 };
    const z = this.zombies.nearestTo(p.x, p.z, 4);
    this.act('ping', { x: p.x, y: p.y, z: p.z, label: z ? 'Zombi!' : 'Buraya!' });
  }

  // ======================================================================= uyku
  trySleep(bed) {
    if (this.zombies.threatLevel > 0.35) { this.ui.toast('Yakında zombiler varken uyuyamazsın!', 'warn'); return; }
    if (this.time.minuteOfDay > 7 * 60 && this.time.minuteOfDay < 19 * 60 && this.localStats.energy > 40) { this.ui.toast('Henüz uykun yok.', 'info'); return; }
    this.local.mode = 'sleep';
    this.sleepBed = bed;
    if (bed) { this.local.pos.set(bed.x, bed.y, bed.z); this.local.root.position.copy(this.local.pos); this.local.yaw = bed.rot || 0; this.local.syncBody(); }
    this.act('sleep_vote', { on: true });
    this.ui.showSleep();
  }

  wake() {
    if (this.local.mode === 'sleep') this.local.mode = 'ground';
    this.act('sleep_vote', { on: false });
    this.ui.hideSleep();
  }

  sleepVote(from, on) {
    if (on) this.sleepVotes.add(from); else this.sleepVotes.delete(from);
    const humans = [...this.players.values()].filter((p) => !p.isBot).length;
    const need = Math.ceil(humans / 2 + 0.01);
    const ok = this.sleepVotes.size >= need;
    // gece yalnız güvenli yerde (yer altı sığınağı ya da savunması güçlü üs) hızlı geçer; açıkta uyuyanlar için gece
    // yavaş akar (zombiler gelebilir: hasar uyandırır). Gündüz şekerlemesi her yerde hızlıdır.
    let ff = ok ? 40 : 1;
    if (ok && this.time.isNight) {
      const safe = [...this.sleepVotes].every((id) => {
        const p = id === this.localId ? this.local : this.players.get(id);
        if (!p || !p.pos) return true;
        if (this.world.under && this.world.under.zoneAt(p.pos.x, p.pos.y, p.pos.z)) return true;
        return this.isInBase(p.pos) && this.build.defenseScore() >= 20;
      });
      if (!safe) ff = 8;
      if (!safe && this.sleepState && this.sleepState.ff !== 8) this.emit({ k: 'toast', text: 'Açıkta uyuyorsunuz: gece yavaş geçecek, zombiler gelebilir. Sığınakta ya da korunaklı üste uyuyun.', kind: 'warn', dur: 6 });
    }
    this.emit({ k: 'sleep', ff, votes: this.sleepVotes.size, need });
  }

  // ======================================================================= ayak sesleri
  /** Her karakterin (oyuncu, uzak oyuncu, YZ arkadaş, NPC) ayağı yere bastığında */
  onAvatarStep(av, speed, mode) {
    const p = av.root.position, L = this.audio.listener;
    if (Math.abs(p.x - L.x) > 32 || Math.abs(p.z - L.z) > 32) return;
    const local = av === this.local.avatar;
    this.audio.footstep(local ? null : { x: p.x, y: p.y + 0.1, z: p.z }, this.surfaceAt(p, local ? this.local.inside : null), speed, mode === 'crouch');
  }

  /** Zombi ayak sesi: sürüklenen, düzensiz adımlar (yalnızca yakındakiler, kare başına en fazla 3) */
  onZombieStep(view, speed, crawl) {
    const p = view.root.position, L = this.audio.listener;
    if (Math.abs(p.x - L.x) > 20 || Math.abs(p.z - L.z) > 20) return;
    if (this._zsFrame !== this.t) { this._zsFrame = this.t; this._zsN = 0; }
    if (++this._zsN > 3) return;
    const surface = this.surfaceAt(p);
    this.audio.play('step', { at: { x: p.x, y: p.y + 0.1, z: p.z }, vol: (crawl ? 0.08 : 0.1) + Math.min(0.12, speed * 0.025), surface: surface === 'grass' ? 'dirt' : surface, range: 20 });
  }

  /** Zemin türü: bina zemini, yapı, yol, su, biyom (çim/kum/toprak/kaya/kar) */
  surfaceAt(p, inside = null) {
    const T = this.world.terrain;
    const th = T.heightAt(p.x, p.z);
    if (p.y - th > 0.35) {
      const b = inside || this.world.buildingAt(p.x, p.z);
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

  // ======================================================================= zaman olayları
  onTime(type, d) {
    if (type === 'day') this.timeline.onDayStart(d.day);
    if (!this.isHost) return;
    if (type === 'hour') {
      if (this.net.active) this.net.broadcast({ t: 'evt', e: { k: 'time', total: this.time.total } });
      this.zombies.onHour(d.hour, d.day);
      this.events.onHour(d.hour, d.day);
      if (this.time.ff > 1 && d.hour === 7) {
        this.sleepVotes.clear();
        this.emit({ k: 'sleep', ff: 1, votes: 0, need: 1, woke: true });
      }
    }
    if (type === 'day') { this.events.onDay(d.day); this.loot.onDay(d.day); this.saves.autosave(); }
    if (type === 'phase') this.ui.phaseBanner(d.phase);
  }

  // ======================================================================= uzak oyuncular
  updateRemotes(dt) {
    for (const p of this.players.values()) {
      if (p.isLocal || p.isBot || !p.avatar) continue;
      // anlık görüntüler arasında yumuşak geçiş
      if (p.target) {
        p.pos.lerp(p.target, Math.min(1, dt * 12));
        p.avatar.root.position.copy(p.pos);
      }
      p.avatar.update(dt, p.anim || { mode: 'ground', speed: 0 });
      if (p.vehicleId) {
        const v = this.vehicles.byId(p.vehicleId);
        if (v) v.seatPlayer(p.avatar, p.seat || 0);
      }
    }
  }

  /** Host göçü: bu istemci oyunun otoritesi olur — zombi/bot simülasyonu başlar, araçlar dinamik gövdeye döner */
  becomeHost() {
    this.isHost = true;
    this.offlinePlayers = this.offlinePlayers || {};
    // zombi durumu korunur: istemcinin gördüğü zombiler (eski host'un son anlık görüntüsü) aynı tür, konum ve yönle
    // gerçek zombiye dönüşür (can tam); bölge nüfusu ve öldürülen sayıları son paylaşılan değerden (pdata / hoş geldin)
    // geri yüklenir → ölenler geri gelmez, görüş dışındaki nüfus bölge kuralıyla tamamlanır
    const seen = [];
    for (const v of this.zombies.views.values()) if (v.state && !v.state.dead && v.type) seen.push({ type: v.type, x: v.pos.x, z: v.pos.z, yaw: v.state.yaw || 0, alert: v.state.state === 'chase' || v.state.state === 'attack' });
    for (const id of [...this.zombies.views.keys()]) this.zombies.removeZombie(id);
    this.zombies.list.clear();
    this.zombies.init();
    if (this.zoneState) this.zombies.load({ zones: this.zoneState });
    for (const q of seen) {
      const zb = this.zombies.spawn(q.type, q.x, q.z, { zone: this.zombies.zoneFor(q.x, q.z) });
      if (zb) { zb.yaw = q.yaw; if (q.alert) zb.alert = 1; }
    }
    this.promotedZombies = seen.length;
    if (this.bots && this.bots.promoteProxies) this.bots.promoteProxies();
    // ayrılan oyuncuların koltukları boşalır; sürücüsüz araçlar dinamik gövdeye döner
    for (const v of this.vehicles.list) {
      for (let i = 0; i < v.seats.length; i++) if (v.seats[i] && v.seats[i] !== this.localId && !this.players.has(v.seats[i]) && !(this.bots && this.bots.byId && this.bots.byId(v.seats[i]))) v.seats[i] = null;
      if (!v.seats[0] || v.seats[0] === this.localId) { v.netTarget = null; v.setRemote(false); }
    }
    if (this.doorPhys) for (const r of this.doorPhys.doors) r.cmdT = 0;
    if (this.npcs && this.npcs.promoteAnimals) this.npcs.promoteAnimals();
  }

  addRemotePlayer(info) {
    if (this.players.has(info.id) && this.players.get(info.id).avatar) return this.players.get(info.id);
    const cdef = CHARACTERS[info.charId] || CHARACTERS.mert;
    const look = { ...cdef.look, ...(info.look || {}) };
    const avatar = new Avatar(this.game, look, { name: info.name, color: cdef.color });
    this.game.scene.add(avatar.root);
    const rec = { ...info, look, avatar, pos: new THREE.Vector3(info.x || 0, info.y || 0, info.z || 0), target: null, anim: null, summary: info.summary || null };
    avatar.root.position.copy(rec.pos);
    this.players.set(info.id, rec);
    this.ui.toast(`${info.name} oyuna katıldı.`, 'good');
    return rec;
  }

  removeRemotePlayer(id) {
    const p = this.players.get(id);
    if (!p || p.isLocal) return;
    if (p.avatar) p.avatar.dispose();
    this.players.delete(id);
    this.sleepVotes.delete(id);
    this.ui.toast(`${p.name} bağlantısı koptu. (Geri bağlanabilir)`, 'warn');
  }

  teamList() {
    const out = [];
    for (const p of this.players.values()) {
      const s = p.isLocal ? this.localStats : p.summary;
      out.push({ id: p.id, name: p.name, charId: p.charId, isLocal: !!p.isLocal, health: s ? s.health / (s.maxHealth || 100) : 1, hunger: s ? s.hunger / 100 : 1, thirst: s ? s.thirst / 100 : 1, downed: s ? !!s.downed : false, pos: p.isLocal ? this.local.pos : p.pos, voice: p.speaking });
    }
    for (const b of this.bots.list) out.push({ id: b.id, name: b.name, charId: b.charId, isBot: true, health: b.stats.health / b.stats.maxHealth, hunger: b.stats.hunger / 100, thirst: b.stats.thirst / 100, downed: b.stats.downed, pos: b.pos });
    return out;
  }

  // ======================================================================= kayıt
  serialize() {
    const players = {};
    players[this.token] = this.localData();
    for (const p of this.players.values()) if (!p.isLocal && p.saved) players[p.token] = p.saved;
    for (const [tok, pd] of Object.entries(this.offlinePlayers || {})) if (!players[tok]) players[tok] = pd;
    return {
      v: 1, savedAt: Date.now(), seed: this.seed, cfg: { difficulty: this.cfg.difficulty, dayMinutes: this.time.dayMinutes, aiTeammates: this.cfg.aiTeammates || 0 },
      time: this.time.serialize(), flags: this.flags, relations: this.relations,
      results: { ...this.results, vehicles: [...this.results.vehicles] },
      players, hostToken: this.token,
      loot: this.loot.serialize(), ground: this.ground.serialize(), build: this.build.serialize(), zombies: this.zombies.serialize(),
      vehicles: this.vehicles.serialize(), npcs: this.npcs.serialize(), quests: this.quests.serialize(), events: this.events.serialize(),
      map: this.map.serialize(), weather: this.weather.serialize(), bots: this.bots.serialize(), doors: this.serializeDoors(), timeline: this.timeline.serialize(), story: this.storyWorld.serialize(),
    };
  }

  localData() {
    return { charId: this.localProfile.charId, name: this.localProfile.name, look: this.localProfile.look, pos: [this.local.pos.x, this.local.pos.y, this.local.pos.z], yaw: this.local.yaw, stats: this.localStats.serialize(), inv: this.inventory.serialize(), equip: { ...this.equipment } };
  }

  serializeDoors() {
    const out = {};
    // açılması komut edilmiş ama animasyonu henüz başlamamış kapı da (target > 0) gönderilir: yavaş host'tan katılan
    // oyuncu onu kapalı görmesin
    for (const d of this.world.doors) if (d.target > 0 || d.open01 > 0 || d.broken || d.barricade || !d.locked !== !d.origLocked || d.hp < d.maxHp) out[d.id] = [d.target, d.broken ? 1 : 0, d.barricade, d.locked ? 1 : 0, Math.round(d.hp)];
    const wins = {};
    for (const w of this.world.windows) if (w.broken || w.barricade || w.hp < w.maxHp || w.initBroken || w.initBarricade) wins[w.id] = [w.broken ? 1 : 0, w.barricade, Math.round(w.hp)];
    return { doors: out, windows: wins };
  }

  load(data) {
    this.seed = data.seed;
    this.rng = new RNG(this.seed + ':' + data.time.total);
    this.time.set(data.time.total);
    this.flags = data.flags || {};
    this.relations = data.relations || this.relations;
    this.results = { ...this.results, ...(data.results || {}), vehicles: new Set(data.results?.vehicles || []) };
    const me = data.players[this.token] || data.players[data.hostToken] || Object.values(data.players)[0];
    this.restoreLocal(me);
    for (const [tok, pd] of Object.entries(data.players)) if (tok !== this.token) this.offlinePlayers = { ...(this.offlinePlayers || {}), [tok]: pd };
    this.loot.load(data.loot);
    this.ground.load(data.ground);
    this.build.load(data.build);
    this.zombies.load(data.zombies);
    this.vehicles.load(data.vehicles);
    this.npcs.load(data.npcs);
    this.quests.load(data.quests);
    this.events.load(data.events);
    this.map.load(data.map);
    this.weather.load(data.weather);
    this.bots.load(data.bots);
    this.loadDoors(data.doors);
    this.timeline.load(data.timeline);
    this.storyWorld.load(data.story);
    // takvim ortam durumu (elektrik kesintisi, kızıllaşan gökyüzü)
    this.env.streetPower = this.time.day < 4 || !!this.flags.power_restored;
    this.env.doom = this.time.day >= 30 ? 0.9 : this.time.day >= 29 ? 0.75 : this.time.day >= 28 ? 0.4 : 0;
    this.selectHotbar(0);
    this.ui.toast(`Kayıt yüklendi: ${this.time.day}. gün`, 'good');
  }

  restoreLocal(me) {
    if (!me) { const sp = this.world.spawn; this.local.spawnAt(sp.x, sp.y, sp.z, sp.rot); return; }
    this.localStats.load(me.stats);
    this.inventory = Inventory.deserialize(me.inv, 30);
    this.equipment = { ...this.equipment, ...(me.equip || {}) };
    this.local.spawnAt(me.pos[0], me.pos[1] + 0.2, me.pos[2], me.yaw || 0);
  }

  loadDoors(d) {
    if (!d) return;
    const byId = new Map(this.world.doors.map((x) => [x.id, x]));
    for (const [id, a] of Object.entries(d.doors || {})) { const door = byId.get(id); if (door) this.interact.applyDoorState(door, { target: a[0], broken: !!a[1], barricade: a[2], locked: !!a[3], hp: a[4] }); }
    const wById = new Map(this.world.windows.map((x) => [x.id, x]));
    this.applyInitialWindows();
    for (const [id, a] of Object.entries(d.windows || {})) { const w = wById.get(id); if (w) this.interact.applyWindowState(w, { broken: !!a[0], barricade: a[1], hp: a[2] }, true); }
  }

  /** İstemci: host'tan gelen tam durum */
  applyWelcome(w) {
    this.seed = w.seed;
    this._trade = w.trade || {};
    this.zoneState = w.zones || null; // zombi bölge nüfusu (göçte geri yüklenir)
    this.time.set(w.time.total);
    this.time.dayMinutes = w.time.dayMinutes;
    this.flags = w.flags || {};
    this.relations = w.relations || this.relations;
    const me = w.you;
    if (me) this.restoreLocal(me);
    else {
      const cdef = CHARACTERS[this.localProfile.charId];
      const sp = this.world.spawn;
      this.local.spawnAt(sp.x + 1.5 + Math.random() * 2, sp.y, sp.z + 1, sp.rot);
      for (const [id, n, data] of cdef.start) this.inventory.add(id, n, data || null, true);
      this.inventory.add('water_bottle', 2, null, true);
    }
    this.loot.load(w.loot);
    if (w.lootUse) this.loot.applyUsage(w.lootUse); // o an açık dolaplar (sonradan katılan da açık görsün)
    this.ground.load(w.ground);
    this.build.load(w.build);
    this.vehicles.load(w.vehicles);
    this.npcs.load(w.npcs);
    this.quests.load(w.quests);
    this.events.load(w.events);
    this.weather.load(w.weather);
    this.loadDoors(w.doors);
    this.storyWorld.load(w.story);
    if (w.env) { this.env.streetPower = w.env.streetPower !== false; this.env.doom = w.env.doom || 0; this.env.redMist = w.env.redMist || 0; }
    if (w.props && this.props && this.props.applyDynamic) this.props.applyDynamic(w.props);
    this.zombies.initClient();
    for (const p of w.players || []) if (p.id !== this.localId) this.addRemotePlayer(p);
    this.selectHotbar(0);
  }

  dispose() {
    this.disposed = true;
    this.audio.occluder = null;
    this.audio.setEnvironment(false);
    for (const sys of [this.storyWorld, this.zombies, this.vehicles, this.npcs, this.ground, this.props, this.doorPhys, this.drawers, this.fronts, this.fx, this.build, this.bots, this.events, this.endings]) if (sys && sys.dispose) sys.dispose();
    if (this.buoyancyOff) this.buoyancyOff();
    if (this.contacts) this.contacts.dispose();
    if (this.living) for (const l of Object.values(this.living)) { this.game.scene.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose(); }
    for (const p of this.players.values()) if (p.avatar && !p.isLocal) p.avatar.dispose();
    this.local.dispose();
    this.game.phys.clearDynamic();
    this.game.gfx.grade.uDanger.value = 0; this.game.gfx.grade.uBlur.value = 0; this.game.gfx.grade.uDesat.value = 0;
    // dünyayı sıfırla (kapılar, pencereler)
    for (const d of this.world.doors) this.interact.applyDoorState(d, { target: 0, broken: false, barricade: 0, locked: d.origLocked ?? d.locked, hp: d.maxHp }, true);
    this.applyInitialWindows();
    this.world.setRoofHidden(null);
    this.env.weather = { type: 'clear', rain: 0, cloud: 0.35, fog: 0, wind: 1, snow: 0, storm: 0 };
    this.env.doom = 0; this.env.redMist = 0; this.env.streetPower = true; this.env.bloodMoon = false;
    this.env.extraLights.length = 0;
  }
}

export { dist };
