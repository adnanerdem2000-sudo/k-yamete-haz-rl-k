// Menteşeli kapılar: bina kapıları (ahşap/metal/lab) Rapier'de gerçek birer gövde + dönel eklem (menteşe) olur.
//  • Kapı kanadı dinamik gövdedir: oyuncu yürüyerek iter, nesne/araç çarpınca savrulur, zombi yumruklayınca
//    sarsılır. E ile aç/kapat: eklem motoru hedef açıya sürer (ama itilince esner).
//  • Kilitli ya da barikatlı kapı sabit gövdedir (itilemez). Kırılınca eklem kopar, kanat düşer; uyuyunca
//    gövde kaldırılır, kanat yerde kalır (DoorRenderer kırık pozu).
//  • Görsel, kanadın gerçek dönüşümünden yazılır (açılma açısı ve çarpışma alanı birebir eşleşir).
//  • Oyun tarafı AABB çarpıştırıcısı (yol bulma, görüş hattı, zombi engeli) aynen kalır; yalnız Rapier'e
//    aynalanmaz (onun yerine kanat gövdesi engel olur). Oyuncu kapıyı iterek açarsa host'a 'door' eylemi gider
//    (kilitli değilse), böylece durum herkeste eşitlenir.
import * as THREE from 'three';
import { G, groups } from './PhysicsWorld.js';

const OPEN_ANGLE = Math.PI * 0.52; // DoorRenderer ile aynı
const PHYS_KINDS = new Set(['wood', 'metal', 'lab']);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _off = new THREE.Vector3();

export class DoorPhysics {
  constructor(session) {
    this.s = session;
    this.pw = session.game.phys;
    this.R = this.pw.R;
    this.doors = [];
    this.byDoor = new Map();
    this.time = 0;
    this.t = 0;
    for (const d of session.world.doors) if (PHYS_KINDS.has(d.kind) && d.hinge && d.leafW > 0.3) this.attach(d);
    // durum olayları (herkeste): hedef, kilit, barikat, kırılma, onarım. Interact.applyDoorState alanları aynı
    // olayda yazar; sıra bağımsız olsun diye yenileme mikro görevle (tüm uygulayıcılar bitince) yapılır
    session.onEvt('door', (e) => { const r = this.byDoor.get(e.id); if (r) queueMicrotask(() => this.refresh(r)); });
  }

