// Araçlar: arcade fiziği (arazi takibi, kayma, çarpışma), yakıt, hasar, bagaj, tamir, geliştirme,
// farlar, korna, zombilere çarpma. Sürücü istemci aracın hareketinde otoritedir; host durumu yayar.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { clamp, damp, dampAngle, wrapAngle, dist, uid } from '../core/util.js';

export const VEHICLE_TYPES = {
  sedan: { name: 'Aile Arabası', model: 'sedan', scale: 1.7, maxSpeed: 27, accel: 7.5, fuelCap: 45, trunk: 16, hp: 100, grip: 1.0, offroad: 0.55, seats: 4, len: 4.2, wid: 2.2 },
  pickup: { name: 'Pikap', model: 'vehicle-truck-red', scale: 1.75, maxSpeed: 25, accel: 7.5, fuelCap: 60, trunk: 30, hp: 140, grip: 0.95, offroad: 0.85, seats: 2, len: 4.6, wid: 2.3, needs: [['tire', 1], ['engine_part', 1]] },
  police: { name: 'Polis Arabası', model: 'police-car', scale: 1.65, maxSpeed: 31, accel: 9, fuelCap: 50, trunk: 14, hp: 110, grip: 1.05, offroad: 0.5, seats: 4, len: 4.6, wid: 2.2, siren: true },
  ambulance: { name: 'Ambulans', model: 'ambulance', scale: 1.75, maxSpeed: 24, accel: 6.5, fuelCap: 60, trunk: 30, hp: 140, grip: 0.95, offroad: 0.6, seats: 4, len: 5.2, wid: 2.4, siren: true },
  van: { name: 'Minibüs', model: 'van', scale: 1.85, maxSpeed: 22, accel: 5.8, fuelCap: 70, trunk: 40, hp: 150, grip: 0.9, offroad: 0.6, seats: 6, len: 5.6, wid: 2.6 },
  rv: { name: 'Karavan', model: 'citroen-old-van', scale: 1.6, maxSpeed: 19, accel: 4.6, fuelCap: 80, trunk: 50, hp: 160, grip: 0.85, offroad: 0.5, seats: 4, len: 5.4, wid: 2.8 },
  offroad: { name: 'Arazi Aracı', model: 'suv', scale: 1.75, maxSpeed: 25, accel: 8.2, fuelCap: 60, trunk: 24, hp: 170, grip: 1.0, offroad: 1.0, seats: 4, len: 4.7, wid: 2.4, needs: [['engine_part', 1], ['car_battery', 1]] },
  motorcycle: { name: 'Motosiklet', model: 'vehicle-motorcycle', scale: 1.3, maxSpeed: 33, accel: 12, fuelCap: 15, trunk: 4, hp: 60, grip: 1.1, offroad: 0.7, seats: 2, len: 3.0, wid: 1.2, bike: true, sound: 'engine-motorcycle' },
  military: { name: 'Askerî Kamyon', model: 'vehicle-truck-green', scale: 2.0, maxSpeed: 23, accel: 6.5, fuelCap: 90, trunk: 40, hp: 260, grip: 0.95, offroad: 1.0, seats: 6, len: 5.4, wid: 2.7, armor: 0.3 },
  armored: { name: 'Zırhlı Minibüs', model: 'delivery-truck', scale: 1.85, maxSpeed: 20, accel: 5, fuelCap: 80, trunk: 30, hp: 320, grip: 0.9, offroad: 0.7, seats: 6, len: 5.8, wid: 2.7, armor: 0.5, needs: [['car_battery', 1], ['engine_part', 2]] },
  boat: { name: 'Martı Teknesi', model: 'boat-large', scale: 3.4, maxSpeed: 15, accel: 4, fuelCap: 60, trunk: 20, hp: 100, grip: 0.6, offroad: 0, seats: 6, len: 6, wid: 3, water: true, needs: [['engine_part', 1], ['repair_kit', 1]] },
};

export const UPGRADES = {
  armor: { name: 'Zırh Plakaları', cost: [['armor_kit', 1]], desc: 'Hasarı %40 azaltır, zombi çarpışmasında daha az hasar.', ws: true },
  bumper: { name: 'Çelik Tampon', cost: [['metal_sheet', 2], ['screws', 10]], desc: 'Zombilere 2 kat çarpma hasarı.', ws: true },
  rack: { name: 'Tavan Bagajı', cost: [['plank', 4], ['rope', 2], ['scrap_metal', 2]], desc: 'Bagaj +10 yuva.' },
  tank: { name: 'Ek Yakıt Deposu', cost: [['jerrycan', 1], ['metal_sheet', 1], ['duct_tape', 1]], desc: 'Yakıt kapasitesi +%50.' },
  lights: { name: 'Far Geliştirmesi', cost: [['electronics', 1], ['wire', 2], ['glass', 1]], desc: 'Daha güçlü farlar.' },
  tires: { name: 'Arazi Lastikleri', cost: [['tire', 2]], desc: 'Arazi performansı ve yol tutuşu +.' },
  engine: { name: 'Motor Geliştirmesi', cost: [['engine_part', 2], ['electronics', 1]], desc: 'Azami hız +%15, ivme +%20.', ws: true },
  paint: { name: 'Boya', cost: [['plastic', 1]], desc: 'Aracın rengini değiştir.' },
  sticker: { name: 'Çıkartma', cost: [['cloth', 1]], desc: 'Kendine özgü bir çıkartma.' },
};
const PAINTS = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#2c3e50', '#ecf0f1', '#556b2f', '#d35400', '#e88fb4'];

