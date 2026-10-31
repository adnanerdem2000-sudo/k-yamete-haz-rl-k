// CharacterRig — Kenney karakter iskeletini prosedürel olarak süren animasyon katmanı.
//
// Tüm dönüşler "T-poz model uzayında" tanımlanır: karakter +Z'ye bakar, sol tarafı +X,
// yukarısı +Y'dir. Her kemik için verilen R dönüşü, kemiği T-pozdaki model eksenleri
// etrafında döndürür ve ebeveyn kemiklerin dönüşleriyle zincirlenir (ileri kinematik).
//   yerel_q = P⁻¹ · R · P · q_dinlenme      (P: ebeveynin dinlenme dünyasal yönelimi)
// Böylece kemiklerin garip yerel eksenleriyle uğraşmadan "kolu 70° indir", "dizi 40° bük"
// gibi okunabilir pozlar yazılabilir. Kol IK'si (iki kemik) silah/direksiyon tutmak için vardır.
import * as THREE from 'three';

const D = Math.PI / 180;

// Animasyonla sürülen kemikler ve (animasyon zinciri içindeki) ebeveynleri
const CHAIN = [
  ['Hips', null], ['Spine', 'Hips'], ['Chest', 'Spine'], ['UpperChest', 'Chest'], ['Neck', 'UpperChest'], ['Head', 'Neck'],
  ['LeftShoulder', 'UpperChest'], ['LeftArm', 'LeftShoulder'], ['LeftForeArm', 'LeftArm'], ['LeftHand', 'LeftForeArm'],
  ['LeftHandIndex1', 'LeftHand'], ['LeftHandIndex2', 'LeftHandIndex1'], ['LeftHandThumb1', 'LeftHand'],
  ['RightShoulder', 'UpperChest'], ['RightArm', 'RightShoulder'], ['RightForeArm', 'RightArm'], ['RightHand', 'RightForeArm'],
  ['RightHandIndex1', 'RightHand'], ['RightHandIndex2', 'RightHandIndex1'], ['RightHandThumb1', 'RightHand'],
  ['LeftUpLeg', 'Hips'], ['LeftLeg', 'LeftUpLeg'], ['LeftFoot', 'LeftLeg'],
  ['RightUpLeg', 'Hips'], ['RightLeg', 'RightUpLeg'], ['RightFoot', 'RightLeg'],
];
export const BONES = CHAIN.map((c) => c[0]);
const ORDER = {};
for (const b of BONES) ORDER[b] = /Arm|Leg|Foot|Hand|Shoulder/.test(b) ? 'XYZ' : 'YXZ';

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Pose: kemik adı → [x, y, z] (radyan, T-poz model uzayı) + kalça ofseti */
export class Pose {
  constructor() {
    this.a = new Float32Array(BONES.length * 3);
    this.hip = new THREE.Vector3();
  }
  reset() { this.a.fill(0); this.hip.set(0, 0, 0); return this; }
  set(name, x = 0, y = 0, z = 0) { const i = IDX[name] * 3; this.a[i] = x; this.a[i + 1] = y; this.a[i + 2] = z; return this; }
  add(name, x = 0, y = 0, z = 0) { const i = IDX[name] * 3; this.a[i] += x; this.a[i + 1] += y; this.a[i + 2] += z; return this; }
  get(name) { const i = IDX[name] * 3; return [this.a[i], this.a[i + 1], this.a[i + 2]]; }
  copy(p) { this.a.set(p.a); this.hip.copy(p.hip); return this; }
  /** this = lerp(this, p, t) */
  blend(p, t) {
    if (t <= 0) return this;
    if (t >= 1) return this.copy(p);
    const a = this.a, b = p.a;
    for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * t;
    this.hip.lerp(p.hip, t);
    return this;
  }
  /** Yalnızca belirtilen kemik kümesini karıştırır (üst gövde katmanı vb.) */
  blendMasked(p, t, mask) {
    if (t <= 0) return this;
    const a = this.a, b = p.a;
    for (const i of mask) { const k = i * 3; a[k] += (b[k] - a[k]) * t; a[k + 1] += (b[k + 1] - a[k + 1]) * t; a[k + 2] += (b[k + 2] - a[k + 2]) * t; }
    return this;
  }
}
const IDX = {};
BONES.forEach((b, i) => { IDX[b] = i; });
export const UPPER_MASK = BONES.map((b, i) => [b, i]).filter(([b]) => /Spine|Chest|Neck|Head|Shoulder|Arm|Hand/.test(b)).map(([, i]) => i);
export const ARMS_MASK = BONES.map((b, i) => [b, i]).filter(([b]) => /Shoulder|Arm|Hand/.test(b)).map(([, i]) => i);
export const RARM_MASK = BONES.map((b, i) => [b, i]).filter(([b]) => /Right(Shoulder|Arm|ForeArm|Hand)/.test(b)).map(([, i]) => i);
export const LARM_MASK = BONES.map((b, i) => [b, i]).filter(([b]) => /Left(Shoulder|Arm|ForeArm|Hand)/.test(b)).map(([, i]) => i);

