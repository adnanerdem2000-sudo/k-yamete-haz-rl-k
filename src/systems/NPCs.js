// NPC'ler (komşular, tüccar, asker, bilim insanı, kayıp çocuk, köpek Karabaş), vahşi hayvanlar
// (geyik, tavşan, tilki, yaban domuzu, kurt, ayı), avcılık ve balıkçılık.
import * as THREE from 'three';
import { Avatar } from '../entities/Avatar.js';
import { NPCS, QUESTS } from '../data/story.js';
import { ITEMS } from '../data/items.js';
import { RNG, dist, clamp, dampAngle, wrapAngle } from '../core/util.js';
import { forestMask } from '../world/Terrain.js';
import { rayCyl } from './Combat.js';

const ANIMALS = {
  deer: { name: 'Geyik', hp: 60, speed: 7, size: [0.45, 1.1, 1.3], color: '#b07a4a', flee: true, drops: [['raw_meat', 3], ['leather', 1]], leg: 0.75, antlers: true },
  rabbit: { name: 'Tavşan', hp: 12, speed: 6.5, size: [0.25, 0.3, 0.4], color: '#c8b8a0', flee: true, drops: [['raw_meat', 1]], leg: 0.18 },
  fox: { name: 'Tilki', hp: 25, speed: 6, size: [0.3, 0.45, 0.8], color: '#d2691e', flee: true, drops: [['leather', 1], ['raw_meat', 1]], leg: 0.3 },
  boar: { name: 'Yaban Domuzu', hp: 90, speed: 5.5, size: [0.55, 0.75, 1.2], color: '#5b4636', aggro: 6, dmg: 14, drops: [['raw_meat', 3], ['leather', 1]], leg: 0.35, tusks: true },
  wolf: { name: 'Kurt', hp: 70, speed: 7.5, size: [0.38, 0.7, 1.15], color: '#7d7d7d', aggro: 16, dmg: 12, drops: [['raw_meat', 2], ['leather', 1]], leg: 0.5, pack: true },
  bear: { name: 'Ayı', hp: 320, speed: 6, size: [0.9, 1.3, 1.9], color: '#4a3020', aggro: 10, dmg: 30, drops: [['raw_meat', 6], ['leather', 3]], leg: 0.55 },
};
const FISH = { lake: ['Alabalık', 'Sazan', 'Levrek', 'Turna'], sea: ['Lüfer', 'Kefal', 'Somon', 'Levrek'] };

class NPC {
  constructor(sys, def, x, z) {
    this.sys = sys; this.def = def; this.id = def.id;
    const S = sys.s;
    this.avatar = new Avatar(S.game, def.look, { name: def.name, color: '#ffe0a8' });
    this.pos = new THREE.Vector3(x, S.world.physics.groundHeight(x, z, 1e9), z);
    this.home = { x, z };
    this.yaw = Math.random() * 6;
    this.speed = 0;
    this.visible = true; this.alive = true;
    this.hp = 100;
    this.follow = null;
    this.goal = null;
    this.t = 0;
    S.game.scene.add(this.avatar.root);
  }
  setVisible(v) { this.visible = v; this.avatar.root.visible = v; }
}

