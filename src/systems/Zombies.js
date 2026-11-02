// Zombi yöneticisi. Host zombileri simüle eder (algı, yol bulma, saldırı, kırma);
// istemciler anlık görüntülerden çizer. Bölgelerde "sanal nüfus" tutulur; oyunculara yakın
// olanlar aktifleşir, uzaklaşınca havuza geri döner (performans).
import * as THREE from 'three';
import { ZOMBIE_TYPES, SPAWN_ZONES } from '../data/zombies.js';
import { ZombieView } from '../entities/ZombieView.js';
import { NAV } from '../world/NavGrid.js';
import { RNG, clamp, dist, wrapAngle } from '../core/util.js';
import { Settings } from '../core/Settings.js';
import { DUSK } from './TimeSystem.js';

let ZID = 1;
const _res = { x: 0, z: 0, hit: false, hits: [] };

class Zombie {
  constructor(type, x, y, z) {
    this.id = 'z' + (ZID++);
    this.type = type;
    this.def = ZOMBIE_TYPES[type];
    this.hp = this.def.hp;
    this.x = x; this.y = y; this.z = z;
    this.yaw = Math.random() * 6.28;
    this.state = 'idle';
    this.speed = 0;
    this.target = null; // {kind:'player'|'pos', id, x, z}
    this.path = null; this.pathI = 0; this.repath = 0;
    this.think = Math.random() * 0.3;
    this.attackCd = 0; this.stagger = 0; this.alert = 0;
    this.wander = null;
    this.bash = null;
    this.dead = false; this.deadT = 0;
    this.groanT = 2 + Math.random() * 8;
    this.slow = 0;
  }
}

export class Zombies {
  constructor(session) {
    this.s = session;
    this.list = new Map();
    this.views = new Map(); // istemci + host görselleri
    this.zones = SPAWN_ZONES.map((z) => ({ ...z, pop: 0, killed: 0 }));
    this.threatLevel = 0;
    this.rng = new RNG(session.seed + ':z');
    this.grid = new Map();
    this.pathBudget = 0;
    this.spawnT = 0;
    this.hordes = [];
    this.group = new THREE.Group();
    this.group.name = 'zombies';
    session.game.scene.add(this.group);
    const q = Settings.get('graphics.quality');
    this.cap = q === 'low' ? 26 : q === 'medium' ? 38 : 50;
    const S = session;
    S.on('zombie_hit', (p, from) => this.hit(p.id, p.dmg, p.dir, from, p.kind, p.force));
    S.onEvt('zdie', (e) => this.onDieEvt(e));
    // şişko patlaması: herkes görür/duyar; hasarı her istemci kendi oyuncusuna, host zombilere uygular
    S.onEvt('zburst', (e) => {
      S.fx.toxic(e.x, e.y + 1, e.z);
      S.props.explosion(e.x, e.y + 0.9, e.z, 4.2);
      const p = S.local.pos;
      if (dist(p.x, p.z, e.x, e.z) < 5.5 && S.sameLevel(p, e)) { S.localStats.cond.poisoned = Math.max(S.localStats.cond.poisoned || 0, 90); S.ui.toast('Şişko patladı! Zehirlendin.', 'danger'); }
    });
    S.onEvt('zfx_scream', (e) => {
      S.audio.play('scream', { at: e, vol: 1, range: 90 });
      const v = this.views.get(e.id); if (v) v.screamT = 1.6;
      if (dist(S.local.pos.x, S.local.pos.z, e.x, e.z) < 70) S.ui.toast('😱 Çığlıkçı! Çevredeki zombiler geliyor!', 'danger', 3);
    });
    S.onEvt('zfx', (e) => {
      const v = this.views.get(e.id); if (!v) return;
      if (e.a === 'attack') v.attack();
      if (e.a === 'flinch') v.flinch();
      if (e.a === 'ricochet') { S.fx.sparks(v.pos.x, v.pos.y + 1.3, v.pos.z); S.audio.play('hit', { at: v.pos, vol: 0.6, rate: 2.2 }); }
    });
  }

  init() {
    for (const z of this.zones) z.pop = Math.round(z.base * this.s.diff.zombies);
  }
  initClient() { /* istemci: anlık görüntü bekler */ }

  get count() { return this.list.size; }

  // ======================================================================= üretim
  spawn(type, x, z, opts = {}) {
    const S = this.s;
    const free = S.world.nav.nearestFree(x, z, 10);
    if (!free) return null;
    const y = S.world.physics.groundHeight(free.x, free.z, 1e9);
    const zb = new Zombie(type, free.x, y, free.z);
    zb.zone = opts.zone || null;
    if (opts.horde) { zb.target = { kind: 'pos', x: opts.horde.x, z: opts.horde.z }; zb.state = 'investigate'; zb.alert = 1; zb.horde = true; }
    if (opts.chase) { zb.target = { kind: 'player', id: opts.chase }; zb.state = 'chase'; zb.alert = 1; }
    // topraktan çıkış: 2,2 sn hareketsiz yükselir (görünüm kökü yerin altından çıkar, toz)
    if (opts.emerge && !ZOMBIE_TYPES[type].human) { zb.state = 'emerge'; zb.emergeT = 2.2; zb.alert = 0.2; zb.target = null; }
    this.list.set(zb.id, zb);
    this.makeView(zb.id, type, zb.x, zb.y, zb.z);
    return zb;
  }

  makeView(id, type, x, y, z) {
    const v = new ZombieView(this.s.game, ZOMBIE_TYPES[type], id);
    if (ZOMBIE_TYPES[type].human) this.armRaider(v);
    v.root.position.set(x, y, z);
    this.group.add(v.root);
    this.views.set(id, v);
    v.state = { state: 'idle', speed: 0, yaw: 0, dead: false };
    v.pos = new THREE.Vector3(x, y, z);
    v.target = v.pos.clone();
    v.type = type;
    return v;
  }

  armRaider(v) {
    const gun = this.s.game.itemModels.make(this.rng.chance(0.5) ? 'pistol' : 'shotgun');
    const h = new THREE.Group();
    h.position.set(-0.08, -0.015, 0.035); h.rotation.set(0, -Math.PI / 2, Math.PI / 2);
    h.add(gun);
    v.ch.anchors.handR.add(h);
  }