  /** Kanat gövdesi + menteşe eklemi */
  attach(d) {
    const R = this.R, w = this.pw.w;
    // çarpışma kanadı: altta 0,12 m boşluk (eşikteki arazi/zemin yüksekliği farkı takılmasın), görsel tam boy
    const h = d.height - 0.18, hc = 0.12 + h / 2, half = d.leafW / 2;
    const th = d.baseRot + (d.swing || 1) * d.open01 * OPEN_ANGLE;
    const dir = (a) => ({ x: Math.cos(a), z: -Math.sin(a) }); // yerel +X ekseni (three Y dönüşü)
    const u = dir(th);
    const cx = d.hinge.x + u.x * half, cz = d.hinge.z + u.z * half, cy = d.y0 + hc;
    _q.setFromAxisAngle(_s.set(0, 1, 0), th);
    const bd = R.RigidBodyDesc.dynamic().setTranslation(cx, cy, cz).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setLinearDamping(2.0).setAngularDamping(3.0).setCcdEnabled(false);
    const body = w.createRigidBody(bd);
    const mass = d.kind === 'metal' ? 45 : 22;
    const vol = d.leafW * h * 0.07;
    // duvar/arazi ile çarpışmaz (menteşe sınırı kanadı açıklıkta tutar); oyuncu, araç ve nesneleri engeller
    const cd = R.ColliderDesc.cuboid(half, h / 2, 0.035).setDensity(mass / vol).setFriction(0.5).setRestitution(0.05)
      .setCollisionGroups(groups(G.STATIC, G.PLAYER | G.VEHICLE | G.PROP | G.DEBRIS | G.CORPSE));
    const col = w.createCollider(cd, body);
    // menteşe: sabit gövde (menteşe noktası) ↔ kanat (kanat yerelinde -X ucu)
    const anchor = w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(d.hinge.x, cy, d.hinge.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }));
    const jd = R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: -half, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    jd.limitsEnabled = true;
    // eklem açısı = kanadın menteşeye göre Y dönüşü (sağ el kuralı) = DoorRenderer'daki swing·açı
    jd.limits = d.swing >= 0 ? [-0.02, OPEN_ANGLE] : [-OPEN_ANGLE, 0.02];
    const joint = w.createImpulseJoint(jd, anchor, body, true);
    // oyun AABB'si Rapier'e aynalanmasın (kanat gövdesi engeller)
    if (d.collider) {
      const rc = this.pw.links.get(d.collider);
      if (rc) { w.removeCollider(rc, false); this.pw.links.delete(d.collider); }
      d.collider.noPhysics = true;
    }
    const r = { d, body, col, anchor, joint, half, hc, h, mass, fixed: false, broken: false, sleepT: 0, pushT: 0, lastOpen01: d.open01, shakeT: 0 };
    this.doors.push(r);
    this.byDoor.set(d.id, r);
    d.phys = r;
    this.refresh(r);
    return r;
  }

  /** Durumdan: kilitli/barikatlı → sabit; hedef → motor; kırık → eklem kopar */
  refresh(r) {
    const d = r.d, R = this.R;
    if (d.broken) { if (!r.broken) this.breakLeaf(r); return; }
    if (r.broken) this.rebuild(r); // onarıldı
    r.cmdT = this.time; // komut zamanı: motor hedefe giderken itme algılanmasın
    const lock = d.locked || d.barricade > 0;
    if (lock !== r.fixed) { r.body.setBodyType(lock ? R.RigidBodyType.Fixed : R.RigidBodyType.Dynamic, true); r.fixed = lock; }
    if (!lock) {
      // motor: hedef açıya yumuşak sürüş (itilince esner); kapanınca mandal kadar tutar
      // açık: hedefe sür; kapalı: zayıf mandal (yürüyen oyuncu iterek açabilsin, kendi kendine kapanmasın)
      const target = d.target > 0.5 ? this.signedOpen(r, 1) : 0;
      r.joint.configureMotorPosition(target, d.target > 0.5 ? 60 : 14, d.target > 0.5 ? 14 : 8);
      r.body.wakeUp();
    }
  }

  /** Eklem açısı işareti: kapının açılma yönü (swing) ile eklem ekseni arasındaki ilişki */
  signedOpen(r, k) { return (r.d.swing >= 0 ? 1 : -1) * OPEN_ANGLE * k; }

  breakLeaf(r) {
    const w = this.pw.w, d = r.d;
    r.broken = true;
    if (r.joint) { w.removeImpulseJoint(r.joint, true); r.joint = null; }
    if (r.fixed) { r.body.setBodyType(this.R.RigidBodyType.Dynamic, true); r.fixed = false; }
    r.body.wakeUp();
    r.col.setCollisionGroups(groups(G.DEBRIS, G.STATIC | G.PROP | G.DEBRIS | G.VEHICLE)); // düşen kanat zemine çarpar
    // içeri doğru savrul
    r.body.applyImpulse({ x: d.inward.x * r.mass * 2.2, y: r.mass * 0.6, z: d.inward.z * r.mass * 2.2 }, true);
    r.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * r.mass, y: 0, z: (Math.random() - 0.5) * r.mass }, true);
    r.sleepT = 0;
  }

  /** Onarım: kanadı menteşeye geri as */
  rebuild(r) {
    const w = this.pw.w;
    const d = r.d;
    if (r.body) w.removeRigidBody(r.body);
    if (r.anchor) w.removeRigidBody(r.anchor);
    this.doors.splice(this.doors.indexOf(r), 1);
    this.byDoor.delete(d.id);
    d.open01 = 0;
    this.attach(d);
  }

  /** Zombi yumruğu: kanadı içeri doğru sars (her istemcide görsel) */
  shake(r, strength = 1) {
    if (r.broken) return;
    const d = r.d;
    if (r.fixed) { r.shakeT = 0.35; return; } // kilitli: titreşim yalnız görselde (küçük)
    r.body.wakeUp();
    r.body.applyImpulseAtPoint({ x: d.inward.x * r.mass * 1.6 * strength, y: 0, z: d.inward.z * r.mass * 1.6 * strength }, { x: d.center.x, y: d.y0 + 1.1, z: d.center.z }, true);
  }

  update(dt) {
    const S = this.s;
    this.time += dt;
    this.t += dt;
    // zombi yumruklayan kapılar (görünüm durumu her istemcide var)
    if (this.t > 0.9) {
      this.t = 0;
      const views = S.zombies && S.zombies.views;
      if (views) for (const v of views.values()) {
        if (!v.state || !v.state.bashing) continue;
        const p = v.root ? v.root.position : v;
        let best = null, bd = 1.9;
        for (const r of this.doors) { const dd = Math.hypot(r.d.center.x - p.x, r.d.center.z - p.z); if (dd < bd) { bd = dd; best = r; } }
        if (best) this.shake(best, 1);
      }
    }
    const pl = S.local;
    for (const r of this.doors) {
      const d = r.d, b = r.body;
      if (r.broken) {
        // yerde yatan kanat: uyuyunca gövdeyi kaldır, son dönüşüm görselde kalır
        if (b) {
          this.writeVisual(r);
          if (b.isSleeping()) { r.sleepT += dt; if (r.sleepT > 2) { this.pw.w.removeRigidBody(b); r.body = null; } }
        }
        continue;
      }
      if (r.shakeT > 0) { r.shakeT -= dt; this.writeVisual(r, Math.sin(this.time * 40) * 0.012 * r.shakeT); continue; }
      // uyuyan kanat: son kez eşitlenip bırakılır (uyandığında yeniden izlenir)
      const sleeping = b.isSleeping();
      if (sleeping && r.synced) continue;
      r.synced = sleeping;
      // açıklık oranı kanadın gerçek açısından
      const rot = b.rotation();
      _q.set(rot.x, rot.y, rot.z, rot.w);
      _e.setFromQuaternion(_q, 'YXZ');
      let a = _e.y - d.baseRot;
      a = Math.atan2(Math.sin(a), Math.cos(a)) * (d.swing || 1);
      const open01 = Math.max(0, Math.min(1, a / OPEN_ANGLE));
      d.open01 = open01;
      r.lastOpen01 = open01;
      this.writeVisual(r);
      // oyuncu iterek açtı/kapattı → durumu eşitle (kilitli değilse, host doğrular)
      if (!d.locked && d.barricade === 0 && pl) {
        const near = Math.hypot(pl.pos.x - d.center.x, pl.pos.z - d.center.z) < 2.2;
        const settled = this.time - (r.cmdT || 0) > 2.0; // son komuttan beri motor hedefe varmış olmalı
        if (settled && near && ((open01 > 0.55 && d.target < 0.5) || (open01 < 0.2 && d.target > 0.5))) {
          r.pushT += dt;
          if (r.pushT > 0.35) { r.pushT = -2; S.act('door', { id: d.id, open: d.target < 0.5 }); }
        } else r.pushT = Math.min(r.pushT + dt, 0);
      }
    }
  }

  /** Örnek matrisini kanadın gerçek dönüşümünden yaz (menteşe köşesi = geometri kökü) */
  writeVisual(r, jitter = 0) {
    const d = r.d, im = d.renderMesh;
    if (!im || !r.body) return;
    const t = r.body.translation(), rot = r.body.rotation();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _off.set(-r.half, -r.hc, 0).applyQuaternion(_q);
    _p.set(t.x + _off.x + jitter, t.y + _off.y, t.z + _off.z + jitter);
    _s.set(d.leafW, d.height - 0.04, 0.07);
    _m.compose(_p, _q, _s);
    im.setMatrixAt(d.renderIndex, _m);
    im.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    const w = this.pw.w;
    for (const r of this.doors) {
      if (r.joint) w.removeImpulseJoint(r.joint, true);
      if (r.body) w.removeRigidBody(r.body);
      if (r.anchor) w.removeRigidBody(r.anchor);
      r.d.phys = null;
      // statik AABB aynası geri (menü sahnesi / yeni oturum)
      if (r.d.collider) { r.d.collider.noPhysics = false; this.pw.link(r.d.collider); this.pw.sync(r.d.collider, r.d.collider.enabled !== false); }
    }
    this.doors = [];
    this.byDoor.clear();
  }
}