class Animal {
  constructor(sys, type, x, z) {
    this.sys = sys; this.type = type; this.def = ANIMALS[type];
    this.id = 'a' + Math.random().toString(36).slice(2, 8);
    this.hp = this.def.hp;
    this.x = x; this.z = z; this.y = sys.s.world.terrain.heightAt(x, z);
    this.yaw = Math.random() * 6; this.speed = 0; this.state = 'graze'; this.t = Math.random() * 5; this.phase = 0;
    this.dead = false; this.atkCd = 0;
    this.build();
  }
  build() {
    const d = this.def, [w, h, l] = d.size;
    const c = new THREE.Color(d.color);
    const M = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, flatShading: true });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, l), M(c));
    body.position.y = d.leg + h * 0.25;
    g.add(body);
    const head = new THREE.Group();
    const hd = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.4, l * 0.35), M(c.clone().multiplyScalar(0.92)));
    head.add(hd);
    const sn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, h * 0.22, l * 0.2), M(c.clone().multiplyScalar(0.8)));
    sn.position.set(0, -h * 0.06, l * 0.24); head.add(sn);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.025, w * 0.06), 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      eye.position.set(s * w * 0.3, h * 0.06, l * 0.15); head.add(eye);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(w * 0.12, h * 0.25, 4), M(c));
      ear.position.set(s * w * 0.25, h * 0.25, -l * 0.05); head.add(ear);
      if (d.antlers) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.55, 5), M('#e8dcc0')); a.position.set(s * 0.12, h * 0.45, 0); a.rotation.z = s * 0.4; head.add(a); const a2 = a.clone(); a2.scale.setScalar(0.6); a2.position.set(s * 0.22, h * 0.6, 0.05); a2.rotation.z = s * 0.9; head.add(a2); }
      if (d.tusks) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), M('#fffbe6')); t.position.set(s * w * 0.15, -h * 0.1, l * 0.32); t.rotation.x = -1; head.add(t); }
    }
    head.position.set(0, d.leg + h * 0.45, l * 0.55);
    g.add(head);
    this.head = head;
    this.legs = [];
    for (const [x, z] of [[-w * 0.35, l * 0.35], [w * 0.35, l * 0.35], [-w * 0.35, -l * 0.35], [w * 0.35, -l * 0.35]]) {
      const p = new THREE.Group(); p.position.set(x, d.leg, z);
      const lg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, d.leg, w * 0.22), M(c.clone().multiplyScalar(0.85)));
      lg.position.y = -d.leg / 2; p.add(lg); g.add(p); this.legs.push(p);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.15, w * 0.15, l * 0.25), M(c));
    tail.position.set(0, d.leg + h * 0.35, -l * 0.6); tail.rotation.x = -0.5; g.add(tail);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.root = g;
    this.sys.group.add(g);
  }
}

export class NPCs {
  constructor(session) {
    this.s = session;
    this.list = [];
    this.animals = [];
    this.group = new THREE.Group();
    session.game.scene.add(this.group);
    this.rng = new RNG(session.seed + ':npc');
    this.dog = null;
    this.fishing = null;
    const S = session;
    S.on('npc_state', (p) => S.emit({ k: 'npc_state', ...p }));
    S.onEvt('npc_state', (e) => { const n = this.byId(e.id); if (!n) return; if (e.visible !== undefined) n.setVisible(e.visible); if (e.follow !== undefined) n.follow = e.follow; if (e.x !== undefined) { n.pos.set(e.x, S.world.physics.groundHeight(e.x, e.z, 1e9), e.z); n.home = { x: e.x, z: e.z }; } if (e.alive === false) { n.alive = false; n.setVisible(false); } });
    S.on('animal_hit', (p, from) => this.hitAnimal(p.id, p.dmg, from));
    S.onEvt('animal_die', (e) => { const a = this.animals.find((x) => x.id === e.id); if (a) { a.dead = true; a.deadT = 0; } });
  }

  init() {
    const W = this.s.world;
    const b = (id) => W.buildingById[id];
    const front = (bid, dz = 2) => { const bb = b(bid); const p = bb.frame.pt(bb.tpl.w / 2 - 2, bb.tpl.d + dz); return p; };
    const add = (id, x, z, vis = true) => { const n = new NPC(this, NPCS[id], x, z); n.setVisible(vis); this.list.push(n); return n; };
    const h = front('n1'); add('hasan', h.x, h.z);
    const a = front('s3'); add('ayse', a.x, a.z);
    add('can', -201, 232); // parkta kayıp
    add('kemal', 270, -238, false);
    add('riza', 58, 306, false);
    add('selin', -85, -38, false);
    add('kurt', -230, 160, false);
    this.byId('can').zombieTarget = true;
    // köpek Karabaş (orman kenarı)
    this.spawnDog(-262, 42);
  }

  byId(id) { return this.list.find((n) => n.id === id); }
  spawnAnimal(type, x, z) { this.animals.push(new Animal(this, type, x, z)); }

  spawnDog(x, z) {
    const S = this.s;
    const m = S.game.assets.model('props', 'dogue');
    const box = new THREE.Box3().setFromObject(m);
    const g = new THREE.Group();
    m.scale.setScalar(0.38);
    m.position.y = -box.min.y * 0.38;
    m.rotation.y = 0;
    g.add(m);
    g.position.set(x, S.world.terrain.heightAt(x, z), z);
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this.dog = { root: g, model: m, x, z, yaw: 0, follow: false, t: 0, found: false, barkT: 0 };
  }

