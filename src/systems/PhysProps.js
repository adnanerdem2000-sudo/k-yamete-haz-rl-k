// Fiziksel dünya nesneleri: yol kenarlarında itilebilir/devrilebilir variller, kasalar, çöp kutuları;
// vurulunca patlayan kırmızı variller; kırılan kapı/pencere/yapılardan saçılan tahta enkazı;
// araç ya da patlamayla savrulan cesetler. Her istemci kendi kopyasını simüle eder (görsel fizik); yalnız elde
// taşıma eşitlenir: kimin taşıdığını host belirler, bırakılan yer ve hız herkese aynı gider.
import * as THREE from 'three';
import { G } from '../physics/PhysicsWorld.js';
import { roadCenterline } from '../world/Roads.js';
import { ROADS } from '../world/WorldLayout.js';
import { RNG, dist } from '../core/util.js';

const KINDS = {
  barrel: { kit: 'props', name: 'Barrel_A', h: 1.05, shape: 'cyl', mass: 28 },
  barrel2: { kit: 'props', name: 'Barrel_B', h: 1.05, shape: 'cyl', mass: 28 },
  redbarrel: { kit: 'props', name: 'Barrel_C', h: 1.05, shape: 'cyl', mass: 30, explosive: true, tint: '#c0392b' },
  box: { kit: 'props', name: 'Box_A', h: 0.75, shape: 'box', mass: 12 },
  box2: { kit: 'props', name: 'box_large', h: 0.9, shape: 'box', mass: 18 },
  crate: { kit: 'props', name: 'Box_B', h: 0.6, shape: 'box', mass: 9 },
  trash: { kit: 'props', name: 'trash_A', h: 1.1, shape: 'cyl', mass: 14 },
  pallet: { kit: 'props', name: 'Pallet_Small', h: 0.18, shape: 'box', mass: 10 },
  keg: { kit: 'props', name: 'keg', h: 0.8, shape: 'cyl', mass: 20 },
};
const REGION_SET = { mahalle: ['trash', 'box', 'barrel2'], sehir: ['trash', 'box', 'crate', 'barrel', 'redbarrel'], sanayi: ['barrel', 'redbarrel', 'box2', 'pallet', 'crate'], benzin: ['redbarrel', 'barrel', 'box'], liman: ['barrel', 'box2', 'crate', 'pallet', 'keg'], askeri: ['box2', 'crate', 'redbarrel'], hastane: ['trash', 'box'] };

const _box = new THREE.Box3(), _size = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _tv = new THREE.Vector3(), _tq = new THREE.Quaternion();

/** Gövde pozu → ağ için yuvarlanmış [x,y,z,qx,qy,qz,qw] */
export function packPose(t, r) { return [t.x, t.y, t.z, r.x, r.y, r.z, r.w].map((x) => Math.round(x * 1000) / 1000); }

/** Taşınan nesnenin hedef pozu: taşıyanın önünde göğüs hizası (yerel oyuncu ve uzak taşıyıcılar aynı formülü kullanır) */
export function carryTarget(def, pos, yaw, outV, outQ) {
  const h = (def.h || 0.7) * 0.5, f = 0.55 + h * 0.4;
  outV.set(pos.x + Math.sin(yaw) * f, pos.y + 1.0 + Math.max(0, 0.35 - h), pos.z + Math.cos(yaw) * f);
  outQ.setFromAxisAngle(_up, yaw);
}
const PLANK_GEO = new THREE.BoxGeometry(0.16, 0.05, 0.85);
const PLANK_MAT = new THREE.MeshStandardMaterial({ color: 0x8d6e4a, roughness: 0.9 });
const SHARD_GEO = new THREE.BoxGeometry(0.22, 0.02, 0.18);
const SHARD_MAT = new THREE.MeshStandardMaterial({ color: 0xbfe3f3, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.6 });