  zoneFor(x, z) {
    let best = null, bd = Infinity;
    for (const zn of this.zones) { const d = dist(x, z, zn.cx, zn.cz) / zn.r; if (d < 1 && d < bd) { bd = d; best = zn; } }
    return best;
  }

  /** Oyunculara yakın bölgelerde zombi aktifleştir */
  populate(dt) {
    const S = this.s;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 1.2;
    const players = this.targets().filter((t) => t.kind === 'player');
    if (!players.length) return;
    const day = S.time.day;
    const night = S.time.isNight;
    // GÜNDÜZ DOĞAL ZOMBİ YOK: ölüler alacakaranlıkta topraktan çıkar, şafakta toprağa döner (DayThreats gündüz
    // tehditlerini yönetir). İstisna: Kanlı Ay çılgınlığı ve final gecesi. spawn() saatten bağımsız kalır (olaylar,
    // testler, benchmark doğrudan çağırır; gündüz olay zombileri Events.zSpawn ile geceye ertelenir).
    if (!night && !this.frenzy && !(S.endings && S.endings.active)) return;
    // gecenin ilk saati: zombiler oyuncunun görebileceği yakınlıkta (25–60 m) topraktan çıkar
    const md = S.time.minuteOfDay, early = night && md >= DUSK && md < DUSK + 60;
    for (const pl of players) {
      if (this.list.size >= this.cap) break;
      // oyuncunun bölgesindeki ve komşu bölgelerdeki nüfus
      for (const zn of this.zones) {
        if (this.list.size >= this.cap) break;
        const dz = dist(pl.x, pl.z, zn.cx, zn.cz);
        if (dz > zn.r + 140) continue;
        const activeHere = [...this.list.values()].filter((z) => z.zone === zn && !z.dead).length;
        // bölgenin toplam nüfusu (sanal + aktif) güne göre artar; öldürülenler geri gelmez
        const target = Math.round((zn.base + zn.perDay * day) * S.diff.zombies * (night ? 1.5 : 1));
        if (zn.pop + activeHere + zn.killed < target) zn.pop = Math.max(0, target - zn.killed - activeHere);
        // aynı anda etrafta dolaşan sayısı: bölge yoğunluğu, gün ve gece ile ölçeklenir (1. gün sakin başlar)
        const dens = Math.min(2.2, 0.6 + (zn.base / 14) * 0.5);
        // zombiler artık yalnız gece var: gece yoğunluğu eskiden ×1,4'tü, şimdi ×1,8 (günün kalanında hiç yoklar)
        const want = Math.round((4 + zn.r * 0.05) * (0.5 + day * 0.035) * (night ? 1.8 : 1) * (this.frenzy ? 1.5 : 1) * dens * S.diff.zombies);
        if (activeHere >= want || zn.pop <= 0) continue;
        // görüş dışında, 55-110 m mesafede bir nokta (gecenin ilk saatinde 25–60 m: topraktan çıkışı görülsün)
        for (let tries = 0; tries < 6; tries++) {
          const a = this.rng.next() * Math.PI * 2;
          const r = early ? 25 + this.rng.next() * 35 : 55 + this.rng.next() * 55;
          const x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r;
          if (dist(x, z, zn.cx, zn.cz) > zn.r) continue;
          if (S.isInBase({ x, z })) continue;
          if (S.world.terrain.isWater(x, z)) continue;
          if (S.world.buildingAt(x, z) && this.rng.chance(0.5)) continue;
          let type = this.rng.weighted(zn.types);
          if (night && day >= 13 && this.rng.chance(0.3)) type = 'night';
          if (day >= 13 && type === 'normal' && this.rng.chance(0.15)) type = 'runner';
          if (ZOMBIE_TYPES[type].nightOnly && !night) type = 'normal';
          if ((ZOMBIE_TYPES[type].minDay || 0) > day) type = 'normal';
          if (S.world.under && S.world.under.zoneAt(x, S.world.terrain.heightAt(x, z), z)) continue;
          if (this.spawn(type, x, z, { zone: zn, emerge: true })) { zn.pop--; break; }
        }
      }
    }
  }

  /** Sürü saldırısı: üsse doğru yürüyen büyük grup */
  spawnHorde(size, around = null, withLeader = false) {
    const S = this.s;
    const base = around || { x: S.world.home.spec.x, z: S.world.home.spec.z };
    const a = this.rng.next() * Math.PI * 2;
    const cx = base.x + Math.cos(a) * 90, cz = base.z + Math.sin(a) * 90;
    let n = 0;
    for (let i = 0; i < size; i++) {
      const t = this.rng.weighted([['normal', 5], ['normal2', 4], ['runner', S.time.day >= 13 ? 3 : 1], ['heavy', S.time.day >= 7 ? 1 : 0.2], ['dog', 0.8]]);
      if (this.spawn(t, cx + (this.rng.next() - 0.5) * 20, cz + (this.rng.next() - 0.5) * 20, { horde: base })) n++;
    }
    if (withLeader) this.spawn('leader', cx, cz, { horde: base });
    this.s.map.addMarker(cx, cz, 'Sürü!', 'danger', 120);
    return n;
  }

  targets() {
    const S = this.s;
    const out = [];
    for (const p of S.players.values()) {
      const pos = p.isLocal ? S.local.pos : p.pos;
      const sm = p.isLocal ? S.localStats : p.summary;
      if (sm && sm.downed && sm.dead) continue;
      const inVeh = p.isLocal ? S.local.vehicle : p.vehicleId;
      out.push({ kind: 'player', id: p.id, x: pos.x, y: pos.y, z: pos.z, noise: p.isLocal ? S.local.noise : (p.anim && p.anim.speed > 4 ? 10 : 4), crouch: p.isLocal ? S.local.mode === 'crouch' || S.local.mode === 'prone' : p.anim && (p.anim.mode === 'crouch' || p.anim.mode === 'prone'), downed: sm && sm.downed, vehicle: inVeh, light: p.isLocal ? !!S.local.avatar.flashlight : false });
    }
    for (const b of S.bots.list) if (!b.stats.downed) out.push({ kind: 'bot', id: b.id, x: b.pos.x, y: b.pos.y, z: b.pos.z, noise: 4, bot: b });
    // korunması gereken NPC'ler yalnızca bir oyuncuyu takip ederken (eskort) hedef olur: oyuncu yokken ölmezler
    for (const n of S.npcs.list) if (n.visible && n.alive && n.zombieTarget && n.follow) out.push({ kind: 'npc', id: n.id, x: n.pos.x, y: n.pos.y, z: n.pos.z, noise: 3, npc: n });
    return out;
  }

