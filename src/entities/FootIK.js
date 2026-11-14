// FootIK — eğim ve basamaklarda ayak yerleştirme. Klip pozu yazıldıktan sonra çalışır:
//  1) Her ayağın (incik ucundaki bilek noktası) altındaki zemin yüksekliği örneklenir (arazi + basılabilir
//     yüzeyler: merdiven basamağı, kaldırım, sandık…), kök (kapsül tabanı) yüksekliğine göre fark bulunur.
//  2) Kalça, alçak taraftaki ayağın yetişebileceği kadar indirilir (model kökü kaydırması; yumuşak).
//  3) İki kemikli IK (uyluk + incik) bileği hedefe taşır; diz bükülme düzlemi korunur. IK ayak kemiği
//     (kökün çocuğu) bileğin gerçek yer değiştirmesi kadar kaydırılır (ayak incikten kopmaz).
//  4) Basan ayağın tabanı zemin eğimine yatırılır (bileğin altındaki zemin normali, en çok 20°; basamak kenarında düz,
//     ayak kalkınca söner). Bilek konumu değişmez.
// Ayak klipte havadayken de (salınım) aynı zemin farkı uygulanır; fark sönümlü olduğundan basamak kenarında
// sıçrama olmaz. Ayrıca gövdenin önü-arkası eğimi ölçülür (slope: yokuş yukarı +; Avatar yokuşta eğilmek için kullanır).
// Yalnızca ayakta/eğik kipte ve yakındaki karakterlerde çalışır (Avatar karar verir).
import * as THREE from 'three';

const _H = new THREE.Vector3(), _K = new THREE.Vector3(), _A = new THREE.Vector3(), _A0 = new THREE.Vector3(), _T = new THREE.Vector3();
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _pole = new THREE.Vector3(), _K2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _n = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _I = new THREE.Quaternion();
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const FOOT_MAX = 0.35; // ayak tabanı en çok ~20° yatar

/** Kemiği dünya uzayında q kadar döndür (yerel = ebeveynDünya⁻¹ · q · dünya) */
function rotateWorld(bone, q) {
  bone.matrixWorld.decompose(_p, _qw, _s);
  bone.parent.matrixWorld.decompose(_p, _qp, _s);
  bone.quaternion.copy(_qp.invert().multiply(q).multiply(_qw));
  bone.updateMatrixWorld(true);
}

export class FootIK {
  constructor(ch) {
    this.model = ch.model;
    const B = ch.rig.bones, F = ch.rig.restData.feet;
    this.legs = ['L', 'R'].map((s) => ({ ul: B['UpperLeg' + s], ll: B['LowerLeg' + s], ft: B['Foot' + s], ankle: F[s].bind.ankleLocal, dy: 0, h0: null }));
    this.ok = this.legs.every((l) => l.ul && l.ll && l.ft && l.ul.parent);
    this.pelvis = 0;
    this.w = 0;
    this.slope = 0; // gövde yönünde eğim (yükselti/yatay; yokuş yukarı +)
  }

  /**
   * ground(x, z, refY) → zemin yüksekliği (dünya). rootY: avatar kökünün dünya yüksekliği.
   * want: 0..1 etkinlik (kip/tam gövde klibi). Döner: kalça ofseti (model kökünün y kaydırması, metre).
   * Model konumu bu çağrıdan önce son haline getirilmiş olmalı (pelvis ofseti hariç; onu buradan alır).
   */
  solve(dt, ground, rootY, want) {
    this.w = damp(this.w, want, 8, dt);
    if (!this.ok || this.w < 0.01) { this.pelvis = damp(this.pelvis, 0, 10, dt); this.slope = damp(this.slope, 0, 6, dt); return this.pelvis; }
    const m = this.model;
    m.updateMatrixWorld(true);
    // 0) gövdenin önü-arkası eğimi (kökten ±0,35 m); basamak kenarında (fark ≥ 0,3 m) düz sayılır
    const E = m.matrixWorld.elements;
    const fl = Math.hypot(E[8], E[10]) || 1, fx = E[8] / fl, fz = E[10] / fl;
    const gF = ground(E[12] + fx * 0.35, E[14] + fz * 0.35, rootY + 0.45), gB = ground(E[12] - fx * 0.35, E[14] - fz * 0.35, rootY + 0.45);
    this.slope = damp(this.slope, Math.abs(gF - gB) < 0.3 ? (gF - gB) / 0.7 : 0, 6, dt);
    // 1) zemin farkları (bilek noktasının altı)
    let lo = Infinity;
    for (const L of this.legs) {
      _A.copy(L.ankle).applyMatrix4(L.ll.matrixWorld);
      const g = ground(_A.x, _A.z, rootY + 0.45);
      L.g = g;
      const dy = clamp(g - rootY, -0.5, 0.5);
      L.dy = Math.abs(dy - L.dy) > 0.6 ? dy : damp(L.dy, dy, 16, dt);
      lo = Math.min(lo, L.dy);
    }
    // 2) kalça: alçak ayağa yetiş (yukarı kaldırma yok: kök zaten en yüksek desteğe oturur)
    const pel = clamp(Math.min(0, lo), -0.42, 0) * this.w;
    this.pelvis = damp(this.pelvis, pel, 14, dt);
    m.position.y += this.pelvis;
    m.updateMatrixWorld(true);
    // 3) bacaklar, 4) ayak tabanı
    for (const L of this.legs) {
      const corr = (L.dy - this.pelvis) * this.w;
      if (Math.abs(corr) >= 0.004) this.reach(L, corr, m);
      this.alignFoot(L, ground, rootY, dt);
    }
    return this.pelvis;
  }

