// Üs geliştirme: yapı yerleştirme, inşaat, hasar/onarım, elektrik şebekesi (jeneratör + güneş paneli),
// yeraltı sığınağı projesi, bahçe, yağmur suyu, kamp ateşi, tuzaklar, depolar ve üs seviyesi.
import * as THREE from 'three';
import { BUILDABLES, PROJECTS } from '../data/buildables.js';
import { ITEMS } from '../data/items.js';
import { Geo } from '../world/Geo.js';
import * as P from '../world/Props.js';
import { NAV } from '../world/NavGrid.js';
import { uid, clamp, dist, RNG } from '../core/util.js';
import { makeFire } from '../Game.js';

export class Build {
  constructor(session) {
    this.s = session;
    this.structures = new Map();
    this.placing = null;
    this.ghost = null;
    this.rot = 0;
    this.gen = { fixed: false, fuel: 0, on: false };
    this.bunker = { stage: 0, progress: 0 };
    this.fires = new Map(); // ateş noktaları: id → {x,y,z,fuel(dk), fx}
    this.gardens = new Map();
    this.group = new THREE.Group();
    this.group.name = 'structures';
    session.game.scene.add(this.group);
    this.powerFlag = false;
    const S = session;
    // ---- eylemler
    S.on('build_place', (p, from) => {
      const def = BUILDABLES[p.type];
      if (!def) return;
      if (!this.validAt(def, p.x, p.y, p.z, p.rot).ok) return;
      const id = 's' + uid();
      S.emit({ k: 'struct_add', id, type: p.type, x: p.x, y: p.y, z: p.z, rot: p.rot, built: 0, hp: def.hp, by: from });
    });
    S.on('build_work', (p, from) => {
      const st = this.structures.get(p.id);
      if (!st) return;
      const built = clamp(st.built + p.amount, 0, 1);
      S.emit({ k: 'struct_set', id: st.id, built });
      if (built >= 1 && st.built < 1) {
        S.results.built++;
        S.quests.onBuild(st.type, from);
        S.emit({ k: 'toast', text: `${BUILDABLES[st.type].name} tamamlandı!`, kind: 'good' });
      }
    });
    S.on('struct_damage', (p) => {
      const st = this.structures.get(p.id);
      if (!st) return;
      const hp = st.hp - p.dmg;
      if (hp <= 0) S.emit({ k: 'struct_remove', id: st.id, destroyed: true });
      else { st.hp = hp; if (Math.random() < 0.3) S.emit({ k: 'struct_set', id: st.id, hp }); }
    });
    S.on('struct_remove', (p) => S.emit({ k: 'struct_remove', id: p.id }));
    S.on('struct_repair', (p) => { const st = this.structures.get(p.id); if (st) S.emit({ k: 'struct_set', id: st.id, hp: BUILDABLES[st.type].hp }); });
    S.on('struct_data', (p) => { const st = this.structures.get(p.id); if (st) S.emit({ k: 'struct_set', id: st.id, data: { ...st.data, ...p.data } }); });
    S.on('door_struct', (p) => { const st = this.structures.get(p.id); if (st) S.emit({ k: 'struct_set', id: st.id, data: { ...st.data, open: !st.data.open } }); });
    // ortak depo (sandık/raf) — yuvalar st.data.slots
    S.on('store_take', (p, from) => {
      const st = this.structures.get(p.id);
      if (!st || !st.data.slots) return;
      const s = st.data.slots[p.slot];
      if (!s) return;
      const qty = Math.min(p.qty || s.qty, s.qty);
      const slots = st.data.slots.map((x) => (x ? { ...x } : null));
      slots[p.slot].qty -= qty;
      if (slots[p.slot].qty <= 0) slots[p.slot] = null;
      S.emit({ k: 'struct_set', id: st.id, data: { ...st.data, slots } });
      S.emit({ k: 'grant', to: from, items: [{ ...s, qty }] });
    });
    S.on('store_take_all', (p, from) => {
      const st = this.structures.get(p.id);
      if (!st || !st.data.slots) return;
      const items = st.data.slots.filter(Boolean);
      S.emit({ k: 'struct_set', id: st.id, data: { ...st.data, slots: st.data.slots.map(() => null) } });
      if (items.length) S.emit({ k: 'grant', to: from, items });
    });
    S.on('store_put', (p, from) => {
      const st = this.structures.get(p.id);
      const def = st && BUILDABLES[st.type];
      if (!st || !def.storage) return;
      const slots = (st.data.slots || new Array(def.storage).fill(null)).map((x) => (x ? { ...x } : null));
      while (slots.length < def.storage) slots.push(null);
      const idef = ITEMS[p.stack.id];
      let left = p.stack.qty;
      if (idef.stack > 1) for (const s of slots) if (s && s.id === p.stack.id && !s.noteId && left > 0) { const a = Math.min(idef.stack - s.qty, left); s.qty += a; left -= a; }
      for (let i = 0; i < slots.length && left > 0; i++) if (!slots[i]) { const a = Math.min(idef.stack, left); slots[i] = { ...p.stack, qty: a }; left -= a; }
      S.emit({ k: 'struct_set', id: st.id, data: { ...st.data, slots } });
      if (left > 0) S.emit({ k: 'grant', to: from, items: [{ ...p.stack, qty: left }], silent: true });
    });
    S.on('gen', (p) => S.emit({ k: 'gen', ...this.gen, ...p }));
    S.on('bunker', (p) => S.emit({ k: 'bunker', ...this.bunker, ...p }));
    S.on('fire_set', (p) => S.emit({ k: 'fire', id: p.id, x: p.x, y: p.y, z: p.z, fuel: p.fuel }));
    S.on('garden', (p) => S.emit({ k: 'garden', id: p.id, g: p.g }));
    S.on('team_morale', (p) => S.emit({ k: 'team_morale', amount: p.amount }));
    S.onEvt('team_morale', (e) => { if (S.isInBase(S.local.pos)) { S.localStats.morale = Math.min(100, S.localStats.morale + e.amount); S.ui.toast('Takımın morali yükseldi!', 'good', 2); } });
    // ---- olaylar
    S.onEvt('struct_add', (e) => this.addStructure(e));
    S.onEvt('struct_set', (e) => this.setStructure(e));
    S.onEvt('struct_remove', (e) => this.removeStructure(e.id, e.destroyed));
    S.onEvt('gen', (e) => { this.gen = { fixed: e.fixed, fuel: e.fuel, on: e.on }; S.flags.generator_fixed = e.fixed; this.refreshPower(); });
    S.onEvt('bunker', (e) => { this.bunker = { stage: e.stage, progress: e.progress }; S.flags.bunker_stage = e.stage; S.quests.onFlag('bunker_stage'); this.updateBunkerRoom(); });
    S.onEvt('fire', (e) => this.setFire(e));
    S.onEvt('garden', (e) => { this.gardens.set(e.id, e.g); this.updateGardenVisual(e.id); });
  }

  init() {
    // evin yatakları uyuma noktası
    const W = this.s.world;
    const home = W.home;
    for (const r of home.tpl.rooms) if (r.type === 'bedroom') {
      const p = home.frame.pt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      if (!W.interactables.find((i) => i.type === 'bed' && Math.abs(i.x - p.x) < 0.1)) W.interactable('bed', p.x, home.floorY + 0.5, p.z, { name: 'Yatak' });
    }
  }

  get rng() { return this._rng || (this._rng = new RNG(this.s.seed + ':b')); }

