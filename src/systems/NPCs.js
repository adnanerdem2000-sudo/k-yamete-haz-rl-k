// NPC'ler (komşular, tüccar, asker, bilim insanı, kayıp çocuk, köpek Karabaş), vahşi hayvanlar
// (geyik, tavşan, tilki, yaban domuzu, kurt, ayı), avcılık ve balıkçılık.
import * as THREE from 'three';
import { Avatar } from '../entities/Avatar.js';
import { AnimalView, ANIMAL_MODELS } from '../entities/AnimalView.js';
import { NPCS, QUESTS } from '../data/story.js';
import { ITEMS } from '../data/items.js';
import { RNG, dist, clamp, dampAngle, wrapAngle } from '../core/util.js';
import { forestMask } from '../world/Terrain.js';
import { rayCyl } from './Combat.js';

// Tüccar stokları (gün başına tohumdan aynı başlangıç; satışlar host üzerinden eşitlenir)
export const TRADE_STOCK = {
  hasan: ['canned_food', 'bread', 'water_bottle', 'bandage', 'nails', 'plank', 'seeds', 'rope', 'cloth', 'painkiller', 'hammer', 'tea'],
  riza: ['ammo_9mm', 'shells', 'pistol', 'jerrycan', 'engine_part', 'car_battery', 'tire', 'repair_kit', 'antibiotics', 'first_aid', 'electronics', 'metal_sheet', 'screws', 'duct_tape', 'mre', 'energy_drink', 'backpack_large', 'flashlight', 'battery'],
  // Dağ köyü (köy kurtarılınca): kiler, kaynak suyu, yün ve av malzemesi
  omer: ['bread', 'honey', 'cheese', 'apple', 'corn', 'water_bottle', 'warm_jacket', 'leather', 'rope', 'seeds', 'bow', 'arrow', 'lighter', 'sleeping_bag'],
};
// hayvan durumları (ağ anlık görüntüsünde indeks olarak)
const ASTATE = ['graze', 'flee', 'attack'];

const ANIMALS = {
  deer: { name: 'Geyik', hp: 60, speed: 7.5, size: [0.45, 1.1, 1.3], color: '#b07a4a', flee: true, herd: [2, 4], drops: [['raw_meat', 3], ['leather', 1]], leg: 0.75, antlers: true },
  stag: { name: 'Erkek Geyik', hp: 130, speed: 8, size: [0.5, 1.3, 1.5], color: '#8a5a32', flee: true, charge: true, dmg: 22, drops: [['raw_meat', 5], ['leather', 2]], leg: 0.85, antlers: true },
  rabbit: { name: 'Tavşan', hp: 12, speed: 6.5, size: [0.25, 0.3, 0.4], color: '#c8b8a0', flee: true, drops: [['raw_meat', 1]], leg: 0.18 },
  fox: { name: 'Tilki', hp: 25, speed: 6, size: [0.3, 0.45, 0.8], color: '#d2691e', flee: true, drops: [['leather', 1], ['raw_meat', 1]], leg: 0.3 },
  boar: { name: 'Yaban Domuzu', hp: 90, speed: 5.5, size: [0.55, 0.75, 1.2], color: '#5b4636', aggro: 6, dmg: 14, drops: [['raw_meat', 3], ['leather', 1]], leg: 0.35, tusks: true },
  wolf: { name: 'Kurt', hp: 70, speed: 7.8, size: [0.38, 0.7, 1.15], color: '#7d7d7d', aggro: 22, dmg: 10, drops: [['raw_meat', 2], ['leather', 1]], leg: 0.5, pack: true },
  bear: { name: 'Ayı', hp: 320, speed: 6, size: [0.9, 1.3, 1.9], color: '#4a3020', aggro: 10, dmg: 30, drops: [['raw_meat', 6], ['leather', 3]], leg: 0.55 },
  // başıboş aç köpekler (gündüz tehdidi, DayThreats doğurur): kurtla aynı sürü yapay zekâsı, kasaba ve şehirde
  husky: { name: 'Başıboş Köpek', hp: 50, speed: 7.4, size: [0.35, 0.65, 1.0], color: '#8a8580', aggro: 18, dmg: 8, drops: [['raw_meat', 1]], leg: 0.45, pack: true, stray: true },
  shiba: { name: 'Başıboş Köpek', hp: 36, speed: 7.0, size: [0.3, 0.5, 0.8], color: '#c47a3a', aggro: 14, dmg: 6, drops: [['raw_meat', 1]], leg: 0.35, pack: true, stray: true },
};
const FISH = { lake: ['Alabalık', 'Sazan', 'Levrek', 'Turna'], sea: ['Lüfer', 'Kefal', 'Somon', 'Levrek'] };