const _res = { x: 0, z: 0, hit: false, hits: [] };

class Vehicle {
  constructor(session, spec) {
    this.s = session;
    this.id = spec.id || 'v' + uid();
    this.type = spec.type;
    this.def = VEHICLE_TYPES[spec.type];
    this.pos = new THREE.Vector3(spec.x, spec.y ?? session.world.terrain.heightAt(spec.x, spec.z), spec.z);
    this.yaw = spec.rot || 0;
    this.speed = 0; this.vx = 0; this.vz = 0; this.vy = 0;
    this.steer = 0;
    this.health = (spec.health ?? 1) * this.def.hp;
    this.fuel = (spec.fuel ?? 0.5) * this.def.fuelCap;
    this.broken = !!spec.broken;
    this.upgrades = spec.upgrades || {};
    this.paint = spec.paint || null;
    this.trunk = spec.trunk || new Array(this.def.trunk).fill(null);
    this.seats = new Array(this.def.seats).fill(null);
    this.lights = false;
    this.pitch = 0; this.roll = 0;
    this.wrecked = this.health <= 0;
    this.water = !!this.def.water;
    this.build();
  }

  get maxFuel() { return this.def.fuelCap * (this.upgrades.tank ? 1.5 : 1); }
  get maxHealth() { return this.def.hp * (this.upgrades.armor ? 1.5 : 1); }
  get trunkSize() { return this.def.trunk + (this.upgrades.rack ? 10 : 0); }

  build() {
    const S = this.s;
    const g = new THREE.Group();
    const m = S.game.assets.model('vehicles', this.def.model);
    m.scale.setScalar(this.def.scale);
    // pivotu merkeze al ve tekerlekleri döndürülebilir yap
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);
    g.add(m);
    g.updateMatrixWorld(true);
    this.wheels = [];
    const wheelNodes = [];
    m.traverse((o) => { if (o.isMesh && /wheel/i.test(o.name + (o.parent ? o.parent.name : ''))) wheelNodes.push(o); });
    for (const w of wheelNodes) {
      const wc = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(wc);
      g.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      g.updateMatrixWorld(true);
      spin.attach(w);
      this.wheels.push({ pivot, spin, front: wc.z > 0, mesh: w });
    }
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.model = m;
    this.bodyMats = [];
    m.traverse((o) => { if (o.isMesh && o.material && /paint|body|car/i.test(o.material.name)) { o.material = o.material.clone(); this.bodyMats.push(o.material); } });
    if (this.paint) this.applyPaint(this.paint);
    // farlar
    this.headlights = [];
    for (const s of [-1, 1]) {
      const sl = new THREE.SpotLight(0xfff4d6, 0, 40, 0.5, 0.5, 1.2);
      sl.position.set(s * this.def.wid * 0.3, 0.9, this.def.len * 0.45);
      const t = new THREE.Object3D(); t.position.set(s * 0.6, 0, this.def.len * 0.45 + 12);
      g.add(sl); g.add(t); sl.target = t;
      this.headlights.push(sl);
    }
    this.root = g;
    this.armorVis = null;
    this.updateUpgradeVisuals();
    S.game.scene.add(g);
    this.sync();
  }

  applyPaint(col) {
    this.paint = col;
    for (const m of this.bodyMats) m.color.set(col);
  }

  updateUpgradeVisuals() {
    if (this.armorVis) { this.root.remove(this.armorVis); this.armorVis = null; }
    const grp = new THREE.Group();
    const M = new THREE.MeshStandardMaterial({ color: 0x6d7478, metalness: 0.5, roughness: 0.5 });
    const L = this.def.len, W = this.def.wid;
    if (this.upgrades.armor) {
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, L * 0.7), M); p.position.set(s * W * 0.5, 0.9, 0); grp.add(p); }
      const w = new THREE.Mesh(new THREE.BoxGeometry(W * 0.75, 0.35, 0.06), M); w.position.set(0, 1.55, L * 0.18); w.rotation.x = -0.4; grp.add(w);
    }
    if (this.upgrades.bumper) { const b = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, 0.3, 0.25), M); b.position.set(0, 0.55, L * 0.52); grp.add(b); for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), M); sp.rotation.x = Math.PI / 2; sp.position.set(-W * 0.35 + i * W * 0.23, 0.55, L * 0.52 + 0.25); grp.add(sp); } }
    if (this.upgrades.rack) { const r = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.08, L * 0.4), new THREE.MeshStandardMaterial({ color: 0x3a3a3a })); r.position.set(0, 2.0, -L * 0.05); grp.add(r); for (let i = 0; i < 3; i++) { const bx = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: [0x8d6e45, 0xc0392b, 0x556b2f][i] })); bx.position.set(-0.5 + i * 0.5, 2.25, -L * 0.05); grp.add(bx); } }
    if (this.upgrades.sticker) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill(); g.fillStyle = '#1b1b1b'; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('30', 64, 66); const tex = new THREE.CanvasTexture(c); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: tex, transparent: true })); p.position.set(s * (W * 0.5 + 0.02), 1.0, 0); p.rotation.y = s * Math.PI / 2; grp.add(p); } }
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.armorVis = grp;
    this.root.add(grp);
    for (const h of this.headlights) h.distance = this.upgrades.lights ? 70 : 40;
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, 0, 0);
    this.root.rotateY(this.yaw);
    this.root.rotateX(-this.pitch);
    this.root.rotateZ(this.roll);
  }

  /** Model üzerindeki koltuk konumları (yerel) */
  seatLocal(i) {
    const W = this.def.wid, L = this.def.len;
    if (this.def.bike) return new THREE.Vector3(0, 0.75, i === 0 ? -0.1 : -0.75);
    const row = Math.floor(i / 2), side = i % 2 === 0 ? 1 : -1;
    return new THREE.Vector3(side * W * 0.2, 0.55, L * 0.08 - row * 1.1);
  }

  seatPlayer(avatar, i) {
    const lp = this.seatLocal(i).applyMatrix4(this.root.matrixWorld);
    avatar.root.position.copy(lp);
    avatar.visYaw = this.yaw;
    avatar.root.rotation.y = this.yaw;
  }

  dispose() {
    this.s.game.scene.remove(this.root);
  }
}