  // ======================================================================= konuşma
  talk(n) {
    const S = this.s;
    const def = n.def;
    const choices = [];
    const greet = def.greet[Math.floor(Math.random() * def.greet.length)];
    // görev ver / teslim al
    for (const [qid, q] of Object.entries(QUESTS)) {
      if (q.giver !== n.id) continue;
      const st = S.quests.state(qid);
      if (!st) choices.push({ text: `📜 Görev: ${q.title}`, onSelect: () => { S.act('quest_start', { id: qid }); S.ui.closeDialog(); } });
      else if (st === 'active') {
        for (const o of q.objs) if (o.t === 'deliver' && o.to === n.id) {
          const ids = [o.item, ...(o.alt || [])];
          const have = ids.reduce((acc, id) => acc + S.inventory.count(id), 0);
          if (have >= o.count) choices.push({ text: `🎁 Teslim et: ${ITEMS[o.item].name} x${o.count}`, onSelect: () => { let left = o.count; for (const id of ids) left -= S.inventory.remove(id, left); S.act('quest_deliver', { id: qid, item: o.item }); S.ui.closeDialog(); } });
        }
      }
    }
    if (n.id === 'can' && !S.flags.can_home) {
      choices.push({ text: n.follow ? 'Burada bekle.' : 'Benimle gel, seni ananeye götüreyim.', onSelect: () => { S.act('npc_state', { id: 'can', follow: n.follow ? null : S.localId }); S.quests.onTalk('can'); S.ui.closeDialog(); } });
    }
    if (n.id === 'ayse' && !S.flags.can_home) {
      const can = this.byId('can');
      if (can && dist(can.pos.x, can.pos.z, n.pos.x, n.pos.z) < 8) choices.push({ text: 'Can\'ı getirdim!', onSelect: () => { S.act('flag', { flag: 'can_home', value: 1 }); S.act('npc_state', { id: 'can', follow: null, x: n.pos.x + 1, z: n.pos.z }); S.results.rescued++; S.ui.closeDialog(); S.ui.toast('Ayşe Teyze gözyaşlarıyla teşekkür etti. (+Moral)', 'good', 4); S.localStats.morale = Math.min(100, S.localStats.morale + 15); } });
    }
    if (n.id === 'can' && S.flags.can_home && !S.flags.dog_found && !S.quests.state('s_can_dog')) choices.push({ text: '📜 Görev: Karabaş', onSelect: () => { S.act('quest_start', { id: 's_can_dog' }); S.ui.closeDialog(); } });
    if (def.trade) choices.push({ text: '💰 Takas yap', onSelect: () => { S.ui.closeDialog(); S.ui.openTrade(n); } });
    if (n.id === 'riza' && S.quests.state('s_riza_fuel') === 'active') {
      const jc = S.inventory.slots.findIndex((s) => s && s.id === 'jerrycan' && s.fuel >= 19);
      if (jc >= 0) choices.push({ text: '⛽ Dolu bidonu ver', onSelect: () => { S.inventory.takeAt(jc, 1); S.act('flag', { flag: 'riza_fuel', value: 1 }); S.ui.closeDialog(); } });
    }
    if (n.id === 'kemal') {
      const rel = S.relations.military || 0;
      choices.push({ text: `🪖 Tahliye listesi? (İlişki: ${rel})`, onSelect: () => { S.ui.closeDialog(); S.ui.openDialog({ speaker: def.name, text: rel >= 50 ? (S.flags.antenna_built ? 'Adınız listede. 30. gün saat 20:00, helikopter pisti. Geç kalmayın!' : 'Listedesiniz ama telsiz anteniniz olmadan sizi bulamayız. Üssünüze anten kurun.') : 'Henüz olmaz. Bize yardım edin: künyeler, numune… Güvenimizi kazanın.', choices: [{ text: 'Anlaşıldı.', onSelect: () => S.ui.closeDialog() }] }); } });
      if (S.inventory.has('medal') && S.quests.state('s_kemal_tags') !== 'active') choices.push({ text: `🎖️ Künye ver (+askerî ilişki)`, onSelect: () => { S.inventory.remove('medal', 1); S.act('rel', { faction: 'military', delta: 8 }); S.ui.toast('Çavuş Kemal minnettar. (+8 ilişki)', 'good'); S.ui.closeDialog(); } });
    }
    if (n.id === 'selin') choices.push({ text: 'Proje Kızılçam nedir?', onSelect: () => { S.ui.openDialog({ speaker: def.name, text: 'Ormandaki kızıl çam mantarından "yenilenme serumu" yapmaya çalıştık. Denekler iyileşti… ama artık insan değillerdi. Sızıntı kaza değildi. Numuneyi askerlere ulaştırın — aşı için tek umut. Karantina odası tesisin arka koridorunda; kart gerekiyor.', choices: [{ text: 'Yardım edeceğiz.', onSelect: () => { S.ui.closeDialog(); if (!S.quests.state('s_kemal_sample')) S.act('quest_start', { id: 's_kemal_sample' }); } }] }); } });
    if (n.id === 'kurt') choices.push({ text: 'Ne istiyorsun?', onSelect: () => { S.ui.closeDialog(); S.events.raiderNegotiation(); } });
    choices.push({ text: 'Görüşürüz.', onSelect: () => S.ui.closeDialog() });
    S.ui.openDialog({ speaker: `${def.name} — ${def.role}`, text: greet, choices, npc: n });
    S.quests.onTalk(n.id);
    n.yaw = Math.atan2(S.local.pos.x - n.pos.x, S.local.pos.z - n.pos.z);
    n.avatar.play('wave', 1.2);
  }