export class CharacterRig {
  /** @param {THREE.Object3D} model  SkinnedMesh içeren (kimlik dönüşümlü) model kökü */
  constructor(model) {
    this.model = model;
    this.bones = {};
    // GLTFLoader aynı kitte tekrar eden kemik adlarına _1, _2 ekler: temel adı kullan
    model.traverse((o) => { if (o.isBone) { const n = o.name.replace(/_\d+$/, ''); if (!this.bones[n]) this.bones[n] = o; } });
    model.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    this.rest = {};
    for (const name of BONES) {
      const b = this.bones[name];
      if (!b) continue;
      const wm = new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld);
      const wq = new THREE.Quaternion(), wp = new THREE.Vector3(), ws = new THREE.Vector3();
      wm.decompose(wp, wq, ws);
      const pm = new THREE.Matrix4().multiplyMatrices(rootInv, b.parent.matrixWorld);
      const pq = new THREE.Quaternion(), pp = new THREE.Vector3(), ps = new THREE.Vector3();
      pm.decompose(pp, pq, ps);
      this.rest[name] = { q: b.quaternion.clone(), pos: b.position.clone(), P: pq, Pinv: pq.clone().invert(), W: wq, wpos: wp, pscale: ps.x };
    }
    // Kemik yön vektörleri (model uzayı, dinlenme): üst kol → dirsek, ön kol → bilek
    this.restDir = {};
    for (const [a, b] of [['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['LeftUpLeg', 'LeftLeg'], ['RightUpLeg', 'RightLeg']]) {
      this.restDir[a] = this.rest[b].wpos.clone().sub(this.rest[a].wpos).normalize();
    }
    this.armLen = {
      upper: this.rest.LeftForeArm.wpos.distanceTo(this.rest.LeftArm.wpos),
      lower: this.rest.LeftHand.wpos.distanceTo(this.rest.LeftForeArm.wpos),
    };
    this.R = {};
    this.Rtot = {};
    for (const n of BONES) { this.R[n] = new THREE.Quaternion(); this.Rtot[n] = new THREE.Quaternion(); }
    this.pose = new Pose();
    this.ikTargets = { Left: null, Right: null };
    this._ikTmp = { Left: new THREE.Vector3(), Right: new THREE.Vector3() };
    this._polTmp = { Left: new THREE.Vector3(), Right: new THREE.Vector3() };
    this.hipsCtrl = this.bones.HipsCtrl;
    this.hipsCtrlRestPos = this.hipsCtrl ? this.hipsCtrl.position.clone() : null;
    if (this.hipsCtrl) {
      const pm = new THREE.Matrix4().multiplyMatrices(rootInv, this.hipsCtrl.parent.matrixWorld);
      this.hipsCtrlParentInv = new THREE.Quaternion();
      pm.decompose(new THREE.Vector3(), this.hipsCtrlParentInv, new THREE.Vector3());
      this.hipsCtrlParentInv.invert();
    }
  }

  /** Model uzayında bir IK hedefi belirler (null → kapalı). pole: dirseğin yöneleceği yön */
  setArmIK(side, target, pole) {
    if (!target) { this.ikTargets[side] = null; return; }
    this._ikTmp[side].copy(target);
    this._polTmp[side].copy(pole || (side === 'Left' ? _v.set(1, -1, -0.3) : _v.set(-1, -1, -0.3)));
    this.ikTargets[side] = this._ikTmp[side];
  }

  /** Pozu kemiklere uygular. */
  apply(pose = this.pose) {
    const a = pose.a;
    for (let i = 0; i < BONES.length; i++) {
      const name = BONES[i];
      const k = i * 3;
      const x = a[k], y = a[k + 1], z = a[k + 2];
      if (x === 0 && y === 0 && z === 0) this.R[name].identity();
      else this.R[name].setFromEuler(_e.set(x, y, z, ORDER[name]));
    }
    // IK (kollar): R değerlerini mutlak yönlere göre yeniden yazar
    if (this.ikTargets.Left || this.ikTargets.Right) this._solveIK();
    for (let i = 0; i < CHAIN.length; i++) {
      const [name, parent] = CHAIN[i];
      const b = this.bones[name];
      if (!b) continue;
      const rest = this.rest[name];
      if (parent) this.Rtot[name].multiplyQuaternions(this.Rtot[parent], this.R[name]);
      else this.Rtot[name].copy(this.R[name]);
      // yerel = Pinv * R * P * qrest
      b.quaternion.copy(rest.Pinv).multiply(this.R[name]).multiply(rest.P).multiply(rest.q);
    }
    if (this.hipsCtrl) {
      _v.copy(pose.hip).applyQuaternion(this.hipsCtrlParentInv);
      this.hipsCtrl.position.copy(this.hipsCtrlRestPos).add(_v);
    }
  }

  // Kemiğin T-poz model uzayındaki toplam dönüşünü (ebeveyn zinciri dahil) hesaplar
  _computeRtot(name) {
    const chain = [];
    let n = name;
    while (n) { chain.unshift(n); n = PARENT[n]; }
    const q = _q2.identity();
    for (const c of chain) q.multiply(this.R[c]);
    return q;
  }

  // Model uzayında kemik pozisyonu (kalça ofseti dahil, mevcut R'lere göre)
  _bonePos(name, out) {
    // kalçadan başlayarak ileri kinematik
    const chain = [];
    let n = name;
    while (n) { chain.unshift(n); n = PARENT[n]; }
    out.copy(this.rest[chain[0]].wpos).add(this.pose.hip);
    const q = _q.identity();
    for (let i = 0; i < chain.length - 1; i++) {
      q.multiply(this.R[chain[i]]);
      _v3.copy(this.rest[chain[i + 1]].wpos).sub(this.rest[chain[i]].wpos).applyQuaternion(q);
      out.add(_v3);
    }
    return out;
  }

  _solveIK() {
    for (const side of ['Left', 'Right']) {
      const target = this.ikTargets[side];
      if (!target) continue;
      const upper = side + 'Arm', fore = side + 'ForeArm';
      const S = this._bonePos(upper, new THREE.Vector3());
      const a = this.armLen.upper, b = this.armLen.lower;
      const toT = _v.copy(target).sub(S);
      let d = toT.length();
      d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-3);
      const dir = toT.normalize();
      // dirsek: kosinüs teoremi
      const cosA = (a * a + d * d - b * b) / (2 * a * d);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const pole = _v2.copy(this._polTmp[side]);
      pole.sub(_v3.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
      const elbowDir = new THREE.Vector3().copy(dir).multiplyScalar(cosA).addScaledVector(pole, sinA).normalize();
      const E = new THREE.Vector3().copy(S).addScaledVector(elbowDir, a);
      const T = new THREE.Vector3().copy(S).addScaledVector(dir, d);
      const foreDir = T.sub(E).normalize();
      // mutlak dönüşler
      const Aup = new THREE.Quaternion().setFromUnitVectors(this.restDir[upper], elbowDir);
      const Afore = new THREE.Quaternion().setFromUnitVectors(this.restDir[fore], foreDir);
      const parentTot = this._computeRtot(side + 'Shoulder').clone();
      this.R[upper].copy(parentTot.clone().invert().multiply(Aup));
      this.R[fore].copy(Aup.clone().invert().multiply(Afore));
    }
  }

  /** El kemiğine bağlı, T-poz model eksenleriyle hizalı bağlantı noktası oluşturur */
  makeAnchor(boneName, name) {
    const b = this.bones[boneName];
    const anchor = new THREE.Object3D();
    anchor.name = name || boneName + '_anchor';
    // anchor dünya yönelimi (dinlenmede) = kimlik → yerel = W⁻¹
    anchor.quaternion.copy(this.rest[boneName].W).invert();
    // ölçeği telafi et
    const s = 1 / (this.rest[boneName].pscale || 1);
    anchor.scale.setScalar(1);
    b.add(anchor);
    anchor.userData.invScale = s;
    return anchor;
  }
}

const PARENT = {};
for (const [n, p] of CHAIN) PARENT[n] = p;

export { D };