export class Vehicles {
  constructor(session) {
    this.s = session;
    this.list = [];
    this.local = null; // sürülen araç
    const S = session;
    S.on('vehicle_enter', (p, from) => {
      const v = this.byId(p.id);
      if (!v) return;
      const seat = p.seat === 0 && !v.seats[0] ? 0 : v.seats.findIndex((x, i) => !x && i > 0);
      if (seat < 0) return;
      S.emit({ k: 'veh_seat', id: v.id, seat, player: from });
    });
    S.on('vehicle_exit', (p, from) => { const v = this.byId(p.id); if (v) { const seat = v.seats.indexOf(from); if (seat >= 0) S.emit({ k: 'veh_seat', id: v.id, seat, player: null }); } });
    S.on('vehicle_state', (p, from) => { const v = this.byId(p.id); if (v && v.seats[0] === from) { this.applyState(v, p); S.net.active && S.net.broadcast({ t: 'evt', e: { k: 'veh_state', ...p } }, from); } });
    S.on('vehicle_damage', (p) => { const v = this.byId(p.id); if (v) S.emit({ k: 'veh_set', id: v.id, health: Math.max(0, v.health - p.dmg * (1 - (v.upgrades.armor ? 0.4 : 0) - (v.def.armor || 0))) }); });
    S.on('vehicle_set', (p) => S.emit({ k: 'veh_set', ...p }));
    S.on('trunk_take', (p, from) => {
      const v = this.byId(p.id); if (!v) return;
      const s = v.trunk[p.slot]; if (!s) return;
      v.trunk[p.slot] = null;
      S.emit({ k: 'veh_set', id: v.id, trunk: v.trunk });
      S.emit({ k: 'grant', to: from, items: [s] });
    });
    S.on('trunk_put', (p, from) => {
      const v = this.byId(p.id); if (!v) return;
      const def = ITEMS[p.stack.id]; let left = p.stack.qty;
      if (def.stack > 1) for (const s of v.trunk) if (s && s.id === p.stack.id && left > 0) { const a = Math.min(def.stack - s.qty, left); s.qty += a; left -= a; }
      for (let i = 0; i < v.trunkSize && left > 0; i++) if (!v.trunk[i]) { const a = Math.min(def.stack, left); v.trunk[i] = { ...p.stack, qty: a }; left -= a; }
      S.emit({ k: 'veh_set', id: v.id, trunk: v.trunk });
      if (left > 0) S.emit({ k: 'grant', to: from, items: [{ ...p.stack, qty: left }], silent: true });
    });
    S.onEvt('veh_seat', (e) => this.onSeat(e));
    S.onEvt('veh_state', (e) => { const v = this.byId(e.id); if (v && v !== this.local) this.applyState(v, e); });
    S.onEvt('veh_set', (e) => {
      const v = this.byId(e.id); if (!v) return;
      if (e.health !== undefined) { v.health = e.health; if (v.health <= 0 && !v.wrecked) { v.wrecked = true; S.fx.fire(v.pos.x, v.pos.y + 1, v.pos.z, 30, 1.2); S.audio.play('explosion', { at: v.pos, vol: 1 }); if (v === this.local) { this.exitLocal(); S.ui.toast('Araç kullanılamaz hale geldi!', 'danger'); } } }
      if (e.fuel !== undefined) v.fuel = e.fuel;
      if (e.broken !== undefined) v.broken = e.broken;
      if (e.upgrades) { v.upgrades = e.upgrades; v.updateUpgradeVisuals(); }
      if (e.paint) v.applyPaint(e.paint);
      if (e.trunk) { v.trunk = e.trunk; S.ui.refreshStorage && S.ui.refreshStorage(v.id); }
      if (e.wrecked === false) v.wrecked = false;
    });
    S.onEvt('veh_add', (e) => { if (!this.byId(e.id)) this.list.push(new Vehicle(S, e)); });
  }