  /** Tüccar takas fiyatları (para) */
  priceOf(id) {
    const def = ITEMS[id];
    const base = { common: 6, uncommon: 18, rare: 45, epic: 120, story: 0 }[def.rarity] || 5;
    const catMul = { weapon: 2, ammo: 0.12, med: 1.4, car: 1.8, food: 1, drink: 1, build: 0.8, tool: 1.5, wear: 1.3, misc: 1 }[def.cat] || 1;
    return Math.max(1, Math.round(base * catMul));
  }

  // ======================================================================= hasar
  damage(n, dmg) {
    n.hp -= dmg;
    n.avatar.flinch(1);
    if (n.hp <= 0 && n.alive) {
      this.s.applyAction('npc_state', { id: n.id, alive: false }, null);
      this.s.emit({ k: 'toast', text: `${n.def.name} hayatını kaybetti…`, kind: 'danger', dur: 5 });
      this.s.applyAction('team_morale', { amount: -15 }, null);
    }
  }

  meleeHit(pos, fx, fz, range, dmg) {
    let hits = 0;
    for (const a of this.animals) {
      if (a.dead) continue;
      const dx = a.x - pos.x, dz = a.z - pos.z, d = Math.hypot(dx, dz);
      if (d > range + a.def.size[2] * 0.5) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.3) continue;
      this.s.act('animal_hit', { id: a.id, dmg });
      this.s.fx.hit(a.x, a.y + 0.7, a.z, 'flesh');
      hits++;
    }
    return hits;
  }

  rayHit(o, d, maxD) {
    let best = null, bd = maxD;
    for (const a of this.animals) {
      if (a.dead) continue;
      const t = rayCyl(o, d, a.x, a.z, a.def.size[0] * 0.8 + 0.15, a.y, a.y + a.def.leg + a.def.size[1]);
      if (t !== null && t > 1.5 && t < bd) { bd = t; best = { dist: t, npc: a, point: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t } }; }
    }
    return best;
  }

  shotHit(a, dmg) {
    this.s.act('animal_hit', { id: a.id, dmg });
    this.s.fx.hit(a.x, a.y + 0.7, a.z, 'flesh');
  }

  hitAnimal(id, dmg, from) {
    const S = this.s;
    const a = this.animals.find((x) => x.id === id);
    if (!a || a.dead) return;
    a.hp -= dmg;
    a.state = a.def.flee ? 'flee' : 'attack';
    a.target = from;
    if (a.hp <= 0) {
      S.emit({ k: 'animal_die', id: a.id });
      const hunt = from && S.players.get(from) && S.players.get(from).charId === 'elif' ? 1.5 : 1;
      for (const [it, n] of a.def.drops) S.applyAction('ground_drop', { stack: { id: it, qty: Math.max(1, Math.round(n * hunt)) }, x: a.x, y: a.y, z: a.z }, from);
      S.emit({ k: 'toast', text: `${a.def.name} avlandı.`, kind: 'good', dur: 2 });
    }
  }

  // ======================================================================= balıkçılık
  startFishing(spot) {
    const S = this.s;
    const inv = S.inventory;
    if (!inv.has('fishing_rod')) { S.ui.toast('Olta gerekli.', 'warn'); return; }
    if (this.fishing) return;
    const bait = inv.has('bait');
    const wait = (bait ? 2.5 : 5) + Math.random() * (bait ? 3 : 6);
    S.local.avatar.play('fish', wait + 3);
    S.local.avatar.action.loop = true;
    this.fishing = { spot, t: 0, bite: wait, window: 1.1, bait };
    S.ui.toast('Olta atıldı… Vurgun gelince E\'ye bas!', 'info', 3);
    S.audio.play('splash', { vol: 0.5 });
  }

  updateFishing(dt) {
    const S = this.s;
    const f = this.fishing;
    if (!f) return;
    f.t += dt;
    if (S.local.speed > 0.5) { this.fishing = null; S.local.avatar.action = null; S.ui.toast('Balık tutma iptal.', 'info', 1.5); return; }
    if (f.t >= f.bite && !f.biting) { f.biting = true; S.audio.play('splash', { vol: 0.9 }); S.ui.setPrompt({ label: '🎣 VURGUN! Hemen E\'ye bas!', key: 'E', progress: 0 }); }
    if (f.biting && S.game.input.wasPressed('interact')) {
      const ok = f.t - f.bite <= f.window;
      this.fishing = null; S.local.avatar.action = null;
      if (ok) {
        const pool = FISH[f.spot.water === 'sea' ? 'sea' : 'lake'];
        const name = pool[Math.floor(Math.random() * pool.length)];
        if (f.bait) S.inventory.remove('bait', 1);
        S.giveLocal('raw_fish', 1);
        S.ui.toast(`🐟 ${name} tuttun! (Çiğ Balık)`, 'good', 3);
        S.localStats.morale = Math.min(100, S.localStats.morale + 3);
        const rod = S.inventory.slots.find((s) => s && s.id === 'fishing_rod');
        if (rod && rod.dur !== undefined) { rod.dur -= 2; if (rod.dur <= 0) { S.inventory.remove('fishing_rod', 1); S.ui.toast('Olta kırıldı!', 'warn'); } }
      } else S.ui.toast('Balık kaçtı…', 'info', 2);
    } else if (f.biting && f.t - f.bite > f.window) { this.fishing = null; S.local.avatar.action = null; S.ui.toast('Balık kaçtı…', 'info', 2); }
  }

  // ======================================================================= güncelleme
  update(dt) {
    const S = this.s;
    this.updateFishing(dt);
    const day = S.time.day, hour = S.time.hour;
    const night = S.time.isNight;
    // görünürlük takvimi (host)
    if (S.isHost) {
      this._schedT = (this._schedT || 0) - dt;
      if (this._schedT <= 0) {
        this._schedT = 2;
        const want = { kemal: day >= 8, selin: day >= 17, riza: (day >= 2 && day % 3 === 2 && hour >= 9 && hour < 17) || !!S.flags.trader_here };
        for (const [id, v] of Object.entries(want)) { const n = this.byId(id); if (n && n.alive && n.visible !== v) S.applyAction('npc_state', { id, visible: v }, null); }
      }
    }
    for (const n of this.list) {
      if (!n.visible || !n.alive) continue;
      n.t += dt;
      let goal = null, sp = 0;
      if (n.follow) {
        const pl = n.follow === S.localId ? S.local.pos : S.players.get(n.follow)?.pos;
        if (pl && dist(pl.x, pl.z, n.pos.x, n.pos.z) > 2.5) { goal = pl; sp = dist(pl.x, pl.z, n.pos.x, n.pos.z) > 6 ? 4.2 : 2; }
      } else if (n.id === 'hasan' || n.id === 'ayse') {
        if (!n.goal || n.t > 8) { n.t = 0; n.goal = night ? n.home : { x: n.home.x + (Math.random() - 0.5) * 8, z: n.home.z + (Math.random() - 0.5) * 6 }; }
        if (dist(n.goal.x, n.goal.z, n.pos.x, n.pos.z) > 0.6) { goal = n.goal; sp = 1.3; }
      }
      if (goal) {
        const dx = goal.x - n.pos.x, dz = goal.z - n.pos.z, d = Math.hypot(dx, dz);
        n.yaw = dampAngle(n.yaw, Math.atan2(dx, dz), 8, dt);
        const r = S.world.physics.resolveCircle(n.pos.x + dx / d * sp * dt, n.pos.z + dz / d * sp * dt, 0.3, n.pos.y, n.pos.y + 1.7, 0.55);
        n.pos.x = r.x; n.pos.z = r.z;
        n.pos.y = S.world.physics.groundHeight(n.pos.x, n.pos.z, n.pos.y, 0.55);
        n.speed = sp;
      } else n.speed = 0;
      n.avatar.root.position.copy(n.pos);
      n.avatar.update(dt, { mode: 'ground', speed: n.speed, yaw: n.yaw, pitch: 0 });
      // Can eve vardığında
      if (n.id === 'can' && n.follow && !S.flags.can_home) {
        const ay = this.byId('ayse');
        if (ay && dist(ay.pos.x, ay.pos.z, n.pos.x, n.pos.z) < 5 && S.isHost) { S.applyAction('flag', { flag: 'can_home', value: 1 }, null); S.applyAction('npc_state', { id: 'can', follow: null }, null); S.results.rescued++; S.emit({ k: 'toast', text: 'Can, ananesine kavuştu! (+Moral)', kind: 'good', dur: 4 }); }
      }
    }
    this.updateDog(dt);
    this.updateAnimals(dt);
  }

  updateDog(dt) {
    const S = this.s;
    const d = this.dog;
    if (!d) return;
    d.t += dt;
    const p = S.local.pos;
    const pd = dist(p.x, p.z, d.x, d.z);
    if (!d.found && pd < 3) {
      d.found = true; d.follow = true;
      S.act('flag', { flag: 'dog_found', value: 1 });
      S.ui.toast('🐕 Karabaş seni buldu! Artık ekibin bir parçası.', 'good', 4);
    }
    let tx = d.x, tz = d.z, sp = 0;
    if (d.follow) {
      const base = S.world.home;
      const inBase = S.isInBase(p);
      const tgt = inBase || pd < 40 ? p : { x: base.spec.x + 4, z: base.spec.z - 12 };
      const td = dist(tgt.x, tgt.z, d.x, d.z);
      if (td > 3) { tx = tgt.x; tz = tgt.z; sp = td > 8 ? 6.5 : 3; }
    }
    if (sp > 0) {
      const dx = tx - d.x, dz = tz - d.z, l = Math.hypot(dx, dz);
      const r = S.world.physics.resolveCircle(d.x + dx / l * sp * dt, d.z + dz / l * sp * dt, 0.3, d.root.position.y, d.root.position.y + 0.8, 0.55);
      d.x = r.x; d.z = r.z;
      d.yaw = dampAngle(d.yaw, Math.atan2(dx, dz), 8, dt);
    }
    d.root.position.set(d.x, S.world.physics.groundHeight(d.x, d.z, d.root.position.y + 0.5, 0.6) + (sp > 0 ? Math.abs(Math.sin(d.t * 12)) * 0.08 : 0), d.z);
    d.root.rotation.y = d.yaw;
    // zombi yaklaşınca havla (alarm)
    d.barkT -= dt;
    if (d.follow && d.barkT <= 0) {
      const z = S.zombies.nearestTo(d.x, d.z, 18);
      if (z) { d.barkT = 3; S.audio.play('bark', { at: d.root.position, vol: 1 }); if (Math.random() < 0.3) S.ui.toast('🐕 Karabaş havlıyor: zombi yakında!', 'warn', 2); }
    }
  }

  updateAnimals(dt) {
    const S = this.s;
    const p = S.local.pos;
    // nüfus (host)
    if (S.isHost) {
      this._spawnT = (this._spawnT || 0) - dt;
      if (this._spawnT <= 0) {
        this._spawnT = 3;
        const alive = this.animals.filter((a) => !a.dead).length;
        const fm = forestMask(p.x, p.z);
        if (alive < 7 && (fm > 0.3 || p.y > 25)) {
          const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 40;
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
          if (!S.world.terrain.isWater(x, z) && !S.world.buildingAt(x, z) && forestMask(x, z) > 0.25) {
            const type = this.rng.weighted([['deer', 4], ['rabbit', 5], ['fox', 2], ['boar', 2], ['wolf', S.time.isNight ? 3 : 1], ['bear', 0.3]]);
            const n = ANIMALS[type].pack ? 3 : 1;
            for (let i = 0; i < n; i++) this.animals.push(new Animal(this, type, x + i * 1.5, z + i));
          }
        }
      }
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      const pd = dist(a.x, a.z, p.x, p.z);
      if (a.dead) {
        a.deadT += dt;
        a.root.rotation.z = Math.min(1, a.deadT * 3) * Math.PI / 2;
        if (a.deadT > 20) { this.group.remove(a.root); this.animals.splice(i, 1); }
        continue;
      }
      if (pd > 160) { this.group.remove(a.root); this.animals.splice(i, 1); continue; }
      a.t += dt;
      a.atkCd -= dt;
      // davranış
      if (a.def.flee) { if (pd < (S.local.mode === 'crouch' ? 9 : 18)) a.state = 'flee'; else if (a.state === 'flee' && pd > 35) a.state = 'graze'; }
      else if (a.def.aggro && pd < a.def.aggro) a.state = 'attack';
      else if (a.state === 'attack' && pd > a.def.aggro * 2.5) a.state = 'graze';
      let sp = 0, ty = a.yaw;
      if (a.state === 'flee') { ty = Math.atan2(a.x - p.x, a.z - p.z); sp = a.def.speed; }
      else if (a.state === 'attack') {
        ty = Math.atan2(p.x - a.x, p.z - a.z); sp = pd > 1.6 ? a.def.speed * 0.9 : 0;
        if (pd < 1.9 && a.atkCd <= 0 && S.isHost) { a.atkCd = 1.4; S.damageLocal(a.def.dmg, a.type === 'bear' ? 'heavy' : 'zombie'); S.audio.play('bark', { at: a, vol: 0.8, rate: a.type === 'bear' ? 0.5 : 1 }); }
      } else {
        if (a.t > 4) { a.t = 0; a.wy = Math.random() * 6.28; a.walk = Math.random() < 0.5; }
        ty = a.wy ?? a.yaw; sp = a.walk ? 1.2 : 0;
      }
      a.yaw = dampAngle(a.yaw, ty, 5, dt);
      if (sp > 0) {
        const r = S.world.physics.resolveCircle(a.x + Math.sin(a.yaw) * sp * dt, a.z + Math.cos(a.yaw) * sp * dt, a.def.size[0] * 0.6, a.y, a.y + 1.2, 0.6);
        if (!S.world.terrain.isWater(r.x, r.z)) { a.x = r.x; a.z = r.z; }
        a.y = S.world.terrain.heightAt(a.x, a.z);
      }
      a.phase += sp * dt * 4;
      const sw = Math.sin(a.phase) * Math.min(1, sp / 3) * 0.7;
      a.legs[0].rotation.x = sw; a.legs[3].rotation.x = sw; a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw;
      a.head.rotation.x = sp === 0 && a.state === 'graze' ? 0.6 : 0;
      a.root.position.set(a.x, a.y, a.z);
      a.root.rotation.y = a.yaw;
    }
  }

  serialize() {
    return { npcs: this.list.map((n) => ({ id: n.id, x: n.pos.x, z: n.pos.z, vis: n.visible, alive: n.alive, follow: n.follow })), dog: this.dog ? { x: this.dog.x, z: this.dog.z, found: this.dog.found } : null };
  }
  load(o) {
    if (!this.list.length) this.init();
    if (!o) return;
    for (const d of o.npcs || []) { const n = this.byId(d.id); if (!n) continue; n.pos.set(d.x, this.s.world.physics.groundHeight(d.x, d.z, 1e9), d.z); n.setVisible(d.vis); n.alive = d.alive; n.follow = d.follow; if (!d.alive) n.setVisible(false); }
    if (o.dog && this.dog) { this.dog.x = o.dog.x; this.dog.z = o.dog.z; this.dog.found = o.dog.found; this.dog.follow = o.dog.found; }
  }
  dispose() {
    for (const n of this.list) n.avatar.dispose();
    this.list = [];
    this.s.game.scene.remove(this.group);
  }
}

export { ANIMALS, clamp, wrapAngle };
