// Hayvan görseli: Quaternius CC0 iskeletli hayvan modelleri (kurt, geyik, erkek geyik, husky, tilki, shiba)
// AnimationMixer ile: bekleme/yürüme/dörtnal hıza göre karışır; saldırı, darbe tepkisi, otlama ve ölüm
// klipleri tek seferlik oynar. Zombi hayvanlar için çürümüş renk tonu ve parlayan gözler.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { damp, smoothstep, dampAngle } from '../core/util.js';

// model: rigged dosya; scale: gerçek boyut; walk/run: kliplerin yaklaşık yer hızı (m/s, ölçekli)
export const ANIMAL_MODELS = {
  wolf: { model: 'wolf', scale: 0.3, walk: 1.5, run: 7.5, attack: 'Attack', graze: 'Idle_2_HeadLow' },
  deer: { model: 'deer', scale: 0.33, walk: 1.4, run: 8.5, attack: 'Attack_Kick', graze: 'Eating' },
  stag: { model: 'stag', scale: 0.42, walk: 1.6, run: 9, attack: 'Attack_Headbutt', graze: 'Eating' },
  fox: { model: 'fox', scale: 0.17, walk: 0.9, run: 5.5, attack: 'Attack', graze: 'Idle_2_HeadLow' },
  husky: { model: 'husky', scale: 0.24, walk: 1.2, run: 6.5, attack: 'Attack', graze: 'Eating' },
  shiba: { model: 'shiba', scale: 0.18, walk: 1.0, run: 5.5, attack: 'Attack', graze: 'Eating' },
};

const ZOMBIE_TINT = new THREE.Color('#5d6b52');

export class AnimalView {
  /** opts: {zombie: bool, scale: çarpan, tint: renk, eyes: renk} */
  constructor(game, kind, opts = {}) {
    const cfg = ANIMAL_MODELS[kind];
    this.kind = kind;
    this.cfg = cfg;
    const src = game.assets.rigged[cfg.model];
    this.model = SkeletonUtils.clone(src.scene);
    const k = cfg.scale * (opts.scale || 1);
    this.model.scale.setScalar(k);
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      if (opts.zombie || opts.tint) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const nm = mats.map((m) => {
          const c = m.clone();
          const pupil = /Eyes?_(Black|Pupil)/i.test(m.name) || (cfg.model === 'husky' && m.name === 'Material.002');
          const eye = pupil || /eye/i.test(m.name) || (cfg.model === 'husky' && m.name === 'Material.003');
          if (opts.zombie) {
            if (pupil) { c.color.set(opts.eyes || '#ff2a1a'); c.emissive = new THREE.Color(opts.eyes || '#ff2a1a'); c.emissiveIntensity = 1.4; }
            else if (!eye) c.color.lerp(ZOMBIE_TINT, 0.55).multiplyScalar(0.8);
          } else if (opts.tint && !eye) c.color.multiply(new THREE.Color(opts.tint));
          return c;
        });
        o.material = Array.isArray(o.material) ? nm : nm[0];
      }
    });
    this.root = new THREE.Group();
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {};
    for (const c of src.animations) this.clips[c.name] = c;
    const act = (n) => { const c = this.clips[n]; if (!c) return null; const a = this.mixer.clipAction(c); return a; };
    this.loco = { idle: act('Idle'), walk: act('Walk'), run: act('Gallop'), graze: act(cfg.graze) };
    for (const [n, a] of Object.entries(this.loco)) { if (!a) continue; a.play(); a.setEffectiveWeight(n === 'idle' ? 1 : 0); }
    this.oneShot = null; // {action, t, dur, fade}
    this.speedSm = 0;
    this.grazeW = 0;
    this.visYaw = 0;
    this.dead = false;
    this.t = Math.random() * 10;
  }

  /** Tek seferlik klip (saldırı, darbe). dur: istenen süre */
  play(name, dur = null, weight = 1) {
    if (this.dead) return;
    const c = this.clips[name];
    if (!c) return;
    if (this.oneShot) this.oneShot.action.stop();
    const a = this.mixer.clipAction(c);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.timeScale = dur ? c.duration / dur : 1;
    a.setEffectiveWeight(weight);
    a.play();
    this.oneShot = { action: a, t: 0, dur: dur || c.duration, w: weight };
  }

  attack(dur = 0.7) { this.play(this.cfg.attack, dur); }
  flinch() { this.play(Math.random() < 0.5 ? 'Idle_HitReact_Left' : 'Idle_HitReact_Right', 0.4, 0.8); }

  die() {
    if (this.dead) return;
    this.dead = true;
    for (const a of Object.values(this.loco)) if (a) a.fadeOut(0.15);
    if (this.oneShot) { this.oneShot.action.fadeOut(0.1); this.oneShot = null; }
    const c = this.clips.Death;
    if (!c) return;
    const a = this.mixer.clipAction(c);
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(1); a.fadeIn(0.1); a.play();
  }

  /** s: {speed, yaw, graze} */
  update(dt, s) {
    this.t += dt;
    if (s.yaw !== undefined) { this.visYaw = dampAngle(this.visYaw, s.yaw, 7, dt); this.root.rotation.y = this.visYaw; }
    if (!this.dead) {
      const sp = this.speedSm = damp(this.speedSm, s.speed || 0, 8, dt);
      const cfg = this.cfg;
      const k = this.model.scale.x / cfg.scale; // boy çarpanı (büyük hayvan daha uzun adım)
      const idleW = 1 - smoothstep(0.08, 0.5, sp);
      const runW = smoothstep(cfg.walk * 1.6 * k, cfg.walk * 3.2 * k, sp);
      this.grazeW = damp(this.grazeW, s.graze && sp < 0.1 ? 1 : 0, 3, dt);
      const L = this.loco;
      const shot = this.oneShot ? this.oneShot.w * Math.min(1, this.oneShot.t / 0.08, (this.oneShot.dur - this.oneShot.t) / 0.12) : 0;
      const base = 1 - Math.max(0, Math.min(1, shot));
      if (L.idle) L.idle.setEffectiveWeight(idleW * (1 - this.grazeW) * base);
      if (L.graze) L.graze.setEffectiveWeight(idleW * this.grazeW * base);
      if (L.walk) { L.walk.setEffectiveWeight((1 - idleW) * (1 - runW) * base); L.walk.timeScale = Math.min(2.2, Math.max(0.5, sp / (cfg.walk * k))); }
      if (L.run) { L.run.setEffectiveWeight((1 - idleW) * runW * base); L.run.timeScale = Math.min(1.7, Math.max(0.6, sp / (cfg.run * 0.8 * k))); }
      if (this.oneShot) {
        this.oneShot.t += dt;
        if (this.oneShot.t >= this.oneShot.dur) { this.oneShot.action.stop(); this.oneShot = null; }
      }
    }
    this.mixer.update(dt);
  }

  dispose() { this.mixer.stopAllAction(); if (this.root.parent) this.root.parent.remove(this.root); }
}
