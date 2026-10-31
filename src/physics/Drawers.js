// Fiziksel çekmeceler: şifonyer, komodin, masa, dosya dolabı, tezgâh gibi konteynerlerin önünde Rapier'de
// kayar eklemli (prizmatik) bir çekmece gövdesi. Aranırken ya da depo paneli açıkken motor çekmeceyi dışarı
// sürer, kapanınca içeri; oyuncu yürüyerek iterse kapanır (kinematik karakter itkisi). Gövde sayısı sınırlı
// kalsın diye yalnız oyuncuya yakın (≤ 22 m) en fazla 14 konteyner için kurulur, uzaklaşınca kaldırılır.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from './PhysicsWorld.js';

const DRAWER_TYPES = new Set(['dresser', 'nightstand', 'desk', 'filing_cabinet', 'counter', 'bathroom_cabinet', 'radio_desk', 'medical_cart', 'cart', 'register']);
const TRAVEL = 0.34, NEAR = 22, FAR = 28, MAX = 14;
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

let GEO = null, MAT = null;
function drawerGeometry() {
  if (GEO) return GEO;
  const col = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
  const front = col(new THREE.BoxGeometry(0.44, 0.17, 0.025).translate(0, 0, 0.19), '#6e4a2c');
  const box = col(new THREE.BoxGeometry(0.4, 0.14, 0.36).translate(0, -0.005, 0), '#8a6a45');
  const handle = col(new THREE.BoxGeometry(0.1, 0.018, 0.02).translate(0, 0.0, 0.215), '#b8bcc0');
  GEO = mergeGeometries([front, box, handle], false);
  return GEO;
}
function drawerMaterial() { return MAT || (MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 })); }

export class Drawers {
  constructor(session) {
    this.s = session;
    this.pw = session.game.phys;
    this.R = this.pw.R;
    this.active = new Map(); // container id → kayıt
    this.t = 0;
    this.cands = session.world.containers.filter((c) => DRAWER_TYPES.has(c.type) && !c.locked);
    this.group = new THREE.Group();
    this.group.name = 'drawers';
    session.game.scene.add(this.group);
  }

  /** Konteynerin baktığı yön: odasının merkezine doğru (yoksa oyuncuya) */
  facing(ct) {
    const S = this.s;
    const B = S.world.buildingById && S.world.buildingById[ct.building];
    const room = B && B.rooms && B.rooms.find((r) => r.id === ct.room);
    let fx = 0, fz = 1;
    if (room) { fx = (room.minX + room.maxX) / 2 - ct.x; fz = (room.minZ + room.maxZ) / 2 - ct.z; }
    else if (S.local) { fx = S.local.pos.x - ct.x; fz = S.local.pos.z - ct.z; }
    const l = Math.hypot(fx, fz) || 1;
    return { x: fx / l, z: fz / l };
  }

  create(ct) {
    const R = this.R, w = this.pw.w;
    const f = this.facing(ct);
    const yaw = Math.atan2(f.x, f.z);
    _q.setFromAxisAngle(_up, yaw);
    const quat = { x: _q.x, y: _q.y, z: _q.z, w: _q.w };
    const x = ct.x + f.x * 0.08, y = ct.y - 0.06, z = ct.z + f.z * 0.08;
    const mesh = new THREE.Mesh(drawerGeometry(), drawerMaterial());
    mesh.castShadow = true;
    this.group.add(mesh);
    const d = this.pw.addDynamic(mesh, { type: 'box', hx: 0.21, hy: 0.085, hz: 0.19 }, x, y, z, { quat, density: 180, friction: 0.4, bounce: 0, group: G.PROP, filter: G.PLAYER | G.PROP | G.DEBRIS, linDamp: 5, angDamp: 6 });
    d.noBuoyancy = true;
    const anchor = w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(quat));
    const jd = R.JointData.prismatic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    jd.limitsEnabled = true;
    jd.limits = [0, TRAVEL];
    const joint = w.createImpulseJoint(jd, anchor, d.body, true);
    const r = { ct, d, anchor, joint, open: false, f, x0: x, z0: z };
    joint.configureMotorPosition(0, 140, 26);
    this.active.set(ct.id, r);
    return r;
  }

  remove(r) {
    this.pw.removeDynamic(r.d);
    this.pw.w.removeRigidBody(r.anchor);
    this.group.remove(r.d.obj);
    this.active.delete(r.ct.id);
  }

  /** Açık olmalı mı: aranıyor ya da depo paneli bu konteynere açık */
  wantOpen(ct) {
    const S = this.s;
    const hold = S.interact && S.interact.hold;
    if (hold && hold.container === ct) return true;
    const st = S.ui && S.ui.panels && S.ui.panels.storage;
    return !!(st && st.kind === 'container' && st.id === ct.id && S.ui.panel && S.ui.panel.name === 'storage');
  }

  /** Çekmecenin dışarı çıkma miktarı (m) */
  extension(r) { const t = r.d.body.translation(); return (t.x - r.x0) * r.f.x + (t.z - r.z0) * r.f.z; }

  update(dt) {
    const S = this.s, pl = S.local;
    if (!pl) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.5;
      const px = pl.pos.x, pz = pl.pos.z;
      for (const r of [...this.active.values()]) if (Math.hypot(r.ct.x - px, r.ct.z - pz) > FAR) this.remove(r);
      if (this.active.size < MAX) {
        const near = [];
        for (const c of this.cands) { if (this.active.has(c.id)) continue; const dd = Math.hypot(c.x - px, c.z - pz); if (dd < NEAR) near.push([dd, c]); }
        near.sort((a, b) => a[0] - b[0]);
        for (const [, c] of near.slice(0, MAX - this.active.size)) this.create(c);
      }
    }
    for (const r of this.active.values()) {
      const want = this.wantOpen(r.ct);
      if (want !== r.open) {
        r.open = want;
        r.joint.configureMotorPosition(want ? TRAVEL : 0, 140, 26);
        r.d.body.wakeUp();
        if (!want) S.audio && S.audio.play('door', { at: r.ct, vol: 0.25, rate: 1.9 });
      }
    }
  }

  dispose() {
    for (const r of [...this.active.values()]) this.remove(r);
    this.s.game.scene.remove(this.group);
  }
}