  // ======================================================================= ses
  hearNoise(x, z, r, src) {
    if (!this.s.isHost) return;
    for (const zb of this.list.values()) {
      if (zb.dead || zb.state === 'burrow') continue; // toprağa dönen zombi sese dönmez
      const d = dist(zb.x, zb.z, x, z);
      if (d < r * (zb.def.hear / 26)) {
        if (zb.state === 'chase' && zb.target && zb.target.kind === 'player' && d > 8) continue;
        zb.target = { kind: 'pos', x: x + (this.rng.next() - 0.5) * 4, z: z + (this.rng.next() - 0.5) * 4 };
        zb.state = 'investigate'; zb.alert = Math.max(zb.alert, 0.7); zb.path = null; zb.repath = 0;
        zb.search = Math.max(zb.search || 0, 1); // ses kaynağının çevresine de bir göz at
      }
    }
    void src;
  }

  nearestTo(x, z, r) {
    let best = null, bd = r * r;
    for (const [id, v] of this.views) {
      if (v.state.dead) continue;
      const d = (v.pos.x - x) ** 2 + (v.pos.z - z) ** 2;
      if (d < bd) { bd = d; best = { id, v }; }
    }
    return best;
  }

  // ======================================================================= hasar
  hit(id, dmg, dir, from, kind, force = 0) {
    const zb = this.list.get(id);
    if (!zb || zb.dead) return;
    // çevik kuvvet yeleği: kurşun hasarı azalır
    if (zb.def.armor && kind === 'gun') { dmg *= zb.def.armor; if (Math.random() < 0.35) this.s.emit({ k: 'zfx', id, a: 'ricochet' }); }
    zb.hp -= dmg;
    zb.lastHit = { kind, dir: dir || null, force: force || 0 };
    zb.stagger = Math.max(zb.stagger, kind === 'melee' ? 0.35 * (1 - (zb.def.knockResist || 0)) : 0.15);
    if (dir && kind === 'melee') { zb.kx = dir[0] * 3 * (1 - (zb.def.knockResist || 0)); zb.kz = dir[1] * 3 * (1 - (zb.def.knockResist || 0)); }
    // saldırganı hedefle (toprağa dönmekte olan zombi dönüşünü sürdürür: hasar alır, kovalamaya geçmez)
    if (from && zb.state !== 'burrow') { zb.target = { kind: from.startsWith('bot_') ? 'bot' : 'player', id: from }; zb.state = 'chase'; zb.alert = 1; }
    this.s.emit({ k: 'zfx', id, a: 'flinch' });
    if (zb.hp <= 0) this.kill(zb, from);
  }

  kill(zb, from) {
    zb.dead = true;
    zb.state = 'dead';
    const S = this.s;
    if (zb.zone) { zb.zone.killed++; }
    S.results.kills++;
    // ganimet
    let drop = null;
    const r = this.rng.next();
    if (zb.def.human) drop = this.rng.pick([['ammo_9mm', 8], ['shells', 4], ['bandage', 1], ['canned_food', 1], ['money', 30]]);
    else if (zb.type === 'special') drop = ['antibiotics', 1];
    else if (zb.type === 'leader') drop = ['first_aid', 1];
    else if (r < 0.06) drop = this.rng.pick([['bandage', 1], ['ammo_9mm', 4], ['battery', 1], ['canned_food', 1], ['cloth', 1], ['medal', 1]]);
    const lh = zb.lastHit || {};
    S.emit({ k: 'zdie', id: zb.id, x: zb.x, y: zb.y, z: zb.z, type: zb.type, by: from, hk: lh.kind || null, hd: lh.dir ? [Math.round(lh.dir[0] * 100) / 100, Math.round(lh.dir[1] * 100) / 100] : null, hf: Math.round((lh.force || 0) * 10) / 10 });
    if (drop) S.applyAction('ground_drop', { stack: { id: drop[0], qty: drop[1] }, x: zb.x, y: zb.y, z: zb.z }, from);
    if (zb.def.toxic) S.emit({ k: 'toast', text: 'Zehirli bulut! Uzak dur!', kind: 'danger' });
    if (zb.def.bloat) S.emit({ k: 'zburst', x: zb.x, y: zb.y, z: zb.z });
    if (zb.def.leader) { S.emit({ k: 'toast', text: 'Sürü lideri öldü! Sürü dağılıyor!', kind: 'good', dur: 5 }); for (const z of this.list.values()) if (z.horde && !z.dead && this.rng.chance(0.6)) { z.horde = false; z.state = 'wander'; z.target = null; } }
    S.quests.onKill(zb.type, from);
  }

  onDieEvt(e) {
    const v = this.views.get(e.id);
    const S = this.s;
    if (v) {
      v.state.dead = true; v.deadAt = S.t;
      // araç çarpması / patlama: ceset fizikle savrulur
      if ((e.hk === 'vehicle' || e.hk === 'explosion') && e.hd && e.hf > 1.5) S.props.launchCorpse(v, e.hd, e.hf);
    }
    S.fx.death(e.x, e.y, e.z);
    S.audio.play(ZOMBIE_TYPES[e.type]?.dog ? 'bark' : 'zdeath', { at: e, vol: 0.9 });
    if (ZOMBIE_TYPES[e.type]?.toxic) {
      S.fx.toxic(e.x, e.y + 1, e.z);
      // zehirli bulut: yakındaki oyuncu zehirlenir
      const p = S.local.pos;
      if (dist(p.x, p.z, e.x, e.z) < 4 && S.sameLevel(p, e)) { S.localStats.cond.poisoned = 120; S.ui.toast('Zehirli buluta yakalandın!', 'danger'); }
    }
    if (e.by === S.localId) S.fx.text(e.x, e.y + 2.2, e.z, '✖', '#ff6b6b', 1.2);
  }

  // ======================================================================= güncelleme
  update(dt) {
    const S = this.s;
    if (S.isHost) {
      this.populate(dt);
      this.simulate(dt);
    } else {
      // istemci: tehdit seviyesini anlık görüntülerden hesapla (müzik, uyku kontrolü)
      let threat = 0;
      const lp = S.local.pos;
      for (const v of this.views.values()) {
        if (v.state.dead || (v.state.state !== 'chase' && !v.state.bashing)) continue;
        const d = dist(lp.x, lp.z, v.pos.x, v.pos.z);
        if (d < 35) threat += (35 - d) / 35 * 0.25;
      }
      this.threatLevel = clamp(threat, 0, 1);
    }
    this.updateViews(dt);
  }