class NPC {
  constructor(sys, def, x, z, y = null) {
    this.sys = sys; this.def = def; this.id = def.id;
    const S = sys.s;
    this.avatar = new Avatar(S.game, def.look, { name: def.name, color: '#ffe0a8' });
    // y verilirse (bina içi) o kattaki zemin, yoksa en üstteki yürünebilir yüzey
    this.pos = new THREE.Vector3(x, S.world.physics.groundHeight(x, z, y ?? 1e9), z);
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
    if (ANIMAL_MODELS[type]) {
      this.view = new AnimalView(sys.s.game, type);
      this.root = this.view.root;
      this.root.position.set(x, this.y, z);
      sys.group.add(this.root);
    } else this.build();
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
    S.onEvt('npc_state', (e) => { const n = this.byId(e.id); if (!n) return; if (e.visible !== undefined) n.setVisible(e.visible); if (e.follow !== undefined) n.follow = e.follow; if (e.x !== undefined) { n.pos.set(e.x, S.world.physics.groundHeight(e.x, e.z, e.y ?? 1e9), e.z); n.home = { x: e.x, z: e.z }; } if (e.alive === false) { n.alive = false; n.setVisible(false); } if (e.stay !== undefined) n.stay = e.stay; });
    S.on('animal_hit', (p, from) => this.hitAnimal(p.id, p.dmg, from));
    S.onEvt('animal_die', (e) => { const a = this.animals.find((x) => x.id === e.id); if (a) { a.dead = true; a.deadT = 0; if (a.view) a.view.die(); } });
    // takas: stok host'ta düşer, değişiklik herkese yayılır; para/eşya yalnız alıcıda
    S.on('trade_buy', (p, from) => this.hostTradeBuy(p, from));
    S.on('trade_refund', (p, from) => this.hostTradeRefund(p, from));
    S.onEvt('trade_stock', (e) => this.applyTradeStock(e));
    this._sales = new Map(); // host: oyuncu|tüccar:gün|eşya → ödemesi beklenen satış sayısı (iade yalnız bunlar için)
    // hayvan saldırı/sarsılma görseli ve sesi herkeste (yapay zekâ host'ta)
    S.onEvt('animal_fx', (e) => this.applyAnimalFx(e));
  }

  init() {
    const W = this.s.world;
    const b = (id) => W.buildingById[id];
    const front = (bid, dz = 2) => { const bb = b(bid); const p = bb.frame.pt(bb.tpl.w / 2 - 2, bb.tpl.d + dz); return p; };
    const add = (id, x, z, vis = true, y = null) => { const n = new NPC(this, NPCS[id], x, z, y); n.setVisible(vis); this.list.push(n); return n; };
    const inside = (bid, lx, lz) => { const bb = b(bid); const p = bb.frame.pt(lx, lz); return [p.x, p.z, bb.floorY + 1]; };
    const h = front('n1'); add('hasan', h.x, h.z);
    const a = front('s3'); add('ayse', a.x, a.z);
    add('can', -201, 232); // parkta kayıp
    add('kemal', 270, -238, false);
    add('riza', 58, 306, false);
    add('selin', -85, -38, false);
    add('kurt', -230, 160, false);
    this.byId('can').zombieTarget = true;
    // genişletilmiş ada
    const t = front('tower', 3); add('aydin', t.x, t.z);
    const k = front('keeper', 2); add('ismail', k.x, k.z);
    const pp = front('powerplant', 3); add('zeynep', pp.x, pp.z, false);
    const vc = front('vil_cafe', 3); add('omer', vc.x, vc.z);
    const pa = front('prison_admin', 2); add('necla', pa.x, pa.z);
    const [mx, mz, my] = inside('hotel', 17.5, 3.6); add('murat', mx, mz, true, my);
    const [dx, dz, dy] = inside('hotel', 16.2, 5.0); add('defne', dx, dz, true, dy);
    this.byId('murat').zombieTarget = true;
    this.byId('defne').zombieTarget = true;
    // köpek Karabaş (orman kenarı)
    this.spawnDog(-262, 42);
  }

  byId(id) { return this.list.find((n) => n.id === id); }
  spawnAnimal(type, x, z) { const a = new Animal(this, type, x, z); this.animals.push(a); return a; }

  // ======================================================================= takas (çok oyunculu eşitleme)
  /** Tüccarın o günkü stoğu: tohum + gün → her istemcide aynı başlangıç; satışlar 'trade_stock' olayıyla */
  tradeStock(npcId, day = this.s.time.day) {
    const S = this.s;
    S._trade = S._trade || {};
    const key = npcId + ':' + day;
    if (!S._trade[key]) {
      const rng = new RNG(S.seed + key);
      const pool = (TRADE_STOCK[npcId] || TRADE_STOCK.hasan).filter((id) => ITEMS[id]);
      S._trade[key] = rng.shuffle([...pool]).slice(0, 8).map((id) => ({ id, qty: ITEMS[id].stack > 1 ? rng.int(2, Math.min(ITEMS[id].stack, 12)) : 1 }));
    }
    return S._trade[key];
  }

  /** Host: satın alma isteği — stok varsa düşer; sonuç (başarılı/başarısız) herkese yayılır */
  hostTradeBuy(p, from) {
    const S = this.s;
    if (!p || !p.npc || !p.id || !ITEMS[p.id]) return;
    const day = Number.isFinite(p.day) ? p.day : S.time.day;
    const it = this.tradeStock(p.npc, day).find((x) => x.id === p.id);
    if (!it || it.qty <= 0) { S.emit({ k: 'trade_stock', npc: p.npc, day, id: p.id, qty: it ? it.qty : 0, by: from, fail: 1 }); return; }
    it.qty--;
    const sk = `${from}|${p.npc}:${day}|${p.id}`;
    this._sales.set(sk, (this._sales.get(sk) || 0) + 1);
    S.emit({ k: 'trade_stock', npc: p.npc, day, id: p.id, qty: it.qty, by: from, price: Math.max(0, Math.round(p.price || 0)) });
  }

  /** Host: alıcı ödeyemedi (çift tıklama, bu arada para harcandı) → satış geri alınır, stok herkeste geri artar */
  hostTradeRefund(p, from) {
    const S = this.s;
    if (!p || !p.npc || !p.id) return;
    const day = Number.isFinite(p.day) ? p.day : S.time.day;
    const sk = `${from}|${p.npc}:${day}|${p.id}`;
    const n = this._sales.get(sk) || 0;
    if (n <= 0) return; // kayıtlı satış yoksa iade yok
    if (n === 1) this._sales.delete(sk); else this._sales.set(sk, n - 1);
    const it = this.tradeStock(p.npc, day).find((x) => x.id === p.id);
    if (!it) return;
    it.qty++;
    S.emit({ k: 'trade_stock', npc: p.npc, day, id: p.id, qty: it.qty });
  }

