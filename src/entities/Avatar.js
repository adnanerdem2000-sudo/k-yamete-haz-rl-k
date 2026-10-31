// Avatar: görsel karakter + animatör. Yerel oyuncu, ağ oyuncuları, NPC'ler ve yapay zekâ
// takım arkadaşları aynı sınıfı kullanır. Durum (anim) nesnesinden her karede poz üretir.
import * as THREE from 'three';
import { Pose, UPPER_MASK, RARM_MASK, D } from './CharacterRig.js';
import * as A from './Animations.js';
import { CHAR_SCALE } from './CharacterFactory.js';
import { ITEMS } from '../data/items.js';
import { damp, dampAngle } from '../core/util.js';

// Eldeki eşya tutuş ofsetleri (el bağlantı noktası uzayında; birim = model birimi)
const HOLDS = {
  melee1: { pos: [-0.06, -0.02, 0.05], rot: [0, 0, 1.45], fwd: 0.35 },
  melee2: { pos: [-0.06, -0.02, 0.05], rot: [0, 0, 1.45], fwd: 0.45 },
  pistol: { pos: [-0.1, -0.02, 0.06], rot: [0, -Math.PI / 2, Math.PI / 2], fwd: 0.05 },
  rifle: { pos: [-0.12, -0.03, 0.08], rot: [0, -Math.PI / 2, Math.PI / 2], fwd: 0.18 },
  bow: { pos: [-0.05, 0, 0.05], rot: [Math.PI / 2, 0, Math.PI / 2], fwd: 0 },
  flashlight: { pos: [-0.1, -0.02, 0.05], rot: [0, -Math.PI / 2, Math.PI / 2], fwd: 0.05 },
  binoculars: { pos: [-0.08, 0, 0.08], rot: [0, 0, 0], fwd: 0 },
  rod: { pos: [-0.06, -0.02, 0.05], rot: [0, 0, 1.2], fwd: 0.5 },
  small: { pos: [-0.08, -0.02, 0.07], rot: [0, 0, 0], fwd: 0 },
};

const _v = new THREE.Vector3();

export class Avatar {
  constructor(game, look, opts = {}) {
    this.game = game;
    this.ch = game.charFactory.create(look, opts);
    this.root = this.ch.root;
    this.rig = this.ch.rig;
    this.pose = new Pose();
    this.tmp = new Pose();
    this.phase = 0;
    this.t = Math.random() * 10;
    this.speedSm = 0;
    this.lean = 0;
    this.blend = { crouch: 0, air: 0, aim: 0, prone: 0 };
    this.heldId = null;
    this.heldObj = null;
    this.flashlight = null;
    this.action = null; // {type, t, dur, kind}
    this.hit = null;
    this.yaw = 0;
    this.visYaw = 0;
    this.pitch = 0;
    this.nameTag = null;
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (opts.name) this.setNameTag(opts.name, opts.color);
  }

  setLook(look) { this.game.charFactory.applyLook(this.ch, look); }

  setNameTag(name, color = '#ffffff') {
    if (this.nameTag) { this.root.remove(this.nameTag); this.nameTag.material.map.dispose(); }
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '28px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(name, 128, 32);
    g.fillStyle = color; g.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    sp.scale.set(1.6, 0.4, 1);
    sp.position.y = 2.25;
    sp.renderOrder = 5;
    this.root.add(sp);
    this.nameTag = sp;
  }

  /** Eldeki eşyayı değiştir */
  hold(itemId) {
    if (this.heldId === itemId) return;
    this.heldId = itemId;
    if (this.heldObj) { this.heldObj.parent.remove(this.heldObj); this.heldObj = null; }
    if (this.flashlight) { this.flashlight.parent.remove(this.flashlight); this.flashlight.target.parent && this.flashlight.target.parent.remove(this.flashlight.target); this.flashlight = null; }
    if (!itemId) return;
    const def = ITEMS[itemId];
    const obj = this.game.itemModels.make(itemId);
    const hk = def.hold || 'small';
    const h = HOLDS[hk] || HOLDS.small;
    const holder = new THREE.Group();
    holder.position.set(...h.pos);
    holder.rotation.set(...h.rot);
    obj.position.x = h.fwd / CHAR_SCALE * 0.6;
    obj.scale.setScalar(1 / CHAR_SCALE);
    holder.add(obj);
    holder.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const anchor = hk === 'bow' ? this.ch.anchors.handL : this.ch.anchors.handR;
    anchor.add(holder);
    this.heldObj = holder;
    this.holdKind = def.gun ? (def.hold === 'pistol' ? 'pistol' : def.hold === 'bow' ? 'bow' : 'rifle') : def.melee ? (def.hold === 'melee2' ? 'melee2' : 'melee1') : hk;
  }