  simulate(dt) {
    const S = this.s;
    const players = this.targets();
    this.pathBudget = 3;
    // uzamsal ızgara (ayrışma için)
    this.grid.clear();
    for (const zb of this.list.values()) {
      if (zb.dead) continue;
      const k = (Math.floor(zb.x / 3) * 7919) ^ Math.floor(zb.z / 3);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(zb);
    }
    const night = S.time.isNight;
    const dark = S.env.darkness || 0;
    let threat = 0;
    const lp = S.local.pos;
    this._players = players;
    // şafak kenarı (gece → gündüz; zaman sıçramalarını da yakalar): yaşayan zombiler kademeli olarak toprağa döner
    if (this._wasNight === undefined) this._wasNight = night;
    if (this._wasNight && !night && !(S.endings && S.endings.active)) this.dawn();
    this._wasNight = night;
    // yol bulma bütçesi en yakındakilere: zombiler oyunculara uzaklığa göre sıralanır (uzaktakiler seyrek düşünür)
    const order = [];
    for (const zb of this.list.values()) {
      if (zb.dead) {
        zb.deadT += dt;
        if (zb.deadT > 25) this.removeZombie(zb.id);
        continue;
      }
      let nearest = null, nd = Infinity;
      for (const p of players) { const d = dist(p.x, p.z, zb.x, zb.z); if (d < nd) { nd = d; nearest = p; } }
      zb._nd = nd; zb._nearest = nearest;
      order.push(zb);
    }
    order.sort((a, b) => a._nd - b._nd);
    for (const zb of order) {
      const nd = zb._nd, nearest = zb._nearest;
      void nearest;
      if (zb.burrowAt && S.t >= zb.burrowAt && zb.state !== 'burrow' && zb.state !== 'emerge') { zb.state = 'burrow'; zb.burrowT = zb.burrowT ?? 2.6; zb.speed = 0; zb.target = null; }
      if (zb.state === 'emerge' || zb.state === 'burrow') { this.act(zb, dt, players); continue; }
      // uzaklaşınca havuza geri dön
      if (nd > 170 && !zb.horde) { if (zb.zone) zb.zone.pop++; this.removeZombie(zb.id); continue; }
      zb.think -= dt;
      if (zb.think <= 0) { zb.think = (nd > 60 ? 0.6 : 0.25) + this.rng.next() * 0.15; this.perceive(zb, players, night, dark); }
      this.act(zb, dt, players);
      const ld = dist(lp.x, lp.z, zb.x, zb.z);
      if ((zb.state === 'chase' || zb.state === 'attack' || zb.state === 'bash') && ld < 35) threat += (35 - ld) / 35 * (zb.def.hp > 200 ? 0.5 : 0.25);
      // inleme sesi
      zb.groanT -= dt;
      if (zb.groanT <= 0) { zb.groanT = 4 + this.rng.next() * 9; if (ld < 40) S.audio.play(zb.def.dog ? 'bark' : 'groan', { at: zb, vol: zb.state === 'chase' ? 0.8 : 0.45, range: 40 }); }
    }
    this.resolveOverlaps();
    this.threatLevel = clamp(threat, 0, 1);
  }