  /** Herkes: stok güncellenir; alıcı parayı öder ve eşyayı alır; açık takas paneli yenilenir */
  applyTradeStock(e) {
    const S = this.s;
    const it = this.tradeStock(e.npc, e.day).find((x) => x.id === e.id);
    if (it) it.qty = e.qty;
    if (e.by === S.localId) {
      if (S.ui && S.ui.panels) S.ui.panels.tradePending = false;
      if (e.fail) S.ui.toast('Bu ürün stokta kalmadı.', 'warn');
      else if (S.inventory.count('money') >= e.price) { if (e.price > 0) S.inventory.remove('money', e.price); S.giveLocal(e.id, 1); S.game.audio.play('pickup', { vol: 0.6 }); }
      else { S.ui.toast('Yeterli paran yok.', 'warn'); S.act('trade_refund', { npc: e.npc, day: e.day, id: e.id }); }
    }
    const ui = S.ui;
    if (ui && ui.panel && ui.panel.name === 'trade' && ui.panels && ui.panels.tradeRender) ui.panels.tradeRender();
  }

  // ======================================================================= hayvanlar: çok oyunculu
  /** Host: hayvan algısı/saldırısı/doğması için bütün oyuncuların konumları (yerel + uzak) */
  playerAnchors() {
    const S = this.s, out = [];
    for (const q of S.players.values()) {
      if (q.isLocal) out.push({ id: q.id, local: true, x: S.local.pos.x, y: S.local.pos.y, z: S.local.pos.z, sneak: S.local.mode === 'crouch' || S.local.mode === 'prone' });
      else if (q.pos) out.push({ id: q.id, local: false, x: q.pos.x, y: q.pos.y, z: q.pos.z, sneak: !!(q.anim && (q.anim.mode === 'crouch' || q.anim.mode === 'prone')) });
    }
    if (!out.length) out.push({ id: S.localId, local: true, x: S.local.pos.x, y: S.local.pos.y, z: S.local.pos.z, sneak: S.local.mode === 'crouch' || S.local.mode === 'prone' });
    for (const q of out) q.under = this.isUnderground(q.x, q.y, q.z);
    return out;
  }

