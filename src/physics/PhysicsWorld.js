// Fizik motoru köprüsü (Rapier 3D, WASM). Oyunun mevcut çarpışma dünyası (AABB/daire) yapay zekâ,
// yol bulma ve mermi ışınları için kalır; tüm katı cisimler buraya aynalanır:
//  • statik: arazi yükseklik alanı + duvarlar/kapılar/çitler (kapı açılınca devre dışı)
//  • kinematik: oyuncu kapsülü (karakter denetleyicisi: basamak, eğim, zemine yapışma)
//  • dinamik: araçlar (ışınlı süspansiyon), yerdeki eşyalar, enkaz, devrilebilir nesneler, cesetler
// Simülasyon sabit 60 Hz adımla ilerler; çizim adımlar arası enterpolasyonla yapılır.
import RAPIER from 'rapier';
import * as THREE from 'three';

export const STEP = 1 / 60;
export const GRAVITY = -9.81 * 1.35;
/** Çarpışma grupları (bit) */
export const G = { STATIC: 1, PLAYER: 2, VEHICLE: 4, PROP: 8, DEBRIS: 16, CORPSE: 32 };
export const ALL = 0xffff;
export const groups = (member, filter = ALL) => (((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class PhysicsWorld {
  /** WASM modülünü bir kez başlat */
  static async load() { if (!PhysicsWorld.ready) { await RAPIER.init(); PhysicsWorld.ready = true; } return RAPIER; }

  constructor(world) {
    this.R = RAPIER;
    this.world = world;
    this.w = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.w.timestep = STEP;
    this.links = new Map(); // oyun çarpıştırıcısı → Rapier çarpıştırıcısı
    this.hooks = new Set(); // her fizik adımından önce (h)
    this.after = new Set(); // her fizik adımından sonra (h)
    this.dynamic = new Set(); // görsel eşlemeli dinamik nesneler
    this.acc = 0;
    this.alpha = 0;
    this.steps = 0;
    this.addTerrain(world.terrain);
    const cw = world.physics;
    for (const c of cw.all) this.link(c);
    const prev = cw.onChange;
    cw.onChange = (c, on) => { if (prev) prev(c, on); this.sync(c, on); };
  }

  // ======================================================================= statik dünya
  addTerrain(T) {
    const N = T.N, V = N + 1, size = N * T.cell;
    // Rapier: sütun-öncelikli matris, satır = z (j), sütun = x (i); ters köşegen üçgenleme (Terrain.heightAt ile aynı)
    const hh = new Float32Array(V * V);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) hh[j + i * V] = T.h[j * V + i];
    const desc = RAPIER.ColliderDesc.heightfield(N, N, hh, { x: size, y: 1, z: size })
      .setFriction(0.9).setCollisionGroups(groups(G.STATIC));
    this.terrainCollider = this.w.createCollider(desc);
  }

  /** Oyun çarpıştırıcısını aynala */
  link(c) {
    if (this.links.has(c) || c.noPhysics) return;
    let desc;
    const minY = Math.max(c.minY, -60), maxY = Math.min(c.maxY, 120);
    const hy = Math.max(0.02, (maxY - minY) / 2), cy = (minY + maxY) / 2;
    if (c.shape === 'circle') desc = RAPIER.ColliderDesc.cylinder(hy, Math.max(0.03, c.r)).setTranslation(c.x, cy, c.z);
    else {
      const hx = Math.max(0.02, (c.maxX - c.minX) / 2), hz = Math.max(0.02, (c.maxZ - c.minZ) / 2);
      desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation((c.minX + c.maxX) / 2, cy, (c.minZ + c.maxZ) / 2);
    }
    desc.setFriction(c.isFloor ? 0.9 : 0.6).setCollisionGroups(groups(G.STATIC));
    const rc = this.w.createCollider(desc);
    rc.setEnabled(c.enabled !== false);
    this.links.set(c, rc);
  }

  /** Çarpıştırıcı eklendi/kaldırıldı/açıldı-kapandı */
  sync(c, on) {
    const rc = this.links.get(c);
    if (!this.world.physics.all.has(c)) { // kaldırıldı
      if (rc) { this.w.removeCollider(rc, false); this.links.delete(c); }
      return;
    }
    if (!rc) { this.link(c); return; }
    rc.setEnabled(!!on && c.enabled !== false);
  }

  // ======================================================================= adım
  addHook(fn) { this.hooks.add(fn); return () => this.hooks.delete(fn); }
  addAfter(fn) { this.after.add(fn); return () => this.after.delete(fn); }

  /** Sabit adımlı ilerletme. Dönüş: bu karede atılan adım sayısı */
  update(dt) {
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= STEP && n < 6) {
      for (const h of this.hooks) h(STEP);
      this.recordPrev();
      this.w.step(this.eventQueue || undefined);
      for (const a of this.after) a(STEP);
      this.acc -= STEP;
      n++;
      this.steps++;
    }
    if (n >= 6) this.acc = 0; // yavaş makinede spiral kaçınma
    this.alpha = this.acc / STEP;
    this.syncDynamic();
    return n;
  }

  // ======================================================================= karakter
  createCharacter(x, y, z, opts = {}) { return new CharacterBody(this, x, y, z, opts); }

  // ======================================================================= dinamik nesneler
  /**
   * Görsel nesneye bağlı dinamik gövde. shape: {type:'box', hx,hy,hz} | {type:'ball', r} | {type:'capsule', hh, r} | {type:'cyl', hh, r}
   * obj: THREE.Object3D (konum/dönüş eşlenir); offset: gövde merkezinden görsel köke yerel ofset
   */
  addDynamic(obj, shape, x, y, z, opts = {}) {
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
      .setLinearDamping(opts.linDamp ?? 0.15).setAngularDamping(opts.angDamp ?? 0.4).setCcdEnabled(!!opts.ccd);
    if (opts.quat) bd.setRotation(opts.quat);
    const body = this.w.createRigidBody(bd);
    let cd;
    if (shape.type === 'ball') cd = RAPIER.ColliderDesc.ball(shape.r);
    else if (shape.type === 'capsule') cd = RAPIER.ColliderDesc.capsule(shape.hh, shape.r);
    else if (shape.type === 'cyl') cd = RAPIER.ColliderDesc.cylinder(shape.hh, shape.r);
    else cd = RAPIER.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz);
    cd.setDensity(opts.density ?? 300).setFriction(opts.friction ?? 0.7).setRestitution(opts.bounce ?? 0.15)
      .setCollisionGroups(groups(opts.group ?? G.DEBRIS, opts.filter ?? (G.STATIC | G.VEHICLE | G.PROP | G.PLAYER | G.DEBRIS | G.CORPSE)));
    if (shape.offset) cd.setTranslation(shape.offset.x, shape.offset.y, shape.offset.z);
    const col = this.w.createCollider(cd, body);
    if (opts.vel) body.setLinvel(opts.vel, true);
    if (opts.spin) body.setAngvel(opts.spin, true);
    const d = { body, col, obj, offset: opts.visualOffset || null, life: opts.life || 0, t: 0, onSleep: opts.onSleep || null, sleepT: 0, prev: new THREE.Vector3(x, y, z), prevQ: new THREE.Quaternion() };
    if (opts.quat) d.prevQ.set(opts.quat.x, opts.quat.y, opts.quat.z, opts.quat.w);
    this.dynamic.add(d);
    return d;
  }

  /**
   * Taşıma: gövde kinematiğe alınır (oyuncu kapsülüyle çarpışmaz, diğer nesneleri iter); bırakınca yeniden
   * dinamik olur. vel: bırakma/fırlatma hızı; pose [x,y,z,qx,qy,qz,qw]: bırakıldığı yer (ağdan gelen bırakma).
   */
  setCarried(d, on, vel = null, pose = null) {
    if (!d || !this.dynamic.has(d)) return;
    d.body.setBodyType(on ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic, true);
    d.col.setCollisionGroups(groups(G.PROP, on ? (G.STATIC | G.PROP | G.DEBRIS) : (G.STATIC | G.VEHICLE | G.PROP | G.PLAYER | G.DEBRIS | G.CORPSE)));
    d.carried = !!on;
    if (on) return;
    if (pose) {
      d.body.setTranslation({ x: pose[0], y: pose[1], z: pose[2] }, true);
      d.body.setRotation({ x: pose[3], y: pose[4], z: pose[5], w: pose[6] }, true);
      d.hasPrev = false; // ışınlanma: araya enterpolasyon çizme
    }
    d.body.wakeUp();
    if (vel) d.body.setLinvel(vel, true);
  }
  /** Ağdan gelen dinlenme pozu: gövdeyi oraya koy ve uyut (görsel bir kez güncellenir) */
  placeAtRest(d, pose) {
    if (!d || !this.dynamic.has(d) || d.carried) return;
    d.body.setTranslation({ x: pose[0], y: pose[1], z: pose[2] }, true);
    d.body.setRotation({ x: pose[3], y: pose[4], z: pose[5], w: pose[6] }, true);
    d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    d.body.sleep();
    d.hasPrev = false;
    d.synced = false;
  }
  moveCarried(d, pos, quat) {
    if (!d || !d.carried) return;
    // kinematik hedef uyuyan gövdeyi uyandırmaz: oyuncu durup yeniden yürüyünce nesne yerde kalmasın
    if (d.body.isSleeping()) d.body.wakeUp();
    d.body.setNextKinematicTranslation(pos);
    d.body.setNextKinematicRotation(quat);
  }

  removeDynamic(d) {
    if (!d || !this.dynamic.has(d)) return;
    this.dynamic.delete(d);
    this.w.removeRigidBody(d.body);
  }

  /** Adım öncesi dönüşümleri sakla (çizimde adımlar arası enterpolasyon için) */
  recordPrev() {
    for (const d of this.dynamic) {
      if (d.body.isSleeping()) { d.hasPrev = false; continue; }
      const t = d.body.translation(), r = d.body.rotation();
      d.prev.set(t.x, t.y, t.z);
      d.prevQ.set(r.x, r.y, r.z, r.w);
      d.hasPrev = true;
    }
  }

  /** Dinamik görselleri gövdelere eşle (enterpolasyonlu); uyku/kayıp yönetimi */
  syncDynamic() {
    const a = this.alpha;
    for (const d of this.dynamic) {
      const sleeping = d.body.isSleeping();
      if (sleeping && d.synced) { this.sleepTick(d, true); continue; }
      const t = d.body.translation(), r = d.body.rotation();
      if (t.y < -40) { this.removeDynamic(d); if (d.onLost) d.onLost(d); continue; }
      if (d.obj) {
        if (d.hasPrev && !sleeping) {
          d.obj.position.set(d.prev.x + (t.x - d.prev.x) * a, d.prev.y + (t.y - d.prev.y) * a, d.prev.z + (t.z - d.prev.z) * a);
          d.obj.quaternion.slerpQuaternions(d.prevQ, _q.set(r.x, r.y, r.z, r.w), a);
        } else {
          d.obj.position.set(t.x, t.y, t.z);
          d.obj.quaternion.set(r.x, r.y, r.z, r.w);
        }
        if (d.offset) { const o = _v1.copy(d.offset).applyQuaternion(d.obj.quaternion); d.obj.position.add(o); }
      }
      d.synced = sleeping;
      this.sleepTick(d, sleeping);
    }
  }

  sleepTick(d, sleeping) {
    if (!d.onSleep) return;
    if (sleeping) { d.sleepT += 1; if (d.sleepT > 30) { const cb = d.onSleep; d.onSleep = null; cb(d); } } else d.sleepT = 0;
  }

  /** Patlama/darbe: yarıçap içindeki dinamik gövdelere itki */
  impulse(x, y, z, radius, strength) {
    const out = [];
    for (const d of this.dynamic) {
      const t = d.body.translation();
      const dx = t.x - x, dy = t.y - y, dz = t.z - z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius || dist < 1e-3) continue;
      const k = strength * (1 - dist / radius) * d.body.mass();
      d.body.applyImpulse({ x: dx / dist * k, y: Math.max(0.35, dy / dist + 0.5) * k, z: dz / dist * k }, true);
      d.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * k * 0.3, y: (Math.random() - 0.5) * k * 0.3, z: (Math.random() - 0.5) * k * 0.3 }, true);
      out.push(d);
    }
    for (const v of this.vehicleBodies || []) {
      const t = v.translation();
      const dist = Math.hypot(t.x - x, t.y - y, t.z - z);
      if (dist > radius) continue;
      const k = strength * 0.25 * (1 - dist / radius) * v.mass();
      v.applyImpulse({ x: (t.x - x) / (dist || 1) * k, y: k * 0.6, z: (t.z - z) / (dist || 1) * k }, true);
    }
    return out;
  }

  /** Işın: statik dünya + dinamik gövdeler. Dönüş {dist, point, normal, collider} */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filterGroups = groups(ALL, G.STATIC | G.VEHICLE | G.PROP), exclude = null) {
    const len = Math.hypot(dx, dy, dz) || 1;
    const ray = new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx / len, y: dy / len, z: dz / len });
    const hit = this.w.castRayAndGetNormal(ray, maxDist, true, undefined, filterGroups, exclude || undefined);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return { dist: t, point: { x: ox + dx / len * t, y: oy + dy / len * t, z: oz + dz / len * t }, normal: hit.normal, collider: hit.collider };
  }

  dynamicAt(collider) {
    for (const d of this.dynamic) if (d.col === collider) return d;
    return null;
  }

  /** Oturum sonu: dinamik nesneleri temizle (statik dünya kalır) */
  clearDynamic() { for (const d of [...this.dynamic]) this.removeDynamic(d); this.hooks.clear(); this.after.clear(); this.acc = 0; }
}