  // ======================================================================= yapı ekle/kaldır
  addStructure(e) {
    if (this.structures.has(e.id)) return;
    const def = BUILDABLES[e.type];
    const st = { id: e.id, type: e.type, x: e.x, y: e.y, z: e.z, rot: e.rot || 0, built: e.built ?? 1, hp: e.hp ?? def.hp, data: e.data || {} };
    if (def.storage && !st.data.slots) st.data.slots = new Array(def.storage).fill(null);
    if (def.garden) this.gardens.set(st.id, st.data.garden || { crop: null });
    if (def.rain) st.data.water = st.data.water || 0;
    this.structures.set(st.id, st);
    this.buildVisual(st);
    if (def.fire && st.built >= 1) this.setFire({ id: st.id, x: st.x, y: st.y, z: st.z, fuel: st.data.fuel ?? 360 });
    this.s.audio.play('placement-a', { at: st, vol: 0.7 });
    this.refreshPower();
  }

  setStructure(e) {
    const st = this.structures.get(e.id);
    if (!st) return;
    const wasBuilt = st.built;
    if (e.built !== undefined) st.built = e.built;
    if (e.hp !== undefined) st.hp = e.hp;
    if (e.data) st.data = e.data;
    if (e.built !== undefined && (wasBuilt < 1) !== (st.built < 1)) {
      this.buildVisual(st);
      const def = BUILDABLES[st.type];
      if (def.fire && st.built >= 1) this.setFire({ id: st.id, x: st.x, y: st.y, z: st.z, fuel: 360 });
      this.s.audio.play('placement-b', { at: st, vol: 0.8 });
    }
    if (e.data && BUILDABLES[st.type].door) this.updateStructDoor(st);
    if (e.data && BUILDABLES[st.type].garden) { this.gardens.set(st.id, st.data.garden || { crop: null }); this.updateGardenVisual(st.id); }
    this.refreshPower();
    this.s.ui.refreshStorage && this.s.ui.refreshStorage(st.id);
  }

  removeStructure(id, destroyed = false) {
    const st = this.structures.get(id);
    if (!st) return;
    if (st.mesh) this.group.remove(st.mesh);
    for (const c of st.colliders || []) this.s.world.physics.remove(c);
    if (st.light) { const i = this.s.env.extraLights.indexOf(st.light); if (i >= 0) this.s.env.extraLights.splice(i, 1); }
    this.structures.delete(id);
    if (this.fires.has(id)) this.setFire({ id, fuel: 0 });
    if (destroyed) { this.s.fx.hit(st.x, st.y + 1, st.z, 'wood'); this.s.fx.dust(st.x, st.y, st.z, 10); this.s.audio.play('break', { at: st, vol: 1 }); this.s.ui.toast(`${BUILDABLES[st.type].name} yıkıldı!`, 'danger', 2.5); }
    else this.s.audio.play('removal-a', { at: st, vol: 0.7 });
    this.refreshPower();
  }

