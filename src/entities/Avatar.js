// Avatar: görsel karakter + animatör. Yerel oyuncu, ağ oyuncuları, NPC'ler ve yapay zekâ
// takım arkadaşları aynı sınıfı kullanır. Aktarılmış hareket kütüphanesi (Motion, UAL klipleri) varsa temel
// katman ve eylemler onunla oynar (updateMotion); yoksa aşağıdaki eski düzen (yedek):
//  1) Klip hareketi (AnimationMixer): bekleme, yürüme, koşu, geri ve yana koşu; hıza ve hareket yönüne
//     göre ağırlıklandırılır, tüm döngüler ortak fazla senkron ilerler (ayak kayması olmaz).
//  2) Maskeli klip katmanları: yumruk, kılıç savurma, darbe tepkisi, etkileşim, el sallama, takla, ölüm.
//  3) Prosedürel pozlar (CharacterRig): eğilme, sürünme, yüzme, oturma/sürüş, yaralı yatma, tırmanma,
//     zıplama, silah nişanı (kafa/gövde eğimi + IK), eşya tutuşları — kemik başına ağırlıkla karışır.
import * as THREE from 'three';
import { Pose, UPPER_MASK, RARM_MASK, LARM_MASK, ARMS_MASK, D, RIG_MASK, RIG_BONES, UPPER_BONE_RE, BONES } from './CharacterRig.js';
import * as A from './Animations.js';
import { baseOf } from './CharacterFactory.js';
import { Motion } from './Motion.js';
import { FootIK } from './FootIK.js';
import { ITEMS } from '../data/items.js';
import { damp, dampAngle, smoothstep, clamp, wrapAngle } from '../core/util.js';

// Eldeki eşya tutuş ofsetleri (el bağlantı noktası uzayı, T-poz eksenleri; metre)
const HOLDS = {
  melee1: { pos: [-0.075, -0.015, 0.03], rot: [0, 0, 1.45], fwd: 0.35 },
  melee2: { pos: [-0.075, -0.015, 0.03], rot: [0, 0, 1.45], fwd: 0.45 },
  pistol: { pos: [-0.08, -0.015, 0.035], rot: [0, -Math.PI / 2, Math.PI / 2], fwd: 0.05 },
  rifle: { pos: [-0.09, -0.02, 0.045], rot: [0, -Math.PI / 2, Math.PI / 2], fwd: 0.18 },
  bow: { pos: [-0.05, 0, 0.03], rot: [Math.PI / 2, 0, Math.PI / 2], fwd: 0 },
  flashlight: { pos: [-0.08, -0.015, 0.03], rot: [0, -Math.PI / 2, Math.PI / 2], fwd: 0.05 },
  binoculars: { pos: [-0.07, 0, 0.05], rot: [0, 0, 0], fwd: 0 },
  rod: { pos: [-0.075, -0.015, 0.03], rot: [0, 0, 1.2], fwd: 0.5 },
  small: { pos: [-0.07, -0.02, 0.04], rot: [0, 0, 0], fwd: 0 },
};

// Klip katmanları: hangi klip, hangi kemikler, ağırlık
const OVERLAYS = {
  punchR: { clip: 'Punch_Right', re: UPPER_BONE_RE, w: 1 },
  punchL: { clip: 'Punch_Left', re: UPPER_BONE_RE, w: 1 },
  slash: { clip: 'Sword_Slash', re: UPPER_BONE_RE, w: 1 },
  hit: { clip: 'HitRecieve', re: UPPER_BONE_RE, w: 0.8 },
  hit2: { clip: 'HitRecieve_2', re: UPPER_BONE_RE, w: 0.8 },
  interact: { clip: 'Interact', re: UPPER_BONE_RE, w: 1 },
  wave: { clip: 'Wave', re: UPPER_BONE_RE, w: 1 },
  roll: { clip: 'Roll', re: null, w: 1 },
  death: { clip: 'Death', re: null, w: 1, clamp: true },
  kick: { clip: 'Kick_Right', re: null, w: 1 },
};

// Eylem → aktarılmış klip (Motion). dur: oyunun istediği süre; loop: eylem süresince tekrar; mask: katman
// moving: hareket halindeyken kullanılacak (üst gövde) alternatif. Klibi olmayan eylemler prosedürel kalır.
const UAL_ACTIONS = {
  kick: { clip: 'Kick', mask: 'full', fadeIn: 0.08 },
  roll: { clip: 'Roll', mask: 'full', to: 0.92, fadeIn: 0.06, fadeOut: 0.14 },
  dodgeL: { clip: 'Dodge_Left', mask: 'full', fadeIn: 0.06 },
  dodgeR: { clip: 'Dodge_Right', mask: 'full', fadeIn: 0.06 },
  interact: { clip: 'Interact', mask: 'upper', from: 0.08, to: 0.8 },
  pickup: { clip: 'PickUp_Kneeling', mask: 'full', from: 0.12, to: 0.82, minDur: 0.95, moving: { clip: 'PickUp_Table', mask: 'upper', from: 0.1, to: 0.9 } },
  search: { clip: 'Fixing_Kneeling', mask: 'full', loop: true, fadeIn: 0.25, moving: { clip: 'Interact', mask: 'upper', loop: true } },
  searchHigh: { clip: 'Chest_Open', mask: 'upper', loop: true, fadeIn: 0.2 },
  revive: { clip: 'Fixing_Kneeling', mask: 'full', loop: true, fadeIn: 0.3 },
  bandage: { clip: 'Bandage_Loop', mask: 'upper', loop: true, fadeIn: 0.2 },
  consume: { clip: 'Consume', mask: 'upper', fadeIn: 0.15 },
  drink: { clip: 'Drink', mask: 'upper', from: 0.1, to: 0.85, fadeIn: 0.15 },
  hammer: { clip: 'Mining_Loop', mask: 'upper', loop: true, fadeIn: 0.2, rate: 0.85 },
  chop: { clip: 'TreeChopping_Loop', mask: 'full', loop: true, fadeIn: 0.2 },
  throw: { clip: 'OverhandThrow', mask: 'upper', from: 0.15, to: 0.85, fadeIn: 0.06 },
  reloadPistol: { clip: 'Pistol_Reload', mask: 'arms', from: 0.05, to: 0.95, fadeIn: 0.1 },
  cheer: { clip: 'Celebration', mask: 'full', loop: true, to: 0.62, fadeIn: 0.2, emote: true },
  dance: { clip: 'Dance_Loop', mask: 'full', loop: true, fadeIn: 0.25, rate: 1, emote: true },
  yes: { clip: 'Yes', mask: 'upper', fadeIn: 0.2 },
  no: { clip: 'Idle_No_Loop', mask: 'upper', fadeIn: 0.2 },
  surprise: { clip: 'Surprise', mask: 'upper', to: 0.7, fadeIn: 0.1 },
  push: { clip: 'Push_Loop', mask: 'full', loop: true, fadeIn: 0.25 },
  fish: { clip: 'Fish_Cast', mask: 'full', fadeIn: 0.2, then: { clip: 'Fish_Cast_Idle_Loop', mask: 'full', loop: true, fadeIn: 0.4 } },
  jump: { clip: 'Jump_Start', mask: 'full', from: 0.08, to: 0.3, fadeIn: 0.04, fadeOut: 0.12, fixed: 0.24 },
  land: { clip: 'Jump_Land', mask: 'full', from: 0.06, to: 0.5, fadeIn: 0.04, fadeOut: 0.18, fixed: 0.45, still: true },
  vault: { clip: 'SafetyVault', mask: 'full', fadeIn: 0.05, fadeOut: 0.1 },
  climbUp: { clip: 'ClimbUp_1m', mask: 'full', fadeIn: 0.05, fadeOut: 0.12 },
  climbUp2: { clip: 'ClimbUp_2m', mask: 'full', fadeIn: 0.05, fadeOut: 0.15 },
  ladderIn: { clip: 'Climb_Enter', mask: 'full', from: 0.1, to: 0.95, fadeIn: 0.08, fadeOut: 0.2 },
  ladderOut: { clip: 'Climb_Exit', mask: 'full', from: 0.05, to: 0.9, fadeIn: 0.06, fadeOut: 0.25 },
};
const HIT_CLIPS = ['Hit_Chest', 'Hit_Head', 'Hit_Stomach', 'Hit_Shoulder_L', 'Hit_Shoulder_R'];
// kişilik → kıpırdanma türleri (Animations.fidget) ve elde beliren alet (eşya modeli)
const FIDGETS = {
  relaxed: ['tinker', 'tinker', 'stretch'], observer: ['binoculars', 'binoculars', 'peek'], heavy: ['stretch'], confident: ['boxing', 'stretch'],
  calm: ['watch'], formal: ['watch'], agile: ['peek'], default: ['stretch'],
};
const FIDGET_PROPS = { tinker: 'wrench', binoculars: 'binoculars' };
// ağda uzak oyunculara yansıtılan eylemler (takla ve ifadeler anim durumunda ayrıca taşınır)
const REPLICATED = new Set(['melee', 'kick', 'reload', 'throw', 'pickup', 'search', 'revive', 'bandage', 'drink', 'consume', 'hammer', 'chop', 'fish', 'vault', 'climbUp', 'climbUp2', 'ladderIn', 'ladderOut', 'jump', 'land', 'interact', 'push', 'stop']);