  init() {
    for (const sp of this.s.world.vehicleSpawns) this.list.push(new Vehicle(this.s, sp));
    // karavan kamp alanında
    this.list.push(new Vehicle(this.s, { id: 'rv', type: 'rv', x: -224, z: -38, rot: 0.6, fuel: 0.25, health: 0.7 }));
  }

  byId(id) { return this.list.find((v) => v.id === id); }

  /** Etkileşim seçenekleri */
  options(v, pl) {
    const S = this.s;
    const out = [];
    const sideX = v.pos.x + Math.cos(v.yaw) * v.def.wid * 0.55, sideZ = v.pos.z - Math.sin(v.yaw) * v.def.wid * 0.55;
    const backX = v.pos.x - Math.sin(v.yaw) * v.def.len * 0.55, backZ = v.pos.z - Math.cos(v.yaw) * v.def.len * 0.55;
    if (v.wrecked) { out.push({ act: 'repair', label: `${v.def.name}: Hurda (Tamir: 2 tamir seti)`, holdTime: 2, x: v.pos.x, z: v.pos.z, range: 3.5 }); return out; }
    if (v.broken) {
      const need = (v.def.needs || []).map(([id, n]) => `${ITEMS[id].name} x${n}`).join(', ');
      out.push({ act: 'fix', label: `${v.def.name} bozuk — Onar (${need})`, holdTime: 2, x: v.pos.x, z: v.pos.z, range: 3.6 });
    } else if (!v.water || S.local.pos.distanceTo(v.pos) < 6) {
      if (!v.seats[0]) out.push({ act: 'drive', label: `Sür: ${v.def.name} (Yakıt %${Math.round(v.fuel / v.maxFuel * 100)})`, x: sideX, z: sideZ, range: 2.6, bias: -0.3 });
      else if (v.seats.some((s, i) => i > 0 && !s)) out.push({ act: 'ride', label: `Yolcu Ol: ${v.def.name}`, x: sideX, z: sideZ, range: 2.6 });
    }
    out.push({ act: 'trunk', label: `Bagaj: ${v.def.name}`, x: backX, z: backZ, range: 2.0 });
    const jc = S.inventory.slots.find((s) => s && s.id === 'jerrycan' && (s.fuel || 0) > 0);
    if (jc && v.fuel < v.maxFuel - 1) out.push({ act: 'refuel', label: `Yakıt Doldur (${Math.round(jc.fuel)} L)`, holdTime: 2, x: backX, z: backZ, range: 2.4 });
    if (v.health < v.maxHealth * 0.98 && S.inventory.has('repair_kit')) out.push({ act: 'repair', label: `Tamir Et (Sağlık %${Math.round(v.health / v.maxHealth * 100)})`, holdTime: 3, x: v.pos.x, z: v.pos.z, range: 3.2 });
    out.push({ act: 'upgrade', label: `Araç Geliştirme: ${v.def.name}`, x: v.pos.x + Math.sin(v.yaw) * v.def.len * 0.5, z: v.pos.z + Math.cos(v.yaw) * v.def.len * 0.5, range: 2.2, bias: 0.3 });
    void pl;
    return out;
  }

  useOption(v, opt) {
    const S = this.s;
    const inv = S.inventory;
    switch (opt.act) {
      case 'drive': S.act('vehicle_enter', { id: v.id, seat: 0 }); break;
      case 'ride': S.act('vehicle_enter', { id: v.id, seat: 1 }); break;
      case 'trunk': S.ui.openStorage({ kind: 'trunk', id: v.id, label: `${v.def.name} — Bagaj` }); S.audio.play('door', { at: v.pos, vol: 0.6, rate: 0.8 }); break;
      case 'refuel': {
        S.interact.startHold('Yakıt aktarılıyor…', 2, () => {
          const jc = inv.slots.find((s) => s && s.id === 'jerrycan' && (s.fuel || 0) > 0);
          if (!jc) return;
          const add = Math.min(jc.fuel, v.maxFuel - v.fuel);
          jc.fuel -= add; inv.changed();
          S.act('vehicle_set', { id: v.id, fuel: v.fuel + add });
          if (v.type === 'boat') S.act('flag', { flag: 'boat_fuel', value: Math.round(v.fuel + add) });
          S.ui.toast(`${Math.round(add)} L yakıt eklendi.`, 'good');
        }, 'search');
        break;
      }
      case 'repair': {
        const kits = v.wrecked ? 2 : 1;
        if (inv.count('repair_kit') < kits) { S.ui.toast(`${kits} tamir seti gerekli.`, 'warn'); return; }
        const mul = S.localProfile.stats.repair || 1;
        S.interact.startHold('Araç tamir ediliyor…', 3.5 / mul, () => {
          inv.remove('repair_kit', kits);
          const nh = v.wrecked ? v.maxHealth * 0.4 : Math.min(v.maxHealth, v.health + v.maxHealth * 0.35 * mul);
          S.act('vehicle_set', { id: v.id, health: nh, wrecked: false });
          S.ui.toast('Araç onarıldı.', 'good');
        }, 'hammer');
        break;
      }
      case 'fix': {
        const needs = v.def.needs || [];
        const miss = needs.filter(([id, n]) => !inv.has(id, n));
        if (miss.length) { S.ui.toast('Eksik: ' + miss.map(([id, n]) => `${ITEMS[id].name} (${inv.count(id)}/${n})`).join(', '), 'warn', 5); return; }
        if (!S.build.hasTool('wrench')) { S.ui.toast('İngiliz anahtarı gerekli.', 'warn'); return; }
        const mul = S.localProfile.stats.repair || 1;
        const tm = S.interact.timed(20, mul);
        S.interact.startHold(`${v.def.name} onarılıyor…`, tm.real + 2, () => {
          for (const [id, n] of needs) inv.remove(id, n);
          S.act('vehicle_set', { id: v.id, broken: false });
          S.quests.onRepair('vehicle:' + v.id);
          if (tm.extra) S.time.advance(tm.extra);
          S.ui.toast(`${v.def.name} çalışıyor!`, 'good', 3);
        }, 'hammer');
        break;
      }
      case 'upgrade': S.ui.openVehicle(v); break;
      default: break;
    }
  }

