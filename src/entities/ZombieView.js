// Zombi görseli: Kenney zombi tabanlı iskeletli model (ya da prosedürel köpek) + prosedürel animasyon.
import * as THREE from 'three';
import { Pose } from './CharacterRig.js';
import * as A from './Animations.js';
import { damp, dampAngle } from '../core/util.js';

export class ZombieView {
  constructor(game, type) {
    this.game = game;
    this.type = type;
    this.t = Math.random() * 10;
    this.phase = Math.random() * 6;
    this.visYaw = 0;
    this.deadT = 0;
    this.attackT = -1;
    this.hitT = -1;
    this.lod = 0;
    if (type.dog) { this.buildDog(); return; }
    this.ch = game.charFactory.create(null, { zombie: type });
    this.root = this.ch.root;
    this.rig = this.ch.rig;
    this.pose = new Pose();
    this.tmp = new Pose();
    if (type.human) {
      // yağmacı: insan görünümü + silah
      game.charFactory.applyLook(this.ch, raiderLook(type));
    }
  }

  buildDog() {
    const g = new THREE.Group();
    const c = new THREE.Color(this.type.tint);
    const M = (col, o = {}) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, ...o });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.95), M(c));
    body.position.y = 0.62;
    g.add(body);
    // kaburgalar
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.05), M('#d8c8b0')); r.position.set(0, 0.62, -0.15 + i * 0.12); g.add(r); }
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.36), M(c.clone().multiplyScalar(0.9)));
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.24), M(c.clone().multiplyScalar(0.8)));
    snout.position.set(0, -0.05, 0.27);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.2), M('#5a1a1a'));
    jaw.position.set(0, -0.15, 0.25);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), M(c));
      ear.position.set(s * 0.1, 0.2, -0.05);
      head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      eye.position.set(s * 0.09, 0.05, 0.18);
      head.add(eye);
    }
    head.add(skull, snout, jaw);
    head.position.set(0, 0.86, 0.55);
    g.add(head);
    this.dogHead = head; this.dogJaw = jaw;
    this.legs = [];
    for (const [x, z] of [[-0.14, 0.34], [0.14, 0.34], [-0.14, -0.34], [0.14, -0.34]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.5, z);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), M(c.clone().multiplyScalar(0.85)));
      leg.position.y = -0.25; pivot.add(leg); g.add(pivot);
      this.legs.push(pivot);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), M(c));
    tail.position.set(0, 0.75, -0.62); tail.rotation.x = -0.6;
    g.add(tail);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.root = new THREE.Group();
    this.root.add(g);
    this.body = g;
  }

  /** s: {state, speed, yaw, dead, bashing} */
  update(dt, s, lodSkip = false) {
    this.t += dt;
    const run = Math.min(1, Math.max(0, (s.speed - 1.6) / 2.5));
    this.phase += s.speed * dt * (this.type.dog ? 3.4 : 2.1);
    this.visYaw = dampAngle(this.visYaw, s.yaw, 10, dt);
    this.root.rotation.y = this.visYaw;
    if (this.type.dog) { this.updateDog(dt, s); return; }
    if (lodSkip) return;
    const p = this.pose;
    if (s.dead) {
      this.deadT += dt;
      A.downed(p, 0, 0);
      p.set('Head', 30 * Math.PI / 180, 0.4, 0);
      this.rig.apply(p);
      const k = Math.min(1, this.deadT * 3);
      this.ch.model.rotation.x = k * (Math.PI / 2 - 0.05);
      this.ch.model.position.y = k * 0.25;
      this.ch.model.position.z = k * 0.7;
      return;
    }
    if (this.type.human) {
      if (s.speed > 0.2) A.locomotion(p, this.phase, run, this.t); else A.idle(p, this.t);
      if (s.state === 'attack' || s.state === 'aim') A.aim(p, 'rifle', 0, this.attackT > 0 ? 0.6 : 0);
    } else {
      A.zombieWalk(p, this.phase, run, this.t, this.type.style || 0);
      if (s.bashing) A.zombieBash(p, this.t);
    }
    if (this.attackT >= 0) {
      this.attackT += dt;
      const k = this.attackT / 0.6;
      if (!this.type.human) A.zombieAttack(p, k);
      if (k >= 1) this.attackT = -1;
    }
    if (this.hitT >= 0) {
      this.hitT += dt;
      A.hitReact(p, this.hitT / 0.35, 1);
      if (this.hitT > 0.35) this.hitT = -1;
    }
    this.rig.apply(p);
  }

  updateDog(dt, s) {
    if (s.dead) {
      this.deadT += dt;
      this.body.rotation.z = Math.min(1, this.deadT * 3) * Math.PI / 2;
      this.body.position.y = -0.3 * Math.min(1, this.deadT * 3);
      return;
    }
    const sw = Math.sin(this.phase) * Math.min(1, s.speed / 3) * 0.7;
    this.legs[0].rotation.x = sw; this.legs[3].rotation.x = sw;
    this.legs[1].rotation.x = -sw; this.legs[2].rotation.x = -sw;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * Math.min(1, s.speed / 3);
    this.dogJaw.position.y = -0.15 - (this.attackT >= 0 ? 0.06 : Math.abs(Math.sin(this.t * 8)) * 0.02);
    this.dogHead.rotation.x = this.attackT >= 0 ? -0.4 : Math.sin(this.t * 2) * 0.1;
    if (this.attackT >= 0) { this.attackT += dt; if (this.attackT > 0.5) this.attackT = -1; }
  }

  attack() { this.attackT = 0; }
  flinch() { this.hitT = 0; }
  dispose() { if (this.root.parent) this.root.parent.remove(this.root); }
}

function raiderLook() {
  const tops = ['#1b1b1b', '#3a2a2a', '#2c3a2c', '#4a3a2a'];
  return {
    base: Math.random() < 0.5 ? 'survivor-male' : 'male', skin: ['#e0a07a', '#c98a5e', '#a86b45'][Math.floor(Math.random() * 3)], hairStyle: 'short', hairColor: '#1d1410',
    beard: Math.random() < 0.6 ? 'stubble' : 'none', hat: Math.random() < 0.6 ? 'bandana' : 'beanie', hatColor: '#7a1a1a',
    top: { style: 'vest', color: tops[Math.floor(Math.random() * tops.length)], color2: '#5a3a2a' }, pants: { style: 'cargo', color: '#2c2c2c' }, shoes: '#1b1b1b',
    backpack: 'tactical', backpackColor: '#2c2c2c', glasses: Math.random() < 0.4 ? 'sunglasses' : 'none', gloves: 'tactical', accessory: 'bandolier', build: 1.05, dirt: 0.6,
  };
}

export { damp };