  /** Yapının görseli ve çarpışma kutuları */
  buildVisual(st) {
    const S = this.s;
    const def = BUILDABLES[st.type];
    if (st.mesh) this.group.remove(st.mesh);
    for (const c of st.colliders || []) S.world.physics.remove(c);
    st.colliders = [];
    const g = new THREE.Group();
    const mesh = this.makeMesh(st.type, st);
    g.add(mesh);
    if (st.built < 1) g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.45; o.material.color && o.material.color.lerp(new THREE.Color('#8fd3ff'), 0.4); } });
    g.position.set(st.x, st.y, st.z);
    g.rotation.y = st.rot * Math.PI / 2;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(g);
    st.mesh = g;
    if (st.built >= 1 && !def.walkThrough) {
      const [w, h, d] = def.size;
      const q = st.rot & 1;
      const hw = (q ? d : w) / 2, hd = (q ? w : d) / 2;
      if (def.door) {
        // kapı açıklığı: iki yan parça + kapı
        const side = (w - 1.2) / 2;
        const ax = q ? 0 : 1, az = q ? 1 : 0;
        for (const s of [-1, 1]) {
          const cx = st.x + ax * s * (w / 2 - side / 2), cz = st.z + az * s * (w / 2 - side / 2);
          st.colliders.push(S.world.physics.addBoxC(cx, cz, q ? hw : side / 2, q ? side / 2 : hd, st.y, st.y + h, { kind: 'structure', owner: st, navType: NAV.STRUCT }));
        }
        st.doorCol = S.world.physics.addBoxC(st.x, st.z, q ? hw : 0.6, q ? 0.6 : hd, st.y, st.y + h, { kind: 'structure', owner: st, navType: NAV.STRUCT });
        st.colliders.push(st.doorCol);
        this.updateStructDoor(st);
      } else if (def.trap) {
        // tuzaklar engel değil
      } else {
        const c = S.world.physics.addBoxC(st.x, st.z, hw, hd, st.y, st.y + h, { kind: 'structure', owner: st, walkable: h < 1.5, navType: def.navBlock ? NAV.STRUCT : undefined, blocksNav: def.navBlock || h > 0.9 });
        if (def.navBlock) c.navType = NAV.STRUCT;
        st.colliders.push(c);
      }
      if (def.tower) {
        S.world.physics.addFloor(st.x - 1.7, st.z - 1.7, st.x + 1.7, st.z + 1.7, st.y + 4.15);
        st.ladder = { x: st.x + 1.5, z: st.z, top: st.y + 4.15, bottom: st.y };
      }
      if (def.light) {
        st.light = { x: st.x, y: st.y + def.size[1] + 0.2, z: st.z, color: def.fire ? 0xff8a3a : 0xfff0d0, intensity: def.fire ? 18 : 40, range: def.light, flicker: !!def.fire, on: false, always: !!def.fire };
        S.env.extraLights.push(st.light);
      }
    }
  }

  updateStructDoor(st) {
    if (!st.doorLeaf || !st.doorCol) return;
    const open = !!st.data.open;
    st.doorLeaf.rotation.y = open ? -1.4 : 0;
    this.s.world.physics.setEnabled(st.doorCol, !open);
  }

  makeMesh(type, st) {
    const S = this.s;
    const g = new Geo();
    const W = '#a87c52', W2 = '#8b6239', M = '#9aa5ad';
    const grp = new THREE.Group();
    const add = () => { for (const m of g.toMeshes()) grp.add(m); };
    const kk = (kit, name, s, y = 0, ry = 0) => { const m = S.game.assets.model(kit, name); m.scale.set(...(Array.isArray(s) ? s : [s, s, s])); m.position.y = y; m.rotation.y = ry; grp.add(m); return m; };
    switch (type) {
      case 'wood_wall':
        for (let i = 0; i < 8; i++) g.box('wood', -1.1 + i * 0.275, 0, -0.1, -1.1 + i * 0.275 + 0.26, 2.5 + (i % 2) * 0.1, 0.1, i % 2 ? W : W2);
        g.box('wood', -1.15, 0.6, 0.1, 1.15, 0.78, 0.17, W2); g.box('wood', -1.15, 1.9, 0.1, 1.15, 2.08, 0.17, W2);
        add(); break;
      case 'metal_wall':
        g.box('metal', -1.1, 0, -0.06, 1.1, 2.6, 0.06, M);
        g.box('metal', -1.15, 0, -0.1, -1.05, 2.65, 0.1, '#6d7478'); g.box('metal', 1.05, 0, -0.1, 1.15, 2.65, 0.1, '#6d7478');
        g.box('metal', -1.1, 1.25, 0.06, 1.1, 1.4, 0.1, '#6d7478');
        add(); break;
      case 'wood_fence':
        for (const x of [-1.05, 0, 1.05]) g.box('wood', x - 0.07, 0, -0.07, x + 0.07, 1.25, 0.07, W2);
        for (const y of [0.35, 0.75, 1.1]) g.box('wood', -1.1, y, -0.04, 1.1, y + 0.12, 0.04, W);
        add(); break;
      case 'wood_door': {
        for (const s of [-1, 1]) for (let i = 0; i < 2; i++) g.box('wood', s * 1.1 - (s > 0 ? 0.5 : 0) + i * 0.25 * (s > 0 ? 1 : 1) - (s < 0 ? 0 : 0), 0, -0.1, s * 1.1 - (s > 0 ? 0.5 : 0) + i * 0.25 + 0.24, 2.6, 0.1, W);
        g.box('wood', -1.1, 2.2, -0.1, 1.1, 2.6, 0.1, W2);
        add();
        const leaf = new THREE.Group();
        const lm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.15, 0.07), new THREE.MeshStandardMaterial({ color: 0x7a4f2a, roughness: 0.8 }));
        lm.position.set(0.575, 1.075, 0);
        leaf.add(lm);
        leaf.position.set(-0.6, 0, 0);
        grp.add(leaf);
        if (st) st.doorLeaf = leaf;
        break;
      }
      case 'barricade_wood':
        for (let i = 0; i < 5; i++) { P.rbox(g, 'wood', -0.8 + i * 0.4, 0, 0, 0.5 * (i % 2 ? 1 : -1), -0.08, 0, -0.06, 0.08, 1.5, 0.06, i % 2 ? W : W2); }
        g.box('wood', -1.0, 0.45, -0.25, 1.0, 0.6, 0.25, W2); g.box('wood', -1.0, 0.9, -0.2, 1.0, 1.05, 0.2, W);
        add(); break;
      case 'barricade_metal':
        g.box('metal', -1.0, 0.1, -0.05, 1.0, 1.4, 0.05, '#8d989f');
        for (const x of [-0.8, 0.8]) P.rbox(g, 'metal', x, 0, 0, 0, -0.05, 0, -0.5, 0.05, 1.2, 0.05, '#6d7478');
        g.box('metal', -1.0, 0, -0.5, 1.0, 0.1, 0.5, '#5d6468');
        add(); break;
      case 'barbed_wire':
        for (const x of [-1.1, 0, 1.1]) g.box('wood', x - 0.05, 0, -0.05, x + 0.05, 0.85, 0.05, W2);
        for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.015, 4, 18), new THREE.MeshStandardMaterial({ color: 0x9aa5ad, metalness: 0.6 })); t.position.set(-0.85 + i * 0.57, 0.4, 0); t.rotation.y = Math.PI / 2; grp.add(t); }
        add(); break;
      case 'spike_trap':
        g.box('wood', -0.7, 0, -0.7, 0.7, 0.06, 0.7, W2);
        add();
        for (let i = 0; i < 16; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.6 })); c.position.set(-0.55 + (i % 4) * 0.37, 0.15, -0.55 + Math.floor(i / 4) * 0.37); grp.add(c); }
        break;
      case 'alarm':
        g.box('wood', -0.05, 0, -0.05, 0.05, 1.2, 0.05, W2); g.box('metal', -0.15, 1.2, -0.12, 0.15, 1.5, 0.12, '#2c3e50');
        g.box('emissive', -0.06, 1.5, -0.06, 0.06, 1.6, 0.06, '#e74c3c');
        add(); break;
      case 'camera':
        g.cylinder('metal', 0, 0, 0, 0.06, 2.2, '#7f8c8d', 8); g.box('metal', -0.12, 2.1, -0.1, 0.12, 2.3, 0.3, '#ecf0f1'); g.box('plain', -0.06, 2.15, 0.3, 0.06, 2.25, 0.33, '#111');
        add(); break;
      case 'floodlight':
        g.cylinder('metal', 0, 0, 0, 0.07, 2.6, '#7f8c8d', 8); g.box('metal', -0.35, 2.55, -0.15, 0.35, 2.85, 0.2, '#2c3e50'); g.box('emissive', -0.3, 2.6, 0.2, 0.3, 2.8, 0.22, '#fffbe6');
        add(); break;
      case 'watchtower': P.watchTower(g, 0, 0, 0, 4); add(); break;
      case 'workbench': case 'workbench2': case 'workbench3': {
        const big = type === 'workbench' ? 0 : type === 'workbench2' ? 1 : 2;
        const w2 = 0.9 + big * 0.2;
        g.box('wood', -w2, 0.85, -0.45, w2, 0.95, 0.45, '#9c6b43');
        for (const [a, b] of [[-w2 + 0.05, -0.4], [w2 - 0.15, -0.4], [-w2 + 0.05, 0.3], [w2 - 0.15, 0.3]]) g.box('metal', a, 0, b, a + 0.1, 0.85, b + 0.1, '#555b60');
        g.box('wood', -w2, 0.95, -0.47, w2, 1.9 + big * 0.2, -0.42, '#c9a77c');
        g.box('metal', 0.4, 0.95, -0.2, 0.75, 1.1, 0.1, '#2f4f6f');
        if (big >= 1) { g.box('metal', -w2 + 0.1, 0.95, -0.3, -w2 + 0.6, 1.4, 0.2, '#c0392b'); g.box('emissive', -w2 + 0.2, 1.2, 0.2, -w2 + 0.5, 1.3, 0.21, '#3498db'); }
        if (big >= 2) { g.cylinder('metal', 0, 0.95, 0.15, 0.15, 0.5, '#7f8c8d', 10); }
        add(); break;
      }
      case 'campfire': P.campfirePit(g, 0, 0, 0); add(); break;
      case 'water_filter':
        g.cylinder('plain', 0, 0, 0, 0.32, 1.0, '#3498db', 12); g.cylinder('plain', 0, 1.0, 0, 0.22, 0.4, '#ecf0f1', 12); g.box('metal', 0.3, 0.2, -0.04, 0.55, 0.28, 0.04, '#7f8c8d');
        add(); break;
      case 'rain_collector':
        g.cylinder('plain', 0, 0, 0, 0.5, 1.1, '#2e86c1', 12); g.cylinder('plain', 0, 1.1, 0, 0.7, 0.12, '#1b4f72', 12);
        for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) g.box('wood', x - 0.04, 0, z - 0.04, x + 0.04, 1.6, z + 0.04, W2);
        g.quad('plain', [-0.65, 1.6, 0.65], [0.65, 1.6, 0.65], [0.65, 1.6, -0.65], [-0.65, 1.6, -0.65], '#5dade2');
        add(); break;
      case 'storage_crate':
        g.box('wood', -0.6, 0, -0.4, 0.6, 0.8, 0.4, W); g.box('wood', -0.62, 0.72, -0.42, 0.62, 0.82, 0.42, W2);
        g.box('metal', -0.62, 0.3, -0.42, 0.62, 0.36, 0.42, '#5d6468');
        add(); break;
      case 'shelf': P.rbox(g, 'metal', 0, 0, 0, 0, -1, 0, -0.3, 1, 2.0, 0.3, '#7f8c8d'); for (let i = 0; i < 4; i++) { g.box('wood', -0.95, 0.2 + i * 0.5, -0.28, 0.95, 0.26 + i * 0.5, 0.28, W); g.box('plain', -0.8 + i * 0.3, 0.26 + i * 0.5, -0.2, -0.5 + i * 0.3, 0.6 + i * 0.5, 0.15, ['#c0392b', '#2980b9', '#f1c40f', '#27ae60'][i]); } add(); break;
      case 'lamp': g.cylinder('metal', 0, 0, 0, 0.04, 1.7, '#2c3e50', 8); g.cylinder('plain', 0, 1.6, 0, 0.25, 0.25, '#f5cba7', 10); add(); break;
      case 'solar_panel':
        for (const x of [-0.8, 0.8]) g.box('metal', x - 0.05, 0, -0.05, x + 0.05, 1.0, 0.05, '#7f8c8d');
        P.rbox(g, 'shiny', 0, 1.0, 0, 0, -1.0, 0, -0.7, 1.0, 0.06, 0.7, '#1f3a5f');
        add(); break;
      case 'antenna': P.antennaTower(g, 0, 0, 0, 6); add(); break;
      case 'garden_plot':
        g.box('wood', -1.2, -0.05, -2.1, 1.2, 0.3, 2.1, '#8d6e63'); g.box('plain', -1.05, 0, -1.95, 1.05, 0.33, 1.95, '#5d4037');
        add(); break;
      case 'bed': kk('furniture', 'bed_single_B', 0.7); break;
      case 'couch': kk('furniture', 'couch_pillows', 0.7); break;
      case 'table': kk('furniture', 'table_medium', 0.7); break;
      case 'rug': kk('furniture', 'rug_rectangle_stripes_A', 0.7); break;
      case 'plant': kk('furniture', 'cactus_medium_A', 0.8); break;
      case 'guitar': g.box('wood', -0.25, 0, -0.15, 0.25, 0.05, 0.15, W2); add(); { const gm = S.game.itemModels.make('bow'); void gm; const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb5651d })); body.scale.set(1, 1.2, 0.4); body.position.y = 0.4; grp.add(body); const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.04), new THREE.MeshStandardMaterial({ color: 0x3e2723 })); neck.position.y = 0.95; grp.add(neck); } break;
      default: g.box('wood', -0.5, 0, -0.5, 0.5, 1, 0.5, W); add();
    }
    return grp;
  }

  // ======================================================================= yerleştirme modu
  toggleMenu() {
    const S = this.s;
    if (this.placing) { this.cancelPlacing(); return; }
    if (!S.isInBase(S.local.pos) && S.local.pos.distanceTo(S.world.home.frame ? new THREE.Vector3(S.world.home.spec.x, S.local.pos.y, S.world.home.spec.z) : S.local.pos) > 120) S.ui.toast('Çoğu yapı yalnızca üs çevresine kurulabilir (barikat, tuzak ve kamp ateşi her yerde).', 'info', 3);
    S.ui.openBuildMenu();
  }

  startPlacing(type) {
    this.cancelPlacing();
    const def = BUILDABLES[type];
    this.placing = type;
    const ghost = this.makeMesh(type, null);
    ghost.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.45, depthWrite: false }); } });
    this.ghost = ghost;
    this.s.game.scene.add(ghost);
    this.s.ui.toast(`${def.name}: Sol tık yerleştir · R / tekerlek döndür · Sağ tık iptal`, 'info', 4);
    this.s.ui.setBuildHint(def);
  }

  cancelPlacing() {
    if (this.ghost) this.s.game.scene.remove(this.ghost);
    this.ghost = null; this.placing = null;
    this.s.ui.setBuildHint(null);
  }

  /** Yerleştirme geçerliliği */
  validAt(def, x, y, z, rot) {
    const S = this.s;
    const [w, h, d] = def.size;
    const q = rot & 1;
    const hw = (q ? d : w) / 2 - 0.05, hd = (q ? w : d) / 2 - 0.05;
    if (S.world.terrain.isWater(x, z)) return { ok: false, why: 'Suya kurulamaz' };
    const anywhere = ['barricade_wood', 'barricade_metal', 'spike_trap', 'barbed_wire', 'campfire', 'wood_fence', 'wood_wall', 'storage_crate', 'bed', 'rain_collector', 'alarm', 'garden_plot', 'watchtower'].includes(def.id);
    if (!anywhere && !S.isInBase({ x, z })) return { ok: false, why: 'Yalnızca üs alanında' };
    if (def.walkThrough || def.trap) return { ok: true };
    const c = S.world.physics.overlapsBox(x - hw, z - hd, x + hw, z + hd, y + 0.15, y + Math.max(0.5, h - 0.1));
    if (c) return { ok: false, why: 'Engel var' };
    for (const v of S.vehicles.list) if (Math.hypot(v.pos.x - x, v.pos.z - z) < 2.5) return { ok: false, why: 'Araç var' };
    return { ok: true };
  }

  updatePlacing(dt, input) {
    const S = this.s;
    if (!this.placing) return;
    const def = BUILDABLES[this.placing];
    const pl = S.local;
    const cam = S.game.gfx.camera;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const hit = S.world.physics.raycast(cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z, 14, (c) => c.isFloor || c.kind === 'wall' || c.kind === 'prop' || c.kind === 'structure');
    let px, pz;
    if (hit) { px = hit.point.x; pz = hit.point.z; } else { px = pl.pos.x + Math.sin(pl.yaw) * 3; pz = pl.pos.z + Math.cos(pl.yaw) * 3; }
    const d0 = Math.hypot(px - pl.pos.x, pz - pl.pos.z);
    if (d0 > 7) { px = pl.pos.x + (px - pl.pos.x) / d0 * 7; pz = pl.pos.z + (pz - pl.pos.z) / d0 * 7; }
    const sn = def.snap || 0.5;
    px = Math.round(px / sn) * sn; pz = Math.round(pz / sn) * sn;
    if (input.keyPressed('KeyR') || input.mouse.wheel) { this.rot = (this.rot + (input.mouse.wheel < 0 ? 3 : 1)) % 4; S.audio.play('rotate', { vol: 0.5 }); }
    const py = S.world.physics.groundHeight(px, pz, pl.pos.y + 1.5, 1.6);
    this.ghost.position.set(px, py, pz);
    this.ghost.rotation.y = this.rot * Math.PI / 2;
    const v = this.validAt(def, px, py, pz, this.rot);
    const afford = this.canAfford(def);
    const ok = v.ok && afford.ok;
    this.ghost.traverse((o) => { if (o.isMesh) o.material.color.set(ok ? 0x5dff8a : 0xff5d5d); });
    S.ui.setBuildHint(def, ok ? null : (v.why || afford.why));
    if (input.mouse.rightPressed || input.wasPressed('pause')) { this.cancelPlacing(); return; }
    if (input.mouse.leftPressed && ok) {
      this.pay(def);
      S.act('build_place', { type: this.placing, x: px, y: py, z: pz, rot: this.rot });
      this.pendingAuto = { x: px, z: pz, type: this.placing, t: 0 };
      if (!input.keyDown('ShiftLeft')) this.cancelPlacing();
    }
  }

  canAfford(def) {
    const inv = this.s.inventory;
    for (const [id, n] of def.cost) if (!inv.has(id, Math.max(1, Math.ceil(n * this.costMul())))) return { ok: false, why: `Eksik: ${ITEMS[id].name} (${inv.count(id)}/${Math.ceil(n * this.costMul())})` };
    for (const t of def.tools || []) if (!this.hasTool(t)) return { ok: false, why: `Alet gerekli: ${toolName(t)}` };
    return { ok: true };
  }
  costMul() { return this.s.localProfile.charId === 'bora' ? 0.75 : 1; }
  hasTool(t) { const inv = this.s.inventory; return inv.items().some((s) => ITEMS[s.id].tool && ITEMS[s.id].tool.includes(t)); }
  pay(def) { for (const [id, n] of def.cost) this.s.inventory.remove(id, Math.max(1, Math.ceil(n * this.costMul()))); }

  // ======================================================================= yapı kullanımı (etkileşim)
  describe(st) {
    const def = BUILDABLES[st.type];
    if (st.built < 1) return { label: `İnşa Et: ${def.name} (%${Math.round(st.built * 100)})`, holdTime: 1 };
    if (def.station === 'workbench') return { label: `Çalışma Tezgâhı (Sv.${def.level}) — Üretim` };
    if (def.storage) return { label: `${def.name} — Aç` };
    if (def.bed) return { label: 'Uyu' };
    if (def.fire) return { label: this.fires.has(st.id) ? 'Kamp Ateşi — Pişir / Tahta Ekle' : 'Ateşi Yak (1 tahta)' };
    if (def.rain) return { label: `Yağmur Deposu (${Math.floor(st.data.water || 0)}/${def.rain}) — Şişe Doldur` };
    if (def.station === 'water_filter') return { label: 'Su Filtresi — Suyu Filtrele' };
    if (def.door) return { label: st.data.open ? 'Kapıyı Kapat' : 'Kapıyı Aç' };
    if (def.garden) return this.gardenInfo({ id: st.id });
    if (def.tower) return { label: 'Kuleye Tırman' };
    if (def.music) return { label: 'Gitar Çal (moral)' };
    if (st.hp < def.hp * 0.95) return { label: `${def.name} — Onar (1 tahta)`, holdTime: 2 };
    if (def.antenna) return { label: 'Telsiz Anteni — Frekans 147.30 dinle' };
    return { label: `${def.name} (Söküp kaldırmak için E)`, holdTime: 1.5 };
  }

  use(st, t) {
    const S = this.s;
    const def = BUILDABLES[st.type];
    if (st.built < 1) {
      const mul = (S.localProfile.stats.build || 1) * (S.equipment.hands === 'work_gloves' ? 1.1 : 1);
      const tm = S.interact.timed(def.time * (1 - st.built), mul);
      S.interact.startHold(`${def.name} inşa ediliyor…`, tm.real, () => { S.act('build_work', { id: st.id, amount: 1 }); if (tm.extra) S.time.advance(tm.extra); }, 'hammer');
      return;
    }
    if (def.station === 'workbench') { S.ui.openJournal('crafting'); return; }
    if (def.storage) { S.ui.openStorage({ kind: 'struct', id: st.id, label: def.name }); return; }
    if (def.bed) { S.trySleep({ x: st.x, y: st.y + 0.5, z: st.z, rot: st.rot * Math.PI / 2 }); return; }
    if (def.fire) { this.useFirePit({ id: st.id, x: st.x, y: st.y, z: st.z }); return; }
    if (def.rain) {
      const n = Math.min(S.inventory.count('empty_bottle'), Math.floor(st.data.water || 0));
      if (!n) { S.ui.toast(st.data.water >= 1 ? 'Boş şişen yok.' : 'Depo boş. Yağmur bekle.', 'info'); return; }
      S.inventory.remove('empty_bottle', n); S.giveLocal('water_bottle', n);
      S.act('struct_data', { id: st.id, data: { water: (st.data.water || 0) - n } });
      return;
    }
    if (def.station === 'water_filter') { S.ui.openJournal('crafting'); return; }
    if (def.door) { S.act('door_struct', { id: st.id }); S.audio.play('door', { at: st, vol: 0.8 }); return; }
    if (def.garden) { this.useGarden({ id: st.id, x: st.x, y: st.y, z: st.z }); return; }
    if (def.tower) { S.local.startLadder({ x: st.ladder.x, z: st.ladder.z, top: st.ladder.top, bottom: st.ladder.bottom, exitX: st.x, exitZ: st.z }); return; }
    if (def.music) { S.local.avatar.play('fish', 4); S.act('team_morale', { amount: 6 }); for (let i = 0; i < 8; i++) setTimeout(() => S.audio.play('success', { vol: 0.3 }), i * 450); return; }
    if (def.antenna) { S.events.useRadio(true); return; }
    if (st.hp < def.hp * 0.95) {
      if (!S.inventory.has('plank')) { S.ui.toast('Onarım için tahta gerekli.', 'warn'); return; }
      S.interact.startHold('Onarılıyor…', 2, () => { S.inventory.remove('plank', 1); S.act('struct_repair', { id: st.id }); }, 'hammer');
      return;
    }
    // sök
    S.interact.startHold(`${def.name} sökülüyor…`, 1.5, () => {
      for (const [id, n] of def.cost) S.giveLocal(id, Math.max(0, Math.floor(n / 2)));
      S.act('struct_remove', { id: st.id });
    }, 'hammer');
    void t;
  }

  // ======================================================================= jeneratör & elektrik
  generatorInfo() {
    const g = this.gen;
    if (!g.fixed) return { label: 'Jeneratörü Onar (motor parçası, 2 elektronik, kablo, İngiliz anahtarı)', holdTime: 2 };
    if (g.fuel <= 0.05) return { label: 'Jeneratör: Yakıt Ekle (bidon)' };
    return { label: `Jeneratör ${g.on ? 'Kapat' : 'Çalıştır'} (Yakıt: ${g.fuel.toFixed(1)} L)` };
  }

  useGenerator(it) {
    const S = this.s;
    const inv = S.inventory;
    const g = this.gen;
    if (!g.fixed) {
      S.quests.onInteract('generator');
      const st = PROJECTS.generator.stages[0];
      const miss = st.cost.filter(([id, n]) => !inv.has(id, n));
      if (miss.length || !this.hasTool('wrench')) {
        S.ui.toast('Gerekenler: ' + st.cost.map(([id, n]) => `${ITEMS[id].name} x${n} (${inv.count(id)})`).join(', ') + ' + İngiliz Anahtarı', 'warn', 6);
        return;
      }
      const tm = S.interact.timed(st.time, S.localProfile.stats.repair || 1);
      S.interact.startHold('Jeneratör onarılıyor…', tm.real, () => {
        for (const [id, n] of st.cost) inv.remove(id, n);
        S.act('gen', { fixed: true, fuel: 2, on: true });
        S.quests.onRepair('generator');
        if (tm.extra) S.time.advance(tm.extra);
        S.ui.toast('Jeneratör çalışıyor! Elektrik geldi.', 'good', 4);
      }, 'hammer');
      return;
    }
    if (g.fuel <= 0.05 || (!g.on && inv.slots.some((s) => s && s.id === 'jerrycan' && s.fuel > 0) && g.fuel < 10)) {
      const i = inv.slots.findIndex((s) => s && s.id === 'jerrycan' && (s.fuel || 0) > 0);
      if (i < 0) { S.ui.toast('Yakıt bidonun boş ya da yok.', 'warn'); return; }
      const s = inv.slots[i];
      const add = Math.min(s.fuel, 20 - g.fuel);
      s.fuel -= add; inv.changed();
      S.act('gen', { fuel: g.fuel + add, on: true });
      S.ui.toast(`Jeneratöre ${add.toFixed(0)} L yakıt eklendi.`, 'good');
      return;
    }
    S.act('gen', { on: !g.on });
    void it;
  }

  powerSupply() {
    let sup = 0;
    if (this.gen.fixed && this.gen.on && this.gen.fuel > 0) sup += 10;
    const day = !this.s.time.isNight;
    for (const st of this.structures.values()) if (st.built >= 1 && BUILDABLES[st.type].powerGen && day) sup += BUILDABLES[st.type].powerGen;
    if (this.s.flags.power_fail) sup = 0;
    return sup;
  }

  refreshPower() {
    const sup = this.powerSupply();
    let used = 0;
    for (const st of this.structures.values()) {
      const def = BUILDABLES[st.type];
      if (st.built < 1) continue;
      if (def.power) { st.powered = used + def.power <= sup; if (st.powered) used += def.power; }
      if (st.light && !def.fire) st.light.on = !!st.powered;
    }
    this.powered = sup > 0;
    this.s.flags.has_security = [...this.structures.values()].some((s) => s.type === 'camera' || s.type === 'alarm');
    // evin iç ışıkları
    const home = this.s.world.home;
    if (!this.homeLights) {
      this.homeLights = home.rooms.filter((r) => r.type !== 'garage').map((r) => ({ x: (r.minX + r.maxX) / 2, y: home.floorY + 2.5, z: (r.minZ + r.maxZ) / 2, color: 0xffd9a0, intensity: 14, range: 9, on: false }));
      for (const l of this.homeLights) this.s.env.extraLights.push(l);
    }
    for (const l of this.homeLights) l.on = this.powered;
  }

  // ======================================================================= ateş
  fireAt(it) { return this.fires.has(it.id); }

  useFirePit(it) {
    const S = this.s;
    const inv = S.inventory;
    if (this.fires.has(it.id)) {
      if (inv.has('plank') && this.fires.get(it.id).fuel < 300) { inv.remove('plank', 1); S.act('fire_set', { id: it.id, x: it.x, y: it.y, z: it.z, fuel: this.fires.get(it.id).fuel + 120 }); S.ui.toast('Ateşe tahta eklendi.', 'good', 1.5); }
      S.ui.openJournal('crafting');
      return;
    }
    if (!inv.has('plank') && !inv.has('log')) { S.ui.toast('Ateş yakmak için tahta ya da kütük gerekli.', 'warn'); return; }
    if (!inv.has('lighter')) { S.ui.toast('Çakmak gerekli.', 'warn'); return; }
    S.interact.startHold('Ateş yakılıyor…', 2, () => {
      if (!inv.remove('log', 1)) inv.remove('plank', 1);
      S.act('fire_set', { id: it.id, x: it.x, y: it.y, z: it.z, fuel: 240 });
    }, 'search');
  }

  setFire(e) {
    const S = this.s;
    const old = this.fires.get(e.id);
    if (e.fuel <= 0) {
      if (old) { if (old.mesh) S.game.scene.remove(old.mesh); const k = S.env.extraLights.indexOf(old.light); if (k >= 0) S.env.extraLights.splice(k, 1); S.audio.stopLoop('fire_' + e.id); this.fires.delete(e.id); }
      return;
    }
    if (old) { old.fuel = e.fuel; return; }
    const y = e.y ?? S.world.terrain.heightAt(e.x, e.z);
    const mesh = makeFire();
    mesh.position.set(e.x, y + 0.05, e.z);
    S.game.scene.add(mesh);
    const light = { x: e.x, y: y + 0.9, z: e.z, color: 0xff8a3a, intensity: 20, range: 13, flicker: true, on: true, always: true };
    S.env.extraLights.push(light);
    this.fires.set(e.id, { x: e.x, y, z: e.z, fuel: e.fuel, mesh, light });
  }

  nearFire(p, r = 4) {
    for (const f of this.fires.values()) if (dist(f.x, f.z, p.x, p.z) < r) return true;
    // ev içinde ve elektrik varsa ılık
    return false;
  }

  /** Yakındaki üretim istasyonları */
  stations(p) {
    const S = this.s;
    const out = { workbench: 0, fire: false, water_filter: false };
    for (const st of this.structures.values()) {
      if (st.built < 1 || dist(st.x, st.z, p.x, p.z) > 3.2) continue;
      const def = BUILDABLES[st.type];
      if (def.station === 'workbench') out.workbench = Math.max(out.workbench, def.level);
      if (def.station === 'water_filter') out.water_filter = true;
    }
    if (this.nearFire(p, 3.2)) out.fire = true;
    for (const c of S.world.containers) {
      if (dist(c.x, c.z, p.x, p.z) > 2.6) continue;
      if (c.type === 'workbench') out.workbench = Math.max(out.workbench, 1);
      if (c.type === 'stove' && (c.building === 'home' ? true : this.powered || true)) out.fire = true;
    }
    return out;
  }

  // ======================================================================= bahçe
  gardenInfo(it) {
    const g = this.gardens.get(it.id) || {};
    if (!g.crop) return { label: 'Bahçe Parseli — Tohum Ek', holdTime: 1.5 };
    const grow = this.growth(g);
    if (grow >= 1) return { label: `Hasat Et: ${ITEMS[g.crop].name}`, holdTime: 1.5 };
    return { label: `${ITEMS[g.crop].name} büyüyor (%${Math.round(grow * 100)})${g.watered ? '' : ' — Sula (su şişesi)'}`, holdTime: g.watered ? 0 : 1 };
  }

  growth(g) {
    if (!g.crop) return 0;
    const mins = this.s.time.total - g.planted;
    const need = 1440 * (g.watered ? 1.5 : 2.5) * (g.fert ? 0.7 : 1);
    return clamp(mins / need, 0, 1);
  }

  useGarden(it) {
    const S = this.s;
    const inv = S.inventory;
    const g = this.gardens.get(it.id) || { crop: null };
    if (!g.crop) {
      if (!inv.has('seeds')) { S.ui.toast('Tohum gerekli (marketler, hırdavatçılar, domates).', 'warn'); return; }
      S.interact.startHold('Ekiliyor…', 1.5, () => {
        inv.remove('seeds', 1);
        const crop = this.rng.pick(['carrot', 'tomato', 'cabbage', 'corn']);
        const fert = inv.remove('fertilizer', 1) > 0;
        S.act('garden', { id: it.id, g: { crop, planted: S.time.total, watered: this.s.env.weather.rain > 0.2, fert } });
        S.ui.toast(`${ITEMS[crop].name} ekildi.`, 'good');
      }, 'search');
      return;
    }
    const grow = this.growth(g);
    if (grow >= 1) {
      S.interact.startHold('Hasat ediliyor…', 1.5, () => {
        const n = 3 + Math.floor(Math.random() * 3);
        S.giveLocal(g.crop, n);
        if (Math.random() < 0.5) S.giveLocal('seeds', 1);
        S.act('garden', { id: it.id, g: { crop: null } });
      }, 'search');
      return;
    }
    if (!g.watered) {
      const i = inv.firstSlotOf('water_bottle') >= 0 ? 'water_bottle' : inv.firstSlotOf('dirty_water') >= 0 ? 'dirty_water' : null;
      if (!i) { S.ui.toast('Sulamak için su gerekli.', 'warn'); return; }
      inv.remove(i, 1); S.giveLocal('empty_bottle', 1);
      S.act('garden', { id: it.id, g: { ...g, watered: true } });
      S.ui.toast('Sulandı.', 'good', 1.5);
    }
  }

  updateGardenVisual(id) {
    const S = this.s;
    let obj = this.gardenVis && this.gardenVis.get(id);
    if (!this.gardenVis) this.gardenVis = new Map();
    if (obj) { S.game.scene.remove(obj); this.gardenVis.delete(id); }
    const g = this.gardens.get(id);
    if (!g || !g.crop) return;
    const it = S.world.interactables.find((i) => i.id === id) || this.structures.get(id);
    if (!it) return;
    const grp = new THREE.Group();
    const grow = this.growth(g);
    const map = { carrot: 'food_ingredient_carrot', tomato: 'food_ingredient_tomato', cabbage: 'food_ingredient_lettuce', corn: 'food_ingredient_onion' };
    for (let i = 0; i < 6; i++) {
      const m = S.game.assets.model('kitchen', map[g.crop]);
      const s = 0.12 + grow * 0.25;
      m.scale.setScalar(s);
      m.position.set(-0.5 + (i % 2) * 1.0, 0.3, -1.4 + Math.floor(i / 2) * 1.4);
      grp.add(m);
    }
    grp.position.set(it.x, (it.y ?? S.world.terrain.heightAt(it.x, it.z)) - 0.05, it.z);
    S.game.scene.add(grp);
    this.gardenVis.set(id, grp);
  }

  // ======================================================================= sığınak
  bunkerInfo() {
    const b = this.bunker;
    if (b.stage >= 4) return { label: 'Yeraltı Sığınağına İn' };
    const st = PROJECTS.bunker.stages[b.stage];
    return { label: `Sığınak ${b.stage + 1}/4: ${st.name}`, holdTime: 1 };
  }

  useBunker(it) {
    const S = this.s;
    const inv = S.inventory;
    const b = this.bunker;
    if (b.stage >= 4) { this.enterBunker(); return; }
    const st = PROJECTS.bunker.stages[b.stage];
    const miss = st.cost.filter(([id, n]) => !inv.has(id, n));
    const toolMiss = st.tools.filter((t) => !this.hasTool(t));
    if (miss.length || toolMiss.length) {
      S.ui.toast(`${st.name} için: ` + st.cost.map(([id, n]) => `${ITEMS[id].name} ${inv.count(id)}/${n}`).join(', ') + (toolMiss.length ? ' · Alet: ' + toolMiss.map(toolName).join(', ') : ''), 'warn', 7);
      return;
    }
    const tm = S.interact.timed(st.time, S.localProfile.stats.build || 1);
    S.interact.startHold(`${st.name}…`, tm.real + 2, () => {
      for (const [id, n] of st.cost) inv.remove(id, n);
      S.act('bunker', { stage: b.stage + 1, progress: 0 });
      if (tm.extra) S.time.advance(tm.extra);
      S.ui.toast(`Sığınak aşaması tamamlandı: ${st.name} (${b.stage + 1}/4)`, 'good', 4);
    }, 'hammer');
    void it;
  }

  updateBunkerRoom() {
    const S = this.s;
    const b = this.bunker;
    const bp = S.world.bunkerPos;
    if (!bp || b.stage < 1) return;
    if (this.bunkerRoom) { S.game.scene.remove(this.bunkerRoom); }
    const y = S.world.terrain.heightAt(bp.x, bp.z) - 7;
    const g = new Geo();
    const wallC = b.stage >= 2 ? '#a9a59c' : '#6d4c41';
    const mat = b.stage >= 2 ? 'concrete' : 'plain';
    g.box(mat, -4, -0.3, -3, 4, 0, 3, b.stage >= 2 ? '#8d8a84' : '#5d4037');
    g.box(mat, -4.2, 0, -3.2, 4.2, 3, -3, wallC); g.box(mat, -4.2, 0, 3, 4.2, 3, 3.2, wallC);
    g.box(mat, -4.2, 0, -3, -4, 3, 3, wallC); g.box(mat, 4, 0, -3, 4.2, 3, 3, wallC);
    g.box(mat, -4.2, 3, -3.2, 4.2, 3.2, 3.2, wallC);
    if (b.stage >= 1) for (const x of [-2, 0, 2]) g.box('wood', x - 0.1, 0, -2.9, x + 0.1, 3, -2.7, '#8b6239');
    if (b.stage >= 3) { for (let i = 0; i < 3; i++) g.box('metal', -3.8, 0.3 + i * 0.7, -2.6, -1.8, 0.35 + i * 0.7, -1.8, '#7f8c8d'); g.cylinder('metal', 3, 2.5, -2.5, 0.25, 0.6, '#95a5a6', 10); }
    if (b.stage >= 4) { g.box('emissive', -0.3, 2.9, -0.3, 0.3, 3, 0.3, '#fff3c4'); g.box('metal', 2.4, 0, 1.6, 3.8, 1.0, 2.8, '#c0392b'); }
    g.box('wood', 3.2, 0, -0.4, 3.4, 3, 0.4, '#8b6239');
    const grp = new THREE.Group();
    for (const m of g.toMeshes()) grp.add(m);
    if (b.stage >= 3) for (let i = 0; i < 2; i++) { const bed = S.game.assets.model('furniture', 'bed_single_A'); bed.scale.setScalar(0.7); bed.position.set(-2.8 + i * 1.6, 0, 1.6); bed.rotation.y = Math.PI; grp.add(bed); }
    grp.position.set(bp.x, y, bp.z);
    S.game.scene.add(grp);
    this.bunkerRoom = grp;
    if (!this.bunkerFloor) {
      this.bunkerFloor = S.world.physics.addFloor(bp.x - 4, bp.z - 3, bp.x + 4, bp.z + 3, y);
      this.bunkerCols = [this.bunkerFloor];
      for (const [a, b2, c, d] of [[-4.2, -3.2, 4.2, -3], [-4.2, 3, 4.2, 3.2], [-4.2, -3, -4, 3], [4, -3, 4.2, 3]]) this.bunkerCols.push(S.world.physics.addBox(bp.x + a, bp.z + b2, bp.x + c, bp.z + d, y, y + 3, { kind: 'wall', blocksNav: false }));
      S.world.interactables.push({ id: 'bunker_exit', type: 'ladder', x: bp.x + 3.3, y: y + 1.2, z: bp.z, top: S.world.terrain.heightAt(bp.x, bp.z) + 0.3, bottom: y, name: 'Sığınaktan Çık' });
      S.world.interactables.push({ id: 'bunker_bed', type: 'bed', x: bp.x - 2, y: y + 0.5, z: bp.z + 1.6, name: 'Sığınak Yatağı' });
      this.bunkerY = y;
      this.bunkerLight = { x: bp.x, y: y + 2.6, z: bp.z, color: 0xfff0c8, intensity: 14, range: 10, on: true, always: true };
      S.env.extraLights.push(this.bunkerLight);
    }
    this.bunkerLight.on = b.stage >= 4 || this.powered;
  }

  enterBunker() {
    const S = this.s;
    const bp = S.world.bunkerPos;
    S.local.spawnAt(bp.x, this.bunkerY + 0.1, bp.z, 0);
    S.ui.toast('Sığınaktasın. Merdivenden yukarı çıkabilirsin.', 'info', 3);
  }

  // ======================================================================= tuzaklar
  trapCheck(zb) {
    for (const st of this.structures.values()) {
      if (st.built < 1) continue;
      const def = BUILDABLES[st.type];
      if (!def.trap) continue;
      if (Math.abs(st.x - zb.x) > 1.4 || Math.abs(st.z - zb.z) > 1.4) continue;
      if (def.trap.slow) { zb.slow = def.trap.slow; zb.hp -= def.trap.dps * 0.05; }
      if (def.trap.dmg && !zb._trapped) {
        zb._trapped = st.id; zb.hp -= def.trap.dmg; zb.stagger = 0.6;
        st.data.uses = (st.data.uses ?? def.trap.uses) - 1;
        this.s.fx.hit(zb.x, zb.y + 0.3, zb.z, 'flesh');
        if (st.data.uses <= 0) this.s.applyAction('struct_remove', { id: st.id }, null);
      }
      if (zb.hp <= 0 && !zb.dead) this.s.zombies.kill(zb, null);
    }
    if (zb._trapped && Math.random() < 0.02) zb._trapped = null;
  }

  // ======================================================================= tik (host)
  tick(mins, dt) {
    const S = this.s;
    // jeneratör yakıtı
    if (this.gen.on && this.gen.fixed) {
      this.gen.fuel = Math.max(0, this.gen.fuel - mins / 60);
      this._genNoise = (this._genNoise || 0) - dt;
      if (this._genNoise <= 0) { this._genNoise = 6; S.applyAction('noise', { x: -268, z: 137.5, r: 16, src: 'generator' }, null); }
      if (this.gen.fuel <= 0) { S.emit({ k: 'gen', ...this.gen, on: false }); S.emit({ k: 'toast', text: 'Jeneratörün yakıtı bitti!', kind: 'warn' }); }
    }
    // ateşler
    for (const [id, f] of this.fires) {
      f.fuel -= mins * (S.env.weather.rain > 0.5 ? 2 : 1);
      if (f.fuel <= 0) S.emit({ k: 'fire', id, fuel: 0 });
    }
    // yağmur deposu
    if (S.env.weather.rain > 0.2) for (const st of this.structures.values()) if (BUILDABLES[st.type].rain && st.built >= 1) st.data.water = Math.min(BUILDABLES[st.type].rain, (st.data.water || 0) + mins / 20);
    // alarm sensörleri
    this._sensorT = (this._sensorT || 0) - dt;
    if (this._sensorT <= 0) {
      this._sensorT = 1;
      for (const st of this.structures.values()) {
        const def = BUILDABLES[st.type];
        if (!def.sensor || st.built < 1) continue;
        let near = false;
        for (const z of S.zombies.list.values()) if (!z.dead && dist(z.x, z.z, st.x, st.z) < def.sensor) { near = true; break; }
        if (near && !st._alarm) { st._alarm = true; S.emit({ k: 'toast', text: '🚨 ALARM! Üs çevresinde zombi!', kind: 'danger' }); S.audio.play('alert', { vol: 1 }); S.applyAction('noise', { x: st.x, z: st.z, r: 25, src: 'alarm' }, null); }
        if (!near) st._alarm = false;
      }
      this.refreshPower();
      // bahçe görselleri
      if (this.gardenVis) for (const id of this.gardenVis.keys()) if (Math.random() < 0.05) this.updateGardenVisual(id);
      S.flags.base_def = this.defenseScore();
      S.quests.onFlag('base_def');
    }
  }

  /** Her istemcide çalışır: yerleştirme hayaleti, ateş/jeneratör görsel ve sesleri */
  localUpdate(dt) {
    const S = this.s;
    S.audio.loop('generator', 'generator', { at: { x: -268, y: 7, z: 137.5 }, vol: this.gen.on && this.gen.fixed && this.gen.fuel > 0 ? 0.35 : 0, range: 30 });
    for (const [id, f] of this.fires) {
      f.mesh.children.forEach((c, i) => { c.scale.y = 0.8 + Math.sin(S.t * 9 + i) * 0.25; });
      S.audio.loop('fire_' + id, 'fire', { at: f, vol: 0.3, range: 18, bus: 'ambient' });
    }
    // yerleştirme
    if (this.placing) this.updatePlacing(dt, S.game.input);
    // otomatik inşa başlat (yerleştirme sonrası)
    if (this.pendingAuto) {
      this.pendingAuto.t += dt;
      const pa = this.pendingAuto;
      for (const st of this.structures.values()) if (st.built < 1 && Math.abs(st.x - pa.x) < 0.01 && Math.abs(st.z - pa.z) < 0.01) { this.pendingAuto = null; this.use(st); break; }
      if (this.pendingAuto && this.pendingAuto.t > 3) this.pendingAuto = null;
    }
  }

  defenseScore() {
    let s = 0;
    for (const st of this.structures.values()) if (st.built >= 1) s += BUILDABLES[st.type].score.def || 0;
    for (const w of this.s.world.home.windows) s += w.barricade * 2;
    for (const d of this.s.world.home.doors) s += d.barricade * 2;
    return s;
  }
  comfortScore() { let s = 5; for (const st of this.structures.values()) if (st.built >= 1) s += BUILDABLES[st.type].score.comfort || 0; if (this.powered) s += 4; if (this.s.flags.dog_found) s += 5; return s; }
  comfort01() { return clamp(this.comfortScore() / 30, 0, 1); }
  utilScore() { let s = 0; for (const st of this.structures.values()) if (st.built >= 1) s += BUILDABLES[st.type].score.util || 0; if (this.gen.fixed) s += 6; s += this.bunker.stage * 5; return s; }
  /** Üs seviyesi 1-10 */
  baseLevel() { return clamp(1 + Math.floor((this.defenseScore() + this.comfortScore() + this.utilScore()) / 18), 1, 10); }

  respawnPoint() {
    const S = this.s;
    if (S.sleepBed) return S.sleepBed;
    return S.world.spawn;
  }

  /** Ortak depolar (üs içinde) */
  storages() { return [...this.structures.values()].filter((s) => BUILDABLES[s.type].storage && s.built >= 1); }

  serialize() {
    return {
      structs: [...this.structures.values()].map((s) => ({ id: s.id, type: s.type, x: s.x, y: s.y, z: s.z, rot: s.rot, built: s.built, hp: Math.round(s.hp), data: s.data })),
      gen: this.gen, bunker: this.bunker, fires: [...this.fires].map(([id, f]) => ({ id, x: f.x, y: f.y, z: f.z, fuel: f.fuel })), gardens: [...this.gardens],
    };
  }
  load(o) {
    if (!o) return;
    for (const id of [...this.structures.keys()]) this.removeStructure(id);
    for (const s of o.structs || []) this.addStructure(s);
    this.gen = o.gen || this.gen;
    this.bunker = o.bunker || this.bunker;
    this.s.flags.generator_fixed = this.gen.fixed;
    this.s.flags.bunker_stage = this.bunker.stage;
    for (const f of o.fires || []) this.setFire(f);
    for (const [id, g] of o.gardens || []) { this.gardens.set(id, g); this.updateGardenVisual(id); }
    this.updateBunkerRoom();
    this.refreshPower();
  }
  dispose() {
    this.cancelPlacing();
    for (const id of [...this.fires.keys()]) this.setFire({ id, fuel: 0 });
    for (const id of [...this.structures.keys()]) this.removeStructure(id);
    if (this.bunkerRoom) this.s.game.scene.remove(this.bunkerRoom);
    for (const c of this.bunkerCols || []) this.s.world.physics.remove(c);
    const W = this.s.world;
    W.interactables = W.interactables.filter((i) => i.id !== 'bunker_exit' && i.id !== 'bunker_bed');
    if (this.homeLights) for (const l of this.homeLights) { const k = this.s.env.extraLights.indexOf(l); if (k >= 0) this.s.env.extraLights.splice(k, 1); }
    if (this.gardenVis) for (const o of this.gardenVis.values()) this.s.game.scene.remove(o);
    this.s.game.scene.remove(this.group);
    this.s.audio.stopLoop('generator');
  }
}

export function toolName(t) { return { hammer: 'Çekiç', axe: 'Balta', screwdriver: 'Tornavida', wrench: 'İngiliz Anahtarı', crowbar: 'Levye', shovel: 'Kürek' }[t] || t; }