  applyUpgrade(v, key) {
    const S = this.s;
    const up = UPGRADES[key];
    if (!up) return;
    const inv = S.inventory;
    if (key !== 'paint' && v.upgrades[key]) { S.ui.toast('Bu geliştirme zaten takılı.', 'info'); return; }
    if (up.ws && S.build.stations(S.local.pos).workbench < 1 && !S.isInBase(S.local.pos)) { S.ui.toast('Bu geliştirme için üste/atölye yakınında olmalısın.', 'warn'); return; }
    const miss = up.cost.filter(([id, n]) => !inv.has(id, n));
    if (miss.length) { S.ui.toast('Eksik: ' + miss.map(([id, n]) => `${ITEMS[id].name} ${inv.count(id)}/${n}`).join(', '), 'warn', 4); return; }
    for (const [id, n] of up.cost) inv.remove(id, n);
    if (key === 'paint') { const col = PAINTS[(PAINTS.indexOf(v.paint) + 1) % PAINTS.length]; S.act('vehicle_set', { id: v.id, paint: col }); return; }
    S.act('vehicle_set', { id: v.id, upgrades: { ...v.upgrades, [key]: 1 } });
    S.audio.play('build', { vol: 0.8 });
    S.ui.toast(`${up.name} takıldı!`, 'good');
    S.results.vehicles.add(v.def.name);
  }

  onSeat(e) {
    const S = this.s;
    const v = this.byId(e.id);
    if (!v) return;
    const prev = v.seats[e.seat];
    v.seats[e.seat] = e.player;
    if (e.player === S.localId) {
      this.local = v;
      S.local.vehicle = v;
      S.local.mode = e.seat === 0 ? 'drive' : 'seat';
      S.local.seat = e.seat;
      S.local.avatar.hold(null);
      S.local.avatar.setFlashlight(false);
      S.results.vehicles.add(v.def.name);
      S.ui.toast(e.seat === 0 ? `${v.def.name}: W/S gaz-fren · A/D direksiyon · Boşluk el freni · H korna · F far · E in` : 'Yolcu koltuğundasın. E ile in.', 'info', 4);
      S.audio.play('door', { at: v.pos, vol: 0.7, rate: 0.7 });
    } else if (prev === S.localId && e.player !== S.localId) {
      // indik
    }
    const rec = S.players.get(e.player);
    if (rec && !rec.isLocal) { rec.vehicleId = v.id; rec.seat = e.seat; }
    if (!e.player && prev) { const r = S.players.get(prev); if (r && !r.isLocal) r.vehicleId = null; }
  }

  exitLocal() {
    const S = this.s;
    const v = this.local;
    if (!v) return;
    S.act('vehicle_exit', { id: v.id });
    // yanına in
    const side = S.local.seat % 2 === 0 ? 1 : -1;
    let ex = v.pos.x + Math.cos(v.yaw) * (v.def.wid * 0.5 + 0.8) * side, ez = v.pos.z - Math.sin(v.yaw) * (v.def.wid * 0.5 + 0.8) * side;
    if (S.world.physics.overlapsBox(ex - 0.3, ez - 0.3, ex + 0.3, ez + 0.3, v.pos.y + 0.2, v.pos.y + 1.8)) { ex = v.pos.x - Math.cos(v.yaw) * (v.def.wid * 0.5 + 0.8) * side; ez = v.pos.z + Math.sin(v.yaw) * (v.def.wid * 0.5 + 0.8) * side; }
    if (v.water) { const dock = S.world.interactables.find((i) => i.type === 'boat_dock'); if (dock) { ex = dock.x; ez = dock.z - 3; } }
    S.local.spawnAt(ex, S.world.physics.groundHeight(ex, ez, v.pos.y + 2) + 0.05, ez, v.yaw);
    S.local.camYaw = v.yaw + Math.PI;
    S.local.mode = 'ground';
    S.local.vehicle = null;
    this.local = null;
    S.audio.stopLoop('engine_local');
    for (const h of v.headlights) h.intensity = 0;
    S.selectHotbar(S.hotbarIndex);
  }