  setFlashlight(on) {
    if (on && !this.flashlight) {
      const sl = new THREE.SpotLight(0xfff2d0, 26, 32, 0.42, 0.45, 1.4);
      sl.castShadow = false;
      sl.position.set(0, 1.45, 0.25);
      const tgt = new THREE.Object3D(); tgt.position.set(0, 1.0, 8);
      this.root.add(sl); this.root.add(tgt);
      sl.target = tgt;
      this.flashlight = sl;
    } else if (!on && this.flashlight) {
      this.root.remove(this.flashlight); this.root.remove(this.flashlight.target);
      this.flashlight.dispose && this.flashlight.dispose();
      this.flashlight = null;
    }
  }

  /** Bir eylem animasyonu başlat */
  play(type, dur = 0.6, kind = null) { this.action = { type, t: 0, dur, kind }; }
  flinch(dir = 1) { this.hit = { t: 0, dir }; }

  /**
   * a: anim durumu {mode, speed, moveAngle, vy, aim, pitch, crouch, sprint, steer, emote}
   */
  update(dt, a) {
    this.t += dt;
    const p = this.pose, tmp = this.tmp;
    const sp = a.speed || 0;
    this.speedSm = damp(this.speedSm, sp, 10, dt);
    const s = this.speedSm;
    const mode = a.mode || 'ground';
    // faz ilerlemesi (adım uzunluğu ~ hıza göre)
    const stride = s < 2.5 ? 1.15 : s < 5 ? 1.55 : 1.85;
    this.phase += (s / stride) * Math.PI * dt;
    this.blend.crouch = damp(this.blend.crouch, mode === 'crouch' ? 1 : 0, 10, dt);
    this.blend.aim = damp(this.blend.aim, a.aim ? 1 : 0, 14, dt);
    this.blend.air = damp(this.blend.air, mode === 'air' ? 1 : 0, 12, dt);
    const run01 = Math.max(0, Math.min(2, (s - 2.2) / 2.2));
    let baseHandled = false;
    switch (mode) {
      case 'drive': A.seated(p, a.steer || 0, this.t, true); baseHandled = true; break;
      case 'seat': A.seated(p, 0, this.t, false); baseHandled = true; break;
      case 'downed': A.downed(p, this.t, Math.min(1, s)); baseHandled = true; break;
      case 'sleep': A.sleeping(p, this.t); baseHandled = true; break;
      case 'climb': A.climb(p, this.phase * 1.5); baseHandled = true; break;
      case 'prone': A.prone(p, this.phase * 0.8, Math.min(1, s)); baseHandled = true; break;
      case 'carried': A.carriedPose(p, this.t); baseHandled = true; break;
      case 'dead': A.downed(p, 0, 0); baseHandled = true; break;
      default: break;
    }
    if (!baseHandled) {
      if (s < 0.15) A.idle(p, this.t, a.mood || 0);
      else A.locomotion(p, this.phase, run01, this.t);
      if (this.blend.crouch > 0.01) { A.crouch(tmp, this.phase, Math.min(1, s / 1.5), this.t); p.blend(tmp, this.blend.crouch); }
      if (this.blend.air > 0.01) { A.airborne(tmp, a.vy || 0, this.t); p.blend(tmp, this.blend.air); }
      // emote
      if (a.emote) { A.emote(tmp, a.emote, this.t); p.blend(tmp, 1); }
    }
    // üst gövde: tutuş / nişan
    this.rig.setArmIK('Left', null);
    if (!baseHandled || mode === 'climb') {
      const hk = this.holdKind;
      if (this.heldId && mode !== 'climb') {
        if (hk === 'pistol' || hk === 'rifle' || hk === 'bow') {
          const aimW = Math.max(this.blend.aim, 0.35);
          tmp.copy(p);
          A.aim(tmp, hk, a.pitch || 0, a.recoil || 0);
          p.blendMasked(tmp, hk === 'pistol' && this.blend.aim < 0.5 ? aimW * 0.0 + 0 : aimW, UPPER_MASK);
          if (hk === 'pistol' && this.blend.aim < 0.5) {
            // silah aşağıda tutulur
            p.set('RightArm', (-20 - s * 4) * D, 0, 70 * D); p.set('RightForeArm', 0, 40 * D, 0); A.grip(p, 'Right', 1);
          }
          if (hk === 'rifle' && aimW > 0.3) {
            // sol el kabzaya (IK)
            const pd = a.pitch || 0;
            const target = _v.set(-0.12, 1.42 - Math.sin(pd) * 0.0 + Math.sin(pd) * 0.45, 0.62 * Math.cos(pd));
            this.rig.setArmIK('Left', target, new THREE.Vector3(1, -1.2, -0.2));
          }
        } else if (hk === 'melee1' || hk === 'melee2') {
          // yürürken silahı omuzda/yanda taşı
          p.add('RightArm', -12 * D, 0, -8 * D);
          p.add('RightForeArm', 0, 35 * D, 0);
          A.grip(p, 'Right', 1);
        } else if (hk === 'flashlight') {
          p.set('RightArm', (-55 + (a.pitch || 0) / D * -0.5) * D, -10 * D, 85 * D); p.set('RightForeArm', 0, 10 * D, 0); A.grip(p, 'Right', 1);
        } else {
          A.grip(p, 'Right', 0.8);
          p.add('RightForeArm', 0, 25 * D, 0);
        }
      }
    }
    if (a.carrying) A.carryPose(p);
    // eylem katmanı
    const act = this.action;
    if (act) {
      act.t += dt;
      const k = Math.min(1, act.t / act.dur);
      switch (act.type) {
        case 'melee': tmp.copy(p); A.meleeSwing(tmp, k, act.kind === 'melee2'); p.blendMasked(tmp, 1, UPPER_MASK); break;
        case 'search': A.search(tmp, this.t, act.kind === 'low' ? 0.7 : 0.2); p.blend(tmp, Math.min(1, act.t * 5)); break;
        case 'pickup': A.pickup(tmp, k); p.blend(tmp, Math.sin(k * Math.PI)); break;
        case 'consume': A.consume(p, k); break;
        case 'hammer': A.hammer(p, this.t); break;
        case 'shoot': break;
        case 'reload': p.add('LeftArm', -30 * Math.sin(k * Math.PI) * D, 0, 20 * D); p.add('Head', 15 * Math.sin(k * Math.PI) * D, 0, 0); break;
        case 'throw': { const kk = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6; p.set('RightArm', (-150 * kk + 40 * (1 - kk)) * D, 0, 40 * D); p.set('RightForeArm', 0, 40 * kk * D, 0); break; }
        case 'wave': case 'cheer': case 'dance': case 'laugh': case 'point': A.emote(tmp, act.type, this.t); p.blend(tmp, Math.min(1, act.t * 4, (act.dur - act.t) * 4)); break;
        case 'revive': A.search(tmp, this.t * 0.6, 0.9); p.blend(tmp, Math.min(1, act.t * 4)); break;
        case 'fish': p.set('RightArm', -70 * D, 0, 50 * D); p.set('RightForeArm', 0, 40 * D, 0); p.set('LeftArm', -60 * D, 0, -50 * D); p.set('LeftForeArm', 0, -50 * D, 0); break;
        default: break;
      }
      if (act.t >= act.dur && !act.loop) this.action = null;
    }
    // darbe tepkisi
    if (this.hit) {
      this.hit.t += dt;
      A.hitReact(p, this.hit.t / 0.35, this.hit.dir);
      if (this.hit.t > 0.35) this.hit = null;
    }
    // bakış: kafa pitch
    if (!baseHandled && !this.heldId) p.add('Head', -(a.pitch || 0) * 0.35, 0, 0);
    this.rig.apply(p);
    // gövde dönüşü
    if (a.yaw !== undefined) this.visYaw = dampAngle(this.visYaw, a.yaw, a.instantYaw ? 40 : 14, dt);
    this.root.rotation.y = this.visYaw;
    // yere yatma modları: kök eğimi
    const lay = mode === 'prone' ? -Math.PI / 2 + 0.15 : mode === 'downed' || mode === 'dead' ? Math.PI / 2 - 0.05 : mode === 'sleep' ? Math.PI / 2 : 0;
    this.ch.model.rotation.x = damp(this.ch.model.rotation.x, lay, 8, dt);
    const layLift = mode === 'prone' ? 0.25 : mode === 'downed' || mode === 'dead' ? 0.28 : mode === 'sleep' ? 0.3 : 0;
    this.ch.model.position.y = damp(this.ch.model.position.y, layLift, 8, dt);
    this.ch.model.position.z = damp(this.ch.model.position.z, mode === 'prone' ? -0.75 : mode === 'downed' || mode === 'dead' || mode === 'sleep' ? 0.75 : 0, 8, dt);
    if (this.flashlight) {
      const pd = a.pitch || 0;
      this.flashlight.target.position.set(0, 1.4 - Math.sin(pd) * 8, Math.cos(pd) * 8);
    }
  }

  dispose() {
    this.hold(null);
    this.setFlashlight(false);
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
