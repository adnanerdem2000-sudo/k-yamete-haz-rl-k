// CharacterRig — insan iskeletini (Quaternius "CharacterArmature", 62 kemik) prosedürel pozlarla süren katman.
//
// Pozlar "T-poz model uzayında" tanımlanır: karakter +Z'ye bakar, sol tarafı +X, yukarısı +Y'dir.
// Her kemik için verilen R dönüşü, kemiği T-pozdaki model eksenleri etrafında döndürür ve ebeveyn
// kemiklerin dönüşleriyle zincirlenir (ileri kinematik):
//   yerel_q = P⁻¹ · R · P · q_T      (P: ebeveynin T-poz dünyasal yönelimi, q_T: kemiğin T-poz yerel dönüşü)
// Modelin bağlama pozu kollar aşağıdadır; T-poz yükleme sırasında bir kez hesaplanır (ModularBase).
// Poz sözlüğü (Hips, Spine, LeftArm…) eski prosedürel kütüphaneyle aynıdır; burada yeni iskelete eşlenir.
// Ayak kemikleri modelde bacak zincirine değil köke bağlıdır (IK hedefi): prosedürel pozda bilek
// konumuna taşınırlar. apply() klip pozunun üzerine kemik başına ağırlıkla karışabilir.
import * as THREE from 'three';

const D = Math.PI / 180;

// ---------------------------------------------------------------- poz sözlüğü (eski adlar)
const VOCAB = [
  'Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandThumb1',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandIndex1', 'RightHandIndex2', 'RightHandThumb1',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
];
export const BONES = VOCAB;
const ORDER = {};
for (const b of VOCAB) ORDER[b] = /Arm|Leg|Foot|Hand|Shoulder/.test(b) ? 'XYZ' : 'YXZ';
const IDX = {};
VOCAB.forEach((b, i) => { IDX[b] = i; });