  /** Sürücü/yolcu güncellemesi (yerel) */
  updateLocalDriving(dt, input, blocking) {
    const S = this.s;
    const v = this.local;
    const pl = S.local;
    if (!v) { pl.mode = 'ground'; return; }
    if (!blocking && input.locked) {
      const sens = 0.0024 * S.game.settings.get('controls.mouseSens');
      pl.camYaw -= input.mouse.dx * sens;
      pl.camPitch = clamp(pl.camPitch - input.mouse.dy * sens, -1.0, 0.6);
    }
    if (pl.mode === 'drive') {
      let thr = 0, st = 0, hb = false;
      if (!blocking) {
        if (input.isDown('forward')) thr += 1;
        if (input.isDown('back')) thr -= 1;
        if (input.isDown('left')) st += 1;
        if (input.isDown('right')) st -= 1;
        hb = input.isDown('jump');
        if (input.wasPressed('quickHeal')) { S.audio.play('horn', { at: v.pos, vol: 1 }); S.act('noise', { x: v.pos.x, z: v.pos.z, r: 60, src: 'horn' }); }
        if (input.wasPressed('flashlight')) { v.lights = !v.lights; S.audio.play('click', { vol: 0.5 }); }
      }
      this.drive(v, dt, thr, st, hb);
      // ağ: araç durumu
      this._sendT = (this._sendT || 0) - dt;
      if (this._sendT <= 0) { this._sendT = 1 / 12; if (S.net.active) S.act('vehicle_state', this.stateOf(v)); }
    }
    pl.pos.copy(v.pos);
    v.seatPlayer(pl.avatar, pl.seat);
    pl.yaw = v.yaw;
    pl.avatar.visYaw = v.yaw;
    pl.speed = 0;
    pl.updateCamera(dt);
    const sp = Math.abs(v.speed);
    S.audio.loop('engine_local', v.def.sound || 'engine', { vol: v.broken || v.fuel <= 0 ? 0 : 0.35 + sp / v.def.maxSpeed * 0.4, rate: 0.6 + sp / v.def.maxSpeed * 1.4 });
    if (input.wasPressed('interact') && !blocking) this.exitLocal();
  }

