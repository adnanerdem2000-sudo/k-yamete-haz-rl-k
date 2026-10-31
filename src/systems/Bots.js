// Yapay zekâ takım arkadaşları: oyuncuyu takip eder, zombilerle savaşır, yere düşeni kaldırır,
// verilen yiyecek/ilacı kullanır. Host simüle eder; istemciler anlık görüntüden çizer.
import * as THREE from 'three';
import { Avatar } from '../entities/Avatar.js';
import { CHARACTERS, CHARACTER_IDS } from '../entities/CharacterFactory.js';
import { PlayerStats } from './PlayerStats.js';
import { ITEMS } from '../data/items.js';
import { RNG, dist, clamp } from '../core/util.js';

const KIT = {
  mert: { melee: 'wrench', gun: null },
  zulal: { melee: 'knife', gun: null },
  deniz: { melee: 'bat', gun: 'pistol' },
  elif: { melee: 'knife', gun: 'bow' },
  bora: { melee: 'hammer', gun: null },
  ceren: { melee: 'pipe', gun: null },
};
const LINES = {
  hungry: ['Acıktım… bir şeyin var mı?', 'Midem kazınıyor, yiyecek lazım.', 'Bir konserve bulsak fena olmaz.'],
  thirsty: ['Susadım. Su var mı?', 'Boğazım kurudu…'],
  thanks: ['Sağ ol!', 'Eline sağlık.', 'Tam ihtiyacım olan şey!'],
  downed: ['Yardım edin! Yere düştüm!', 'Kalkamıyorum! Biri gelsin!'],
  revived: ['Teşekkürler, borçluyum.', 'Az kalsın gidiyordum…'],
  revive: ['Dayan, geliyorum!', 'Seni kaldırıyorum, kıpırdama!'],
  fight: ['Zombi var!', 'Arkanı kolla!', 'Şunlara bak…', 'Geliyorlar!'],
  follow: ['Arkandayım.', 'Tamam, peşindeyim.'],
  stay: ['Burada bekliyorum.', 'Tamam, burayı tutuyorum.'],
  base: ['Üsse dönüyorum, nöbet tutarım.', 'Evde görüşürüz.'],
  ammo: ['Mermim bitti, yakın dövüşe geçiyorum!'],
};
const ORDERS = { follow: 'Takip et', stay: 'Burada bekle', base: 'Üsse dön, nöbet tut' };
const _res = { x: 0, z: 0, hit: false, hits: [] };

class Bot {
  constructor(sys, charId, o = {}) {
    const S = sys.s;
    this.sys = sys;
    this.id = 'bot_' + charId;
    this.charId = charId;
    this.def = CHARACTERS[charId];
    this.name = this.def.name.charAt(0) + this.def.name.slice(1).toLocaleLowerCase('tr');
    this.isBot = true;
    this.stats = new PlayerStats(this.def.stats, S.diff.needs);
    if (o.stats) this.stats.load(o.stats);
    this.inv = o.inv ? o.inv.map((s) => ({ ...s })) : [{ id: 'canned_food', qty: 1 }, { id: 'water_bottle', qty: 1 }];
    this.kit = KIT[charId] || KIT.mert;
    this.ammo = o.ammo ?? (this.kit.gun === 'bow' ? 14 : this.kit.gun ? 24 : 0);
    this.order = o.order || 'follow';
    this.anchor = o.anchor || null;
    this.pos = new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0);
    this.yaw = o.yaw || 0;
    this.speed = 0;
    this.mode = 'ground';
    this.cool = 0; this.think = 0; this.repath = 0; this.path = null; this.pathI = 0;
    this.target = null; this.reviving = null; this.reviveT = 0;
    this.talkT = 10 + Math.random() * 20;
    this.downT = 0;
    this.vehicleId = null;
    this.aim = false;
    this.avatar = new Avatar(S.game, this.def.look, { name: this.name, color: this.def.color });
    S.game.scene.add(this.avatar.root);
    this.avatar.root.position.copy(this.pos);
    this.held = null;
    this.setHeld(this.kit.gun && this.ammo > 0 ? this.kit.gun : this.kit.melee);
  }

  setHeld(id) { if (this.held === id) return; this.held = id; this.avatar.hold(id); }

  say(key) {
    const arr = LINES[key];
    if (!arr) return;
    const S = this.sys.s;
    S.emit({ k: 'chat', from: this.id, name: this.name, text: arr[Math.floor(Math.random() * arr.length)] });
  }

  dispose() { this.avatar.dispose(); }
}