/** Pose: kemik adı → [x, y, z] (radyan, T-poz model uzayı) + kalça ofseti (metre) */
export class Pose {
  constructor() {
    this.a = new Float32Array(VOCAB.length * 3);
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
const vmask = (re) => VOCAB.map((b, i) => [b, i]).filter(([b]) => re.test(b)).map(([, i]) => i);
export const UPPER_MASK = vmask(/Spine|Chest|Neck|Head|Shoulder|Arm|Hand/);
export const ARMS_MASK = vmask(/Shoulder|Arm|Hand/);
export const RARM_MASK = vmask(/Right(Shoulder|Arm|ForeArm|Hand)/);
export const LARM_MASK = vmask(/Left(Shoulder|Arm|ForeArm|Hand)/);

// ---------------------------------------------------------------- yeni iskelete eşleme
// [kemik, ebeveyn (zincirde), poz yuvası (null: geçiş), oran]
const RIG = [['Body', null, 'Hips'], ['Hips', 'Body', null], ['Abdomen', 'Hips', 'Spine'], ['Torso', 'Abdomen', 'Chest'], ['Chest', 'Torso', 'UpperChest'], ['Neck', 'Chest', 'Neck'], ['Head', 'Neck', 'Head']];
for (const [S, s] of [['Left', 'L'], ['Right', 'R']]) {
  RIG.push(['Shoulder' + s, 'Chest', S + 'Shoulder'], ['UpperArm' + s, 'Shoulder' + s, S + 'Arm'], ['LowerArm' + s, 'UpperArm' + s, S + 'ForeArm'], ['Wrist' + s, 'LowerArm' + s, S + 'Hand']);
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
    RIG.push([f + '1' + s, 'Wrist' + s, S + 'HandIndex1', f === 'Index' ? 1 : 0.95], [f + '2' + s, f + '1' + s, S + 'HandIndex2', 1], [f + '3' + s, f + '2' + s, S + 'HandIndex2', 0.7]);
  }
  RIG.push(['Thumb1' + s, 'Wrist' + s, S + 'HandThumb1', 1], ['Thumb2' + s, 'Thumb1' + s, S + 'HandThumb1', 0.6]);
  RIG.push(['UpperLeg' + s, 'Body', S + 'UpLeg'], ['LowerLeg' + s, 'UpperLeg' + s, S + 'Leg']);
}
export const RIG_BONES = RIG.map((r) => r[0]);
const RIDX = {};
RIG.forEach((r, i) => { RIDX[r[0]] = i; });
const rmask = (re) => RIG.map((r, i) => [r[0], i]).filter(([b]) => re.test(b)).map(([, i]) => i);
/** Klip üzerine karıştırma maskeleri (RIG dizinleri) */
export const RIG_MASK = {
  all: RIG.map((_, i) => i),
  upper: rmask(/Abdomen|Torso|Chest|Neck|Head|Shoulder|Arm|Wrist|Index|Middle|Ring|Pinky|Thumb/),
  spine: rmask(/Abdomen|Torso|^Chest|Neck|Head/),
  arms: rmask(/Shoulder|Arm|Wrist|Index|Middle|Ring|Pinky|Thumb/),
  rarm: rmask(/(Shoulder|Arm|Wrist|Index\d|Middle\d|Ring\d|Pinky\d|Thumb\d)R$/),
  larm: rmask(/(Shoulder|Arm|Wrist|Index\d|Middle\d|Ring\d|Pinky\d|Thumb\d)L$/),
  rhand: rmask(/(Index\d|Middle\d|Ring\d|Pinky\d|Thumb\d)R$/),
  lhand: rmask(/(Index\d|Middle\d|Ring\d|Pinky\d|Thumb\d)L$/),
  legs: rmask(/Leg/),
  head: rmask(/Neck|Head/),
};
/** Kemik adı (sanitize edilmiş) → klip izleri için grup testi */
export const UPPER_BONE_RE = /^(Abdomen|Torso|Chest|Neck|Head|Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/;
export const ARM_BONE_RE = /^(Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/;

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _ident = new THREE.Quaternion();
const _e3q = new THREE.Quaternion();
const HIP_SCALE = 0.75; // eski poz birimleri (model birimi) → metre
const FOOT_LEVEL = 0.7; // ayak yönü: 0 = inciği izle, 1 = gövdeye göre yatay

/**
 * T-poz dinlenme verisini hesaplar (taban model başına bir kez). bones: ad → THREE.Bone (bağlama pozunda),
 * modelRoot: kök nesne (kimlik dönüşümlü). Dönüş: CharacterRig'in kullandığı paylaşılan veri.
 */
export function computeRest(bones, modelRoot) {
  modelRoot.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
  const saved = new Map();
  for (const b of Object.values(bones)) saved.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
  const wq = (b, out = new THREE.Quaternion()) => { _m.multiplyMatrices(rootInv, b.matrixWorld); _m.decompose(_v3, out, _v2); return out; };
  const wp = (b, out = new THREE.Vector3()) => { _m.multiplyMatrices(rootInv, b.matrixWorld); return out.setFromMatrixPosition(_m); };
  /** kemiği, model uzayında 'from' yönünü 'to' yönüne çevirecek şekilde döndür */
  const aim = (bone, from, to) => {
    const R = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
    const P = wq(bone.parent);
    // yeni dünya = R · W ; yerel = P⁻¹ · R · W
    const W = wq(bone);
    bone.quaternion.copy(P.clone().invert().multiply(R).multiply(W));
    bone.updateMatrixWorld(true);
  };
  // ---- ayak-incik ilişkisi BAĞLAMA pozundan (botun deri ağırlıkları bu ilişkiye göredir)
  const footBind = {};
  for (const s of ['L', 'R']) {
    const ll = bones['LowerLeg' + s], ft = bones['Foot' + s];
    const llInv = new THREE.Matrix4().multiplyMatrices(rootInv, ll.matrixWorld).invert();
    const fh = wp(ft);
    // ayak bileği eklemi ≈ topuğun (ayak kemiği başı) biraz üstü ve önü
    const ank = fh.clone().add(new THREE.Vector3(0, 0.085, 0.025));
    footBind[s] = { headLocal: fh.clone().applyMatrix4(llInv), ankleLocal: ank.applyMatrix4(llInv), rel: wq(ll).invert().multiply(wq(ft)) };
  }
  // ---- T-poz: kollar yatay (sol +X), bilekler düz; bacaklar dik
  const shin = {};
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const ua = bones['UpperArm' + s], la = bones['LowerArm' + s], wr = bones['Wrist' + s], mid = bones['Middle1' + s];
    aim(ua, wp(la).sub(wp(ua)), new THREE.Vector3(sx, 0, 0));
    aim(la, wp(wr).sub(wp(la)), new THREE.Vector3(sx, 0, 0));
    if (mid) aim(wr, wp(mid).sub(wp(wr)), new THREE.Vector3(sx, 0, 0));
    const ul = bones['UpperLeg' + s], ll = bones['LowerLeg' + s], ft = bones['Foot' + s];
    // bilek ≈ ayak kemiği başı (topuk) + biraz yukarı; incik yönü diz → ayak
    const footW = wp(ft);
    shin[s] = { len: wp(ll).distanceTo(footW) };
    aim(ul, wp(ll).sub(wp(ul)), new THREE.Vector3(0, -1, 0));
    aim(ll, footW.clone().sub(wp(ll)), new THREE.Vector3(0, -1, 0));
  }
  modelRoot.updateMatrixWorld(true);
  const wscale = (b) => { _m.multiplyMatrices(rootInv, b.matrixWorld); _m.decompose(_v3, _q, _v2); return (_v2.x + _v2.y + _v2.z) / 3; };
  const entries = RIG.map(([name, parent, slot, factor]) => {
    const b = bones[name];
    if (!b) return null;
    const W = wq(b), P = wq(b.parent);
    return { name, parent: parent ? RIDX[parent] : -1, slot: slot ? IDX[slot] : -1, factor: factor ?? 1, qT: b.quaternion.clone(), pT: b.position.clone(), W, P, Pinv: P.clone().invert(), wpos: wp(b), wscale: wscale(b) };
  });
  // ayaklar: T-pozda bilek (incik ucu) konumu ve göreli yönelim
  const feet = {};
  let groundFix = 0;
  for (const s of ['L', 'R']) {
    const ll = bones['LowerLeg' + s], ft = bones['Foot' + s];
    const llW = new THREE.Matrix4().multiplyMatrices(rootInv, ll.matrixWorld);
    const ankleModel = wp(ll).add(new THREE.Vector3(0, -shin[s].len, 0));
    const ankleLocal = ankleModel.clone().applyMatrix4(llW.clone().invert());
    const llT = wq(ll);
    const footRel = llT.clone().invert().multiply(wq(ft));
    feet[s] = { ankleLocal, footRel, footT: ankleModel, llT, llTinv: llT.clone().invert(), bindLocal: saved.get(ft).q.clone(), bind: footBind[s] };
    // bacaklar düzleştirilince ayak biraz aşağı iner: gövdeyi o kadar yukarı al
    groundFix += (wp(ft).y - ankleModel.y) / 2;
  }
  // kalça (Body) ebeveyn dönüşü
  // model uzayı ofsetini Body'nin ebeveyn yerel uzayına çeviren doğrusal dönüşüm (iskelet ölçekli olabilir)
  const body = bones.Body;
  const bodyParentLin = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, body.parent.matrixWorld).invert());
  // kol uzunlukları ve T-poz yön vektörleri (IK)
  const arm = {};
  for (const s of ['L', 'R']) {
    const e = (n) => entries[RIDX[n + s]];
    arm[s] = { upper: e('UpperArm').wpos.distanceTo(e('LowerArm').wpos), lower: e('LowerArm').wpos.distanceTo(e('Wrist').wpos), dirUp: e('LowerArm').wpos.clone().sub(e('UpperArm').wpos).normalize(), dirLo: e('Wrist').wpos.clone().sub(e('LowerArm').wpos).normalize() };
  }
  const legLen = {};
  for (const s of ['L', 'R']) {
    const e = (n) => entries[RIDX[n + s]];
    legLen[s] = { thigh: e('LowerLeg').wpos.clone().sub(e('UpperLeg').wpos), shinV: feet[s].footT.clone().sub(e('LowerLeg').wpos) };
  }
  // geri yükle (bağlama pozu)
  for (const [b, v] of saved) { b.quaternion.copy(v.q); b.position.copy(v.p); }
  modelRoot.updateMatrixWorld(true);
  return { entries, feet, bodyParentLin, arm, legLen, groundFix };
}