  /**
   * Basan ayağın tabanını zemin normaline yatır: bileğin altında ve 0,14 m yanında/önünde örneklenen zemin düzlemi
   * (basamak kenarında — komşu örnek 6 cm'den farklı — düz kabul edilir), sönümlü normal, en çok 20°; bilek yerden
   * kalktıkça (salınım) söner. Ayak kemiği kendi başı etrafında döner: bilek konumu ve bacak IK'sı değişmez.
   */
  alignFoot(L, ground, rootY, dt) {
    _A.copy(L.ankle).applyMatrix4(L.ll.matrixWorld);
    const g = L.g;
    const gx = ground(_A.x + 0.14, _A.z, rootY + 0.45), gz = ground(_A.x, _A.z + 0.14, rootY + 0.45);
    _n.set(0, 1, 0);
    if (Math.abs(gx - g) < 0.06 && Math.abs(gz - g) < 0.06) _n.set(g - gx, 0.14, g - gz).normalize();
    const n = L.n || (L.n = new THREE.Vector3(0, 1, 0));
    n.lerp(_n, 1 - Math.exp(-10 * dt)).normalize();
    const ang = Math.acos(clamp(n.y, -1, 1));
    const k = this.w * (1 - smooth(0.16, 0.26, _A.y - g)) * 0.85; // basan bilek ≈ zeminden 0,10–0,13 m
    L.tilt = Math.min(ang, FOOT_MAX) * k;
    if (L.tilt < 0.002) return;
    _q.setFromUnitVectors(_UP, n);
    if (ang > FOOT_MAX) _q.slerp(_I, 1 - FOOT_MAX / ang);
    _q.slerp(_I, 1 - k);
    rotateWorld(L.ft, _q);
  }

  /** İki kemikli IK: bileği corr kadar düşey taşı (diz düzlemi korunur), IK ayak kemiğini bileğin yer değiştirmesi kadar kaydır */
  reach(L, corr, m) {
    L.ul.getWorldPosition(_H);
    L.ll.getWorldPosition(_K);
    _A.copy(L.ankle).applyMatrix4(L.ll.matrixWorld);
    _A0.copy(_A);
    _T.copy(_A); _T.y += corr;
    const a = _H.distanceTo(_K), b = _K.distanceTo(_A);
    _d1.subVectors(_T, _H);
    const t = clamp(_d1.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    _d1.normalize();
    // diz düzlemi: mevcut dizin hedef doğrultusuna dik bileşeni
    _pole.subVectors(_K, _H);
    _pole.addScaledVector(_d1, -_pole.dot(_d1));
    if (_pole.lengthSq() < 1e-8) _pole.set(0, 0, 1).applyQuaternion(m.getWorldQuaternion(_qw));
    _pole.normalize();
    const cosA = clamp((a * a + t * t - b * b) / (2 * a * t), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _K2.copy(_H).addScaledVector(_d1, a * cosA).addScaledVector(_pole, a * sinA);
    // uyluk: (K-H) → (K'-H)
    _q.setFromUnitVectors(_d2.subVectors(_K, _H).normalize(), _p.subVectors(_K2, _H).normalize());
    rotateWorld(L.ul, _q);
    // incik: güncel bilek → hedef
    L.ll.getWorldPosition(_K);
    _A.copy(L.ankle).applyMatrix4(L.ll.matrixWorld);
    _q.setFromUnitVectors(_d2.subVectors(_A, _K).normalize(), _p.subVectors(_T, _K).normalize());
    rotateWorld(L.ll, _q);
    // IK ayak kemiği: bileğin gerçek yer değiştirmesi kadar (bacak boyu yetmese de ayak incikten kopmaz)
    _A.copy(L.ankle).applyMatrix4(L.ll.matrixWorld);
    L.ft.getWorldPosition(_p);
    _p.add(_A).sub(_A0);
    L.ft.parent.worldToLocal(_p);
    L.ft.position.copy(_p);
    L.ft.updateMatrixWorld(true);
  }
}