/** İstemci tarafı temsil (anlık görüntüden) */
class BotProxy {
  constructor(sys, a) {
    const S = sys.s;
    this.id = a[0]; this.charId = a[1];
    this.def = CHARACTERS[this.charId];
    this.name = this.def.name.charAt(0) + this.def.name.slice(1).toLocaleLowerCase('tr');
    this.isBot = true;
    this.pos = new THREE.Vector3(a[2], a[3], a[4]);
    this.target = this.pos.clone();
    this.stats = { health: 100, maxHealth: 100, hunger: 100, thirst: 100, downed: false };
    this.anim = { mode: 'ground', speed: 0, yaw: 0 };
    this.avatar = new Avatar(S.game, this.def.look, { name: this.name, color: this.def.color });
    S.game.scene.add(this.avatar.root);
  }
  dispose() { this.avatar.dispose(); }
}

export class Bots {
  constructor(session) {
    this.s = session;
    this.list = [];
    this.rng = new RNG(session.seed + ':bots');
    const S = session;
    S.on('bot_order', (p) => { const b = this.byId(p.id); if (b && b.order !== undefined) { b.order = p.order; b.anchor = p.order === 'stay' ? { x: b.pos.x, z: b.pos.z } : null; b.say(p.order); } });
    S.onEvt('bot_fx', (e) => this.onFx(e));
  }

  byId(id) { return this.list.find((b) => b.id === id); }
  count() { return this.list.length; }
  orders() { return ORDERS; }

  /** n yapay zekâ arkadaş ekle (yerel oyuncudan farklı karakterler) */
  spawn(n) {
    const S = this.s;
    const taken = new Set([...S.players.values()].map((p) => p.charId));
    const free = CHARACTER_IDS.filter((c) => !taken.has(c) && !this.byId('bot_' + c));
    const p = S.local.pos;
    for (let i = 0; i < n && i < free.length; i++) {
      const a = (i + 1) * 1.9;
      const x = p.x + Math.sin(a) * 2.4, z = p.z + Math.cos(a) * 2.4;
      const y = S.world.physics.groundHeight(x, z, p.y + 2);
      const b = new Bot(this, free[i], { x, y, z });
      this.list.push(b);
    }
  }

  // ======================================================================= hasar / kaldırma / eşya
  damage(b, dmg) {
    if (!b || !b.stats || b.stats.downed || !(b instanceof Bot)) return;
    const S = this.s;
    const res = b.stats.damage(dmg * S.diff.dmg * 0.8, 'zombie');
    S.emit({ k: 'bot_fx', id: b.id, a: 'hit' });
    if (res.downed || b.stats.downed) {
      b.stats.downed = true; b.downT = 0; b.mode = 'downed';
      b.say('downed');
      S.emit({ k: 'toast', text: `${b.name} yere düştü! Yanına gidip E'ye basılı tut.`, kind: 'danger' });
      S.map.addMarker(b.pos.x, b.pos.z, `${b.name} yerde!`, 'danger', 60);
    }
  }

  revive(id) {
    const b = this.byId(id);
    if (!b || !(b instanceof Bot)) return;
    b.stats.revive(35);
    b.mode = 'ground';
    if (b.carriedBy) { this.s.emit({ k: 'carry', target: b.id, by: null }); b.carriedBy = null; }
    b.say('revived');
  }