export class CharacterRig {
  /** @param {THREE.Object3D} model  iskelet kökü (klon)  @param rest computeRest() çıktısı */
  constructor(model, rest) {
    this.model = model;
    this.restData = rest;
    this.bones = {};
    model.traverse((o) => { if (o.isBone && !this.bones[o.name]) this.bones[o.name] = o; });
    this.list = rest.entries.map((e) => (e ? this.bones[e.name] : null));
    const n = RIG.length;
    this.R = Array.from({ length: n }, () => new THREE.Quaternion());
    this.Rtot = Array.from({ length: n }, () => new THREE.Quaternion());
    this.local = Array.from({ length: n }, () => new THREE.Quaternion());
    this.weights = new Float32Array(n);
    this.pose = new Pose();
    this.ikTargets = { Left: null, Right: null };
    this._ikTmp = { Left: new THREE.Vector3(), Right: new THREE.Vector3() };
    this._polTmp = { Left: new THREE.Vector3(), Right: new THREE.Vector3() };
    this.foot = { L: this.bones.FootL, R: this.bones.FootR };
    this.root = this.bones.Root;
    this.autoGround = false;
    this.hipY = null; // oturma: kalça (Body) model kökünden bu yükseklikte (m)
    this._hip = new THREE.Vector3();
  }