export class PhysProps {
  constructor(session) {
    this.s = session;
    this.pw = session.game.phys;
    this.props = [];
    this.byId = new Map();
    this.debris = [];
    this.pool = { wood: [], glass: [], metal: [] }; // enkaz ağ havuzu (nesne yeniden kullanımı; gövde yeniden kurulur)
    this.group = new THREE.Group();
    this.group.name = 'physprops';
    session.game.scene.add(this.group);
    const S = session;
    S.on('prop_explode', (p) => S.emit({ k: 'prop_explode', id: p.id, x: p.x, y: p.y, z: p.z }));
    S.onEvt('prop_explode', (e) => this.onExplode(e));
    // elde taşıma: aynı nesneyi iki kişi alamaz (host karar verir); kaybeden istemciye gerçek taşıyıcı bildirilir
    S.on('prop_carry', (p, from) => {
      const prop = this.byId.get(p.id);
      if (!prop || !prop.alive) return;
      if (p.on) {
        if (!prop.carrier || prop.carrier === from) S.emit({ k: 'prop_carry', id: p.id, by: from, on: 1 });
        else S.emit({ k: 'prop_carry', id: p.id, by: prop.carrier, on: 1, to: from });
      } else if (prop.carrier === from) S.emit({ k: 'prop_carry', id: p.id, by: from, on: 0, p: p.p, v: p.v });
    });
    S.onEvt('prop_carry', (e) => this.onCarry(e));
    // bırakılan nesne durunca bırakanın gördüğü son konum herkese gider (istemcilerin fiziği az farklı sonuçlanır)
    S.on('prop_rest', (p, from) => { const prop = this.byId.get(p.id); if (prop && prop.alive && !prop.carrier) S.emit({ k: 'prop_rest', id: p.id, p: p.p, from }); });
    S.onEvt('prop_rest', (e) => {
      const prop = this.byId.get(e.id);
      if (e.from !== S.localId && prop && prop.alive && !prop.carrier && !prop.d.carried) this.pw.placeAtRest(prop.d, e.p);
    });
    if (this.pw) this.spawnWorldProps();
  }

  /** Yol kenarlarına deterministik nesne kümeleri */
  spawnWorldProps() {
    const S = this.s;
    const rng = new RNG('physprops');
    const phys = S.world.physics;
    let n = 0;
    for (const road of ROADS) {
      if (road.type !== 'asphalt') continue;
      const pts = roadCenterline(road, 6);
      for (let i = 2; i < pts.length - 2; i += 3) {
        const p = pts[i];
        const reg = S.world.regionAt(p.x, p.z);
        const set = reg && REGION_SET[reg.id];
        if (!set || !rng.chance(reg.id === 'mahalle' ? 0.12 : 0.28)) continue;
        const q = pts[i + 1];
        const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
        const side = rng.chance(0.5) ? 1 : -1;
        const off = road.w / 2 + 1.3 + rng.next() * 1.4;
        const cx = p.x + (-dz / l) * off * side, cz = p.z + (dx / l) * off * side;
        const count = rng.int(1, 3);
        for (let k = 0; k < count; k++) {
          const x = cx + (rng.next() - 0.5) * 1.6, z = cz + (rng.next() - 0.5) * 1.6;
          if (phys.overlapsBox(x - 0.45, z - 0.45, x + 0.45, z + 0.45, S.world.terrain.heightAt(x, z) + 0.1, S.world.terrain.heightAt(x, z) + 1.5)) continue;
          if (S.world.buildingAt(x, z)) continue;
          this.addProp(rng.pick(set), x, z, rng.next() * 6.28, 'p' + (n++));
        }
      }
    }
    // üs çevresinde birkaç varil ve kasa
    for (const [kind, x, z] of [['barrel', -268.5, 131], ['barrel2', -267.2, 131.4], ['box', -298, 116], ['crate', -298.8, 117.2], ['pallet', -296, 125]]) this.addProp(kind, x, z, rng.next() * 6.28, 'p' + (n++));
  }