  receive(id, stack) {
    const b = this.byId(id);
    if (!b || !(b instanceof Bot)) return;
    const def = ITEMS[stack.id];
    if (def && def.cat === 'ammo') {
      const ok = b.kit.gun && ITEMS[b.kit.gun].gun.ammo === stack.id;
      if (ok) { b.ammo += stack.qty; b.say('thanks'); return; }
    }
    if (def && def.gun && !b.kit.gun) { b.kit = { ...b.kit, gun: stack.id }; b.ammo = stack.ammo || 0; b.say('thanks'); return; }
    if (def && def.melee) { b.kit = { ...b.kit, melee: stack.id }; b.say('thanks'); return; }
    const ex = b.inv.find((s) => s.id === stack.id);
    if (ex) ex.qty += stack.qty; else b.inv.push({ ...stack });
    b.say('thanks');
  }

  // ======================================================================= güncelleme
  update(dt) {
    const S = this.s;
    if (!S.isHost) { this.updateProxies(dt); return; }
    const mins = dt * S.time.rate * S.time.ff;
    for (const b of this.list) this.think(b, dt, mins);
  }

  leader() {
    const S = this.s;
    return { pos: S.local.pos, id: S.localId, vehicle: S.local.vehicle, downed: S.localStats.downed, yaw: S.local.yaw };
  }