  /** Model uzayında bir IK hedefi belirler (null → kapalı). pole: dirseğin yöneleceği yön */
  setArmIK(side, target, pole) {
    if (!target) { this.ikTargets[side] = null; return; }
    this._ikTmp[side].copy(target);
    this._polTmp[side].copy(pole || (side === 'Left' ? _v.set(1, -1, -0.3) : _v.set(-1, -1, -0.3)));
    this.ikTargets[side] = this._ikTmp[side];
  }

  /** Pozdan R ve yerel dönüşleri hesapla */
  _compute(pose) {
    const a = pose.a, E = this.restData.entries;
    for (let i = 0; i < RIG.length; i++) {
      const e = E[i];
      if (!e) continue;
      const R = this.R[i];
      if (e.slot < 0) { R.identity(); continue; }
      const k = e.slot * 3;
      const x = a[k], y = a[k + 1], z = a[k + 2];
      if (x === 0 && y === 0 && z === 0) R.identity();
      else {
        R.setFromEuler(_e.set(x, y, z, ORDER[VOCAB[e.slot]]));
        if (e.factor !== 1) R.slerpQuaternions(_ident, R, e.factor);
      }
    }
    if (this.ikTargets.Left || this.ikTargets.Right) this._solveIK(pose);
    for (let i = 0; i < RIG.length; i++) {
      const e = E[i];
      if (!e) continue;
      if (e.parent >= 0) this.Rtot[i].multiplyQuaternions(this.Rtot[e.parent], this.R[i]);
      else this.Rtot[i].copy(this.R[i]);
      this.local[i].copy(e.Pinv).multiply(this.R[i]).multiply(e.P).multiply(e.qT);
    }
  }