  makeModel(def) {
    const S = this.s;
    const m = S.game.assets.model(def.kit, def.name);
    _box.setFromObject(m); _box.getSize(_size);
    const k = def.h / Math.max(0.05, _size.y);
    m.scale.setScalar(k);
    _box.setFromObject(m); _box.getCenter(_c); _box.getSize(_size);
    m.position.sub(_c);
    if (def.tint) m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(def.tint); } });
    const g = new THREE.Group();
    g.add(m);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { g, size: _size.clone() };
  }

  addProp(kind, x, z, yaw, id) {
    const def = KINDS[kind];
    if (!def || !this.pw) return null;
    const S = this.s;
    let mm;
    try { mm = this.makeModel(def); } catch { return null; }
    const { g, size } = mm;
    this.group.add(g);
    const y = S.world.physics.groundHeight(x, z, 200) + size.y / 2 + 0.02;
    const shape = def.shape === 'cyl' ? { type: 'cyl', hh: size.y / 2, r: Math.max(size.x, size.z) / 2 * 0.95 } : { type: 'box', hx: size.x / 2, hy: size.y / 2, hz: size.z / 2 };
    const vol = def.shape === 'cyl' ? Math.PI * shape.r * shape.r * size.y : size.x * size.y * size.z;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const d = this.pw.addDynamic(g, shape, x, y, z, { quat: { x: q.x, y: q.y, z: q.z, w: q.w }, density: def.mass / Math.max(0.01, vol), friction: 0.7, bounce: 0.1, group: G.PROP, linDamp: 0.2, angDamp: 0.5 });
    d.body.sleep();
    if (S.contacts) S.contacts.register(d, def.shape === 'cyl' ? (kind === 'trash' ? 'plastic' : 'metal') : 'wood');
    const prop = { id, kind, def, d, alive: true, carrier: null, x0: x, y0: y, z0: z };
    d.prop = prop;
    this.props.push(prop);
    this.byId.set(id, prop);
    return prop;
  }

  /** Elde taşınabilecek hafif nesne (≤ 20 kg, patlayıcı değil): oyuncunun önünde 1.7 m içinde en yakını */
  nearestCarryable(x, y, z, yaw) {
    let best = null, bd = 1.7;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const p of this.props) {
      if (!p.alive || p.def.mass > 20 || p.def.explosive || p.d.carried) continue;
      const t = p.d.body.translation();
      const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(t.y - y - 0.5) > 1.2) continue;
      if (d > 0.4 && (dx * fx + dz * fz) / d < 0.3) continue; // önde olsun
      best = p; bd = d;
    }
    if (best) best.dist = bd;
    return best;
  }

  /** Geç katılan istemci için: yerinden oynamış ya da taşınan nesnelerin pozu ve taşıyıcısı */
  serializeDynamic() {
    const out = [];
    for (const p of this.props) {
      if (!p.alive) continue;
      const t = p.d.body.translation(), r = p.d.body.rotation();
      const moved = p.carrier || p.d.carried || Math.abs(t.x - (p.x0 ?? t.x)) > 0.05 || Math.abs(t.z - (p.z0 ?? t.z)) > 0.05 || Math.abs(t.y - (p.y0 ?? t.y)) > 0.05;
      if (moved) out.push({ id: p.id, p: packPose(t, r), by: p.carrier || null });
    }
    return out;
  }

  applyDynamic(list) {
    const S = this.s;
    for (const e of list || []) {
      const prop = this.byId.get(e.id);
      if (!prop || !prop.alive) continue;
      if (e.by && e.by !== S.localId) { prop.carrier = e.by; this.pw.setCarried(prop.d, true); }
      else if (e.p) this.pw.placeAtRest(prop.d, e.p);
    }
  }

  /** Taşıma olayı (her istemcide): yerel oyuncunun kendi alma/bırakması zaten uygulanmıştır (iyimser) */
  onCarry(e) {
    const S = this.s, prop = this.byId.get(e.id);
    if (!prop || !prop.alive) return;
    if (e.on) {
      prop.carrier = e.by;
      if (e.by === S.localId) return;
      if (S.local.carryProp === prop) { S.local.carryProp = null; S.ui.toast('Başkası senden önce aldı.', 'warn', 1.5); }
      this.pw.setCarried(prop.d, true);
      return;
    }
    if (prop.carrier !== e.by) return;
    prop.carrier = null;
    if (e.by === S.localId) return;
    this.pw.setCarried(prop.d, false, e.v ? { x: e.v[0], y: e.v[1], z: e.v[2] } : null, e.p || null);
  }

  /** Bırakılan nesne uyuyunca (durunca) son pozunu yay */
  watchRest(prop) {
    prop.d.onSleep = (d) => {
      if (!prop.alive || prop.carrier || d.carried) return;
      this.s.act('prop_rest', { id: prop.id, p: packPose(d.body.translation(), d.body.rotation()) });
    };
  }

  /**
   * Taşınan nesneyi taşıyanın önüne koy: görsel bu karenin son konumuna doğrudan yerleşir (gecikmesiz), kinematik
   * gövde bir sonraki fizik adımında aynı yere gider (diğer nesneleri iter).
   */
  holdAt(prop, pos, yaw) {
    carryTarget(prop.def, pos, yaw, _tv, _tq);
    this.pw.moveCarried(prop.d, _tv, _tq);
    const o = prop.d.obj;
    if (o) { o.position.copy(_tv); o.quaternion.copy(_tq); }
  }

  /** Uzak oyuncuların taşıdığı nesneler (Session, uzak avatarlar konumlandıktan sonra çağırır) */
  followRemoteCarriers() {
    if (!this.pw) return;
    const S = this.s;
    for (const prop of this.props) {
      if (!prop.carrier || prop.carrier === S.localId || !prop.alive) continue;
      const rec = S.players.get(prop.carrier);
      if (!rec || !rec.pos) { prop.carrier = null; this.pw.setCarried(prop.d, false); continue; } // taşıyan ayrıldı: düşer
      this.holdAt(prop, rec.pos, rec.anim ? rec.anim.yaw || 0 : 0);
    }
  }

  /** Mermi ışını ile fiziksel nesne kesişimi (Combat çağırır). Dönüş {dist, point, prop} */
  rayHit(o, dir, range) {
    if (!this.pw) return null;
    const hit = this.pw.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, range, ((G.STATIC | G.PROP | G.VEHICLE | G.DEBRIS) << 16) | (G.PROP | G.STATIC | G.VEHICLE));
    if (!hit) return null;
    const d = this.pw.dynamicAt(hit.collider);
    if (!d || !d.prop) return null;
    return { dist: hit.dist, point: hit.point, prop: d.prop };
  }

  /** Vuruş: itki ver; patlayıcıysa patlat */
  shoot(prop, point, dir, power = 1) {
    if (!prop.alive) return;
    const b = prop.d.body;
    b.applyImpulseAtPoint({ x: dir.x * 18 * power, y: dir.y * 18 * power + 2, z: dir.z * 18 * power }, point, true);
    if (prop.def.explosive) {
      prop.hits = (prop.hits || 0) + 1;
      if (prop.hits >= 2 || power > 1.5) { const t = b.translation(); this.s.act('prop_explode', { id: prop.id, x: t.x, y: t.y, z: t.z }); }
    }
  }

  onExplode(e) {
    const S = this.s;
    const prop = this.props.find((p) => p.id === e.id);
    if (prop && prop.alive) {
      prop.alive = false;
      this.byId.delete(prop.id);
      this.pw.removeDynamic(prop.d);
      this.group.remove(prop.d.obj);
      this.props.splice(this.props.indexOf(prop), 1);
    }
    this.explosion(e.x, e.y, e.z, 7, prop ? 'barrel' : 'other');
  }

  /** Patlama: görsel + ses + fizik itkisi + (host) hasar ve gürültü */
  explosion(x, y, z, radius = 7, src = 'other') {
    const S = this.s;
    S.fx.fire(x, y, z, 6, 1.4);
    S.fx.smoke(x, y + 1, z, 10, '#3a3a3a');
    S.fx.sparks(x, y + 0.5, z);
    S.audio.play('explosion', { at: { x, y, z }, vol: 1 });
    if (this.pw) this.pw.impulse(x, y, z, radius * 1.6, 9);
    this.burst(x, y + 0.5, z, 'metal', 6);
    const p = S.local.pos;
    const dl = dist(p.x, p.z, x, z);
    if (dl < radius) { S.damageLocal((1 - dl / radius) * 55, 'explosion'); S.local.camShake = 1; }
    else if (dl < radius * 3) S.local.camShake = Math.max(S.local.camShake, 0.6 * (1 - dl / (radius * 3)));
    if (S.isHost) {
      for (const zb of S.zombies.list.values()) {
        if (zb.dead) continue;
        const d = dist(zb.x, zb.z, x, z);
        if (d < radius) S.applyAction('zombie_hit', { id: zb.id, dmg: Math.round((1 - d / radius) * 220), dir: [(zb.x - x) / (d || 1), (zb.z - z) / (d || 1)], kind: 'explosion', force: 14 * (1 - d / radius) }, null);
      }
      S.applyAction('noise', { x, z, r: 90, src: 'explosion' }, null);
    }
    void src;
  }

  /** Enkaz: tahta (kapı/pencere/yapı), cam kırıkları, metal parçalar */
  burst(x, y, z, kind = 'wood', n = 5, dir = null) {
    if (!this.pw) return;
    const pk = kind === 'glass' ? 'glass' : kind === 'metal' ? 'metal' : 'wood';
    for (let i = 0; i < n; i++) {
      const glass = kind === 'glass';
      const mesh = this.pool[pk].pop() || new THREE.Mesh(glass ? SHARD_GEO : PLANK_GEO, glass ? SHARD_MAT : kind === 'metal' ? metalMat() : PLANK_MAT);
      mesh.userData.pool = pk;
      mesh.castShadow = !glass;
      this.group.add(mesh);
      const sx = (Math.random() - 0.5), sz = (Math.random() - 0.5);
      const vx = (dir ? dir[0] * 3 : 0) + sx * 4, vz = (dir ? dir[1] * 3 : 0) + sz * 4;
      const d = this.pw.addDynamic(mesh, glass ? { type: 'box', hx: 0.11, hy: 0.01, hz: 0.09 } : { type: 'box', hx: 0.08, hy: 0.025, hz: 0.42 }, x + sx * 0.6, y + Math.random() * 0.8, z + sz * 0.6, {
        vel: { x: vx, y: 1.5 + Math.random() * 3, z: vz }, spin: { x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 },
        density: glass ? 2500 : 600, friction: 0.8, bounce: 0.25, group: G.DEBRIS,
      });
      if (this.s.contacts) this.s.contacts.register(d, glass ? 'glass' : kind === 'metal' ? 'metal' : 'wood');
      this.debris.push({ d, mesh, life: 14 + Math.random() * 6 });
    }
    // eski enkazı sınırla
    while (this.debris.length > 90) this.killDebris(this.debris.shift());
  }

  killDebris(x) {
    this.pw.removeDynamic(x.d);
    this.group.remove(x.mesh);
    const pk = x.mesh && x.mesh.userData.pool;
    if (pk && this.pool[pk].length < 60) this.pool[pk].push(x.mesh);
  }

  /** Savrulan ceset (araç çarpması/patlama): görünüm kökü fizik kapsülünü izler */
  launchCorpse(view, dir, force) {
    if (!this.pw || !view || !view.root || view.corpse) return;
    const p = view.root.position;
    const yaw = view.root.rotation.y;
    view.corpse = true;
    const f = Math.min(force, 16);
    // gövde, darbe yönüne doğru hafif yatık başlar (dik kalıp dikilmesin)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25 * Math.cos(yaw), yaw, -0.25 * Math.sin(yaw), 'YXZ'));
    // kapsül merkezi kökün 0.8 m üstünde; görsel kök = gövde merkezi + (0,-0.8,0) yerel ofset
    const d = this.pw.addDynamic(view.root, { type: 'capsule', hh: 0.5, r: 0.28 }, p.x, p.y + 0.85, p.z, {
      quat: { x: q.x, y: q.y, z: q.z, w: q.w }, vel: { x: dir[0] * f * 0.8, y: 1.5 + f * 0.3, z: dir[1] * f * 0.8 },
      spin: { x: dir[1] * f * 0.5 + (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 4, z: -dir[0] * f * 0.5 + (Math.random() - 0.5) * 3 }, density: 650, friction: 0.9, bounce: 0.05, group: G.CORPSE,
      filter: G.STATIC | G.PROP, linDamp: 0.3, angDamp: 1.2, visualOffset: new THREE.Vector3(0, -0.8, 0),
    });
    if (this.s.contacts) this.s.contacts.register(d, 'body');
    view.corpseBody = d;
    this.debris.push({ d, mesh: null, life: 8, view });
  }

  update(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const x = this.debris[i];
      x.life -= dt;
      if (x.life <= 0) {
        if (x.view) { this.pw.removeDynamic(x.d); x.view.corpseBody = null; } else this.killDebris(x);
        this.debris.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const p of this.props) if (p.alive) this.pw.removeDynamic(p.d);
    for (const x of this.debris) this.pw.removeDynamic(x.d);
    this.props = []; this.debris = []; this.byId.clear();
    this.s.game.scene.remove(this.group);
  }
}

let METAL = null;
function metalMat() { return METAL || (METAL = new THREE.MeshStandardMaterial({ color: 0x5d6d7e, roughness: 0.5, metalness: 0.5 })); }