  think(b, dt, mins) {
    const S = this.s;
    const st = b.stats;
    st.tick(mins, { ambient: S.weather.temperature, sheltered: !!S.world.buildingAt(b.pos.x, b.pos.z, b.pos.y), inBase: S.isInBase(b.pos), comfort: S.isInBase(b.pos) ? S.build.comfort01() : 0, night: S.time.isNight, sleeping: S.time.ff > 1 && S.isInBase(b.pos) });
    b.cool -= dt;
    b.think -= dt;
    b.talkT -= dt;
    // ---- yerde
    if (st.downed) {
      b.mode = 'downed'; b.speed = 0;
      if (b.carriedBy) {
        const c = b.carriedBy === S.localId ? { pos: S.local.pos, yaw: S.local.yaw } : (() => { const r = S.players.get(b.carriedBy); return r ? { pos: r.pos, yaw: r.anim ? r.anim.yaw || 0 : 0 } : null; })();
        if (c) { b.pos.set(c.pos.x - Math.sin(c.yaw) * 0.1, c.pos.y + 1.2, c.pos.z - Math.cos(c.yaw) * 0.1); b.yaw = c.yaw + Math.PI / 2; b.mode = 'carried'; }
        else b.carriedBy = null;
      }
      b.downT += dt;
      if (b.downT > 100) {
        // kimse kaldırmazsa üste döner (kalıcı ölüm yok)
        const bed = S.build.respawnPoint();
        st.revive(45);
        b.pos.set(bed.x + 1, bed.y, bed.z + 1);
        b.mode = 'ground';
        S.emit({ k: 'toast', text: `${b.name} toparlanıp üsse döndü.`, kind: 'warn' });
      }
      this.applyVisual(b, dt);
      return;
    }
    // ---- ihtiyaçlar: otomatik tüketim
    if (b.think <= 0) {
      b.think = 0.4 + Math.random() * 0.2;
      this.selfCare(b);
    }
    const L = this.leader();
    // ---- araç: lider araçtaysa bot da biner
    if (L.vehicle && b.order === 'follow') {
      if (!b.vehicleId) {
        const v = L.vehicle;
        const seat = v.seats.findIndex((x, i) => i > 0 && !x);
        if (seat > 0 && dist(b.pos.x, b.pos.z, v.pos.x, v.pos.z) < 40) { b.vehicleId = v.id; v.seats[seat] = b.id; b.seat = seat; }
      }
      if (b.vehicleId) {
        const v = S.vehicles.byId(b.vehicleId);
        if (v) { b.pos.copy(v.pos); b.mode = 'seat'; b.speed = 0; v.seatPlayer(b.avatar, b.seat); b.avatar.update(dt, { mode: 'seat', speed: 0, yaw: v.yaw }); return; }
      }
    } else if (b.vehicleId) {
      const v = S.vehicles.byId(b.vehicleId);
      if (v) {
        v.seats[b.seat] = null;
        const ex = v.pos.x - Math.cos(v.yaw) * (v.def.wid * 0.5 + 1), ez = v.pos.z + Math.sin(v.yaw) * (v.def.wid * 0.5 + 1);
        b.pos.set(ex, S.world.physics.groundHeight(ex, ez, v.pos.y + 2), ez);
        if (b.avatar.root.parent !== S.game.scene) S.game.scene.add(b.avatar.root);
      }
      b.vehicleId = null; b.mode = 'ground';
    }
    // ---- hedef seçimi
    let goal = null, run = false, attack = null;
    // 1) yere düşmüş arkadaş
    const downed = this.findDowned(b);
    if (downed) {
      goal = downed.pos; run = true;
      const d = dist(b.pos.x, b.pos.z, downed.pos.x, downed.pos.z);
      if (d < 1.6) {
        goal = null;
        if (b.reviving !== downed.id) { b.reviving = downed.id; b.reviveT = 0; b.say('revive'); S.emit({ k: 'bot_fx', id: b.id, a: 'revive' }); }
        b.reviveT += dt;
        if (b.reviveT > 4) { b.reviving = null; S.applyAction('revive', { target: downed.id, hp: 35 }, b.id); }
      } else b.reviving = null;
    } else b.reviving = null;
    // 2) zombiler
    if (!b.reviving) {
      const z = this.nearestZombie(b, b.order === 'stay' || b.order === 'base' ? 22 : 17);
      if (z) {
        attack = z;
        if (b.talkT < 0) { b.talkT = 25 + Math.random() * 30; b.say('fight'); }
      }
    }
    // 3) emir noktası
    if (!goal && !b.reviving) {
      let fp = null;
      if (b.order === 'follow') {
        // dizilim: oyuncunun iki yanında (üçüncü şahıs kamerasının görüşünü kapatmasın)
        const i = this.list.indexOf(b);
        const side = i % 2 ? 1 : -1;
        const back = 0.4 + Math.floor(i / 2) * 1.8;
        const lat = 2.6 + Math.floor(i / 2) * 0.7;
        fp = { x: L.pos.x - Math.sin(L.yaw) * back + Math.cos(L.yaw) * side * lat, z: L.pos.z - Math.cos(L.yaw) * back - Math.sin(L.yaw) * side * lat };
        const dl = dist(b.pos.x, b.pos.z, L.pos.x, L.pos.z);
        if (dl > 70) { this.teleportNear(b, L.pos); return; }
        run = dl > 9;
      } else if (b.order === 'stay' && b.anchor) fp = b.anchor;
      else if (b.order === 'base') { const h = S.world.home; fp = h.frame.pt(12.5 + (this.list.indexOf(b) - 1) * 2, 18); run = dist(b.pos.x, b.pos.z, fp.x, fp.z) > 15; }
      if (attack) {
        const d = dist(b.pos.x, b.pos.z, attack.x, attack.z);
        const ranged = b.kit.gun && b.ammo > 0;
        if (ranged && d < 22) goal = d < 5 ? { x: b.pos.x - (attack.x - b.pos.x), z: b.pos.z - (attack.z - b.pos.z) } : null;
        else goal = { x: attack.x, z: attack.z };
        run = true;
        // emir noktasından çok uzaklaşma
        if (fp && dist(attack.x, attack.z, fp.x, fp.z) > 26) { goal = fp; attack = null; }
      } else if (fp && dist(b.pos.x, b.pos.z, fp.x, fp.z) > 1.3) goal = fp;
    }
    // ---- saldırı
    b.aim = false;
    if (attack) this.fight(b, attack, dt);
    else this.setHeldIdle(b);
    // ---- hareket
    if (goal) this.moveTo(b, goal, run ? 4.4 : 2.4, dt);
    else b.speed = Math.max(0, b.speed - dt * 10);
    if (attack) b.yaw = Math.atan2(attack.x - b.pos.x, attack.z - b.pos.z);
    // ---- sohbet
    if (b.talkT < 0) {
      b.talkT = 40 + Math.random() * 60;
      if (st.hunger < 30) b.say('hungry'); else if (st.thirst < 30) b.say('thirsty');
    }
    b.mode = 'ground';
    this.applyVisual(b, dt);
  }

