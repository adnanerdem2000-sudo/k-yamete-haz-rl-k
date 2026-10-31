// FootIK — eğim ve basamaklarda ayak yerleştirme. Klip pozu yazıldıktan sonra çalışır:
//  1) Her ayağın (incik ucundaki bilek noktası) altındaki zemin yüksekliği örneklenir (arazi + basılabilir
//     yüzeyler: merdiven basamağı, kaldırım, sandık…), kök (kapsül tabanı) yüksekliğine göre fark bulunur.
//  2) Kalça, alçak taraftaki ayağın yetişebileceği kadar indirilir (model kökü kaydırması; yumuşak).
//  3) İki kemikli IK (uyluk + incik) bileği hedefe taşır; diz bükülme düzlemi korunur. IK ayak kemiği
//     (kökün çocuğu) bileğin gerçek yer değiştirmesi kadar kaydırılır (ayak incikten kopmaz).
// Ayak klipte havadayken de (salınım) aynı zemin farkı uygulanır; fark sönümlü olduğundan basamak kenarında
// sıçrama olmaz. Yalnızca ayakta/eğik kipte ve yakındaki karakterlerde çalışır (Avatar karar verir).
import * as THREE from 'three';

const _H = new THREE.Vector3(), _K = new THREE.Vector3(), _A = new THREE.Vector3(), _A0 = new THREE.Vector3(), _T = new THREE.Vector3();
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _pole = new THREE.Vector3(), _K2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

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
  }

  /**
   * ground(x, z, refY) → zemin yüksekliği (dünya). rootY: avatar kökünün dünya yüksekliği.
   * want: 0..1 etkinlik (kip/tam gövde klibi). Döner: kalça ofseti (model kökünün y kaydırması, metre).
   * Model konumu bu çağrıdan önce son haline getirilmiş olmalı (pelvis ofseti hariç; onu buradan alır).
   */
  solve(dt, ground, rootY, want) {
    this.w = damp(this.w, want, 8, dt);
    if (!this.ok || this.w < 0.01) { this.pelvis = damp(this.pelvis, 0, 10, dt); return this.pelvis; }
    const m = this.model;
    m.updateMatrixWorld(true);
    // 1) zemin farkları (bilek noktasının altı)
    let lo = Infinity;
    for (const L of this.legs) {
      _A.copy(L.ankle).applyMatrix4(L.ll.matrixWorld);
      const g = ground(_A.x, _A.z, rootY + 0.45);
      const dy = clamp(g - rootY, -0.5, 0.5);
      L.dy = Math.abs(dy - L.dy) > 0.6 ? dy : damp(L.dy, dy, 16, dt);
      lo = Math.min(lo, L.dy);
    }
    // 2) kalça: alçak ayağa yetiş (yukarı kaldırma yok: kök zaten en yüksek desteğe oturur)
    const pel = clamp(Math.min(0, lo), -0.42, 0) * this.w;
    this.pelvis = damp(this.pelvis, pel, 14, dt);
    m.position.y += this.pelvis;
    m.updateMatrixWorld(true);
    // 3) bacaklar
    for (const L of this.legs) {
      const corr = (L.dy - this.pelvis) * this.w;
      if (Math.abs(corr) < 0.004) continue;
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
    return this.pelvis;
  }
}