  /** Kalça ofseti: istenirse ayakları yere oturtacak dikey ofset hesaplanır */
  _hipOffset(pose) {
    const h = this._hip.copy(pose.hip).multiplyScalar(HIP_SCALE);
    if (this.hipY !== null) { h.y = this.hipY - this.restData.entries[0].wpos.y; return h; }
    h.y += this.restData.groundFix;
    if (!this.autoGround) return h;
    const E = this.restData.entries, L = this.restData.legLen;
    let minRise = Infinity;
    for (const s of ['L', 'R']) {
      const iu = RIDX['UpperLeg' + s], il = RIDX['LowerLeg' + s];
      // ayak bileği: Body etrafında dönen bacak zinciri
      _v.copy(E[iu].wpos).sub(E[0].wpos).applyQuaternion(this.Rtot[0]);
      _v2.copy(L[s].thigh).applyQuaternion(this.Rtot[iu]);
      _v3.copy(L[s].shinV).applyQuaternion(this.Rtot[il]);
      const y = _v.y + _v2.y + _v3.y;
      const y0 = E[iu].wpos.y - E[0].wpos.y + L[s].thigh.y + L[s].shinV.y;
      minRise = Math.min(minRise, y - y0);
    }
    h.y = -minRise + Math.max(0, pose.hip.y * HIP_SCALE) + this.restData.groundFix;
    return h;
  }

  /**
   * Pozu kemiklere uygular. weights: RIG dizinleri için [0..1] (yoksa tamamı 1 = tam üzerine yazma).
   * Ağırlık < 1 olan kemiklerde mevcut (klip) dönüşüyle küresel karışım yapılır.
   */
  apply(pose = this.pose, weights = null) {
    this._compute(pose);
    const E = this.restData.entries;
    let legW = 0;
    for (let i = 0; i < RIG.length; i++) {
      const b = this.list[i];
      if (!b) continue;
      const w = weights ? weights[i] : 1;
      if (w <= 0) continue;
      if (w >= 1) b.quaternion.copy(this.local[i]);
      else b.quaternion.slerp(this.local[i], w);
      if (i === 0) {
        // kalça konumu (Body)
        const h = this._hipOffset(pose);
        _v.copy(h).applyMatrix3(this.restData.bodyParentLin).add(E[0].pT);
        if (w >= 1) b.position.copy(_v); else b.position.lerp(_v, w);
      }
    }
    // bacaklar procedural ise ayaklar bileğe taşınır
    if (weights) legW = Math.max(weights[RIDX.LowerLegL], weights[RIDX.LowerLegR]); else legW = 1;
    if (legW > 0) this._placeFeet(weights, pose);
  }

  _placeFeet(weights, pose) {
    const F = this.restData.feet;
    const root = this.root;
    if (!root) return;
    root.updateWorldMatrix(true, false);
    _m.copy(root.matrixWorld).invert();
    root.getWorldQuaternion(_q2); // kökün dünya yönelimi
    for (const s of ['L', 'R']) {
      const ft = this.foot[s];
      const ll = this.list[RIDX['LowerLeg' + s]];
      if (!ft || !ll) continue;
      const w = weights ? weights[RIDX['LowerLeg' + s]] : 1;
      if (w <= 0) continue;
      const B = F[s].bind;
      ll.updateWorldMatrix(true, false);
      // bağlama ilişkisiyle varsayılan ayak dönüşümü (dünya)
      const fp0 = _v.copy(B.headLocal).applyMatrix4(ll.matrixWorld);
      const ank = _v2.copy(B.ankleLocal).applyMatrix4(ll.matrixWorld);
      const fq0 = ll.getWorldQuaternion(_q).multiply(B.rel);
      // tabanı gövdeye göre yataya doğru, ayak bileği ekleminin etrafında döndür
      _e3q.multiplyQuaternions(_q2, F[s].bindLocal); // yatay ayak (dünya)
      _q3.copy(fq0).invert();
      _e3q.multiply(_q3); // Δ = yatay · fq0⁻¹
      _q3.identity().slerp(_e3q, FOOT_LEVEL); // kısmi düzeltme
      fp0.sub(ank).applyQuaternion(_q3).add(ank);
      fq0.premultiply(_q3);
      // kök yerel uzayına çevir
      fp0.applyMatrix4(_m);
      _q3.copy(_q2).invert().multiply(fq0);
      if (w >= 1) { ft.position.copy(fp0); ft.quaternion.copy(_q3); } else { ft.position.lerp(fp0, w); ft.quaternion.slerp(_q3, w); }
    }
  }