  /** Üst üste binme yok: komşu hücrelerdeki (3×3) zombi çiftleri 0,55 m'den yakınsa yarı yarıya itilir */
  resolveOverlaps() {
    const min = 0.55;
    const push = (a, b) => {
      if (a.dead || b.dead) return;
      const dx = b.x - a.x, dz = b.z - a.z, dd = dx * dx + dz * dz;
      if (dd < min * min && dd > 1e-6) { const d = Math.sqrt(dd), k = ((min - d) / d) * 0.5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    };
    for (const arr of this.grid.values()) {
      if (!arr.length) continue;
      const k0 = Math.floor(arr[0].x / 3), k1 = Math.floor(arr[0].z / 3);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) push(arr[i], arr[j]);
        // komşu hücreler (yalnız ileri yöndekiler: çiftler bir kez işlensin)
        for (const [a, b] of [[1, -1], [1, 0], [1, 1], [0, 1]]) {
          const o = this.grid.get(((k0 + a) * 7919) ^ (k1 + b));
          if (o) for (const z of o) push(arr[i], z);
        }
      }
    }
  }

  perceive(zb, players, night, dark) {
    const S = this.s;
    const def = zb.def;
    let sightMul = night ? (def.nightOnly ? 1.4 : 0.55) : 1;
    sightMul *= 1 - dark * 0.3;
    let best = null, bestScore = 0;
    const under = S.world.under;
    for (const p of players) {
      // yer altı sığınağındaki oyuncu (toprak altında): yüzeydeki zombi onu ne görür ne duyar
      if (under && p.y < S.world.terrain.heightAt(p.x, p.z) - 2 && under.zoneAt(p.x, p.y + 0.5, p.z)) continue;
      const d = dist(p.x, p.z, zb.x, zb.z);
      let sight = def.sight * sightMul * (p.crouch ? 0.55 : 1) * (p.light && night ? 1.6 : 1) * (p.vehicle ? 1.5 : 1);
      if (p.id === S.localId && S.localProfile.stats.stealth) sight /= Math.sqrt(S.localProfile.stats.stealth);
      // sis fırsatı (olay): çömelen oyuncular yarı mesafeden fark edilir; Kanlı Ay'da zombiler daha keskin
      if (p.crouch && S.storyWorld && S.storyWorld.stealth) sight *= 0.5;
      if (this.frenzy) sight *= 1.2;
      let score = 0;
      if (d < sight) {
        const ang = Math.abs(wrapAngle(Math.atan2(p.x - zb.x, p.z - zb.z) - zb.yaw));
        const inCone = ang < 1.25 || d < 3 || zb.alert > 0.6;
        if (inCone && S.world.physics.lineOfSight(zb.x, zb.y + 1.6, zb.z, p.x, p.y + 1.3, p.z)) score = 2 + (sight - d) / sight;
      }
      const hear = def.hear * (p.noise / 10);
      if (!score && d < hear) score = 1 + (hear - d) / hear;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best && bestScore >= 2) {
      zb.target = { kind: best.kind, id: best.id, x: best.x, z: best.z };
      if (zb.state !== 'attack' && zb.state !== 'bash') zb.state = 'chase';
      // son görülen yer + hedefin hız tahmini (görüş kaybolunca nereye gittiği öngörülür)
      const L = zb.lastSeen, now = S.t;
      let vx = 0, vz = 0;
      if (L && L.id === best.id && now - L.t > 0.05 && now - L.t < 2) {
        vx = (best.x - L.x) / (now - L.t); vz = (best.z - L.z) / (now - L.t);
        vx = L.vx * 0.6 + vx * 0.4; vz = L.vz * 0.6 + vz * 0.4;
      }
      zb.alert = 1; zb.lastSeen = { id: best.id, x: best.x, z: best.z, t: now, vx, vz };
    } else if (best && bestScore >= 1 && zb.state !== 'chase') {
      zb.target = { kind: 'pos', x: best.x, z: best.z };
      zb.state = 'investigate'; zb.alert = Math.max(zb.alert, 0.6);
      zb.search = Math.max(zb.search || 0, 1);
    } else if (zb.state === 'chase' && zb.alert < 0.3) {
      zb.state = zb.lastSeen ? 'investigate' : 'wander';
      if (zb.lastSeen) {
        // görüş kaybı: tahmini konuma git (en çok 10 m ileri), oradan 2-3 noktada ara
        const L = zb.lastSeen, k = Math.min(1.6, 10 / Math.max(0.1, Math.hypot(L.vx || 0, L.vz || 0)));
        zb.target = { kind: 'pos', x: L.x + (L.vx || 0) * k, z: L.z + (L.vz || 0) * k };
        zb.search = 2 + (this.rng.next() < 0.5 ? 1 : 0);
      } else zb.target = null;
    }
    zb.alert = Math.max(0, zb.alert - 0.06);
    // lider etkisi
    if (def.leader) for (const z of this.list.values()) if (!z.dead && z !== zb && dist(z.x, z.z, zb.x, zb.z) < 20) { z.boost = 1.25; if (zb.target && z.state === 'idle') { z.target = { ...zb.target }; z.state = zb.state; } }
  }

  targetPos(zb, players) {
    const t = zb.target;
    if (!t) return null;
    if (t.kind === 'pos') return t;
    const p = players.find((q) => q.id === t.id);
    if (!p) { zb.target = null; zb.state = 'wander'; return null; }
    t.x = p.x; t.z = p.z; t.y = p.y;
    return p;
  }

  act(zb, dt, players) {
    const S = this.s;
    const def = zb.def;
    if (zb.state === 'emerge') { zb.speed = 0; zb.emergeT -= dt; if (zb.emergeT <= 0) { zb.state = 'idle'; zb.alert = 0.3; } return; }
    if (zb.state === 'burrow') {
      zb.speed = 0; zb.burrowT -= dt;
      // toprağa döndü: öldürülmüş sayılmaz (ganimet, ceset, sayaç, görev yok), bölge havuzuna geri döner
      if (zb.burrowT <= 0) { if (zb.zone) zb.zone.pop++; this.removeZombie(zb.id); }
      return;
    }
    zb.attackCd -= dt;
    if (zb.stagger > 0) { zb.stagger -= dt; zb.speed = 0; this.moveBy(zb, (zb.kx || 0) * dt, (zb.kz || 0) * dt); zb.kx = (zb.kx || 0) * 0.85; zb.kz = (zb.kz || 0) * 0.85; return; }
    const night = S.time.isNight;
    const speedMul = (def.nightOnly ? (night ? 1.25 : 0.75) : 1) * (zb.boost || 1) * (1 - zb.slow) * (this.frenzy ? 1.2 : 1);
    zb.boost = 1; zb.slow = Math.max(0, zb.slow - dt);
    let goal = null, run = false;
    // çığlıkçı: hedefi görünce çığlık atar (sesle tüm çevreyi çağırır), sonra mesafeyi korur
    if (def.screamer && (zb.state === 'chase' || zb.state === 'attack' || zb.state === 'scream')) {
      const tp = this.targetPos(zb, players);
      zb.screamCd = (zb.screamCd ?? 0) - dt;
      if (zb.state === 'scream') {
        zb.speed = 0;
        if (tp) zb.yaw = Math.atan2(tp.x - zb.x, tp.z - zb.z);
        zb.screamT -= dt;
        if (zb.screamT <= 0) zb.state = 'chase';
        return;
      }
      if (tp) {
        const d = dist(tp.x, tp.z, zb.x, zb.z);
        if (zb.screamCd <= 0 && d < 30) {
          zb.state = 'scream'; zb.screamT = 1.6; zb.screamCd = 11 + this.rng.next() * 5;
          S.emit({ k: 'zfx_scream', id: zb.id, x: zb.x, y: zb.y, z: zb.z });
          S.applyAction('noise', { x: zb.x, z: zb.z, r: 75, src: 'scream' }, null);
          return;
        }
        // mesafe: 9-16 m arasında kal
        if (d < 9) { goal = { x: zb.x + (zb.x - tp.x), z: zb.z + (zb.z - tp.z) }; run = true; }
        else if (d > 16) { goal = tp; run = false; }
        else { zb.speed = Math.max(0, zb.speed - dt * 4); zb.yaw = Math.atan2(tp.x - zb.x, tp.z - zb.z); return; }
        const sp = (run ? def.run : def.walk) * speedMul;
        this.navigate(zb, goal, sp, dt);
        return;
      }
    }
    if (zb.state === 'chase' || zb.state === 'attack') {
      const tp = this.targetPos(zb, players);
      if (tp) {
        goal = tp; run = true;
        const d = dist(tp.x, tp.z, zb.x, zb.z);
        // kuşatma: aynı hedefi kovalayanlar çevresine dağılır (tek sıra yerine çember)
        if (!def.ranged && d > 2.6 && d < 22) {
          const slot = (parseInt(zb.id.slice(1), 10) * 2.399) % (Math.PI * 2);
          const off = Math.min(2.4, d * 0.28);
          goal = { x: tp.x + Math.cos(slot) * off, z: tp.z + Math.sin(slot) * off, y: tp.y };
        }
        // atılma: koşucular ve köpekler son metrelerde hızlanır
        if ((def.dog || zb.type === 'runner') && d < 5 && d > 1.6 && (zb.lungeCd ?? 0) <= 0) { zb.lunge = 0.45; zb.lungeCd = 3; }
        // menzilli (yağmacı)
        if (def.ranged) {
          if (d < 25 && S.world.physics.lineOfSight(zb.x, zb.y + 1.5, zb.z, tp.x, tp.y + 1.2, tp.z)) {
            zb.state = 'aim';
            zb.yaw = Math.atan2(tp.x - zb.x, tp.z - zb.z);
            if (d > 9) goal = null;
            if (zb.attackCd <= 0) { zb.attackCd = def.rate + this.rng.next() * 0.8; this.rangedAttack(zb, tp, d); }
          } else zb.state = 'chase';
        } else if (d < def.reach + (tp.vehicle ? 1.8 : 0.35) && Math.abs((tp.y || zb.y) - zb.y) < 1.6) {
          zb.state = 'attack';
          zb.yaw = Math.atan2(tp.x - zb.x, tp.z - zb.z);
          goal = null;
          if (zb.attackCd <= 0) {
            zb.attackCd = def.rate;
            S.emit({ k: 'zfx', id: zb.id, a: 'attack' });
            const tgt = tp;
            S.later(0.28, () => this.landHit(zb, tgt));
          }
        } else zb.state = 'chase';
      }
    } else if (zb.state === 'investigate') {
      goal = zb.target;
      if (goal && dist(goal.x, goal.z, zb.x, zb.z) < 2) {
        if ((zb.search || 0) > 0) {
          // arama: hedefin son gidiş yönüne meyilli yakın bir nokta (köşe başı, çalı arkası…)
          zb.search--;
          const L = zb.lastSeen;
          const base = L && (L.vx || L.vz) ? Math.atan2(L.vx, L.vz) : this.rng.next() * Math.PI * 2;
          const a = base + (this.rng.next() - 0.5) * 2.4, r = 4 + this.rng.next() * 5;
          zb.target = { kind: 'pos', x: zb.x + Math.sin(a) * r, z: zb.z + Math.cos(a) * r };
          goal = zb.target;
        } else { zb.state = 'wander'; zb.target = null; goal = null; zb.lastSeen = null; }
      }
    } else if (zb.state === 'bash') {
      const b = zb.bash;
      if (!b || this.bashDone(b)) { zb.state = zb.target ? 'chase' : 'wander'; zb.bash = null; zb.path = null; }
      else {
        zb.speed = 0;
        zb.yaw = Math.atan2(b.x - zb.x, b.z - zb.z);
        zb.bashT = (zb.bashT || 0) - dt;
        if (zb.bashT <= 0) {
          zb.bashT = def.rate * 1.1;
          const dmg = def.dmg * def.structDmg * 0.9;
          if (b.kind === 'door') S.applyAction('door_damage', { id: b.ref.id, dmg }, null);
          else if (b.kind === 'window') S.applyAction('window_damage', { id: b.ref.id, dmg }, null);
          else if (b.kind === 'struct') S.applyAction('struct_damage', { id: b.ref.id, dmg }, null);
          S.audio.play('bash', { at: zb, vol: 0.6, range: 35 });
          S.emit({ k: 'zfx', id: zb.id, a: 'attack' });
        }
      }
      return;
    } else {
      // gezinme
      if (!zb.wander || zb.wanderT <= 0) {
        zb.wanderT = 4 + this.rng.next() * 6;
        zb.wander = this.rng.chance(0.4) ? null : { x: zb.x + (this.rng.next() - 0.5) * 16, z: zb.z + (this.rng.next() - 0.5) * 16 };
      }
      zb.wanderT -= dt;
      goal = zb.wander;
      if (zb.horde && zb.target) goal = zb.target;
    }
    if (!goal) { zb.speed = Math.max(0, zb.speed - dt * 4); return; }
    zb.lungeCd = (zb.lungeCd ?? 0) - dt;
    let lungeMul = 1;
    if (zb.lunge > 0) { zb.lunge -= dt; lungeMul = 1.7; }
    const sp = (run ? def.run : def.walk * (zb.state === 'investigate' ? 1.3 : 0.7)) * speedMul * lungeMul;
    this.navigate(zb, goal, sp, dt);
  }

  landHit(zb, tgt) {
    const S = this.s;
    if (zb.dead || zb.stagger > 0) return;
    const d = dist(tgt.x, tgt.z, zb.x, zb.z);
    if (d > zb.def.reach + (tgt.vehicle ? 2.2 : 0.8)) return;
    const dmg = zb.def.dmg * (0.85 + this.rng.next() * 0.3);
    const kind = zb.def.hp > 300 ? 'heavy' : 'zombie';
    if (tgt.kind === 'player') {
      if (tgt.vehicle) S.applyAction('vehicle_damage', { id: tgt.vehicle.id || tgt.vehicle, dmg: dmg * 0.4 }, null);
      else S.emit({ k: 'dmg_player', to: tgt.id, amount: dmg, kind, from: zb.id, grab: !zb.def.dog && !zb.def.crawl && zb.def.hp < 200 && this.rng.chance(0.22) ? 1 : 0 });
    } else if (tgt.kind === 'bot') tgt.bot && S.bots.damage(tgt.bot, dmg);
    else if (tgt.kind === 'npc') tgt.npc && S.npcs.damage(tgt.npc, dmg);
    S.audio.play(zb.def.dog ? 'bark' : 'zattack', { at: zb, vol: 0.9 });
  }

  rangedAttack(zb, tp, d) {
    const S = this.s;
    S.emit({ k: 'zfx', id: zb.id, a: 'attack' });
    S.emit({ k: 'shot_fx', x: zb.x, y: zb.y + 1.45, z: zb.z, tx: tp.x, ty: tp.y + 1.2, tz: tp.z, w: 'pistol' });
    S.applyAction('noise', { x: zb.x, z: zb.z, r: 45, src: 'gun' }, null);
    const hitChance = clamp(0.55 - d * 0.015, 0.12, 0.55);
    if (this.rng.next() < hitChance) {
      const dmg = zb.def.dmg * (0.8 + this.rng.next() * 0.4);
      if (tp.kind === 'player') S.emit({ k: 'dmg_player', to: tp.id, amount: dmg, kind: 'bullet', from: zb.id });
      else if (tp.kind === 'bot') tp.bot && S.bots.damage(tp.bot, dmg);
    }
  }

  bashDone(b) {
    if (b.kind === 'door') return b.ref.broken || (b.ref.open01 > 0.5 && !b.ref.barricade);
    if (b.kind === 'window') return b.ref.broken && !b.ref.barricade;
    if (b.kind === 'struct') return !this.s.build.structures.has(b.ref.id);
    return true;
  }

  /** Hedefe ilerle: doğrudan ya da A* ile; kırılabilir engelde dur ve vur */
  navigate(zb, goal, speed, dt) {
    const S = this.s;
    const nav = S.world.nav;
    zb.repath -= dt;
    if (zb.noPathT > 0) zb.noPathT -= dt;
    const direct = dist(goal.x, goal.z, zb.x, zb.z) < 4 || nav.lineClear(zb.x, zb.z, goal.x, goal.z, false);
    let wx = goal.x, wz = goal.z;
    if (!direct) {
      // yolu biten/bulunamayan zombi kısa bir bekleme sonra yeniden arar: hedef ulaşılamazsa (park etmiş araçlarla ya da
      // engellerle kapanmış alan) findPath en yakın noktaya kısmi yol verir; o yol bitince arama her karede yinelenip
      // kare başına yol bütçesini öbür zombilerden çalıyordu
      if (((!zb.path && !(zb.noPathT > 0)) || zb.repath <= 0) && this.pathBudget > 0) {
        this.pathBudget--;
        zb.repath = 1.2 + this.rng.next() * 0.8;
        zb.path = nav.findPath(zb.x, zb.z, goal.x, goal.z, { allowBreak: true, maxNodes: 6000 });
        zb.pathI = 1;
        // kısmi yol: hedefe ulaşılamadı, en yakın noktaya gidiliyor (ulaşılabilir hedefin yolu bitince hemen yeniden aranır)
        const last = zb.path && zb.path[zb.path.length - 1];
        zb.pathPartial = !last || dist(last.x, last.z, goal.x, goal.z) > 1.5;
        if (!zb.path) zb.noPathT = 0.8;
      }
      if (zb.path && zb.pathI < zb.path.length) {
        const wp = zb.path[zb.pathI];
        wx = wp.x; wz = wp.z;
        if (dist(wp.x, wp.z, zb.x, zb.z) < 0.6) {
          // kırılabilir hücre: engeli bul
          if (wp.type === NAV.DOOR || wp.type === NAV.WINDOW || wp.type === NAV.STRUCT) {
            const b = this.findBreakable(wp.x, wp.z);
            if (b && !this.bashDone(b)) { zb.state = 'bash'; zb.bash = b; return; }
          }
          zb.pathI++;
        }
      } else if (zb.path && zb.pathI >= zb.path.length) { zb.path = null; if (zb.pathPartial) zb.noPathT = 0.8; }
    }
    const dx = wx - zb.x, dz = wz - zb.z;
    const d = Math.hypot(dx, dz) || 1;
    zb.yaw = Math.atan2(dx, dz) + Math.sin(S.t * 2 + zb.x) * 0.08;
    zb.speed = speed;
    // ayrışma
    let sx = 0, sz = 0;
    const k0 = Math.floor(zb.x / 3), k1 = Math.floor(zb.z / 3);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = this.grid.get(((k0 + a) * 7919) ^ (k1 + b));
      if (!arr) continue;
      for (const o of arr) {
        if (o === zb) continue;
        const ox = zb.x - o.x, oz = zb.z - o.z;
        const od = ox * ox + oz * oz;
        if (od < 0.64 && od > 1e-4) { const f = (0.8 - Math.sqrt(od)) * 2; sx += ox * f; sz += oz * f; }
      }
    }
    const before = { x: zb.x, z: zb.z };
    this.moveBy(zb, (dx / d) * speed * dt + sx * dt, (dz / d) * speed * dt + sz * dt);
    // sıkıştıysa kırılabilir engel var mı bak
    const moved = Math.hypot(zb.x - before.x, zb.z - before.z);
    if (moved < speed * dt * 0.2 && _res.hits.length) {
      for (const c of _res.hits) {
        const b = this.breakableFromCollider(c);
        if (b && !this.bashDone(b)) { zb.state = 'bash'; zb.bash = b; break; }
      }
    }
  }

  moveBy(zb, mx, mz) {
    const S = this.s;
    const r = S.world.physics.resolveCircle(zb.x + mx, zb.z + mz, zb.def.dog ? 0.3 : zb.def.hp > 300 ? 0.5 : 0.33, zb.y, zb.y + 1.7, 0.5, null, _res);
    // oyuncu/botların içinden geçme: 0,75 m içindeyse dışarı it (saldırı menzili 1 m+ olduğundan vuruş etkilenmez)
    for (const p of this._players || []) { const dx = r.x - p.x, dz = r.z - p.z, dd = dx * dx + dz * dz; if (dd < 0.5625 && dd > 1e-6 && Math.abs((p.y || zb.y) - zb.y) < 1.6) { const d = Math.sqrt(dd), k = (0.75 - d) / d; r.x += dx * k; r.z += dz * k; } }
    // araçlar dinamik Rapier gövdesi (çarpışma dünyasında yok): park etmiş/sürülen aracın içinden geçme
    // araçlar: çarpışma dünyasında vekil daireleri var (resolveCircle); derin iç içe geçmede (araç üstüne geldi) kutudan
    // dışarı itilir, sonra duvarlara karşı yeniden çözülür (itme bir duvarın öbür yanına geçirmesin)
    if (S.vehicles) { const pv = S.vehicles.pushOut(r.x, r.z, zb.def.dog ? 0.3 : 0.33, zb.y, true); if (pv.x !== r.x || pv.z !== r.z) { const r2 = S.world.physics.resolveCircle(pv.x, pv.z, zb.def.dog ? 0.3 : 0.33, zb.y, zb.y + 1.7, 0.5); if (!S.world.physics.raycast(r.x, zb.y + 0.6, r.z, r2.x - r.x, 0, r2.z - r.z, Math.hypot(r2.x - r.x, r2.z - r.z), (c) => c.kind !== 'vehicle' && !c.isFloor)) { r.x = r2.x; r.z = r2.z; } } }
    const g = S.world.physics.groundHeight(r.x, r.z, zb.y, 0.55);
    if (g - zb.y > 0.6) return; // çok yüksek
    zb.x = r.x; zb.z = r.z;
    zb.y = g;
    // tuzaklar
    S.build.trapCheck(zb);
  }

  breakableFromCollider(c) {
    if (!c || !c.owner) return null;
    if (c.kind === 'door') return { kind: 'door', ref: c.owner, x: c.owner.center.x, z: c.owner.center.z };
    if (c.kind === 'window') return { kind: 'window', ref: c.owner, x: c.owner.center.x, z: c.owner.center.z };
    if (c.kind === 'structure') return { kind: 'struct', ref: c.owner, x: c.owner.x, z: c.owner.z };
    return null;
  }

  findBreakable(x, z) {
    const list = this.s.world.physics.query(x - 0.8, z - 0.8, x + 0.8, z + 0.8);
    for (const c of list) { const b = this.breakableFromCollider(c); if (b) return b; }
    return null;
  }

  removeZombie(id) {
    this.list.delete(id);
    const v = this.views.get(id);
    if (v) { v.dispose(); this.views.delete(id); }
  }

  // ======================================================================= görseller
  updateViews(dt) {
    const S = this.s;
    const cam = S.game.gfx.camera.position;
    for (const [id, v] of this.views) {
      if (S.isHost) {
        const zb = this.list.get(id);
        if (!zb) continue;
        v.pos.set(zb.x, zb.y, zb.z);
        v.state.state = zb.state; v.state.speed = zb.speed; v.state.yaw = zb.yaw; v.state.dead = zb.dead; v.state.bashing = zb.state === 'bash';
      } else {
        v.pos.lerp(v.target, Math.min(1, dt * 10));
        if (v.state.dead && S.t - (v.deadAt || S.t) > 25) { v.dispose(); this.views.delete(id); continue; }
      }
      if (!v.corpse) v.root.position.copy(v.pos);
      // topraktan çıkış / toprağa dönüş: kök yerin altından yükselir ya da batar (toz ve çıkış klibi)
      const st = v.state.state;
      if (st === 'emerge' || st === 'burrow' || v.sink) {
        if (st === 'emerge') { if (v._ph !== 'e') { v._ph = 'e'; v.sink = -1.5; v.emerge && v.emerge(); S.fx && S.fx.dust(v.pos.x, v.pos.y + 0.1, v.pos.z, 6); } v.sink = Math.min(0, v.sink + dt * 0.95); }
        else if (st === 'burrow') { if (v._ph !== 'b') { v._ph = 'b'; v.sink = v.sink || 0; S.fx && S.fx.dust(v.pos.x, v.pos.y + 0.1, v.pos.z, 6); } v.sink = Math.max(-2.2, v.sink - dt * 0.85); }
        else { v._ph = null; v.sink = Math.min(0, v.sink + dt * 2); }
        if (!v.corpse) v.root.position.y += v.sink;
      }
      const d = Math.hypot(v.pos.x - cam.x, v.pos.z - cam.z);
      v.root.visible = d < 150;
      if (!v.root.visible) continue;
      v.lod = (v.lod + 1) % (d > 70 ? 3 : d > 35 ? 2 : 1);
      v.update(dt * (d > 70 ? 3 : d > 35 ? 2 : 1) * (v.lod === 0 ? 1 : 0), v.state, v.lod !== 0);
    }
  }

  /**
   * Şafak: yaşayan (insan olmayan, kalıcı işaretsiz) zombilere toprağa dönüş zamanı verilir. Kovalayanlar en son
   * (40–90 sn), diğerleri 3–40 sn içinde; böylece şafak ani bir "silinme" değil, gözle görülen bir çekilmedir.
   */
  dawn() {
    const S = this.s;
    let n = 0;
    for (const zb of this.list.values()) {
      if (zb.dead || zb.def.human || zb.persist || zb.burrowAt) continue;
      const busy = zb.state === 'chase' || zb.state === 'attack' || zb.state === 'bash';
      zb.burrowAt = S.t + (busy ? 40 + this.rng.next() * 50 : 3 + this.rng.next() * 37);
      n++;
    }
    this.lastDawn = { t: S.t, n };
  }

  // ======================================================================= ağ
  snapshotFor(x, z) {
    const out = [];
    for (const zb of this.list.values()) {
      if (dist(zb.x, zb.z, x, z) > 150) continue;
      out.push([zb.id, zb.type, Math.round(zb.x * 50) / 50, Math.round(zb.y * 50) / 50, Math.round(zb.z * 50) / 50, Math.round(zb.yaw * 100) / 100, zb.state === 'chase' || zb.state === 'attack' ? 1 : zb.state === 'bash' ? 2 : zb.state === 'scream' ? 3 : zb.state === 'emerge' ? 4 : zb.state === 'burrow' ? 5 : 0, Math.round(zb.speed * 10) / 10, zb.dead ? 1 : 0]);
    }
    return out;
  }

  applySnapshot(arr) {
    const seen = new Set();
    for (const [id, type, x, y, z, yaw, st, speed, dead] of arr) {
      seen.add(id);
      let v = this.views.get(id);
      if (!v) v = this.makeView(id, type, x, y, z);
      v.target.set(x, y, z);
      v.state.yaw = yaw; v.state.speed = speed; v.state.bashing = st === 2; v.state.state = st === 1 ? 'chase' : st === 3 ? 'scream' : st === 4 ? 'emerge' : st === 5 ? 'burrow' : 'idle';
      if (dead && !v.state.dead) { v.state.dead = true; v.deadAt = this.s.t; }
    }
    for (const [id, v] of this.views) if (!seen.has(id) && !v.state.dead) { v.dispose(); this.views.delete(id); }
  }

  onHour(hour, day) {
    // takvim sürüleri Events tarafından tetiklenir; burada gece yoğunluğu
    void hour; void day;
  }

  serialize() { return { zones: this.zones.map((z) => [z.region, z.pop, z.killed]) }; }
  load(o) {
    if (!o) return this.init();
    for (const [reg, pop, killed] of o.zones || []) { const z = this.zones.find((q) => q.region === reg); if (z) { z.pop = pop; z.killed = killed; } }
  }
  dispose() { for (const id of [...this.views.keys()]) { this.views.get(id).dispose(); } this.views.clear(); this.list.clear(); this.s.game.scene.remove(this.group); }
}