  drive(v, dt, thr, steerIn, handbrake) {
    const S = this.s;
    const d = v.def;
    const T = S.world.terrain;
    const canRun = !v.broken && !v.wrecked && v.fuel > 0;
    const hpF = v.health / v.maxHealth;
    const maxSp = d.maxSpeed * (v.upgrades.engine ? 1.15 : 1) * (hpF < 0.3 ? 0.6 : 1);
    const accel = d.accel * (v.upgrades.engine ? 1.2 : 1);
    // arazi tipi
    const onRoad = !!S.world.roads && !v.water && T.roadMask[T.idx(Math.round((v.pos.x + 640) / 4), Math.round((v.pos.z + 640) / 4))] > 0;
    const rough = v.water ? 1 : onRoad ? 1 : 0.6 + 0.4 * (d.offroad + (v.upgrades.tires ? 0.25 : 0));
    // hız
    if (canRun && thr > 0) v.speed += accel * thr * rough * dt * (v.speed < 0 ? 2.2 : 1);
    else if (canRun && thr < 0) v.speed += (v.speed > 0.5 ? -accel * 2.2 : -accel * 0.6) * dt;
    v.speed -= v.speed * (handbrake ? 1.4 : 0.35) * dt;
    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 0.8 * dt);
    v.speed = clamp(v.speed, -maxSp * 0.35, maxSp * rough);
    // direksiyon
    v.steer = damp(v.steer, steerIn, 6, dt);
    const sf = clamp(Math.abs(v.speed) / 6, 0, 1) * (1 - clamp(Math.abs(v.speed) / (maxSp * 1.4), 0, 0.55));
    const grip = d.grip * (v.upgrades.tires ? 1.1 : 1) * (S.env.weather.rain > 0.3 ? 0.85 : 1) * (handbrake ? 0.55 : 1);
    v.yaw += v.steer * 1.9 * sf * Math.sign(v.speed) * dt * (handbrake ? 1.4 : 1);
    // hız vektörü: başa doğru, kayma
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const tvx = fx * v.speed, tvz = fz * v.speed;
    const k = Math.min(1, grip * 6 * dt);
    v.vx += (tvx - v.vx) * k; v.vz += (tvz - v.vz) * k;
    // yakıt
    if (canRun) v.fuel = Math.max(0, v.fuel - (Math.abs(v.speed) * 0.0025 + (thr ? 0.004 : 0.001)) * dt * 6);
    // konum ve çarpışma
    let nx = v.pos.x + v.vx * dt, nz = v.pos.z + v.vz * dt;
    const L = d.len, W = d.wid;
    let impact = 0;
    for (const off of [-L * 0.3, 0, L * 0.3]) {
      const cx = nx + fx * off, cz = nz + fz * off;
      const r = S.world.physics.resolveCircle(cx, cz, W * 0.45, v.pos.y + 0.3, v.pos.y + 1.6, 0.5, null, _res);
      if (r.hit) {
        const px = r.x - cx, pz = r.z - cz;
        nx += px; nz += pz;
        impact = Math.max(impact, Math.abs(v.speed));
      }
    }
    // diğer araçlar
    for (const o of this.list) {
      if (o === v) continue;
      const dd = dist(o.pos.x, o.pos.z, nx, nz);
      const rr = (o.def.wid + W) * 0.5;
      if (dd < rr) { const px = (nx - o.pos.x) / (dd || 1), pz = (nz - o.pos.z) / (dd || 1); nx += px * (rr - dd); nz += pz * (rr - dd); impact = Math.max(impact, Math.abs(v.speed)); }
    }
    if (impact > 3) {
      const dmg = (impact - 3) * 2.2 * (v.upgrades.armor ? 0.6 : 1) * (1 - (d.armor || 0));
      v.speed *= -0.25; v.vx *= -0.2; v.vz *= -0.2;
      S.act('vehicle_damage', { id: v.id, dmg });
      S.audio.play('impact', { at: v.pos, vol: clamp(impact / 15, 0.3, 1) });
      S.local.camShake = clamp(impact / 15, 0.2, 1);
      if (impact > 14) { S.localStats.damage((impact - 14) * 1.5, 'fall'); S.ui.toast('Kaza! Yaralandın.', 'danger'); }
      S.fx.sparks(nx + fx * L * 0.5, v.pos.y + 0.7, nz + fz * L * 0.5);
    } else if (impact > 0) v.speed *= 0.5;
    // su
    if (v.water) {
      const deep = T.heightAt(nx, nz) < -1.0;
      if (!deep) { nx = v.pos.x; nz = v.pos.z; v.speed *= -0.3; }
      v.pos.set(nx, 0.15 + Math.sin(S.t * 1.6) * 0.08, nz);
      v.pitch = Math.sin(S.t * 1.3) * 0.03; v.roll = Math.sin(S.t * 1.1) * 0.04;
    } else {
      // arazi takibi: 4 köşe
      const hf = S.world.physics.groundHeight(nx + fx * L * 0.4, nz + fz * L * 0.4, v.pos.y + 1.2, 1.1);
      const hb = S.world.physics.groundHeight(nx - fx * L * 0.4, nz - fz * L * 0.4, v.pos.y + 1.2, 1.1);
      const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
      const hr = S.world.physics.groundHeight(nx + rx * W * 0.4, nz + rz * W * 0.4, v.pos.y + 1.2, 1.1);
      const hl = S.world.physics.groundHeight(nx - rx * W * 0.4, nz - rz * W * 0.4, v.pos.y + 1.2, 1.1);
      const gy = (hf + hb + hr + hl) / 4;
      if (v.pos.y > gy + 0.05) { v.vy -= 20 * dt; v.pos.y = Math.max(gy, v.pos.y + v.vy * dt); } else { v.pos.y = gy; v.vy = 0; }
      v.pitch = damp(v.pitch, Math.atan2(hf - hb, L * 0.8), 10, dt);
      v.roll = damp(v.roll, Math.atan2(hl - hr, W * 0.8), 10, dt);
      // derin su: stop
      if (T.heightAt(nx, nz) < T.waterLevelAt(nx, nz) - 1.0) { v.speed *= 0.8; if (!v._sunk) { v._sunk = true; S.ui.toast('Araç suya battı! Motor stop etti.', 'danger'); S.act('vehicle_damage', { id: v.id, dmg: 40 }); } }
      v.pos.x = nx; v.pos.z = nz;
    }
    // zombilere çarpma (yerel tespit)
    if (Math.abs(v.speed) > 4) {
      const bumper = v.upgrades.bumper ? 2 : 1;
      for (const [id, zv] of S.zombies.views) {
        if (zv.state.dead || zv.hitCd > S.t) continue;
        const zx = zv.pos.x - (v.pos.x + fx * L * 0.35), zz = zv.pos.z - (v.pos.z + fz * L * 0.35);
        if (zx * zx + zz * zz < (W * 0.6) ** 2) {
          zv.hitCd = S.t + 0.6;
          const dmg = Math.round(Math.abs(v.speed) * 5 * bumper);
          S.act('zombie_hit', { id, dmg, dir: [fx, fz], kind: 'melee' });
          S.fx.hit(zv.pos.x, zv.pos.y + 1, zv.pos.z, 'flesh');
          S.audio.play('hit', { at: zv.pos, vol: 1, rate: 0.7 });
          v.speed *= v.upgrades.bumper ? 0.95 : 0.85;
          S.act('vehicle_damage', { id: v.id, dmg: (zv.type === 'heavy' ? 8 : 2) / bumper });
        }
      }
    }
    // tekerlekler
    for (const w of v.wheels) {
      w.spin.rotation.x += v.speed * dt / 0.4;
      if (w.front) w.pivot.rotation.y = v.steer * 0.5;
    }
    v.sync();
    // farlar
    for (const h of v.headlights) h.intensity = v.lights ? (v.upgrades.lights ? 60 : 35) : 0;
    S.local.noise = Math.abs(v.speed) > 2 ? 18 : 6;
    if (S.isHost && Math.random() < dt * 2 && Math.abs(v.speed) > 3) S.applyAction('noise', { x: v.pos.x, z: v.pos.z, r: 22 + Math.abs(v.speed), src: 'engine' }, S.localId);
    void tvx;
  }

  stateOf(v) { return { id: v.id, x: +v.pos.x.toFixed(2), y: +v.pos.y.toFixed(2), z: +v.pos.z.toFixed(2), yaw: +v.yaw.toFixed(3), sp: +v.speed.toFixed(2), st: +v.steer.toFixed(2), f: +v.fuel.toFixed(1), l: v.lights ? 1 : 0 }; }

  applyState(v, p) {
    v.netTarget = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
    v.speed = p.sp; v.steer = p.st; v.fuel = p.f; v.lights = !!p.l;
  }

  /** Araçların içinden geçmeyi önle (oyuncu itme) */
  pushOut(x, z, r, y) {
    for (const v of this.list) {
      if (v === this.local) continue;
      const dx = x - v.pos.x, dz = z - v.pos.z;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      if (y > v.pos.y + 1.7) continue;
      // yerel kutu
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
      let lx = dx * c - dz * s, lz = dx * s + dz * c;
      const hw = v.def.wid / 2 + r, hl = v.def.len / 2 + r;
      if (Math.abs(lx) < hw && Math.abs(lz) < hl) {
        const ox = hw - Math.abs(lx), oz = hl - Math.abs(lz);
        if (ox < oz) lx = Math.sign(lx) * hw; else lz = Math.sign(lz) * hl;
        x = v.pos.x + (lx * Math.cos(v.yaw) + lz * Math.sin(v.yaw));
        z = v.pos.z + (-lx * Math.sin(v.yaw) + lz * Math.cos(v.yaw));
      }
    }
    return { x, z };
  }

  update(dt) {
    const S = this.s;
    for (const v of this.list) {
      if (v === this.local) continue;
      if (v.netTarget) {
        v.pos.x += (v.netTarget.x - v.pos.x) * Math.min(1, dt * 10);
        v.pos.y += (v.netTarget.y - v.pos.y) * Math.min(1, dt * 10);
        v.pos.z += (v.netTarget.z - v.pos.z) * Math.min(1, dt * 10);
        v.yaw = dampAngle(v.yaw, v.netTarget.yaw, 10, dt);
        for (const w of v.wheels) { w.spin.rotation.x += v.speed * dt / 0.4; if (w.front) w.pivot.rotation.y = v.steer * 0.5; }
        v.sync();
        for (const h of v.headlights) h.intensity = v.lights ? 35 : 0;
        if (v.seats[0]) S.audio.loop('engine_' + v.id, v.def.sound || 'engine', { at: v.pos, vol: 0.3 + Math.abs(v.speed) / v.def.maxSpeed * 0.4, rate: 0.6 + Math.abs(v.speed) / v.def.maxSpeed * 1.4, range: 60 });
        else S.audio.stopLoop('engine_' + v.id);
      }
      if (v.wrecked && Math.random() < dt * 3) S.fx.smoke(v.pos.x, v.pos.y + 1.5, v.pos.z, 1, '#333333');
      else if (v.health < v.maxHealth * 0.3 && Math.random() < dt * 2) S.fx.smoke(v.pos.x + Math.sin(v.yaw) * v.def.len * 0.4, v.pos.y + 1.2, v.pos.z + Math.cos(v.yaw) * v.def.len * 0.4, 1, '#666666');
    }
    if (this.local) {
      const v = this.local;
      if (v.health < v.maxHealth * 0.3 && Math.random() < dt * 3) S.fx.smoke(v.pos.x + Math.sin(v.yaw) * v.def.len * 0.4, v.pos.y + 1.2, v.pos.z + Math.cos(v.yaw) * v.def.len * 0.4, 1, '#555555');
    }
  }

  serialize() {
    return this.list.map((v) => ({ id: v.id, type: v.type, x: v.pos.x, y: v.pos.y, z: v.pos.z, rot: v.yaw, health: v.health / v.def.hp, fuel: v.fuel / v.def.fuelCap, broken: v.broken, upgrades: v.upgrades, paint: v.paint, trunk: v.trunk, wrecked: v.wrecked }));
  }
  load(arr) {
    for (const v of this.list) v.dispose();
    this.list = [];
    if (!arr) { this.init(); return; }
    for (const o of arr) { const v = new Vehicle(this.s, o); if (o.wrecked) v.wrecked = true; this.list.push(v); }
  }
  dispose() { for (const v of this.list) v.dispose(); this.list = []; this.s.audio.stopLoop('engine_local'); }
}

export { wrapAngle };