  // ---------------------------------------------------------------- iki kemik kol IK'si
  _bonePos(i, out, pose) {
    const E = this.restData.entries;
    const chain = [];
    let n = i;
    while (n >= 0) { chain.unshift(n); n = E[n].parent; }
    out.copy(E[chain[0]].wpos).addScaledVector(pose.hip, HIP_SCALE);
    const q = _q.identity();
    for (let k = 0; k < chain.length - 1; k++) {
      q.multiply(this.R[chain[k]]);
      _v3.copy(E[chain[k + 1]].wpos).sub(E[chain[k]].wpos).applyQuaternion(q);
      out.add(_v3);
    }
    return out;
  }

  _rtotOf(i) {
    const E = this.restData.entries;
    const chain = [];
    let n = i;
    while (n >= 0) { chain.unshift(n); n = E[n].parent; }
    const q = new THREE.Quaternion();
    for (const c of chain) q.multiply(this.R[c]);
    return q;
  }

  _solveIK(pose) {
    for (const side of ['Left', 'Right']) {
      const target = this.ikTargets[side];
      if (!target) continue;
      const s = side[0];
      const iu = RIDX['UpperArm' + s], il = RIDX['LowerArm' + s], ish = RIDX['Shoulder' + s];
      const A = this.restData.arm[s];
      const S = this._bonePos(iu, new THREE.Vector3(), pose);
      const a = A.upper, b = A.lower;
      const toT = _v.copy(target).sub(S);
      let d = toT.length();
      d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-3);
      const dir = toT.normalize();
      const cosA = (a * a + d * d - b * b) / (2 * a * d);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const pole = _v2.copy(this._polTmp[side]);
      pole.sub(_v3.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
      const elbowDir = new THREE.Vector3().copy(dir).multiplyScalar(cosA).addScaledVector(pole, sinA).normalize();
      const Ep = new THREE.Vector3().copy(S).addScaledVector(elbowDir, a);
      const T = new THREE.Vector3().copy(S).addScaledVector(dir, d);
      const foreDir = T.sub(Ep).normalize();
      const Aup = new THREE.Quaternion().setFromUnitVectors(A.dirUp, elbowDir);
      const Afore = new THREE.Quaternion().setFromUnitVectors(A.dirLo, foreDir);
      const parentTot = this._rtotOf(ish);
      this.R[iu].copy(parentTot.invert().multiply(Aup));
      this.R[il].copy(Aup.clone().invert().multiply(Afore));
    }
  }

  /** Kemiğe bağlı, T-poz model eksenleriyle hizalı bağlantı noktası oluşturur (birim: metre) */
  makeAnchor(boneName, name) {
    const b = this.bones[boneName];
    const e = this.restData.entries[RIDX[boneName]];
    const anchor = new THREE.Object3D();
    anchor.name = name || boneName + '_anchor';
    // dinlenmede (T-poz) anchor model yönelimi = kimlik → yerel = W_T⁻¹
    if (e) { anchor.quaternion.copy(e.W).invert(); anchor.scale.setScalar(1 / (e.wscale || 1)); }
    b.add(anchor);
    return anchor;
  }
}

export { D };