  selfCare(b) {
    const st = b.stats;
    const take = (pred) => { const i = b.inv.findIndex((s) => pred(ITEMS[s.id])); if (i < 0) return null; const s = b.inv[i]; s.qty--; if (s.qty <= 0) b.inv.splice(i, 1); return ITEMS[s.id]; };
    if (st.hunger < 40) { const d = take((d) => d && d.cat === 'food' && d.use && d.use.hunger > 0 && !(d.use.poison > 0.3)); if (d) st.consume(d.use); }
    if (st.thirst < 40) { const d = take((d) => d && d.cat === 'drink' && d.use && d.use.thirst > 0); if (d) st.consume(d.use); }
    if (st.health < st.maxHealth * 0.5 || st.cond.bleeding > 0) { const d = take((d) => d && d.cat === 'med' && d.use && (d.use.heal || d.use.bleed)); if (d) st.consume(d.use, st.heal || 1); }
  }

  findDowned(b) {
    const S = this.s;
    let best = null, bd = 45;
    for (const p of S.players.values()) {
      if (p.isBot) continue;
      const sm = p.isLocal ? S.localStats : p.summary;
      if (!sm || !sm.downed) continue;
      const pos = p.isLocal ? S.local.pos : p.pos;
      const d = dist(b.pos.x, b.pos.z, pos.x, pos.z);
      if (d < bd) { bd = d; best = { id: p.id, pos }; }
    }
    for (const o of this.list) {
      if (o === b || !o.stats.downed) continue;
      const d = dist(b.pos.x, b.pos.z, o.pos.x, o.pos.z);
      if (d < bd) { bd = d; best = { id: o.id, pos: o.pos }; }
    }
    // yakında saldıran zombi varsa önce onları temizle
    if (best && this.nearestZombie(b, 5)) return null;
    return best;
  }