const _v1 = new THREE.Vector3();

// ============================================================================ karakter gövdesi
const STANCE = { stand: 1.74, crouch: 1.22, prone: 0.62, downed: 0.62 };

/** Oyuncu kapsülü + Rapier kinematik karakter denetleyicisi */
export class CharacterBody {
  constructor(pw, x, y, z, opts = {}) {
    this.pw = pw;
    const R = RAPIER;
    this.r = opts.radius || 0.3;
    this.stance = 'stand';
    this.height = STANCE.stand;
    const hh = this.halfHeight(this.height);
    this.body = pw.w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + hh + this.r, z));
    this.col = pw.w.createCollider(R.ColliderDesc.capsule(hh, this.r).setFriction(0).setCollisionGroups(groups(G.PLAYER, G.STATIC | G.VEHICLE | G.PROP | G.DEBRIS | G.CORPSE)), this.body);
    const k = pw.w.createCharacterController(0.03);
    k.setUp({ x: 0, y: 1, z: 0 });
    k.enableAutostep(0.52, 0.18, false);
    k.enableSnapToGround(0.42);
    k.setMaxSlopeClimbAngle(52 * Math.PI / 180);
    k.setMinSlopeSlideAngle(42 * Math.PI / 180);
    k.setSlideEnabled(true);
    k.setApplyImpulsesToDynamicBodies(true);
    k.setCharacterMass(80);
    k.setNormalNudgeFactor(0.0005);
    this.kcc = k;
    this.filter = groups(ALL, G.STATIC | G.VEHICLE | G.PROP);
    this.grounded = false;
    this.feet = new THREE.Vector3(x, y, z);
    this.prevFeet = this.feet.clone();
    this.lastMove = new THREE.Vector3();
    this.collisions = [];
    this.enabled = true;
  }

  halfHeight(h) { return Math.max(0.01, h / 2 - this.r); }

  /** Duruş değiştir (tavan kontrolü). Dönüş: başarılı mı */
  setStance(name) {
    const target = STANCE[name] || STANCE.stand;
    if (Math.abs(target - this.height) < 1e-3) { this.stance = name; return true; }
    const R = RAPIER;
    if (target > this.height) {
      // ayağa kalkmadan önce yer var mı
      const hh = this.halfHeight(target);
      const c = { x: this.feet.x, y: this.feet.y + hh + this.r + 0.04, z: this.feet.z };
      let blocked = false;
      this.pw.w.intersectionsWithShape(c, { x: 0, y: 0, z: 0, w: 1 }, new R.Capsule(hh, this.r * 0.92), () => { blocked = true; return false; }, undefined, this.filter, this.col, this.body);
      if (blocked) return false;
    }
    this.height = target;
    this.stance = name;
    const hh = this.halfHeight(target);
    this.col.setHalfHeight(hh);
    this.body.setTranslation({ x: this.feet.x, y: this.feet.y + hh + this.r, z: this.feet.z }, true);
    this.body.setNextKinematicTranslation({ x: this.feet.x, y: this.feet.y + hh + this.r, z: this.feet.z });
    this.pw.w.propagateModifiedBodyPositionsToColliders();
    return true;
  }

  /** Bir fizik adımı hareket iste. Dönüş: gerçekleşen hareket */
  move(dx, dy, dz) {
    if (!this.enabled) return this.lastMove.set(0, 0, 0);
    this.kcc.computeColliderMovement(this.col, { x: dx, y: dy, z: dz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.filter);
    const m = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    this.prevFeet.copy(this.feet);
    const hh = this.halfHeight(this.height);
    this.feet.set(t.x + m.x, t.y + m.y - hh - this.r, t.z + m.z);
    this.collisions.length = 0;
    const n = this.kcc.numComputedCollisions();
    for (let i = 0; i < n; i++) { const c = this.kcc.computedCollision(i); if (c) this.collisions.push({ normal: { ...c.normal1 }, collider: c.collider }); }
    return this.lastMove.set(m.x, m.y, m.z);
  }

  /** Doğrudan yerleştir (merdiven, araç inişi, yeniden doğma, taşınma) */
  teleport(x, y, z) {
    const hh = this.halfHeight(this.height);
    this.body.setTranslation({ x, y: y + hh + this.r, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + hh + this.r, z });
    this.feet.set(x, y, z);
    this.prevFeet.copy(this.feet);
    this.pw.w.propagateModifiedBodyPositionsToColliders();
  }

  setEnabled(on) {
    this.enabled = on;
    this.col.setEnabled(on);
  }

  /** Enterpolasyonlu ayak konumu (çizim için) */
  visualFeet(out, alpha) { return out.lerpVectors(this.prevFeet, this.feet, alpha); }

  dispose() { this.pw.w.removeRigidBody(this.body); }
}

/** Yaw/pitch/roll ↔ dördey yardımcıları */
export function quatYaw(yaw) { _q.setFromEuler(_e.set(0, yaw, 0, 'YXZ')); return { x: _q.x, y: _q.y, z: _q.z, w: _q.w }; }
export function yawOf(r) { return Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x)); }

export { RAPIER };
