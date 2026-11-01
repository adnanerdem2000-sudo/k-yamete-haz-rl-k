// Fiziksel çekmeceler: şifonyer, komodin, masa, dosya dolabı, tezgâh gibi konteynerlerin önünde Rapier'de
// kayar eklemli (prizmatik) bir çekmece gövdesi. Aranırken ya da depo paneli açıkken motor çekmeceyi dışarı
// sürer, kapanınca içeri; oyuncu yürüyerek iterse kapanır (kinematik karakter itkisi). Gövde sayısı sınırlı
// kalsın diye yalnız oyuncuya yakın (≤ 22 m) en fazla 14 konteyner için kurulur, uzaklaşınca kaldırılır.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from './PhysicsWorld.js';

// 'cart' (alışveriş arabası modeli) çıkarıldı: çekmecesi yok, çekmece mobilyanın üstünde havada kalıyordu
const DRAWER_TYPES = new Set(['dresser', 'nightstand', 'desk', 'filing_cabinet', 'counter', 'bathroom_cabinet', 'radio_desk', 'medical_cart', 'register']);
const TRAVEL = 0.34, NEAR = 22, FAR = 28, MAX = 14, AJAR = 0.05;
// çekmece ortasının zeminden yüksekliği ve mobilyanın ön yüzünün eşya merkezinden uzaklığı (KayKit dolaplar 0,35 m;
// prosedürel eşyalarda derinliğin yarısı). Eskiden yükseklik konteyner noktasından (mobilyanın üstü) alındığı için
// masa, TV ünitesi ve telsiz masasında çekmece mobilyanın üstünde havada kalıyordu.
function drawerPlacement(ct) {
  const H = ct.fh || 0.8, m = ct.fmodel || '';
  let y;
  switch (ct.type) {
    case 'nightstand': case 'dresser': y = m.startsWith('cabinet') ? 0.53 : Math.min(H - 0.12, 0.42); break;
    case 'desk': case 'radio_desk': y = Math.min(H, 0.8) - 0.15; break;
    case 'filing_cabinet': y = Math.max(0.3, H - 0.25); break;
    case 'counter': case 'register': y = Math.min(H, 1.05) - 0.2; break;
    case 'bathroom_cabinet': y = 0.62; break;
    case 'medical_cart': y = 0.78; break;
    default: y = Math.min(H, 1.0) - 0.2;
  }
  const front = m.startsWith('cabinet') ? 0.35 : (ct.fd || 0.6) / 2;
  const color = ct.type === 'filing_cabinet' ? '#7b878c' : ct.type === 'medical_cart' ? '#dfe3e4' : ct.type === 'register' ? '#7d3412' : ct.type === 'bathroom_cabinet' ? '#ddd5c7' : null;
  return { y, front, color };
}
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
function drawerMaterial(color = null) {
  if (!MAT) MAT = new Map();
  const k = color || 'wood';
  if (!MAT.has(k)) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: color === '#7b878c' ? 0.45 : 0.75, metalness: color === '#7b878c' ? 0.4 : 0.05 });
    if (color) m.color.set(color).multiplyScalar(1.6); // köşe renkleri (ahşap tonu) türün rengiyle çarpılır
    MAT.set(k, m);
  }
  return MAT.get(k);
}

export class Drawers {
  constructor(session) {
    this.s = session;
    this.pw = session.game.phys;
    this.R = this.pw.R;
    this.active = new Map(); // container id → kayıt
    this.t = 0;
    // yalnız bir binanın içindeki mobilyalar (dış mekândaki modelsiz tıbbi sandıkta çekmece boşlukta oluşuyordu)
    this.cands = session.world.containers.filter((c) => DRAWER_TYPES.has(c.type) && !c.locked && c.building);
    this.group = new THREE.Group();
    this.group.name = 'drawers';
    session.game.scene.add(this.group);
  }

  /** Konteynerin baktığı yön: mobilyanın kayıtlı yönü (ön yüz); yoksa odasının merkezine doğru (yoksa oyuncuya) */
  facing(ct) {
    const S = this.s;
    if (ct.yaw !== undefined) return { x: Math.sin(ct.yaw), z: Math.cos(ct.yaw) };
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
    // çekmece ön yüzü mobilyanın ön yüzünün 1 cm önünde (gövde 0,19 + ön kapak 0,0125)
    const pl = ct.fy !== undefined ? drawerPlacement(ct) : null;
    const off = pl ? pl.front - 0.19 : 0.08;
    const x = ct.x + f.x * off, y = pl ? ct.fy + pl.y : ct.y - 0.06, z = ct.z + f.z * off;
    const mesh = new THREE.Mesh(drawerGeometry(), drawerMaterial(pl && pl.color));
    mesh.castShadow = true;
    this.group.add(mesh);
    const d = this.pw.addDynamic(mesh, { type: 'box', hx: 0.21, hy: 0.085, hz: 0.19 }, x, y, z, { quat, density: 180, friction: 0.4, bounce: 0, group: G.PROP, filter: G.PLAYER | G.PROP | G.DEBRIS, linDamp: 5, angDamp: 6 });
    d.noBuoyancy = true;
    const anchor = w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(quat));
    const jd = R.JointData.prismatic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    jd.limitsEnabled = true;
    jd.limits = [0, TRAVEL];
    const joint = w.createImpulseJoint(jd, anchor, d.body, true);
    const r = { ct, d, anchor, joint, open: false, f, x0: x, z0: z, rest: this.restPos(ct) };
    joint.configureMotorPosition(r.rest, 140, 26);
    this.active.set(ct.id, r);
    return r;
  }

  remove(r) {
    this.pw.removeDynamic(r.d);
    this.pw.w.removeRigidBody(r.anchor);
    this.group.remove(r.d.obj);
    this.active.delete(r.ct.id);
  }

  /** Açık olmalı mı: yerelde aranıyor ya da depo paneli açık; ya da başka bir oyuncu/bot kullanıyor (Loot.inUse) */
  wantOpen(ct) {
    const S = this.s;
    const hold = S.interact && S.interact.hold;
    if (hold && hold.container === ct) return true;
    const st = S.ui && S.ui.panels && S.ui.panels.storage;
    if (st && st.kind === 'container' && st.id === ct.id && S.ui.panel && S.ui.panel.name === 'storage') return true;
    return !!(S.loot && S.loot.inUse && S.loot.inUse.has(ct.id));
  }

  /** Aranmış çekmece biraz dışarıda kalır (karıştırılmış görünüm; aranma durumu kayıtta ve ağda) */
  restPos(ct) { const st = this.s.loot && this.s.loot.state.get(ct.id); return st && st.searched ? AJAR : 0; }

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
      const want = this.wantOpen(r.ct), rest = this.restPos(r.ct);
      if (want !== r.open || (!want && rest !== r.rest)) {
        const closing = r.open && !want;
        r.open = want; r.rest = rest;
        r.joint.configureMotorPosition(want ? TRAVEL : rest, 140, 26);
        r.d.body.wakeUp();
        if (closing) S.audio && S.audio.play('door', { at: r.ct, vol: 0.25, rate: 1.9 });
      }
    }
  }

  dispose() {
    for (const r of [...this.active.values()]) this.remove(r);
    this.s.game.scene.remove(this.group);
  }
}