  nearestZombie(b, r) {
    const S = this.s;
    let best = null, bd = r * r;
    for (const z of S.zombies.list.values()) {
      if (z.dead) continue;
      const d = (z.x - b.pos.x) ** 2 + (z.z - b.pos.z) ** 2;
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }

  setHeldIdle(b) { b.setHeld(b.kit.gun && b.ammo > 0 ? b.kit.gun : b.kit.melee); }

  fight(b, z, dt) {
    const S = this.s;
    const d = dist(b.pos.x, b.pos.z, z.x, z.z);
    const ranged = b.kit.gun && b.ammo > 0 && d > 2.2;
    void dt;
    if (ranged) {
      b.setHeld(b.kit.gun);
      b.aim = true;
      const g = ITEMS[b.kit.gun].gun;
      if (b.cool > 0 || d > Math.min(26, g.range)) return;
      const los = S.world.physics.lineOfSight(b.pos.x, b.pos.y + 1.5, b.pos.z, z.x, z.y + 1.3, z.z);
      if (!los) return;
      b.cool = Math.max(0.8, g.rate * 3) + Math.random() * 0.4;
      b.ammo--;
      const acc = clamp(0.9 - d / 45, 0.35, 0.9) * (b.def.stats.aim || 1);
      const hit = Math.random() < acc;
      const dmg = Math.round(g.dmg * 0.85);
      S.emit({ k: 'bot_fx', id: b.id, a: 'shot', w: b.kit.gun, x: z.x, y: z.y + 1.2 + (hit ? 0 : 0.6), z: z.z });
      if (hit) S.applyAction('zombie_hit', { id: z.id, dmg, dir: [(z.x - b.pos.x) / d, (z.z - b.pos.z) / d], kind: 'gun' }, b.id);
      if (g.noise > 10) S.applyAction('noise', { x: b.pos.x, z: b.pos.z, r: g.noise * 0.8, src: 'bot' }, null);
      if (b.ammo <= 0) { b.say('ammo'); b.setHeld(b.kit.melee); }
    } else {
      b.setHeld(b.kit.melee);
      const m = ITEMS[b.kit.melee].melee;
      if (d > (m.range || 1.6) + 0.35 || b.cool > 0) return;
      b.cool = 1.05 / (m.speed || 1) + Math.random() * 0.25;
      S.emit({ k: 'bot_fx', id: b.id, a: 'melee', kind: ITEMS[b.kit.melee].hold });
      const dmg = Math.round(m.dmg * (b.def.stats.melee || 1));
      S.applyAction('zombie_hit', { id: z.id, dmg, dir: [(z.x - b.pos.x) / (d || 1), (z.z - b.pos.z) / (d || 1)], kind: 'melee' }, b.id);
    }
  }

  moveTo(b, goal, speed, dt) {
    const S = this.s;
    const nav = S.world.nav;
    b.repath -= dt;
    let wx = goal.x, wz = goal.z;
    const direct = dist(goal.x, goal.z, b.pos.x, b.pos.z) < 3 || nav.lineClear(b.pos.x, b.pos.z, goal.x, goal.z, false);
    if (!direct) {
      if (!b.path || b.repath <= 0 || dist(b.pathGoal.x, b.pathGoal.z, goal.x, goal.z) > 4) {
        b.repath = 1.2;
        b.path = nav.findPath(b.pos.x, b.pos.z, goal.x, goal.z, { allowBreak: false, maxNodes: 5000 });
        b.pathGoal = { x: goal.x, z: goal.z };
        b.pathI = 1;
      }
      if (b.path && b.pathI < b.path.length) {
        const wp = b.path[b.pathI];
        wx = wp.x; wz = wp.z;
        if (dist(wp.x, wp.z, b.pos.x, b.pos.z) < 0.7) b.pathI++;
      }
    } else b.path = null;
    const dx = wx - b.pos.x, dz = wz - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { b.speed = 0; return; }
    const sp = speed * (b.def.stats.speed || 1) * b.stats.speedMul(0);
    b.speed = sp;
    b.yaw = Math.atan2(dx, dz);
    const step = Math.min(d, sp * dt);
    const nx = b.pos.x + (dx / d) * step, nz = b.pos.z + (dz / d) * step;
    const r = S.world.physics.resolveCircle(nx, nz, 0.32, b.pos.y, b.pos.y + 1.7, 0.55, null, _res);
    const pr = S.vehicles.pushOut(r.x, r.z, 0.35, b.pos.y);
    const g = S.world.physics.groundHeight(pr.x, pr.z, b.pos.y + 0.6, 0.55);
    if (g - b.pos.y > 0.7) { b.path = null; b.repath = 0; return; }
    b.pos.x = pr.x; b.pos.z = pr.z;
    b.pos.y += (g - b.pos.y) * Math.min(1, dt * 15);
    if (S.world.terrain.isWater(b.pos.x, b.pos.z)) b.pos.y = Math.max(b.pos.y, S.world.terrain.waterLevelAt(b.pos.x, b.pos.z) - 1.1);
  }

  teleportNear(b, p) {
    const S = this.s;
    const a = Math.random() * Math.PI * 2;
    const x = p.x + Math.sin(a) * 3, z = p.z + Math.cos(a) * 3;
    b.pos.set(x, S.world.physics.groundHeight(x, z, p.y + 3), z);
    b.path = null;
  }

  applyVisual(b, dt) {
    b.avatar.root.position.copy(b.pos);
    b.avatar.update(dt, { mode: b.mode, speed: b.speed, yaw: b.yaw, aim: b.aim, pitch: 0 });
  }

  onFx(e) {
    const S = this.s;
    const b = this.byId(e.id);
    if (!b) return;
    const av = b.avatar;
    if (e.a === 'shot') {
      av.play('shoot', 0.15);
      const mx = b.pos.x + Math.sin(b.yaw) * 0.6, my = b.pos.y + 1.45, mz = b.pos.z + Math.cos(b.yaw) * 0.6;
      if (e.w !== 'bow') { S.fx.muzzle(mx, my, mz); S.fx.tracer(mx, my, mz, e.x, e.y, e.z); }
      S.audio.play(e.w === 'bow' ? 'bow' : e.w, { at: b.pos, vol: 0.8 });
    } else if (e.a === 'melee') { av.play('melee', 0.45, e.kind); S.audio.play('swing', { at: b.pos, vol: 0.6 }); }
    else if (e.a === 'hit') { av.flinch(1); S.audio.play('hit', { at: b.pos, vol: 0.5 }); }
    else if (e.a === 'revive') av.play('revive', 4);
  }

  // ======================================================================= ağ (istemci)
  snapshot() {
    return this.list.map((b) => [b.id, b.charId, +b.pos.x.toFixed(2), +b.pos.y.toFixed(2), +b.pos.z.toFixed(2), +b.yaw.toFixed(2), +b.speed.toFixed(1), b.mode, b.held, Math.round(b.stats.health), b.stats.maxHealth, Math.round(b.stats.hunger), Math.round(b.stats.thirst), b.stats.downed ? 1 : 0, b.aim ? 1 : 0, b.vehicleId || 0]);
  }

  applySnapshot(arr) {
    const S = this.s;
    const seen = new Set();
    for (const a of arr) {
      seen.add(a[0]);
      let p = this.byId(a[0]);
      if (!p) { p = new BotProxy(this, a); this.list.push(p); }
      p.target.set(a[2], a[3], a[4]);
      p.anim = { mode: a[7], speed: a[6], yaw: a[5], aim: !!a[14], pitch: 0 };
      if (p.held !== a[8]) { p.held = a[8]; p.avatar.hold(a[8]); }
      Object.assign(p.stats, { health: a[9], maxHealth: a[10], hunger: a[11], thirst: a[12], downed: !!a[13] });
      p.vehicleId = a[15] || null;
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!seen.has(p.id)) { p.dispose(); this.list.splice(i, 1); }
    }
  }