// Poz sözlüğü ↔ iskelet maskeleri
const VSPINE = ['Spine', 'Chest', 'UpperChest', 'Neck', 'Head'].map((n) => BONES.indexOf(n));
const VRHAND = ['RightHandIndex1', 'RightHandIndex2', 'RightHandThumb1'].map((n) => BONES.indexOf(n));
const MASKS = {
  upper: { v: UPPER_MASK, r: RIG_MASK.upper },
  arms: { v: ARMS_MASK, r: RIG_MASK.arms },
  rarm: { v: RARM_MASK, r: RIG_MASK.rarm },
  larm: { v: LARM_MASK, r: RIG_MASK.larm },
  spine: { v: VSPINE, r: RIG_MASK.spine },
  rarmSpine: { v: [...RARM_MASK, ...VSPINE], r: [...RIG_MASK.rarm, ...RIG_MASK.spine] },
  armsSpine: { v: [...ARMS_MASK, ...VSPINE], r: [...RIG_MASK.arms, ...RIG_MASK.spine] },
  rhand: { v: VRHAND, r: RIG_MASK.rhand },
};

const LOCO = ['Idle', 'Walk', 'Run', 'Run_Back', 'Run_Left', 'Run_Right'];
const FULL_MODES = new Set(['drive', 'seat', 'downed', 'sleep', 'climb', 'prone', 'carried', 'swim']);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();

/**
 * AnimationMixer bir özelliğin değeri önceki kareyle aynıysa sahneye yazmaz. Biz kemikleri klipten sonra
 * (katman/prosedürel) değiştirdiğimiz için her karede yeniden yazılmalı: son biriktiriciyi hafifçe boz.
 */
function forceRewrite(mixer) {
  const n = mixer._nActiveBindings, B = mixer._bindings, acc = mixer._accuIndex;
  if (!B) return;
  for (let i = 0; i < n; i++) {
    const pm = B[i];
    if (pm && pm.buffer) pm.buffer[pm.valueSize * (1 + acc)] += 1e-6;
  }
}

/** Bir klibin seçili kemik izlerini elle örnekleyip mevcut poza karıştırır */
export class ClipLayer {
  constructor(model, clip, re) {
    this.clip = clip;
    this.re = re;
    this.items = [];
    const nodes = {};
    model.traverse((o) => { if (o.isBone) nodes[o.name] = o; });
    for (const t of clip.tracks) {
      const dot = t.name.lastIndexOf('.');
      const nodeName = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
      const node = nodes[nodeName];
      if (!node || (prop !== 'quaternion' && prop !== 'position')) continue;
      if (re && !re.test(nodeName)) continue;
      this.items.push({ node, q: prop === 'quaternion', interp: t.createInterpolant() });
    }
  }
  apply(time, w) {
    for (const it of this.items) {
      const r = it.interp.evaluate(time);
      if (it.q) { _q.set(r[0], r[1], r[2], r[3]); if (w >= 1) it.node.quaternion.copy(_q); else it.node.quaternion.slerp(_q, w); }
      else { _v.set(r[0], r[1], r[2]); if (w >= 1) it.node.position.copy(_v); else it.node.position.lerp(_v, w); }
    }
  }
}

export class Avatar {
  constructor(game, look, opts = {}) {
    this.game = game;
    this.opts = opts;
    this.build(look);
    this.pose = new Pose();
    this.tmp = new Pose();
    this.pu = new Pose();
    this.weights = new Float32Array(RIG_BONES.length);
    this.phase = 0;
    this.cycle = 0;
    this.t = Math.random() * 10;
    this.speedSm = 0;
    this.angSm = 0;
    this.lean = 0;
    this.blend = { full: 0, crouch: 0, air: 0, aim: 0, hold: 0 };
    this.heldId = null;
    this.heldObj = null;
    this.flashlight = null;
    this.action = null; // {type, t, dur, kind}
    this.yaw = 0;
    this.visYaw = 0;
    this.lastYaw = 0;
    this.pitch = 0;
    this.nameTag = null;
    if (opts.name) this.setNameTag(opts.name, opts.color);
  }

