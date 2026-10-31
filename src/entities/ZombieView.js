// Zombi görseli. İnsan zombiler: Quaternius insan tabanı + hastalıklı ten, yıpranmış kanlı kıyafet,
// türe özgü ekler (çevik kuvvet kaskı/yeleği, şişkonun karnı, parlayan gözler) ve prosedürel yürüyüş;
// ölünce gerçek "Death" klibiyle yere yığılır. Zombi köpek: iskeletli husky modeli (çürümüş, kızıl gözlü).
import * as THREE from 'three';
import { Pose } from './CharacterRig.js';
import * as A from './Animations.js';
import { ClipLayer } from './Avatar.js';
import { AnimalView } from './AnimalView.js';
import { damp, dampAngle } from '../core/util.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });

export class ZombieView {
  constructor(game, type, seed = null) {
    this.game = game;
    this.def = type; // tür tanımı (Zombies.makeView this.type'a tür adını yazar)
    this.type = type;
    this.t = Math.random() * 10;
    this.phase = Math.random() * 6;
    this.visYaw = 0;
    this.deadT = 0;
    this.attackT = -1;
    this.hitT = -1;
    this.lod = 0;
    this.lay = 0;
    if (type.dog) {
      this.animal = new AnimalView(game, Math.random() < 0.5 ? 'husky' : 'wolf', { zombie: true, scale: 0.95 });
      this.root = this.animal.root;
      return;
    }
    this.ch = game.charFactory.create(null, { zombie: type, seed });
    this.root = this.ch.root;
    this.rig = this.ch.rig;
    this.pose = new Pose();
    if (type.human) game.charFactory.applyLook(this.ch, raiderLook());
    this.addExtras(type);
  }