  /** Eskort NPC'yi liderinin bulunduğu sığınağa (Z) ya da yüzeye (Z yok) taşı: merdivenin dibinde / liderin arkasında */
  followZone(n, Z, pl) {
    const S = this.s;
    if (Z) {
      const sp = Z.spawn, c = Math.cos(sp.yaw), s = Math.sin(sp.yaw);
      for (const [lx, lz] of [[0.9, 1.9], [-0.9, 1.9], [0, 2.8], [0, 0]]) {
        const x = sp.x + lx * c + lz * s, z = sp.z - lx * s + lz * c;
        if (S.world.under.zoneAt(x, sp.y + 0.5, z) !== Z || S.world.physics.overlapsBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, sp.y + 0.3, sp.y + 1.7)) continue;
        n.pos.set(x, sp.y, z); return;
      }
      n.pos.set(sp.x, sp.y, sp.z);
      return;
    }
    const x = pl.x - 1.6, z = pl.z - 0.8;
    n.pos.set(x, S.world.physics.groundHeight(x, z, pl.y + 3), z);
  }

  /** Oyuncu yer altı sığınağında mı (toprağın altında): hayvanlar onu görmez, koklamaz, ısıramaz */
  isUnderground(x, y, z) {
    const W = this.s.world;
    return !!(W.under && y < W.terrain.heightAt(x, z) - 2 && W.under.zoneAt(x, y + 0.5, z));
  }

  /** Host → istemci anlık görüntüsü: oyuncuya 170 m içindeki hayvanlar [id, tür, x, z, yön, hız, durum, bayrak, grup, sıra, can] */
  animalSnapshotFor(x, z, r = 170) {
    const out = [];
    for (const a of this.animals) {
      if (dist(a.x, a.z, x, z) > r) continue;
      out.push([a.id, a.type, Math.round(a.x * 100) / 100, Math.round(a.z * 100) / 100, Math.round(a.yaw * 100) / 100, Math.round((a.speed || 0) * 10) / 10, Math.max(0, ASTATE.indexOf(a.state)), (a.graze ? 1 : 0) | (a.dead ? 2 : 0), a.group || 0, a.slot || 0, Math.max(0, Math.round(a.hp))]);
    }
    return out;
  }

  /** İstemci: anlık görüntüdeki hayvanları kur/güncelle; listede olmayanları kaldır (host uzaklaştırdı) */
  applyAnimalSnapshot(list) {
    const S = this.s;
    if (S.isHost || !Array.isArray(list)) return;
    const seen = new Set();
    for (const e of list) {
      const [id, type, x, z, yaw, sp, st, fl, group, slot, hp] = e;
      if (!ANIMALS[type]) continue;
      seen.add(id);
      let a = this.animals.find((q) => q.id === id);
      if (!a) {
        a = new Animal(this, type, x, z);
        a.id = id; a.remote = true; a.yaw = yaw;
        if (a.view) a.view.visYaw = yaw;
        this.animals.push(a);
      }
      a.nx = x; a.nz = z; a.sx = x; a.sz = z; a.netAt = performance.now();
      a.nyaw = yaw; a.netSpeed = sp; a.state = ASTATE[st] || 'graze'; a.graze = !!(fl & 1);
      a.group = group || a.group; a.slot = slot || 0;
      if (Number.isFinite(hp)) a.hp = hp;
      if ((fl & 2) && !a.dead) { a.dead = true; a.deadT = 0; a.x = x; a.z = z; a.y = S.world.terrain.heightAt(x, z); a.root.position.set(a.x, a.y, a.z); if (a.view) a.view.die(); }
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (seen.has(a.id)) continue;
      this.group.remove(a.root); if (a.view) a.view.dispose(); this.animals.splice(i, 1);
    }
  }

  /** Herkes: hayvan saldırı klibi + sesi, vuruş sarsılması (host'un yapay zekâsından olay olarak) */
  applyAnimalFx(e) {
    const a = this.animals.find((x) => x.id === e.id);
    if (!a || a.dead) return;
    if (e.fx === 'attack') {
      if (a.view) a.view.attack(e.d || 0.6);
      this.s.audio.play(a.type === 'wolf' ? 'bark' : 'hit', { at: a, vol: 0.8, rate: a.type === 'bear' ? 0.5 : a.type === 'wolf' ? 0.8 : 1 });
    } else if (e.fx === 'flinch' && a.view) a.view.flinch();
  }

  /** Host göçü: istemcide kopya olarak duran hayvanlar bu makinede simüle edilmeye başlar */
  promoteAnimals() {
    // son anlık görüntünün konumu (tahminle kaymış konum değil) yetkili olur
    for (const a of this.animals) { a.remote = false; if (a.sx !== undefined) { a.x = a.sx; a.z = a.sz; a.y = this.s.world.terrain.heightAt(a.x, a.z); } a.nx = a.nz = a.sx = a.sz = undefined; a.t = a.t || 0; a.atkCd = a.atkCd || 0; }
  }

  /** İstemci: host'tan gelen hayvanı enterpolasyon + yön tahminiyle taşı (yapay zekâ yok) */
  updateRemoteAnimal(a, dt) {
    const S = this.s;
    const sp = a.netSpeed || 0;
    if (a.nx !== undefined) {
      // anlık görüntüler arası tahmin: yalnız son görüntüden sonraki 0,4 sn (host takılırsa hayvan kaymaz)
      if (sp > 0 && performance.now() - (a.netAt || 0) < 400) { a.nx += Math.sin(a.nyaw) * sp * dt; a.nz += Math.cos(a.nyaw) * sp * dt; }
      const dx = a.nx - a.x, dz = a.nz - a.z;
      if (dx * dx + dz * dz > 144) { a.x = a.nx; a.z = a.nz; } else { const k = Math.min(1, dt * 8); a.x += dx * k; a.z += dz * k; }
      a.yaw = dampAngle(a.yaw, a.nyaw, 8, dt);
      a.y = S.world.terrain.heightAt(a.x, a.z);
    }
    a.speed = sp;
    a.root.position.set(a.x, a.y, a.z);
    if (a.view) a.view.update(dt, { speed: sp, yaw: a.yaw, graze: a.state === 'graze' && a.graze });
    else {
      a.phase += sp * dt * 4;
      const sw = Math.sin(a.phase) * Math.min(1, sp / 3) * 0.7;
      a.legs[0].rotation.x = sw; a.legs[3].rotation.x = sw; a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw;
      a.head.rotation.x = sp === 0 && a.state === 'graze' ? 0.6 : 0;
      a.root.rotation.y = a.yaw;
    }
  }

  /** Olaylar: bir noktanın çevresinde sürü (kurt, geyik…). target verilirse sürü saldırır */
  spawnPack(type, around, n, target = null, r = 35) {
    const S = this.s;
    const ang = Math.random() * Math.PI * 2;
    const cx = around.x + Math.cos(ang) * r, cz = around.z + Math.sin(ang) * r;
    const group = 'g' + Math.random().toString(36).slice(2, 6);
    for (let i = 0; i < n; i++) {
      const x = cx + (i % 3) * 1.8, z = cz + Math.floor(i / 3) * 1.8;
      if (S.world.terrain.isWater(x, z)) continue;
      const a = this.spawnAnimal(type, x, z);
      a.group = group; a.slot = i;
      if (target) { a.state = 'attack'; a.target = target; }
    }
  }

  spawnDog(x, z) {
    const S = this.s;
    const view = new AnimalView(S.game, 'husky');
    view.root.position.set(x, S.world.terrain.heightAt(x, z), z);
    this.group.add(view.root);
    this.dog = { root: view.root, view, x, z, yaw: 0, follow: false, t: 0, found: false, barkT: 0, biteT: 0, prey: null };
  }

  // ======================================================================= konuşma
  talk(n) {
    const S = this.s;
    S.timeline.onNpc(n.id);
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
    if (def.trade || (def.tradeFlag && S.flags[def.tradeFlag])) choices.push({ text: '💰 Takas yap', onSelect: () => { S.ui.closeDialog(); S.ui.openTrade(n); } });
    this.storyChoices(n, choices);
    for (const L of def.lore || []) {
      choices.push({ text: '💬 ' + L.q, onSelect: () => {
        S.ui.openDialog({ speaker: def.name, text: L.a, choices: [{ text: 'Anladım.', onSelect: () => S.ui.closeDialog() }] });
        if (L.marker) S.map.addMarker(L.marker[0], L.marker[1], L.marker[2], L.marker[3] || 'quest');
        if (L.note) S.quests.readNoteSilently ? S.quests.readNoteSilently(L.note) : S.act('note_read', { id: L.note });
      } });
    }
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

  /** Genişletilmiş hikâye: NPC'ye özel seçenekler (eskort, kararlar, pilot) */
  storyChoices(n, choices) {
    const S = this.s;
    const def = n.def;
    // Murat ve Defne: otelden üsse eskort
    if ((n.id === 'murat' || n.id === 'defne') && !S.flags.family_home) {
      const m = this.byId('murat'), d = this.byId('defne');
      const following = m && m.follow;
      choices.push({ text: following ? 'Burada bekleyin.' : 'Benimle gelin, sizi üsse götüreceğim.', onSelect: () => {
        for (const x of [m, d]) if (x && x.alive) S.act('npc_state', { id: x.id, follow: following ? null : S.localId });
        S.quests.onTalk('murat');
        S.ui.closeDialog();
        if (!following) S.ui.toast('Murat ve Defne seni takip ediyor. Onları üsse götür!', 'story', 4);
      } });
    }
    // Gardiyan Necla: mahkûmların kaderi
    if (n.id === 'necla' && S.quests.state('s_prison') === 'active' && !S.flags.prison_decided) {
      const st = S.quests.st.s_prison;
      if (st && (st.prog[0] || 0) >= 12) choices.push({ text: '⚖️ Mahkûmlar hakkında karar ver', onSelect: () => this.prisonDecision(n) });
    }
    // Pilot Aydın: iyileşince uçağın başına geçer
    if (n.id === 'aydin' && S.flags.pilot_joined && !n.atPlane) choices.push({ text: '✈️ Uçağın başına geç', onSelect: () => { S.ui.closeDialog(); this.sendPilotToPlane(); } });
    if (n.id === 'aydin' && S.flags.pilot_joined) choices.push({ text: '🛫 Uçağın durumu?', onSelect: () => { S.ui.closeDialog(); S.endings.usePlane(); } });
    void def;
  }

  prisonDecision(n) {
    const S = this.s;
    const done = (text, log) => { S.act('flag', { flag: 'prison_decided', value: 1 }); S.results.choices.push(log); S.ui.closeDialog(); S.ui.toast(text, 'story', 6); if (S.isHost) S.timeline.post('choice', 'Cezaevi kararı', log); else S.timeline.add('choice', 'Cezaevi kararı', log); };
    S.ui.openDialog({
      speaker: n.def.name,
      text: 'Avlu temiz. B koğuşunda sekiz kişi var: iki hırsız, bir kavgacı, bir öğretmen… Hepsi sağlıklı. Anahtar bende. Ne yapacağız?',
      choices: [
        { text: 'Hepsini serbest bırak — üsse katılsınlar', onSelect: () => { S.act('flag', { flag: 'allies', add: 3 }); S.act('flag', { flag: 'prisoners_free', value: 1 }); S.act('rel', { faction: 'raiders', delta: 15 }); S.act('team_morale', { amount: 8 }); S.results.rescued += 8; done('Kapılar açıldı. Üçü üsse katıldı, gerisi yollara dağıldı.', 'Mahkûmlar serbest bırakıldı'); } },
        { text: 'Kilitli kalsınlar, askerlere teslim edilsinler', onSelect: () => { S.act('rel', { faction: 'military', delta: 15 }); S.act('team_morale', { amount: -6 }); done('Necla başını eğdi: "Emir emirdir." Askerler yarın gelecek.', 'Mahkûmlar askerlere bırakıldı'); } },
        { text: 'Öğretmeni ve hastaları çıkar (2 antibiyotik)', onSelect: () => { if (!S.inventory.has('antibiotics', 2)) { S.ui.toast('2 antibiyotik gerekli.', 'warn'); return; } S.inventory.remove('antibiotics', 2); S.act('rel', { faction: 'neighbors', delta: 10 }); S.act('team_morale', { amount: 6 }); S.results.rescued += 3; done('Öğretmen Seda ve iki hasta kurtarıldı. Diğerleri Necla\'nın gözetiminde.', 'Öğretmen ve hastalar kurtarıldı'); } },
      ],
    });
  }

  sendPilotToPlane() {
    const S = this.s;
    const P = S.world.plane;
    if (!P) return;
    // pervanenin önünde (burun yönünde 7 m)
    S.act('npc_state', { id: 'aydin', x: P.x + Math.sin(P.a) * 7, z: P.z + Math.cos(P.a) * 7, follow: null, stay: true });
    S.ui.toast('Aydın topallayarak uçağın yanına geçti.', 'info', 3);
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
    // erkek geyik yaralanınca saldırır; kurtlar yaralanınca sürüyle birlikte saldırır, çok yaralıysa kaçar
    a.state = a.def.charge && a.hp > a.def.hp * 0.25 ? 'attack' : a.def.flee ? 'flee' : a.def.pack && a.hp < a.def.hp * 0.35 ? 'flee' : 'attack';
    a.target = from;
    S.emit({ k: 'animal_fx', id: a.id, fx: 'flinch' });
    if (a.def.pack && a.state === 'attack') for (const o of this.animals) if (o !== a && !o.dead && o.type === a.type && dist(o.x, o.z, a.x, a.z) < 30) o.state = 'attack';
    if (a.def.herd) for (const o of this.animals) if (o !== a && !o.dead && o.def.flee && dist(o.x, o.z, a.x, a.z) < 25) o.state = 'flee';
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
        const want = { kemal: day >= 8, selin: day >= 17, riza: (day >= 2 && day % 3 === 2 && hour >= 9 && hour < 17) || !!S.flags.trader_here, zeynep: day >= 4 || !!S.quests.state('s_power') };
        for (const [id, v] of Object.entries(want)) { const n = this.byId(id); if (n && n.alive && n.visible !== v) S.applyAction('npc_state', { id, visible: v }, null); }
      }
    }
    for (const n of this.list) {
      if (!n.visible || !n.alive) continue;
      n.t += dt;
      let goal = null, sp = 0;
      if (n.follow) {
        const pl = n.follow === S.localId ? S.local.pos : S.players.get(n.follow)?.pos;
        // yer altı sığınağı: eskort lideriyle iner/çıkar (yüzeyde, sığınağın tepesinde bekleyip zombilere yem olmasın)
        if (pl && S.world.under) {
          const lz = S.world.under.zoneAt(pl.x, pl.y + 0.5, pl.z), nz = S.world.under.zoneAt(n.pos.x, n.pos.y + 0.5, n.pos.z);
          if ((lz ? lz.id : null) !== (nz ? nz.id : null)) { n.zoneT = (n.zoneT || 0) + dt; if (n.zoneT > 1.5) { n.zoneT = 0; this.followZone(n, lz, pl); } }
          else n.zoneT = 0;
        }
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
      const talking = S.ui.dialogNpc === n && S.ui.panel && S.ui.panel.name === 'dialog';
      if (talking && !n.speed) n.yaw = dampAngle(n.yaw, Math.atan2(S.local.pos.x - n.pos.x, S.local.pos.z - n.pos.z), 6, dt); // konuşurken oyuncuya döner
      n.avatar.update(dt, { mode: 'ground', speed: n.speed, yaw: n.yaw, pitch: 0, talk: talking });
      // Murat ve Defne üsse vardığında
      if (n.id === 'murat' && n.follow && !S.flags.family_home && S.isHost && S.isInBase(n.pos)) {
        const h = S.world.home.frame.pt(15, 18);
        // görev henüz gelmediyse (telsiz çağrısından önce bulundular) şimdi başlat ve say
        if (!S.quests.state('s_resort')) S.applyAction('quest_start', { id: 's_resort' }, null);
        S.applyAction('flag', { flag: 'family_home', value: 1 }, null);
        S.quests.onTalk('murat');
        for (const [id, dx] of [['murat', 0], ['defne', 1.2]]) S.applyAction('npc_state', { id, follow: null, x: h.x + dx, z: h.z }, null);
        S.results.rescued += 2;
        S.emit({ k: 'toast', text: 'Murat ve Defne üsse ulaştı! Murat araçlarınıza bakacak (tamir %50 daha etkili).', kind: 'good', dur: 6 });
        S.timeline.post('rescue', 'Oda 103 kurtarıldı', 'Murat ve kızı Defne otelden kurtarılıp üsse getirildi.');
      }
      // Pilot Aydın: iyileştikten sonra uçağa geçer (host)
      if (n.id === 'aydin' && S.isHost && S.flags.pilot_joined && !n.atPlane && !n.stay && S.world.plane) { n.atPlane = true; this.sendPilotToPlane(); }
      if (n.id === 'aydin' && n.stay) n.atPlane = true;
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
    d.biteT -= dt;
    // zombi avı: sahibine yakın zombilere saldırır (host hasar verir)
    if (d.follow && S.isHost) {
      if (!d.prey || d.prey.v.state.dead || dist(d.prey.v.pos.x, d.prey.v.pos.z, p.x, p.z) > 18) d.prey = S.zombies.nearestTo(d.x, d.z, 10);
    } else d.prey = null;
    if (d.prey && pd < 20) {
      const zv = d.prey.v;
      const zd = dist(zv.pos.x, zv.pos.z, d.x, d.z);
      tx = zv.pos.x; tz = zv.pos.z; sp = zd > 1.3 ? 6.8 : 0;
      if (zd < 1.6 && d.biteT <= 0) {
        d.biteT = 1.1;
        d.view.attack(0.55);
        S.act('zombie_hit', { id: d.prey.id, dmg: 14, dir: [(zv.pos.x - d.x) / (zd || 1), (zv.pos.z - d.z) / (zd || 1)], kind: 'melee' });
        S.audio.play('bark', { at: d.root.position, vol: 0.9, rate: 0.9 });
      }
    } else if (d.follow) {
      const base = S.world.home;
      const inBase = S.isInBase(p);
      const tgt = inBase || pd < 40 ? p : { x: base.spec.x + 4, z: base.spec.z - 12 };
      const td = dist(tgt.x, tgt.z, d.x, d.z);
      if (td > 3) { tx = tgt.x; tz = tgt.z; sp = td > 8 ? Math.min(7.5, 3 + td * 0.3) : 2.2; }
    }
    if (sp > 0) {
      const dx = tx - d.x, dz = tz - d.z, l = Math.hypot(dx, dz) || 1;
      const r = S.world.physics.resolveCircle(d.x + dx / l * sp * dt, d.z + dz / l * sp * dt, 0.3, d.root.position.y, d.root.position.y + 0.8, 0.55);
      d.x = r.x; d.z = r.z;
      d.yaw = dampAngle(d.yaw, Math.atan2(dx, dz), 8, dt);
    } else if (d.follow && pd < 6) d.yaw = dampAngle(d.yaw, Math.atan2(p.x - d.x, p.z - d.z), 3, dt);
    d.root.position.set(d.x, S.world.physics.groundHeight(d.x, d.z, d.root.position.y + 0.5, 0.6), d.z);
    d.view.update(dt, { speed: sp, yaw: d.yaw, graze: !d.follow });
    // zombi yaklaşınca havla (alarm)
    d.barkT -= dt;
    if (d.follow && d.barkT <= 0) {
      const z = S.zombies.nearestTo(d.x, d.z, 18);
      if (z) { d.barkT = 3; S.audio.play('bark', { at: d.root.position, vol: 1 }); if (Math.random() < 0.3) S.ui.toast('🐕 Karabaş havlıyor: zombi yakında!', 'warn', 2); }
    }
  }

  updateAnimals(dt) {
    const S = this.s;
    // çok oyunculu: hayvanları yalnız host simüle eder (istemciler anlık görüntüden kopya taşır); algı, saldırı,
    // doğma ve kaybolma bütün oyunculara göre
    const anchors = S.isHost ? this.playerAnchors() : null;
    // nüfus (host): her seferinde (çok oyunculuda rastgele) bir oyuncunun çevresinde
    if (S.isHost) {
      this._spawnT = (this._spawnT || 0) - dt;
      if (this._spawnT <= 0) {
        this._spawnT = 3;
        const p = anchors.length > 1 ? anchors[Math.floor(Math.random() * anchors.length)] : anchors[0];
        const alive = this.animals.filter((a) => !a.dead).length;
        const fm = forestMask(p.x, p.z);
        if (alive < Math.min(15, 9 + 2 * (anchors.length - 1)) && (fm > 0.3 || p.y > 25)) {
          const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 40;
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
          if (!S.world.terrain.isWater(x, z) && !S.world.buildingAt(x, z) && forestMask(x, z) > 0.25) {
            const night = S.time.isNight;
            const type = this.rng.weighted([['deer', 4], ['stag', 1.2], ['rabbit', 5], ['fox', 2], ['boar', 2], ['wolf', night ? 3.5 : 1], ['bear', 0.3]]);
            const def = ANIMALS[type];
            const n = def.pack ? 3 + (night && S.time.day > 10 ? 1 : 0) : def.herd ? this.rng.int(def.herd[0], def.herd[1]) : 1;
            const group = 'g' + Math.random().toString(36).slice(2, 6);
            for (let i = 0; i < n; i++) { const an = new Animal(this, type, x + (i % 3) * 1.6, z + Math.floor(i / 3) * 1.6 + i * 0.4); an.group = group; an.slot = i; this.animals.push(an); }
          }
        }
      }
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (a.dead) {
        a.deadT += dt;
        if (a.view) a.view.update(dt, { speed: 0 });
        else a.root.rotation.z = Math.min(1, a.deadT * 3) * Math.PI / 2;
        if (a.deadT > 30 && S.isHost) { this.group.remove(a.root); if (a.view) a.view.dispose(); this.animals.splice(i, 1); } // istemcide anlık görüntü kaldırır
        continue;
      }
      if (!S.isHost) { this.updateRemoteAnimal(a, dt); continue; }
      // en yakın oyuncu (algı, kaybolma); saldırırken hedef oyuncu (vuran/üstüne salınan) 60 m içindeyse o
      // yer altındaki (sığınaktaki) oyuncu algılanmaz; kaybolma mesafesi yine bütün oyunculara göre
      let p = null, npd = Infinity, nAll = Infinity;
      for (const q of anchors) { const d = dist(a.x, a.z, q.x, q.z); if (d < nAll) nAll = d; if (q.under) continue; if (d < npd) { npd = d; p = q; } }
      if (!p) { p = { id: null, local: false, x: a.x + 999, y: a.y, z: a.z, sneak: true, under: true }; npd = 999; } // herkes yer altında: hedef yok
      let pd = npd;
      if (a.target && a.state === 'attack') { const q = anchors.find((x) => x.id === a.target); if (q && !q.under) { const d = dist(a.x, a.z, q.x, q.z); if (d < 60) { p = q; pd = d; } } }
      if (nAll > 170) { this.group.remove(a.root); if (a.view) a.view.dispose(); this.animals.splice(i, 1); continue; }
      a.t += dt;
      a.atkCd -= dt;
      const def = a.def;
      // ---- algı
      const sneak = p.sneak;
      if (def.flee && !def.charge) {
        if (pd < (sneak ? 9 : 20)) a.state = 'flee';
        else if (a.state === 'flee' && pd > 40) a.state = 'graze';
      } else if (def.charge) {
        if (a.state !== 'attack') { if (pd < (sneak ? 8 : 16)) a.state = 'flee'; else if (a.state === 'flee' && pd > 40) a.state = 'graze'; }
        else if (pd > 30) a.state = 'graze';
      } else if (def.aggro && pd < def.aggro * (sneak ? 0.6 : 1) && a.state !== 'flee') a.state = 'attack';
      else if (a.state === 'attack' && pd > def.aggro * 2.5) a.state = 'graze';
      else if (a.state === 'flee' && pd > 50) a.state = 'graze';
      // sürü/küme: kaçan bir üye diğerlerini de kaçırır
      if (a.state === 'flee' && def.herd) for (const o of this.animals) if (o.group === a.group && !o.dead && o.state !== 'flee') o.state = 'flee';
      let sp = 0, ty = a.yaw;
      if (a.state === 'flee') {
        // sürü halinde kaç: tehditten uzağa, ortak yöne
        ty = Math.atan2(a.x - p.x, a.z - p.z) + (a.slot ? Math.sin(a.slot * 1.7) * 0.25 : 0);
        sp = def.speed;
      } else if (a.state === 'attack') {
        const toP = Math.atan2(p.x - a.x, p.z - a.z);
        if (def.pack) {
          // kurt sürüsü taktiği: bir kurt saldırır, diğerleri çevrede döner; sıra değişir
          const pack = this.animals.filter((o) => o.group === a.group && !o.dead && o.state === 'attack');
          const leader = pack.reduce((m, o) => (o.atkCd < m.atkCd ? o : m), pack[0]);
          if (leader === a || pd < 2.2) {
            ty = toP; sp = pd > 1.5 ? def.speed : 0;
          } else {
            // yörünge: 7-9 m yarıçapta teğet hareket
            const want = 7.5 + (a.slot || 0) * 0.6;
            const radial = (pd - want) * 0.6;
            const tang = (a.slot % 2 ? 1 : -1);
            const ax = Math.sin(toP), az = Math.cos(toP);
            const vx = ax * radial + az * tang * 3.2, vz = az * radial - ax * tang * 3.2;
            ty = Math.atan2(vx, vz); sp = Math.min(def.speed * 0.8, Math.hypot(vx, vz));
          }
        } else { ty = toP; sp = pd > 1.6 ? def.speed * (def.charge ? 1 : 0.9) : 0; }
        this.packNext = this.packNext || new Map();
        const packReady = !def.pack || (this.packNext.get(a.group) || 0) <= S.t;
        if (pd < (def.charge ? 2.4 : 1.9) && a.atkCd <= 0 && packReady && S.isHost && Math.abs(wrapAngle(a.yaw - toP)) < 0.8) {
          a.atkCd = def.charge ? 2.2 : def.pack ? 2.4 + Math.random() * 1.2 : 1.4;
          if (def.pack) this.packNext.set(a.group, S.t + 1.9 + Math.random() * 0.6); // sürü sırayla, aralıklı saldırır
          S.emit({ k: 'animal_fx', id: a.id, fx: 'attack', d: def.charge ? 0.65 : 0.6 });
          const dmg = def.dmg, victim = p.id, vLocal = p.local;
          S.later(def.charge ? 0.3 : 0.26, () => {
            if (a.dead) return;
            const R = def.charge ? 2.8 : 2.3, kind = a.type === 'bear' || def.charge ? 'heavy' : 'zombie';
            if (vLocal) {
              if (dist(a.x, a.z, S.local.pos.x, S.local.pos.z) < R && !this.isUnderground(S.local.pos.x, S.local.pos.y, S.local.pos.z)) {
                S.damageLocal(dmg, kind);
                if (def.charge) { S.local.vel.x += Math.sin(a.yaw) * 7; S.local.vel.z += Math.cos(a.yaw) * 7; S.local.vel.y = 3; }
              }
            } else {
              // uzak oyuncu: hasar (boğa/ayıda itme) yalnız o oyuncuya olay olarak gider
              const rp = S.players.get(victim);
              if (rp && rp.pos && dist(a.x, a.z, rp.pos.x, rp.pos.z) < R && !this.isUnderground(rp.pos.x, rp.pos.y, rp.pos.z)) S.emit({ k: 'dmg_player', to: victim, amount: dmg, kind, from: a.id, push: def.charge ? [Math.round(Math.sin(a.yaw) * 700) / 100, Math.round(Math.cos(a.yaw) * 700) / 100, 3] : undefined });
            }
          });
          // kurt saldırıdan sonra geri çekilir (vur-kaç)
          if (def.pack) a.retreatT = 0.9;
        }
        if (a.retreatT > 0) { a.retreatT -= dt; ty = toP + Math.PI; sp = def.speed * 0.7; }
      } else {
        if (a.t > 4) { a.t = 0; a.wy = Math.random() * 6.28; a.walk = Math.random() < 0.45; a.graze = !a.walk && Math.random() < 0.6; }
        // sürü üyeleri liderin yanında kalır
        const lead = def.herd || def.pack ? this.animals.find((o) => o.group === a.group && !o.dead) : null;
        if (lead && lead !== a && dist(lead.x, lead.z, a.x, a.z) > 5) { ty = Math.atan2(lead.x - a.x, lead.z - a.z); sp = 1.6; }
        else { ty = a.wy ?? a.yaw; sp = a.walk ? (def.pack ? 1.4 : 1.1) : 0; }
      }
      a.yaw = dampAngle(a.yaw, ty, 5, dt);
      if (sp > 0) {
        const r = S.world.physics.resolveCircle(a.x + Math.sin(a.yaw) * sp * dt, a.z + Math.cos(a.yaw) * sp * dt, def.size[0] * 0.6, a.y, a.y + 1.2, 0.6);
        if (!S.world.terrain.isWater(r.x, r.z)) { a.x = r.x; a.z = r.z; }
        a.y = S.world.terrain.heightAt(a.x, a.z);
      }
      a.speed = sp;
      a.root.position.set(a.x, a.y, a.z);
      if (a.view) {
        a.view.update(dt, { speed: sp, yaw: a.yaw, graze: a.state === 'graze' && a.graze });
      } else {
        a.phase += sp * dt * 4;
        const sw = Math.sin(a.phase) * Math.min(1, sp / 3) * 0.7;
        a.legs[0].rotation.x = sw; a.legs[3].rotation.x = sw; a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw;
        a.head.rotation.x = sp === 0 && a.state === 'graze' ? 0.6 : 0;
        a.root.rotation.y = a.yaw;
      }
    }
  }

  serialize() {
    return { npcs: this.list.map((n) => ({ id: n.id, x: n.pos.x, y: Math.round(n.pos.y * 100) / 100, z: n.pos.z, vis: n.visible, alive: n.alive, follow: n.follow, stay: n.stay || undefined })), dog: this.dog ? { x: this.dog.x, z: this.dog.z, found: this.dog.found } : null };
  }
  load(o) {
    if (!this.list.length) this.init();
    if (!o) return;
    for (const d of o.npcs || []) { const n = this.byId(d.id); if (!n) continue; n.pos.set(d.x, this.s.world.physics.groundHeight(d.x, d.z, d.y !== undefined ? d.y + 0.6 : 1e9), d.z); n.setVisible(d.vis); n.alive = d.alive; n.follow = d.follow; n.stay = d.stay; if (d.stay) n.atPlane = true; if (!d.alive) n.setVisible(false); }
    if (o.dog && this.dog) { this.dog.x = o.dog.x; this.dog.z = o.dog.z; this.dog.found = o.dog.found; this.dog.follow = o.dog.found; }
  }
  dispose() {
    for (const n of this.list) n.avatar.dispose();
    this.list = [];
    this.s.game.scene.remove(this.group);
  }
}

export { ANIMALS, clamp, wrapAngle };