  updateProxies(dt) {
    const S = this.s;
    for (const p of this.list) {
      if (!(p instanceof BotProxy)) continue;
      p.pos.lerp(p.target, Math.min(1, dt * 10));
      if (p.vehicleId) { const v = S.vehicles.byId(p.vehicleId); if (v) { v.seatPlayer(p.avatar, 1); p.avatar.update(dt, { mode: 'seat', speed: 0, yaw: v.yaw }); continue; } }
      if (p.avatar.root.parent !== S.game.scene) S.game.scene.add(p.avatar.root);
      p.avatar.root.position.copy(p.pos);
      p.avatar.update(dt, p.anim);
    }
  }

  // ======================================================================= kayıt
  serialize() {
    return this.list.filter((b) => b instanceof Bot).map((b) => ({ charId: b.charId, x: b.pos.x, y: b.pos.y, z: b.pos.z, yaw: b.yaw, stats: b.stats.serialize(), inv: b.inv, ammo: b.ammo, order: b.order, anchor: b.anchor, kit: b.kit }));
  }

  load(arr) {
    this.dispose();
    for (const o of arr || []) {
      const b = new Bot(this, o.charId, o);
      if (o.kit) { b.kit = o.kit; b.setHeld(b.kit.gun && b.ammo > 0 ? b.kit.gun : b.kit.melee); }
      this.list.push(b);
    }
  }

  dispose() {
    for (const b of this.list) b.dispose();
    this.list = [];
  }
}