  /** Türe özgü görsel ekler */
  addExtras(z) {
    const an = this.ch.anchors;
    const add = (anchor, mesh) => { mesh.castShadow = true; mesh.userData.acc = true; anchor.add(mesh); return mesh; };
    if (z.riot) {
      // kask (vizörlü) ve çelik yelek
      const helm = add(an.head, new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), M('#1d2533', { metalness: 0.3, roughness: 0.5 })));
      helm.position.set(0, 0.105, -0.005); helm.scale.set(1, 0.95, 1.1);
      const visor = add(an.head, new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, -0.9, 1.8, 0.9, 0.75), M('#2a3a4a', { transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.4 })));
      visor.position.set(0, 0.09, 0.0);
      const vest = add(an.chest, new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.28), M('#232b36', { roughness: 0.7 })));
      vest.position.set(0, -0.08, 0.0);
      const plate = add(an.chest, new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.03), M('#c8c8c8')));
      plate.position.set(0, -0.02, 0.155);
    }
    if (z.bloat) {
      // şişmiş karın
      const belly = add(an.chest, new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), M(z.tint, { roughness: 0.6 })));
      belly.position.set(0, -0.25, 0.1); belly.scale.set(1.1, 1.0, 1.05);
    }
    if (z.screamer) {
      // açık ağız (koyu leke)
      const mouth = add(an.head, new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), new THREE.MeshBasicMaterial({ color: 0x1a0505 })));
      mouth.position.set(0, 0.02, 0.105); mouth.scale.set(1, 1.6, 1);
    }
  }

  /** s: {state, speed, yaw, dead, bashing} */
  update(dt, s, lodSkip = false) {
    this.t += dt;
    const def = this.def;
    const run = Math.min(1, Math.max(0, (s.speed - 1.6) / 2.5));
    const prevPhase = this.phase;
    this.phase += s.speed * dt * (def.crawl ? 2.6 : 2.1);
    // sürüklenen ayak sesi (yakındaysa; oturum kare başına sınırlar)
    if (!s.dead && !this.animal && s.speed > 0.35 && Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI)) {
      const S = this.game.session;
      if (S && S.onZombieStep) S.onZombieStep(this, s.speed, !!def.crawl);
    }
    this.visYaw = dampAngle(this.visYaw, s.yaw, 10, dt);
    if (this.animal) { this.updateDog(dt, s); return; }
    if (!this.corpse) this.root.rotation.y = this.visYaw;
    if (lodSkip) return;
    const p = this.pose;
    const m = this.ch.model;
    if (s.dead) {
      this.deadT += dt;
      if (this.corpse) return; // fizik gövdesi devirir
      if (def.crawl) {
        A.zombieCrawl(p, this.phase, 0, this.t);
        this.rig.apply(p);
        return;
      }
      // gerçek ölüm klibi: önce klip pozu (kemikler), son karede sabit
      if (!this.deathLayer) {
        this.deathLayer = new ClipLayer(m, this.ch.clips.Death, null);
        this.layDamp(0, 0, 0, 1);
      }
      const D0 = this.deathLayer.clip.duration;
      this.deathLayer.apply(Math.min(D0 - 1e-3, this.deadT * 1.15), 1);
      return;
    }
    if (def.crawl) {
      A.zombieCrawl(p, this.phase, s.speed / 1.2, this.t);
      this.layDamp(-Math.PI / 2 + 0.12, 0.15, -0.85, dt);
    } else if (def.human) {
      if (s.speed > 0.2) A.locomotion(p, this.phase, run, this.t); else A.idle(p, this.t);
      if (s.state === 'attack' || s.state === 'aim') A.aim(p, 'rifle', 0, this.attackT > 0 ? 0.6 : 0);
    } else if (s.state === 'scream') {
      A.zombieScream(p, this.t);
    } else {
      this.moveK = damp(this.moveK ?? 0, Math.min(1, s.speed / 0.5), 6, dt);
      A.zombieWalk(p, this.phase, run, this.t, def.bloat ? 0 : (def.style || 0), this.moveK);
      if (def.bloat) { p.add('LeftUpLeg', 0, 0, -10 * Math.PI / 180); p.add('RightUpLeg', 0, 0, 10 * Math.PI / 180); p.add('Spine', -0.15, 0, 0); }
      if (s.bashing) A.zombieBash(p, this.t);
    }
    if (this.attackT >= 0) {
      this.attackT += dt;
      const k = this.attackT / 0.6;
      if (!def.human && !def.crawl) A.zombieAttack(p, k);
      if (k >= 1) this.attackT = -1;
    }
    if (this.hitT >= 0) {
      this.hitT += dt;
      A.hitReact(p, this.hitT / 0.35, 1);
      if (this.hitT > 0.35) this.hitT = -1;
    }
    this.rig.apply(p);
  }

  /** Kök eğimi (sürünen: yüzüstü) */
  layDamp(rx, y, z, dt) {
    const m = this.ch.model;
    m.rotation.x = damp(m.rotation.x, rx, 8, dt);
    m.position.y = damp(m.position.y, y, 8, dt);
    m.position.z = damp(m.position.z, z, 8, dt);
  }

  updateDog(dt, s) {
    const a = this.animal;
    if (s.dead) { if (!a.dead && !this.corpse) a.die(); a.update(dt, { speed: 0 }); return; }
    if (this.attackT >= 0) { this.attackT = -1; a.attack(0.5); }
    if (this.hitT >= 0) { this.hitT = -1; a.flinch(); }
    a.update(dt, { speed: s.speed, yaw: this.corpse ? undefined : s.yaw });
  }

  attack() { this.attackT = 0; }
  flinch() { this.hitT = 0; }
  dispose() { if (this.animal) this.animal.mixer.stopAllAction(); if (this.root.parent) this.root.parent.remove(this.root); }
}

function raiderLook() {
  const tops = ['#1b1b1b', '#3a2a2a', '#2c3a2c', '#4a3a2a'];
  return {
    base: 'male', skin: ['#e0a07a', '#c98a5e', '#a86b45'][Math.floor(Math.random() * 3)], hairStyle: 'short', hairColor: '#1d1410',
    beard: Math.random() < 0.6 ? 'stubble' : 'full', hat: Math.random() < 0.6 ? 'bandana' : 'beanie', hatColor: '#7a1a1a',
    top: { style: 'vest', color: tops[Math.floor(Math.random() * tops.length)], color2: '#5a3a2a' }, pants: { style: 'cargo', color: '#2c2c2c' }, shoes: '#1b1b1b',
    backpack: 'tactical', backpackColor: '#2c2c2c', glasses: Math.random() < 0.4 ? 'sunglasses' : 'none', gloves: 'tactical', accessory: 'bandolier', build: 1.05, dirt: 0.6,
  };
}

export { damp };