  build(look) {
    const game = this.game;
    this.ch = game.charFactory.create(look, this.opts);
    this.root = this.root || new THREE.Group();
    // kök sabit kalır (Player/NPC konumlandırır); model alt nesne olarak değişebilir
    if (this.ch.root !== this.root) { for (const c of [...this.ch.root.children]) this.root.add(c); }
    this.ch.root = this.root;
    this.rig = this.ch.rig;
    this.motion = this.ch.anim ? new Motion(this.ch, { persona: look && look.persona }) : null;
    this.footIK = this.motion ? new FootIK(this.ch) : null;
    this._dead = false; this._sleep = false; this._emote = null; this.later = [];
    this.mixer = new THREE.AnimationMixer(this.ch.model);
    this.actions = {};
    for (const n of this.motion ? [] : LOCO) {
      const clip = this.ch.clips[n];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(n === 'Idle' ? 1 : 0);
      if (n !== 'Idle') a.timeScale = 0; // zaman elle (ortak faz)
      this.actions[n] = a;
    }
    this.layers = {}; // ad → ClipLayer (tembel)
    this.overlays = []; // etkin katmanlar
    // hareket kliplerinin sürdüğü düğümler; katmanların dokunup bunların sürmediği düğümler her karede bağlama pozuna döner
    this.clipNodes = new Set();
    for (const n of LOCO) { const c = this.ch.clips[n]; if (c) for (const t of c.tracks) this.clipNodes.add(t.name); }
    this.bindPose = new Map();
    this.ch.model.traverse((o) => { if (o.isBone) this.bindPose.set(o, { q: o.quaternion.clone(), p: o.position.clone() }); });
    this.extraNodes = new Set();
    this.gait = this.ch.gait;
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  layer(name) {
    if (!this.layers[name]) {
      const def = OVERLAYS[name];
      const clip = this.ch.clips[def.clip];
      this.layers[name] = clip ? new ClipLayer(this.ch.model, clip, def.re) : null;
      if (this.layers[name]) for (const it of this.layers[name].items) if (!this.clipNodes.has(it.node.name + (it.q ? '.quaternion' : '.position'))) this.extraNodes.add(it);
    }
    return this.layers[name];
  }

  /** Klip katmanı başlat. dur: istenen süre (sn; klip buna ölçeklenir) */
  overlay(name, dur = null, opts = {}) {
    const L = this.layer(name);
    if (!L) return;
    const def = OVERLAYS[name];
    // aynı gruptaki eski katmanı bitir
    this.overlays = this.overlays.filter((o) => o.name !== name && !(opts.replace && opts.replace.includes(o.name)));
    const clipDur = L.clip.duration;
    this.overlays.push({ name, L, t: 0, speed: dur ? clipDur / dur : 1, w: def.w * (opts.w ?? 1), clamp: !!def.clamp, fadeIn: opts.fadeIn ?? 0.08, fadeOut: opts.fadeOut ?? 0.15, hold: !!opts.hold });
  }

  stopOverlay(name) { for (const o of this.overlays) if (o.name === name) { o.hold = false; o.clamp = false; o.t = Math.max(o.t, o.L.clip.duration - o.fadeOut * o.speed); } }

  /** Görünümü değiştir (erkek ↔ kadın değişirse model yeniden kurulur) */
  setLook(look) {
    if (baseOf(look) !== this.ch.base.name) {
      const held = this.heldId;
      this.hold(null);
      this.ch.model.parent && this.ch.model.parent.remove(this.ch.model);
      this.build(look);
      if (held) this.hold(held);
      return;
    }
    this.game.charFactory.applyLook(this.ch, look);
  }

  setNameTag(name, color = '#ffffff') {
    if (this.nameTag) { this.root.remove(this.nameTag); this.nameTag.material.map.dispose(); }
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '28px "Luckiest Guy", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(name, 128, 32);
    g.fillStyle = color; g.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    sp.scale.set(1.6, 0.4, 1);
    sp.position.y = 2.2;
    sp.renderOrder = 5;
    this.root.add(sp);
    this.nameTag = sp;
  }

  /** Eldeki eşyayı değiştir */
  hold(itemId) {
    if (this.heldId === itemId) return;
    this.heldId = itemId;
    if (this.heldObj) { this.heldObj.parent.remove(this.heldObj); this.heldObj = null; }
    this.holdKind = null;
    if (!itemId) return;
    const def = ITEMS[itemId];
    const obj = this.game.itemModels.make(itemId);
    const hk = def.hold || 'small';
    const h = HOLDS[hk] || HOLDS.small;
    const holder = new THREE.Group();
    holder.position.set(...h.pos);
    holder.rotation.set(...h.rot);
    obj.position.x = h.fwd * 0.6;
    holder.add(obj);
    holder.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // model ölçeği (beden) eşyayı büyütmesin
    const ms = this.ch.model.scale;
    holder.scale.set(1 / ms.x, 1 / ms.y, 1 / ms.z);
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
  play(type, dur = 0.6, kind = null, off = 0) {
    // ağ eşitlemesi: yerel eylemler sıra numarasıyla anim durumuna yazılır, uzak avatar aynısını oynar;
    // başlangıç zamanı (actT: geçen süre) da gider → uzak avatar klibi ağ gecikmesi kadar ileriden başlatır
    if (REPLICATED.has(type)) { this.lastAct = [((this.lastAct && this.lastAct[0]) || 0) + 1, type, Math.round(dur * 100) / 100, kind]; this.lastActAt = performance.now(); }
    if (off > 0 && type !== 'stop' && off > dur + 0.25) return; // uzak eylem çoktan bitmiş
    if (this.motion && this.playMotion(type, dur, kind, off)) return;
    if (type === 'bandage') type = 'search';
    else if (type === 'drink') type = 'consume';
    switch (type) {
      case 'melee':
        if (!this.heldId) { this.punchSide = !this.punchSide; this.overlay(this.punchSide ? 'punchR' : 'punchL', dur * 1.25, { replace: ['punchR', 'punchL'] }); }
        else this.overlay('slash', dur * 1.15, { fadeIn: 0.05 });
        return;
      case 'wave': this.overlay('wave', Math.max(1.2, dur)); return;
      case 'roll': this.overlay('roll', dur, { fadeIn: 0.06, fadeOut: 0.12 }); return;
      case 'kick': this.overlay('kick', dur); return;
      case 'interact': this.overlay('interact', dur); return;
      case 'jump': case 'land': case 'vault': case 'shoot': return; // fizik/duruşla yönetilir
      default: break;
    }
    this.action = { type, t: Math.max(0, Math.min(off, dur * 0.9)), dur, kind };
  }

  flinch(dir = 1) {
    if (this.motion && this.motion.play(HIT_CLIPS[Math.floor(Math.random() * HIT_CLIPS.length)], { mask: 'upper', w: dir < 0 ? 0.6 : 0.95, fadeIn: 0.03, fadeOut: 0.16, group: 'hit' })) return;
    this.overlay(Math.random() < 0.5 ? 'hit' : 'hit2', 0.45, { w: dir < 0 ? 0.6 : 1, fadeIn: 0.04 });
  }

  /**
   * Eylemi aktarılmış klip olarak oynat (Motion). false: bu eylemin klibi yok → prosedürel/eski yol.
   * Etkileşim/onarım gibi süreli eylemler this.action'da izlenir (dış sistemler action'ı null yaparak bitirir).
   */
  playMotion(type, dur, kind, off = 0) {
    const M = this.motion;
    // uzak eylem: klibi geçen süre kadar ileriden başlat (giriş sönümü atlanır)
    const adv = (shot) => {
      if (shot && off > 0) { const a = Math.min(off, ((shot.to - shot.from) / Math.max(1e-3, shot.rate)) * 0.9); shot.t = Math.min(shot.to - 1e-3, shot.t + a * shot.rate); shot.age = Math.max(shot.age || 0, Math.min(a, shot.fadeIn)); }
      return shot;
    };
    if (type === 'melee') {
      const o = { mask: 'upper', group: 'attack', fadeIn: 0.05, fadeOut: 0.16 };
      if (!this.heldId) { this.punchSide = !this.punchSide; return !!adv(M.play(this.punchSide ? 'Punch_Jab' : 'Punch_Cross', { ...o, dur: dur * 1.25 })); }
      this.swingN = ((this.swingN || 0) + 1) % 2;
      return !!adv(M.play(this.swingN ? 'Sword_Regular_A' : 'Sword_Regular_B', { ...o, dur: dur * 1.15, from: 0.02 }));
    }
    let key = type;
    if (type === 'stop') { if (this.action && this.action.motion) { M.stopShot(this.action.shot); if (this.action.next) M.stopShot(this.action.next); } this.action = null; this._mAct = null; return true; }
    if (type === 'reload') { if (this.holdKind !== 'pistol') return false; key = 'reloadPistol'; }
    const d = UAL_ACTIONS[key];
    if (!d) return false;
    const moving = this.speedSm > 0.6;
    if (d.still && moving) return true; // koşarken iniş: klip yok (adım devam eder)
    const def = d.moving && moving ? d.moving : d;
    const o = { mask: def.mask, from: def.from, to: def.to, fadeIn: def.fadeIn, fadeOut: def.fadeOut, loop: !!def.loop, group: d.emote ? 'emote' : 'act', rate: def.rate };
    const total = d.fixed ?? Math.max(dur, d.minDur || 0);
    if (!def.loop) { o.dur = total; delete o.rate; }
    if (['jump', 'land', 'vault', 'climbUp', 'climbUp2', 'ladderIn', 'ladderOut', 'roll', 'kick', 'dodgeL', 'dodgeR'].includes(key)) { o.group = 'move'; return !!adv(M.play(def.clip, o)); }
    const shot = adv(M.play(def.clip, o));
    if (!shot) return false;
    this.action = { type, t: off > 0 ? Math.min(off, total * 0.9) : 0, dur: total, kind, shot, motion: true, then: def.then || d.then || null, loop: false, loopish: !!def.loop };
    this._mAct = this.action;
    return true;
  }

  /**
   * a: anim durumu {mode, speed, moveAngle, vy, aim, pitch, sprint, steer, emote, carrying, yaw}
   */
  update(dt, a) {
    this.t += dt;
    const p = this.pose, pu = this.pu, tmp = this.tmp;
    const mode = a.mode || 'ground';
    const s = this.speedSm = damp(this.speedSm, a.speed || 0, 10, dt);
    // prosedürel döngü fazı (yarım döngü = bir adım)
    const stride = s < 2.5 ? 1.15 : s < 5 ? 1.55 : 1.85;
    this.phase += (s / stride) * Math.PI * dt;
    this.angSm = a.moveAngle !== undefined ? this.angSm + wrapAngle(a.moveAngle - this.angSm) * Math.min(1, dt * 10) : damp(this.angSm, 0, 6, dt);
    const dead = mode === 'dead';
    // uzak oyuncu taklası (ağ durumundan yükselen kenar)
    if (a.roll && !this._rolling && !this.overlays.some((o) => o.name === 'roll') && !(this.motion && this.motion.playing('Roll'))) this.play('roll', 0.72);
    this._rolling = !!a.roll;
    // uzak oyuncunun eylemi (sıra numarası değişince bir kez), başlangıç zamanıyla: klip, gönderenin paketi yolladığı anda
    // geçmiş süre (actT) kadar ileriden başlar → aynı paketteki konumla eş zamanlı (konum da gecikmeli gösterilir; ağ
    // gecikmesi ayrıca eklenmez). İlk görüşte eylem hâlâ sürüyorsa kaldığı yerden oynar; bitmiş eylem oynatılmaz
    if (a.act && a.act !== this.lastAct) {
      if (this._ractN === undefined) {
        this._ractN = a.act[0];
        if (a.actT !== undefined && a.act[1] !== 'stop' && a.actT < (a.act[2] || 0)) this.play(a.act[1], a.act[2], a.act[3], Math.max(0, a.actT));
      } else if (a.act[0] !== this._ractN) { this._ractN = a.act[0]; this.play(a.act[1], a.act[2], a.act[3], Math.max(0, a.actT || 0)); }
    }
    if (this.motion) { this.updateMotion(dt, a, mode, s, dead); return; }
    // ---- prosedürel tam gövde modları
    const full = FULL_MODES.has(mode);
    this.blend.full = damp(this.blend.full, full ? 1 : 0, 9, dt);
    this.blend.crouch = damp(this.blend.crouch, mode === 'crouch' ? 1 : 0, 10, dt);
    this.blend.air = damp(this.blend.air, mode === 'air' ? 1 : 0, 12, dt);
    this.blend.aim = damp(this.blend.aim, a.aim ? 1 : 0, 14, dt);
    // ---- 1) klip hareketi: ortak faz, hız/yön ağırlıkları
    const g = this.gait;
    const runW = smoothstep(1.9, 3.0, s);
    const cycleDist = (g.walk + (g.run - g.walk) * runW) * (1 + 0.45 * smoothstep(4.3, 7, s));
    const prevCycle = this.cycle;
    this.cycle = (this.cycle + dt * s / cycleDist) % 1;
    const idleW = 1 - smoothstep(0.12, 0.55, s);
    // ayak sesi: ayak yere bastığında (döngünün iki temas noktası) oturuma bildir
    if (idleW < 0.6 && (mode === 'ground' || mode === 'crouch') && this.game.session && this.game.session.onAvatarStep) {
      const cross = (a, b, t) => (a <= b ? t > a && t <= b : t > a || t <= b);
      if (cross(prevCycle, this.cycle, 0.02) || cross(prevCycle, this.cycle, 0.52)) this.game.session.onAvatarStep(this, s, mode);
    }
    const moveW = 1 - idleW;
    const ang = this.angSm;
    let fw = Math.max(0, Math.cos(ang)), bw = Math.max(0, -Math.cos(ang)), lw = Math.max(0, Math.sin(ang)), rw = Math.max(0, -Math.sin(ang));
    const tot = fw + bw + lw + rw || 1;
    fw /= tot; bw /= tot; lw /= tot; rw /= tot;
    const W = { Idle: idleW, Walk: moveW * fw * (1 - runW), Run: moveW * fw * runW, Run_Back: moveW * bw, Run_Left: moveW * lw, Run_Right: moveW * rw };
    const procOnly = this.blend.full > 0.995 || (dead && this.overlays.some((o) => o.name === 'death' && o.t > 0.3));
    for (const n of LOCO) {
      const act = this.actions[n];
      if (!act) continue;
      act.setEffectiveWeight(W[n]);
      if (n !== 'Idle') act.time = this.cycle * act.getClip().duration;
    }
    // klip dışı düğümleri bağlama pozuna al (ör. ölüm klibinin döndürdüğü kök)
    for (const it of this.extraNodes) { const r = this.bindPose.get(it.node); if (r) { if (it.q) it.node.quaternion.copy(r.q); else it.node.position.copy(r.p); } }
    if (!procOnly) { this.mixer.update(dt); forceRewrite(this.mixer); }
    // ---- 2) klip katmanları
    if (dead && !this.overlays.some((o) => o.name === 'death')) this.overlay('death', null, { fadeIn: 0.12, hold: true });
    if (!dead && this.overlays.some((o) => o.name === 'death')) this.overlays = this.overlays.filter((o) => o.name !== 'death');
    let overUpper = 0;
    for (let i = this.overlays.length - 1; i >= 0; i--) {
      const o = this.overlays[i];
      o.t += dt * o.speed;
      const D0 = o.L.clip.duration;
      let w;
      const tIn = o.t / Math.max(1e-3, o.fadeIn * o.speed), tOut = (D0 - o.t) / Math.max(1e-3, o.fadeOut * o.speed);
      if (o.clamp || o.hold) w = Math.min(1, tIn);
      else w = Math.max(0, Math.min(1, tIn, tOut));
      if (!o.clamp && !o.hold && o.t >= D0) { this.overlays.splice(i, 1); continue; }
      o.L.apply(Math.min(o.t, D0 - 1e-3), w * o.w);
      overUpper = Math.max(overUpper, w * o.w);
    }
    // ---- 3) prosedürel poz + kemik ağırlıkları
    const wts = this.weights;
    wts.fill(0);
    let anyProc = false;
    let wFull = 0;
    let lay = 0, layLift = 0, layZ = 0;
    this.rig.autoGround = false;
    this.rig.hipY = mode === 'drive' || mode === 'seat' ? 0.1 : null;
    p.reset();
    if (full || this.blend.full > 0.01) {
      switch (mode) {
        case 'drive': A.seated(p, a.steer || 0, this.t, true); break;
        case 'seat': A.seated(p, 0, this.t, false); break;
        case 'downed': A.downed(p, this.t, Math.min(1, s)); lay = Math.PI / 2 - 0.05; layLift = 0.17; layZ = 0.82; break;
        case 'sleep': A.sleeping(p, this.t); lay = Math.PI / 2; layLift = 0.2; layZ = 0.82; break;
        case 'climb': A.climb(p, this.phase * 1.5); break;
        case 'prone': A.prone(p, this.phase * 0.8, Math.min(1, s)); lay = -Math.PI / 2 + 0.12; layLift = 0.16; layZ = -0.86; break;
        case 'carried': A.carriedPose(p, this.t); lay = -Math.PI / 2 + 0.3; break;
        case 'swim': this.swimPh = (this.swimPh || 0) + dt * (1.6 + s * 1.4); A.swim(p, this.swimPh, Math.min(1, s / 2)); lay = -Math.PI / 2 + 0.35; layLift = 0.78; layZ = -0.55; break;
        default: break;
      }
      wFull = this.blend.full;
    }
    if (!full) {
      // eğilme / havada / ifade: klip üzerine tam gövde karışımı
      if (this.blend.crouch > 0.01) {
        A.crouch(tmp, this.phase, Math.min(1, s / 1.5), this.t);
        p.copy(tmp);
        wFull = Math.max(wFull, this.blend.crouch);
        this.rig.autoGround = true;
      }
      if (this.blend.air > 0.01) {
        A.airborne(tmp, a.vy || 0, this.t);
        if (this.blend.crouch > 0.01) p.blend(tmp, this.blend.air); else p.copy(tmp);
        wFull = Math.max(wFull, this.blend.air * 0.85);
      }
      if (a.emote && a.emote !== 'wave') { A.emote(p, a.emote, this.t); wFull = 1; this.rig.autoGround = true; }
      else if (a.emote === 'wave' && !this.overlays.some((o) => o.name === 'wave')) this.overlay('wave', 1.6);
    }
    for (let i = 0; i < wts.length; i++) wts[i] = wFull;
    if (wFull > 0) anyProc = true;
    // ---- tutuşlar (üst gövde katmanı)
    const setMask = (m, w, src) => {
      if (w <= 0) return;
      p.blendMasked(src, 1, MASKS[m].v);
      for (const i of MASKS[m].r) wts[i] = Math.max(wts[i], w);
      anyProc = true;
    };
    const hk = this.holdKind;
    const canHold = this.heldId && mode !== 'climb' && mode !== 'drive' && mode !== 'seat' && mode !== 'sleep' && mode !== 'carried' && mode !== 'swim' && !dead;
    const holdSup = 1 - overUpper; // vuruş klibi oynarken tutuş pozu geri çekilir
    if (canHold && holdSup > 0.01) {
      A.idle(pu, this.t);
      if (hk === 'pistol' || hk === 'rifle' || hk === 'bow') {
        const aimW = this.blend.aim;
        if (hk === 'pistol') {
          if (aimW > 0.02) { A.aim(pu, 'pistol', a.pitch || 0, a.recoil || 0); setMask('rarmSpine', aimW * holdSup, pu); }
          if (aimW < 0.98) {
            A.idle(tmp, this.t);
            tmp.set('RightArm', (-18 - s * 3) * D, 0, 70 * D); tmp.set('RightForeArm', 0, 38 * D, 0); A.grip(tmp, 'Right', 1);
            setMask('rarm', (1 - aimW) * holdSup, tmp);
          }
        } else if (hk === 'rifle') {
          // nişanda tam, değilse namlu aşağıda (alçak hazır duruş)
          const pd = aimW > 0.5 ? (a.pitch || 0) : -0.55;
          A.aim(pu, 'rifle', pd, a.recoil || 0);
          const chestY = this.rig.restData.entries[4].wpos.y;
          const tgt = _v.set(-0.07, chestY + 0.03 + Math.sin(pd) * 0.33, 0.42 * Math.cos(pd));
          this.rig.setArmIK('Left', tgt, new THREE.Vector3(1, -1.2, -0.2));
          setMask('armsSpine', Math.max(0.85, aimW) * holdSup, pu);
        } else {
          if (aimW > 0.02) { A.aim(pu, 'bow', a.pitch || 0, 0); setMask('armsSpine', aimW * holdSup, pu); }
          else { A.idle(tmp, this.t); A.grip(tmp, 'Left', 1); setMask('larm', 0.6 * holdSup, tmp); }
        }
      } else if (hk === 'melee1' || hk === 'melee2') {
        pu.set('RightArm', (-14 - s * 2) * D, 0, 64 * D); pu.set('RightForeArm', 0, 42 * D, 0); A.grip(pu, 'Right', 1);
        setMask('rarm', 0.9 * holdSup, pu);
      } else if (hk === 'flashlight') {
        pu.set('RightArm', (-55 + (a.pitch || 0) / D * -0.5) * D, -10 * D, 85 * D); pu.set('RightForeArm', 0, 10 * D, 0); A.grip(pu, 'Right', 1);
        setMask('rarm', holdSup, pu);
      } else {
        A.grip(pu, 'Right', 0.85);
        setMask('rhand', 1, pu);
      }
    }
    if (!canHold || hk !== 'rifle' || holdSup <= 0.01) this.rig.setArmIK('Left', null);
    if (a.carrying) { pu.reset(); A.idle(pu, this.t); A.carryPose(pu); setMask('arms', 1, pu); }
    // ---- prosedürel eylemler
    const act = this.action;
    if (act) {
      act.t += dt;
      const k = Math.min(1, act.t / act.dur);
      const env = Math.min(1, act.t * 6, (act.dur - act.t) * 6);
      pu.reset(); A.idle(pu, this.t);
      switch (act.type) {
        case 'search': A.search(tmp, this.t, act.kind === 'low' ? 0.7 : 0.2); p.blend(tmp, 1); for (let i = 0; i < wts.length; i++) wts[i] = Math.max(wts[i], Math.max(0, env)); anyProc = true; this.rig.autoGround = true; break;
        case 'revive': A.search(tmp, this.t * 0.6, 0.9); p.blend(tmp, 1); for (let i = 0; i < wts.length; i++) wts[i] = Math.max(wts[i], Math.max(0, env)); anyProc = true; this.rig.autoGround = true; break;
        case 'pickup': A.pickup(tmp, k); p.blend(tmp, 1); { const w = Math.sin(k * Math.PI); for (let i = 0; i < wts.length; i++) wts[i] = Math.max(wts[i], w); } anyProc = true; this.rig.autoGround = true; break;
        case 'consume': A.consume(pu, k); setMask('rarm', Math.max(0, env), pu); break;
        case 'hammer': A.hammer(pu, this.t); setMask('armsSpine', Math.max(0, env), pu); break;
        case 'reload': { const r = Math.sin(k * Math.PI); pu.set('LeftArm', (-55 * r) * D, 0, (-60 + 25 * r) * D); pu.set('LeftForeArm', 0, -95 * r * D, 0); pu.set('Head', 18 * r * D, 0, 0); setMask('larm', r, pu); break; }
        case 'throw': { const kk = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6; pu.set('RightArm', (-150 * kk + 40 * (1 - kk)) * D, 0, 40 * D); pu.set('RightForeArm', 0, 40 * kk * D, 0); setMask('rarm', Math.max(0, env), pu); break; }
        case 'cheer': case 'dance': case 'laugh': case 'point': A.emote(tmp, act.type, this.t); p.blend(tmp, 1); for (let i = 0; i < wts.length; i++) wts[i] = Math.max(wts[i], Math.max(0, env)); anyProc = true; this.rig.autoGround = true; break;
        case 'fish': pu.set('RightArm', -70 * D, 0, 50 * D); pu.set('RightForeArm', 0, 40 * D, 0); pu.set('LeftArm', -60 * D, 0, -50 * D); pu.set('LeftForeArm', 0, -50 * D, 0); setMask('arms', 1, pu); break;
        default: break;
      }
      if (act.t >= act.dur && !act.loop) this.action = null;
    }
    // tam gövde klibi (takla/ölüm/tekme) oynarken prosedürel katman geri çekilir
    let fullOv = 0;
    for (const o of this.overlays) if (!o.L.re && o.name !== 'death') fullOv = Math.max(fullOv, Math.min(1, o.t / Math.max(1e-3, o.fadeIn * o.speed), (o.L.clip.duration - o.t) / Math.max(1e-3, o.fadeOut * o.speed)));
    if (fullOv > 0) for (let i = 0; i < wts.length; i++) wts[i] *= 1 - fullOv;
    if (anyProc) this.rig.apply(p, wts);
    // ---- bakış: baş ve boyun bakış yönüne (yukarı/aşağı) döner
    if (!full && !dead && !a.aim && a.pitch) this.lookPitch(-(a.pitch || 0) * 0.45);
    // ---- 4) kök: yön, eğim, yatma modları
    if (a.yaw !== undefined) this.visYaw = dampAngle(this.visYaw, a.yaw, a.instantYaw ? 40 : 14, dt);
    const yawRate = dt > 0 ? wrapAngle(this.visYaw - this.lastYaw) / dt : 0;
    this.lastYaw = this.visYaw;
    this.root.rotation.y = this.visYaw;
    // koşarken dönüşe doğru yatma
    const leanT = mode === 'ground' && s > 2 ? clamp(-yawRate * s * 0.012, -0.22, 0.22) : 0;
    this.lean = damp(this.lean, leanT, 6, dt);
    const m = this.ch.model;
    m.rotation.z = this.lean;
    m.rotation.x = damp(m.rotation.x, lay, 8, dt);
    m.position.y = damp(m.position.y, layLift, 8, dt);
    m.position.z = damp(m.position.z, layZ, 8, dt);
    if (this.flashlight) {
      const pd = a.pitch || 0;
      this.flashlight.target.position.set(0, 1.4 - Math.sin(pd) * 8, Math.cos(pd) * 8);
    }
    this.secondary(dt, s, yawRate, mode);
  }

  /**
   * Aktarılmış klip düzeni: Motion temel katmanı + eylem klipleri, üstüne prosedürel tutuşlar (silah/el feneri),
   * taşıma, baş eğimi; kök yönü/eğimi ve koltuğa hizalama.
   */
  updateMotion(dt, a, mode, s, dead) {
    const M = this.motion, p = this.pose, pu = this.pu, tmp = this.tmp;
    // ---- ölüm / uyku / ifade (durum kenarları → klipler)
    if (dead !== this._dead) {
      if (dead) M.play(Math.random() < 0.5 ? 'Death01' : 'Death02', { hold: true, group: 'death', fadeIn: 0.12, fadeOut: 0.4 });
      else M.stop('death');
      this._dead = dead;
    }
    const sleep = mode === 'sleep';
    if (sleep !== this._sleep) {
      if (sleep) M.play('IdleToLay', { hold: true, group: 'sleep', from: 0.3, dur: 1.5, fadeIn: 0.2, fadeOut: 0.3 });
      else { M.stop('sleep'); M.play('LayToIdle', { group: 'wake', dur: 1.15, fadeIn: 0.05, fadeOut: 0.25 }); }
      this._sleep = sleep;
    }
    const em = a.emote && UAL_ACTIONS[a.emote] && UAL_ACTIONS[a.emote].emote ? a.emote : null;
    if (em !== this._emote) {
      if (em && !(this.action && this.action.type === em)) this.playMotion(em, 2.6);
      this._emote = em;
    } else if (a.emote === 'wave' && !this.overlays.some((o) => o.name === 'wave')) this.overlay('wave', 1.6);
    // elde kutu/kasa taşıma: üst gövde taşıma döngüsü (bacaklar hareket katmanından)
    if (!!a.carryBox !== !!this._carryBox) {
      if (a.carryBox) M.play('Walk_Carry_Loop', { mask: 'upper', loop: true, group: 'carry', fadeIn: 0.2, fadeOut: 0.2 });
      else M.stop('carry');
      this._carryBox = !!a.carryBox;
    }
    // dış sistem eylemi bitirdiyse (action = null) döngüdeki klibi durdur
    if (this._mAct && this.action !== this._mAct) {
      M.stopShot(this._mAct.shot); if (this._mAct.next) M.stopShot(this._mAct.next);
      if (this._mAct.loopish && this.lastAct) this.lastAct = [this.lastAct[0] + 1, 'stop', 0, null];
      this._mAct = null;
    }
    const act = this.action;
    if (act && act.motion) {
      act.t += dt;
      if (act.then && !act.next && act.shot && act.t >= (act.shot.to - act.shot.from) / Math.max(1e-3, act.shot.rate) - 0.25) {
        const T = act.then;
        act.next = M.play(T.clip, { mask: T.mask, loop: !!T.loop, fadeIn: T.fadeIn, group: 'act2' });
      }
      if (act.t >= act.dur && !act.loop) { M.stopShot(act.shot); if (act.next) M.stopShot(act.next); this.action = null; this._mAct = null; }
    }
    // ---- 1) temel katman + eylem klipleri
    const ms = this._ms || (this._ms = {});
    ms.mode = dead || sleep || mode === 'carried' ? 'ground' : mode;
    ms.speed = mode === 'carried' || dead ? 0 : s; ms.moveAngle = this.angSm; ms.vy = a.vy || 0; ms.tired = !!a.tired; ms.talk = !!a.talk;
    ms.turn = this.yawRate || 0;
    const prevPh = this.cycle;
    M.update(dt, ms);
    const ph = M.phase[M.state] ?? 0;
    this.cycle = ph;
    if (s > 0.4 && (mode === 'ground' || mode === 'crouch') && this.game.session && this.game.session.onAvatarStep) {
      const cross = (x, y, t) => (x <= y ? t > x && t <= y : t > x || t <= y);
      if (cross(prevPh, ph, 0.02) || cross(prevPh, ph, 0.52)) this.game.session.onAvatarStep(this, s, mode);
    }
    // eski klip katmanları (el sallama: tabanın özgün klibi)
    let overUpper = Math.max(M.upperW, M.fullW);
    for (let i = this.overlays.length - 1; i >= 0; i--) {
      const o = this.overlays[i];
      o.t += dt * o.speed;
      const D0 = o.L.clip.duration;
      const tIn = o.t / Math.max(1e-3, o.fadeIn * o.speed), tOut = (D0 - o.t) / Math.max(1e-3, o.fadeOut * o.speed);
      const w = o.clamp || o.hold ? Math.min(1, tIn) : Math.max(0, Math.min(1, tIn, tOut));
      if (!o.clamp && !o.hold && o.t >= D0) { this.overlays.splice(i, 1); continue; }
      o.L.apply(Math.min(o.t, D0 - 1e-3), w * o.w);
      overUpper = Math.max(overUpper, w * o.w);
    }
    // ---- 2) prosedürel katman (taşınma, tutuşlar, klibi olmayan eylemler)
    const wts = this.weights;
    wts.fill(0);
    let anyProc = false, lay = 0, layLift = 0, layZ = 0;
    this.rig.autoGround = false;
    this.rig.hipY = null;
    p.reset();
    const carried = mode === 'carried';
    this.blend.full = damp(this.blend.full, carried ? 1 : 0, 9, dt);
    this.blend.aim = damp(this.blend.aim, a.aim ? 1 : 0, 14, dt);
    if (this.blend.full > 0.01) { A.carriedPose(p, this.t); for (let i = 0; i < wts.length; i++) wts[i] = this.blend.full; anyProc = true; }
    if (carried) lay = -Math.PI / 2 + 0.3;
    const setMask = (m, w, src) => {
      if (w <= 0) return;
      p.blendMasked(src, 1, MASKS[m].v);
      for (const i of MASKS[m].r) wts[i] = Math.max(wts[i], w);
      anyProc = true;
    };
    const hk = this.holdKind;
    const canHold = this.heldId && !['climb', 'drive', 'seat', 'sleep', 'carried', 'swim', 'prone', 'downed'].includes(mode) && !dead;
    const holdSup = 1 - Math.min(1, overUpper);
    if (canHold && holdSup > 0.01) this.holdPose(a, s, hk, holdSup, setMask);
    if (!canHold || hk !== 'rifle' || holdSup <= 0.01) this.rig.setArmIK('Left', null);
    if (a.carrying && !carried) { pu.reset(); A.idle(pu, this.t); A.carryPose(pu); setMask('arms', 1, pu); }
    // klibi olmayan eylemler (gülme, gösterme, tüfek doldurma…)
    if (act && !act.motion) {
      act.t += dt;
      const k = Math.min(1, act.t / act.dur);
      const env = Math.max(0, Math.min(1, act.t * 6, (act.dur - act.t) * 6));
      pu.reset(); A.idle(pu, this.t);
      switch (act.type) {
        case 'reload': { const r = Math.sin(k * Math.PI); pu.set('LeftArm', (-55 * r) * D, 0, (-60 + 25 * r) * D); pu.set('LeftForeArm', 0, -95 * r * D, 0); pu.set('Head', 18 * r * D, 0, 0); setMask('larm', r, pu); break; }
        case 'laugh': case 'point': A.emote(tmp, act.type, this.t); setMask('armsSpine', env, tmp); break;
        case 'throw': { const kk = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6; pu.set('RightArm', (-150 * kk + 40 * (1 - kk)) * D, 0, 40 * D); pu.set('RightForeArm', 0, 40 * kk * D, 0); setMask('rarm', env, pu); break; }
        default: break;
      }
      if (act.t >= act.dur && !act.loop) this.action = null;
    }
    // kişilik kıpırdanmaları (ayakta boş beklerken: Mert alet kurcalar, Elif dürbünle bakar, Bora gerinir…)
    this.updateFidget(dt, a, mode, s, dead, act, setMask, pu, M);
    if (M.fullW > 0) for (let i = 0; i < wts.length; i++) wts[i] *= 1 - M.fullW;
    if (anyProc) this.rig.apply(p, wts);
    if (!dead && !a.aim && a.pitch && !carried && mode !== 'sleep') this.lookPitch(-(a.pitch || 0) * 0.45 * (1 - M.fullW));
    // ---- 3) koltuk: kalça koltuk noktasına (kök + 0.1 m), klibin oturma yüksekliğinden bağımsız
    const m = this.ch.model;
    if (mode === 'drive' || mode === 'seat') {
      const b = M.bodyLocal(), sc = m.scale.y;
      layLift = 0.1 - b.y * sc;
      layZ = this.rig.restData.entries[0].wpos.z * sc - b.z * sc;
    }
    this.finishRoot(dt, a, mode, s, lay, layLift, layZ);
    // ---- 4) ayak IK'sı (eğim/basamak): ayakta ve eğik kipte, yakındaki karakterlerde
    if (this.footIK) {
      const W = this.game.session ? this.game.session.world : this.game.world;
      const cam = this.game.gfx && this.game.gfx.camera;
      const near = cam ? this.root.position.distanceToSquared(cam.position) < 30 * 30 : true;
      const want = W && W.physics && near && (mode === 'ground' || mode === 'crouch') && !dead && !a.carrying ? 1 - M.fullW : 0;
      if (want > 0 || this.footIK.w > 0.01) {
        const phys = W && W.physics;
        this._groundFn = this._groundFn || ((x, z, y) => phys.groundHeight(x, z, y));
        this.root.updateWorldMatrix(true, false);
        this.footIK.solve(dt, this._groundFn, this.root.matrixWorld.elements[13], want);
      }
    }
  }

  /**
   * Kişilik kıpırdanması zamanlayıcısı: 12–26 sn'de bir, 2,6–4,2 sn süren üst gövde pozu (oyun içinde de
   * görünür; uzak oyuncularda her istemci kendi rastgele zamanlamasıyla oynar — kozmetik, ağ verisi yok).
   */
  updateFidget(dt, a, mode, s, dead, act, setMask, pu, M) {
    const F = this.fidget || (this.fidget = { kind: null, t: 0, dur: 0, next: 10 + Math.random() * 14, prop: null });
    const calm = !dead && mode === 'ground' && s < 0.15 && !act && !a.aim && !a.talk && !a.carrying && !a.carryBox && !a.emote && M.fullW < 0.05 && M.upperW < 0.05 && !this.overlays.length;
    if (F.kind) {
      F.t += dt;
      if (!calm || F.t >= F.dur) { this.endFidget(); return; }
      const env = Math.max(0, Math.min(1, F.t * 3, (F.dur - F.t) * 3));
      pu.reset(); A.fidget(pu, F.kind, F.t / F.dur, this.t);
      setMask('upper', env, pu);
      if (F.prop) F.prop.visible = env > 0.3;
      return;
    }
    if (!calm) { F.next = Math.max(F.next, 2.5); return; }
    F.next -= dt;
    if (F.next > 0) return;
    const persona = (this.ch && this.ch.look && this.ch.look.persona) || 'default';
    const kinds = FIDGETS[persona] || FIDGETS.default;
    this.startFidget(kinds[Math.floor(Math.random() * kinds.length)]);
  }
  /** Kıpırdanmayı hemen başlat (test ve kişilik önizlemesi için de) */
  startFidget(kind) {
    const F = this.fidget || (this.fidget = { kind: null, t: 0, dur: 0, next: 0, prop: null });
    if (F.kind) this.endFidget();
    if (FIDGET_PROPS[kind] && this.heldId) kind = 'stretch'; // elde eşya varken aletli kıpırdanma yok
    F.kind = kind; F.t = 0; F.dur = 2.6 + Math.random() * 1.6; F.next = 12 + Math.random() * 14;
    const item = FIDGET_PROPS[kind];
    if (item && this.game.itemModels && ITEMS[item]) {
      try {
        const obj = this.game.itemModels.make(item);
        const h = HOLDS[kind === 'binoculars' ? 'binoculars' : 'melee1'];
        const holder = new THREE.Group();
        holder.position.set(...h.pos); holder.rotation.set(...h.rot);
        obj.position.x = h.fwd * 0.6;
        holder.add(obj);
        holder.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        const ms = this.ch.model.scale;
        holder.scale.set(1 / ms.x, 1 / ms.y, 1 / ms.z);
        holder.visible = false;
        this.ch.anchors.handR.add(holder);
        F.prop = holder;
      } catch { F.prop = null; }
    }
  }
  endFidget() {
    const F = this.fidget;
    if (!F) return;
    if (F.prop) { F.prop.parent && F.prop.parent.remove(F.prop); F.prop = null; }
    F.kind = null; F.t = 0;
    F.next = Math.max(F.next, 12 + Math.random() * 14);
  }

  /** Tutuş pozları (silah/yakın dövüş/el feneri), üst gövdeye maskeli */
  holdPose(a, s, hk, holdSup, setMask) {
    const pu = this.pu, tmp = this.tmp;
    A.idle(pu, this.t);
    if (hk === 'pistol' || hk === 'rifle' || hk === 'bow') {
      const aimW = this.blend.aim;
      if (hk === 'pistol') {
        if (aimW > 0.02) { A.aim(pu, 'pistol', a.pitch || 0, a.recoil || 0); setMask('rarmSpine', aimW * holdSup, pu); }
        if (aimW < 0.98) {
          A.idle(tmp, this.t);
          tmp.set('RightArm', (-18 - s * 3) * D, 0, 70 * D); tmp.set('RightForeArm', 0, 38 * D, 0); A.grip(tmp, 'Right', 1);
          setMask('rarm', (1 - aimW) * holdSup, tmp);
        }
      } else if (hk === 'rifle') {
        const pd = aimW > 0.5 ? (a.pitch || 0) : -0.55;
        A.aim(pu, 'rifle', pd, a.recoil || 0);
        const chestY = this.rig.restData.entries[4].wpos.y;
        const tgt = _v.set(-0.07, chestY + 0.03 + Math.sin(pd) * 0.33, 0.42 * Math.cos(pd));
        this.rig.setArmIK('Left', tgt, new THREE.Vector3(1, -1.2, -0.2));
        setMask('armsSpine', Math.max(0.85, aimW) * holdSup, pu);
      } else if (aimW > 0.02) { A.aim(pu, 'bow', a.pitch || 0, 0); setMask('armsSpine', aimW * holdSup, pu); }
      else { A.idle(tmp, this.t); A.grip(tmp, 'Left', 1); setMask('larm', 0.6 * holdSup, tmp); }
    } else if (hk === 'melee1' || hk === 'melee2') {
      pu.set('RightArm', (-14 - s * 2) * D, 0, 64 * D); pu.set('RightForeArm', 0, 42 * D, 0); A.grip(pu, 'Right', 1);
      setMask('rarm', 0.9 * holdSup, pu);
    } else if (hk === 'flashlight') {
      pu.set('RightArm', (-55 + (a.pitch || 0) / D * -0.5) * D, -10 * D, 85 * D); pu.set('RightForeArm', 0, 10 * D, 0); A.grip(pu, 'Right', 1);
      setMask('rarm', holdSup, pu);
    } else {
      A.grip(pu, 'Right', 0.85);
      setMask('rhand', 1, pu);
    }
  }

  /** Kök: yön, dönüşte yatma, yatma/koltuk ofsetleri, el feneri, ikincil hareket */
  finishRoot(dt, a, mode, s, lay, layLift, layZ) {
    if (a.yaw !== undefined) this.visYaw = dampAngle(this.visYaw, a.yaw, a.instantYaw ? 40 : 14, dt);
    const yawRate = dt > 0 ? wrapAngle(this.visYaw - this.lastYaw) / dt : 0;
    this.yawRate = damp(this.yawRate || 0, yawRate, 10, dt);
    this.lastYaw = this.visYaw;
    this.root.rotation.y = this.visYaw;
    const leanT = mode === 'ground' && s > 2 ? clamp(-yawRate * s * 0.012, -0.22, 0.22) : 0;
    this.lean = damp(this.lean, leanT, 6, dt);
    const m = this.ch.model;
    m.rotation.z = this.lean;
    m.rotation.x = damp(m.rotation.x, lay, 8, dt);
    // ayrı sönümlü değerler: ayak IK'sı sonradan kalça ofseti ekler, okuma-yazma birbirini bozmasın
    this.liftY = damp(this.liftY ?? 0, layLift, 10, dt);
    this.liftZ = damp(this.liftZ ?? 0, layZ, 10, dt);
    m.position.y = this.liftY;
    m.position.z = this.liftZ;
    if (this.flashlight) {
      const pd = a.pitch || 0;
      this.flashlight.target.position.set(0, 1.4 - Math.sin(pd) * 8, Math.cos(pd) * 8);
    }
    this.secondary(dt, s, yawRate, mode);
  }

  /**
   * İkincil hareket: sırt çantası, alet kemeri ve göğüs aksesuarları yaylı sönümlü sallanır.
   * Girdi: yerel ivme (hız değişimi), dönüş hızı ve adım fazının dikey yaylanması.
   */
  secondary(dt, s, yawRate, mode) {
    if (dt <= 0) return;
    const sp = this.spring || (this.spring = { v: s, x: 0, vx: 0, z: 0, vz: 0, y: 0, vy: 0 });
    const acc = clamp((s - sp.v) / dt, -30, 30);
    sp.v = s;
    const step = mode === 'ground' || mode === 'crouch' ? Math.abs(Math.sin(this.cycle * Math.PI * 2)) * Math.min(1, s / 4) : 0;
    // hedef: hızlanırken geriye, dönerken dışa doğru; adımda hafif zıplama
    const tx = clamp(-acc * 0.012 - s * 0.012, -0.35, 0.25), tz = clamp(-yawRate * s * 0.02, -0.3, 0.3), ty = step * 0.02;
    const k = 60, c = 7.5;
    sp.vx += ((tx - sp.x) * k - sp.vx * c) * dt; sp.x += sp.vx * dt;
    sp.vz += ((tz - sp.z) * k - sp.vz * c) * dt; sp.z += sp.vz * dt;
    sp.vy += ((ty - sp.y) * k * 1.6 - sp.vy * c) * dt; sp.y += sp.vy * dt;
    const A = this.ch.anchors;
    for (const [anchor, gain] of [[A.back, 1], [A.hips, 0.45], [A.chest, 0.6]]) {
      if (!anchor) continue;
      for (const g of anchor.children) {
        if (!g.userData.acc) continue;
        if (!g.userData.base) g.userData.base = { y: g.position.y, rx: g.rotation.x, rz: g.rotation.z };
        const b = g.userData.base;
        g.rotation.x = b.rx + sp.x * gain;
        g.rotation.z = b.rz + sp.z * gain;
        g.position.y = b.y + sp.y * gain * 0.5;
      }
    }
  }

  /** Baş/boyun yukarı-aşağı (klip pozuna eklemeli) */
  lookPitch(x) {
    const E = this.rig.restData.entries;
    for (const [i, f] of [[5, 0.4], [6, 0.6]]) {
      const e = E[i], b = this.rig.list[i];
      if (!e || !b) continue;
      _q.setFromEuler(_e.set(x * f, 0, 0, 'YXZ'));
      // yerel_yeni = P⁻¹ · R · P · yerel
      b.quaternion.premultiply(_q.premultiply(e.Pinv).multiply(e.P));
    }
  }

  dispose() {
    this.hold(null);
    this.setFlashlight(false);
    this.mixer.stopAllAction();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
