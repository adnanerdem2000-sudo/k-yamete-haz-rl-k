// Yerel oyuncu: üçüncü şahıs hareket (yürü/koş/sprint/eğil/sürün/zıpla/tırman/yüz), kamera,
// etkileşim hedefleme, savaş girişi. Hareket Rapier karakter denetleyicisiyle sabit adımda yapılır:
// basamak çıkma, eğimde kayma, zemine yapışma, tavana çarpma, düşme hasarı. Çizim enterpolasyonludur.
import * as THREE from 'three';
import { Avatar } from './Avatar.js';
import { clamp, damp, dampAngle, wrapAngle, smoothstep } from '../core/util.js';
import { Settings } from '../core/Settings.js';

const GRAV = 21;
const JUMP_V = 6.1;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.14;
const _v = new THREE.Vector3(), _cq = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

export class Player {
  constructor(session, profile) {
    this.session = session;
    this.game = session.game;
    this.profile = profile; // {id, name, charId, look, stats}
    this.avatar = new Avatar(this.game, profile.look, {});
    this.root = this.avatar.root;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.camYaw = 0;
    this.camPitch = -0.18;
    this.camDist = 4.4;
    this.mode = 'ground'; // ground | crouch | prone | air | climb | drive | seat | downed | sleep | dead | swim | carried
    this.onGround = true;
    this.sprinting = false;
    this.aiming = false;
    this.speed = 0;
    this.noise = 0;
    this.fallStartY = 0;
    this.ladder = null;
    this.vehicle = null;
    this.seat = -1;
    this.lockMove = 0;
    this.recoil = 0;
    this.camShake = 0;
    this.camDip = 0;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.lastSafe = new THREE.Vector3();
    this.inside = null;
    this.emote = null;
    this.carrying = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.swimming = false;
    this.wantStance = 'stand';
    this.moveSpeedSm = 0;
    // fizik gövdesi (Rapier kapsülü)
    const pw = this.game.phys;
    this.body = pw ? pw.createCharacter(0, 50, 0) : null;
    if (pw) this.unhook = pw.addHook((h) => this.physicsStep(h));
  }

  get stats() { return this.session.localStats; }
  get charStats() { return this.profile.stats; }

  spawnAt(x, y, z, rot = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = rot; this.camYaw = rot + Math.PI;
    this.avatar.visYaw = rot;
    this.lastSafe.copy(this.pos);
    this.fallStartY = y;
    this.root.position.copy(this.pos);
    this.camPos.set(x - Math.sin(rot) * 4, y + 2.5, z - Math.cos(rot) * 4);
    if (this.body) { this.body.setEnabled(true); this.body.teleport(x, y, z); }
  }

  /** Gövdeyi görsel konuma taşı (merdiven, atlama, taşınma, uyku) */
  syncBody() { if (this.body) this.body.teleport(this.pos.x, this.pos.y, this.pos.z); }

  /** Yerel girdiyle hareket niyeti. Konum entegrasyonu physicsStep'te yapılır. */
  update(dt, input, uiBlocking) {
    const S = this.session;
    const st = this.stats;
    const cs = this.charStats;
    // ---- kamera döndürme
    const sens = 0.0024 * Settings.get('controls.mouseSens');
    if (!uiBlocking && input.locked) {
      const aimMul = this.aiming ? (S.combat && S.combat.scoped ? 0.35 : 0.6) : 1;
      this.camYaw -= input.mouse.dx * sens * aimMul;
      this.camPitch -= input.mouse.dy * sens * aimMul * (Settings.get('controls.invertY') ? -1 : 1);
      this.camPitch = clamp(this.camPitch, -1.25, 1.0);
    }
    if (st.downed && this.mode !== 'carried') this.mode = 'downed';
    if (this.mode === 'drive' || this.mode === 'seat' || this.mode === 'carried') return;
    if (this.mode === 'sleep') { this.vel.set(0, 0, 0); return; }
    if (this.mode === 'climb') { this.updateLadder(dt, input, uiBlocking); this.syncBody(); return; }
    // ---- takla (koşarken eğil): kısa süreli hızlı kaçınma, alçak kapsül
    if (this.roll) { this.updateRoll(dt); return; }
    // ---- hareket girdisi
    let mx = 0, mz = 0;
    if (!uiBlocking && this.lockMove <= 0) {
      if (input.isDown('forward')) mz += 1;
      if (input.isDown('back')) mz -= 1;
      if (input.isDown('left')) mx += 1;
      if (input.isDown('right')) mx -= 1;
    }
    const moving = mx !== 0 || mz !== 0;
    const cy = Math.sin(this.camYaw + Math.PI), cyc = Math.cos(this.camYaw + Math.PI);
    const fx = cy, fz = cyc;
    const rx = fz, rz = -fx;
    let dx = fx * mz + rx * mx, dz = fz * mz + rz * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 0) { dx /= dl; dz /= dl; }
    // ---- duruş geçişleri (tavan kontrolüyle)
    if (!uiBlocking && st && !st.downed) {
      if (input.wasPressed('crouch') && this.sprinting && this.onGround && !this.swimming && moving && st.stamina > 14 && !this.carrying && !this.carryProp) { this.startRoll(dx, dz); return; }
      if (input.wasPressed('crouch')) this.wantStance = this.mode === 'crouch' ? 'stand' : 'crouch';
      if (input.wasPressed('prone')) this.wantStance = this.mode === 'prone' ? 'crouch' : 'prone';
    }
    if (st.downed) this.applyStance('downed');
    else if (this.mode === 'downed') { this.mode = 'ground'; this.applyStance('stand'); }
    else if (this.swimming) this.applyStance('stand');
    else this.applyStance(this.wantStance);
    const wantSprint = !uiBlocking && input.isDown('sprint') && moving && this.mode !== 'prone' && this.mode !== 'downed' && !this.aiming && !this.carryProp;
    const walkSlow = !uiBlocking && input.keyDown('AltLeft');
    const sm = st ? st.speedMul(this.session.overweight || 0) : 1;
    let target = 0;
    const base = 4.3 * (cs.speed || 1);
    if (moving) {
      // gerçekçi hızlar (klip yürüyüş hızlarıyla uyumlu): yaralı sürünme 0.45, sürünme 0.65, eğik 1.7, yürüme 1.5 m/s
      if (this.mode === 'downed') target = 0.45;
      else if (this.mode === 'prone') target = 0.65;
      else if (this.mode === 'crouch') target = 1.7 * (cs.speed || 1);
      else if (walkSlow) target = 1.5;
      else if (wantSprint && st.stamina > 1) target = 6.7 * (cs.speed || 1);
      else target = this.aiming ? 2.4 : base;
      target *= sm;
      if (this.carrying) target *= 0.6;
      if (this.carryProp) target = Math.min(target, 3.2) * (this.carryProp.def.mass > 14 ? 0.8 : 0.9);
      if (this.grabT > 0) target *= 0.35;
      // geri geri yürürken yavaş
      if (mz < 0 && this.aiming) target *= 0.8;
    }
    this.sprinting = wantSprint && st.stamina > 1 && target > base * sm;
    if (this.sprinting) st.stamina = Math.max(0, st.stamina - 13 * dt);
    else st.stamina = Math.min(st.staminaMaxNow(), st.stamina + (moving ? 6 : 11) * dt);
    // ---- su
    const terrain = S.world.terrain;
    this.waterLvl = terrain.waterLevelAt(this.pos.x, this.pos.z);
    const groundH = terrain.heightAt(this.pos.x, this.pos.z);
    this.swimming = this.waterLvl - groundH > 1.15 && this.pos.y < this.waterLvl - 0.6;
    if (this.swimming) { target *= 0.45; if (this.mode !== 'downed') this.mode = 'swim'; st.stamina = Math.max(0, st.stamina - 4 * dt); }
    else if (this.mode === 'swim') this.mode = 'ground';
    // ---- yatay hız (zeminde çevik, havada sınırlı kontrol)
    const accel = this.onGround || this.swimming ? (moving ? 12 : 16) : 2.5;
    this.vel.x = damp(this.vel.x, dx * target, accel, dt);
    this.vel.z = damp(this.vel.z, dz * target, accel, dt);
    // ---- yön
    if (this.aiming || (S.combat && S.combat.attacking)) this.yaw = dampAngle(this.yaw, this.camYaw + Math.PI, 30, dt);
    else if (moving && target > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), this.mode === 'prone' ? 4 : this.sprinting ? 9 : 12, dt);
    // ---- zıplama: tampon + kenar affı (coyote time) + engel atlama
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    if (!uiBlocking && input.wasPressed('jump') && st && !st.downed) {
      if (this.mode === 'crouch' || this.mode === 'prone') this.wantStance = 'stand';
      else if (this.onGround && !this.swimming && this.tryVault()) { /* engel atlama */ }
      else this.jumpBuffer = JUMP_BUFFER;
    }
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.swimming && this.mode !== 'downed' && st.stamina > 6 && !this.vault) {
      this.vel.y = JUMP_V;
      this.jumpBuffer = 0; this.coyote = 0;
      this.onGround = false; this.mode = 'air';
      st.stamina -= 6;
      this.fallStartY = this.pos.y;
      this.avatar.play('jump', 0.35);
      S.audio && S.audio.play('jump', { at: this.pos, vol: 0.4 });
    }
    this.lockMove = Math.max(0, this.lockMove - dt);
    this.grabT = Math.max(0, (this.grabT || 0) - dt);
    this.recoil = damp(this.recoil, 0, 9, dt);
  }

  /** Hafif fizik nesnesini (kutu, kasa, çöp kovası) eline al: gövde kinematiğe geçer, önünde taşınır */
  pickProp(prop) {
    if (!prop || this.carryProp) return;
    const pw = this.game.phys;
    pw.setCarried(prop.d, true);
    this.carryProp = prop;
    this.avatar.play('pickup', 0.5);
    this.session.audio && this.session.audio.play('pickup', { vol: 0.4, rate: 0.8 });
  }

  /** Bırak (throw: ileri fırlat) — gövde yeniden dinamik olur, oyuncunun hızını devralır */
  dropProp(throwIt = false) {
    const p = this.carryProp;
    if (!p) return;
    this.carryProp = null;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const k = throwIt ? 7.5 - Math.min(3, p.def.mass / 6) : 0.6;
    this.game.phys.setCarried(p.d, false, { x: this.vel.x + fx * k, y: throwIt ? 2.6 : 0.2, z: this.vel.z + fz * k });
    if (throwIt) { this.avatar.play('throw', 0.5); this.session.audio && this.session.audio.play('whoosh', { vol: 0.35 }); }
  }

  /** Taşınan nesneyi her karede gövdenin önünde göğüs hizasında tut */
  updateCarry() {
    const p = this.carryProp;
    if (!p) return;
    if (!p.alive || this.mode !== 'ground' || (this.stats && this.stats.downed)) { this.dropProp(false); return; }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const h = (p.def.h || 0.7) * 0.5;
    _v.set(this.pos.x + fx * (0.55 + h * 0.4), this.pos.y + 1.0 + Math.max(0, 0.35 - h), this.pos.z + fz * (0.55 + h * 0.4));
    _cq.setFromAxisAngle(_up, this.yaw);
    this.game.phys.moveCarried(p.d, _v, _cq);
  }

  /** Takla başlat: hareket yönünde ~4 m yuvarlanma */
  startRoll(dx, dz) {
    const st = this.stats;
    st.stamina -= 14;
    this.roll = { t: 0, dur: 0.72, dx, dz, speed: 7.2 };
    this.yaw = Math.atan2(dx, dz);
    this.sprinting = false;
    this.applyStance('crouch');
    this.mode = 'ground';
    this.avatar.play('roll', this.roll.dur);
    this.session.audio && this.session.audio.play('whoosh', { vol: 0.45, rate: 0.9, vary: 0.15 });
  }

  updateRoll(dt) {
    const r = this.roll;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    const sp = r.speed * (1 - 0.55 * k * k);
    this.vel.x = r.dx * sp; this.vel.z = r.dz * sp;
    this.yaw = Math.atan2(r.dx, r.dz);
    if (k >= 1) {
      this.roll = null;
      this.wantStance = 'stand';
      this.applyStance('stand');
    } else if (this.body) this.body.setStance('crouch');
  }

  /** Duruşu fizik kapsülüne uygula (kalkacak yer yoksa eğik kalır) */
  applyStance(name) {
    const map = { stand: 'ground', crouch: 'crouch', prone: 'prone', downed: 'downed' };
    if (this.body) {
      const cur = this.body.stance;
      if (cur !== name && !this.body.setStance(name)) {
        if (!this._blockedMsgT || performance.now() - this._blockedMsgT > 3000) { this._blockedMsgT = performance.now(); this.session.ui.toast('Ayağa kalkmak için yer yok.', 'info', 1.5); }
        this.wantStance = cur;
        return;
      }
    }
    if (this.mode !== 'air' && this.mode !== 'swim') this.mode = map[name] || 'ground';
  }

  /** Sabit fizik adımı (1/60 sn) */
  physicsStep(h) {
    const b = this.body;
    if (!b || !b.enabled || this.vault || this.mode === 'drive' || this.mode === 'seat' || this.mode === 'climb' || this.mode === 'sleep' || this.mode === 'carried') return;
    const vel = this.vel;
    if (this.swimming) vel.y = damp(vel.y, (this.waterLvl - 0.85 - b.feet.y) * 4, 6, h);
    else vel.y = Math.max(-55, vel.y - GRAV * h);
    const wasGround = this.onGround;
    const want = vel.y * h;
    const m = b.move(vel.x * h, want, vel.z * h);
    this.onGround = b.grounded && vel.y <= 0.01;
    // tavana çarpma
    if (vel.y > 0 && m.y < want * 0.4) vel.y = 0;
    // havadayken en yüksek noktayı izle (düşme hasarı)
    if (!this.onGround) this.fallStartY = Math.max(this.fallStartY, b.feet.y);
    if (this.onGround) {
      if (!wasGround) this.land();
      if (vel.y < 0) vel.y = 0;
      this.fallStartY = b.feet.y;
    }
    // yatay: duvara dayanınca hız birikmesin
    if (h > 0) {
      const ax = m.x / h, az = m.z / h;
      const want2 = vel.x * vel.x + vel.z * vel.z;
      if (want2 > 1 && ax * ax + az * az < want2 * 0.25) { vel.x *= 0.85; vel.z *= 0.85; }
    }
  }

  /** Yere iniş: düşme hasarı, ses, kamera tepkisi */
  land() {
    const S = this.session;
    const st = this.stats;
    const fall = this.fallStartY - this.body.feet.y;
    if (fall > 3.4 && st && !this.swimming) {
      const dmg = (fall - 3.4) * 9;
      st.damage(dmg, 'fall');
      S.onLocalDamaged(dmg, 'fall');
      if (fall > 6) { st.cond.injury = Math.min(1, st.cond.injury + 0.3); S.ui.toast('Kötü bir düşüş! Bacağın incindi.', 'danger', 3); }
    }
    if (fall > 0.9) {
      S.audio && S.audio.play('land', { at: this.pos, vol: clamp(fall / 4, 0.25, 0.9) });
      this.camDip = Math.min(0.35, fall * 0.06);
      if (fall > 1.6) this.avatar.play('land', 0.25);
    }
    if (this.mode === 'air') this.mode = this.body.stance === 'crouch' ? 'crouch' : 'ground';
  }

  /** Fizik sonrası: enterpolasyonlu konum, hız, gürültü, kamera */
  postPhysics(dt) {
    const S = this.session;
    const b = this.body;
    const free = b && b.enabled && !this.vault && this.mode !== 'drive' && this.mode !== 'seat' && this.mode !== 'climb' && this.mode !== 'sleep' && this.mode !== 'carried';
    if (free) {
      const prevX = this.pos.x, prevZ = this.pos.z;
      b.visualFeet(this.pos, this.game.phys.alpha);
      const actual = dt > 0 ? Math.hypot(this.pos.x - prevX, this.pos.z - prevZ) / dt : 0;
      this.moveSpeedSm = damp(this.moveSpeedSm, Math.min(actual, Math.hypot(this.vel.x, this.vel.z) + 0.5), 14, dt);
      this.speed = this.moveSpeedSm;
      if (!this.onGround && this.mode !== 'swim' && this.mode !== 'downed' && this.body.feet.y < this.fallStartY - 0.25) this.mode = 'air';
      // dünya dışına düşme koruması
      if (this.pos.y < -30) { this.spawnAt(this.lastSafe.x, this.lastSafe.y + 1, this.lastSafe.z, this.yaw); }
      if (this.onGround && !this.swimming) this.lastSafe.copy(this.pos);
    } else if (this.mode === 'sleep' || this.mode === 'carried') this.speed = 0;
    const cs = this.charStats;
    const stealth = cs.stealth || 1;
    this.noise = this.speed < 0.3 ? 0 : (this.mode === 'crouch' || this.mode === 'prone' ? 2 : this.sprinting ? 14 : this.speed > 3 ? 8 : 4) / stealth;
    this.root.position.copy(this.pos);
    this.updateCamera(dt);
    void S;
  }

  /** Alçak engel üzerinden atlama (barikat, çit, kırık pencere) */
  /**
   * Engel aşma: alçak engelin (0.45–1.45 m) üzerinden atlama; arkası doluysa ve üstü basılabilirse üstüne
   * çıkma; 1.45–2.35 m basılabilir yüzeylere (kasa, konteyner, duvar üstü) tutunup tırmanma.
   */
  tryVault() {
    const phys = this.session.world.physics;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const px = this.pos.x + fx * 0.75, pz = this.pos.z + fz * 0.75;
    const c = phys.overlapsBox(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, this.pos.y + 0.3, this.pos.y + 1.2);
    if (!c) return false;
    const h = c.maxY - this.pos.y;
    if (h > 1.45) return h <= 2.35 && this.tryClimbOnto(c, fx, fz, h);
    if (h < 0.45) return false;
    const tx = this.pos.x + fx * 1.9, tz = this.pos.z + fz * 1.9;
    if (phys.overlapsBox(tx - 0.3, tz - 0.3, tx + 0.3, tz + 0.3, this.pos.y + 0.2, this.pos.y + 1.7)) return h >= 0.8 && this.tryClimbOnto(c, fx, fz, h);
    this.vault = { t: 0, dur: 0.58, from: this.pos.clone(), to: new THREE.Vector3(tx, phys.groundHeight(tx, tz, this.pos.y + 0.6), tz), h: c.maxY + 0.35 };
    this.lockMove = 0.58;
    this.avatar.play('vault', 0.58);
    this.session.audio && this.session.audio.play('swing', { at: this.pos, vol: 0.4 });
    return true;
  }

  /** Basılabilir üst yüzeye tırman: üstte duracak yer ve baş boşluğu olmalı */
  tryClimbOnto(c, fx, fz, h) {
    if (!c.walkable || this.carrying || (this.stats && this.stats.stamina < 10)) return false;
    const phys = this.session.world.physics;
    const top = c.maxY;
    for (const d of [1.05, 1.35, 1.7]) {
      const x = this.pos.x + fx * d, z = this.pos.z + fz * d;
      if (Math.abs(phys.groundHeight(x, z, top + 0.1) - top) > 0.12) continue;
      if (phys.overlapsBox(x - 0.28, z - 0.28, x + 0.28, z + 0.28, top + 0.05, top + 1.75)) continue;
      const tall = h > 1.5;
      const dur = tall ? 1.15 : 0.8;
      this.vault = { t: 0, dur, climb: true, from: this.pos.clone(), to: new THREE.Vector3(x, top, z), h: top };
      this.lockMove = dur;
      if (this.stats) this.stats.stamina -= tall ? 9 : 5;
      this.avatar.play(tall ? 'climbUp2' : 'climbUp', dur);
      this.session.audio && this.session.audio.play('swing', { at: this.pos, vol: 0.35, rate: 0.8 });
      return true;
    }
    return false;
  }

  stepVault(dt) {
    const v = this.vault;
    if (!v) return;
    v.t += dt / (v.dur || 0.45);
    const k = Math.min(1, v.t);
    if (v.climb) {
      // tırmanma: önce yüksel (tutunup çekin), sonra üstte öne geç
      const ky = smoothstep(0.05, 0.62, k), kx = smoothstep(0.45, 1, k);
      this.pos.x = THREE.MathUtils.lerp(v.from.x, v.to.x, kx);
      this.pos.z = THREE.MathUtils.lerp(v.from.z, v.to.z, kx);
      this.pos.y = THREE.MathUtils.lerp(v.from.y, v.to.y, ky);
    } else {
      this.pos.lerpVectors(v.from, v.to, k);
      this.pos.y = THREE.MathUtils.lerp(v.from.y, v.to.y, k) + Math.sin(k * Math.PI) * Math.max(0.3, v.h - v.from.y);
    }
    this.root.position.copy(this.pos);
    this.syncBody();
    if (k >= 1) { this.vault = null; this.vel.set(0, 0, 0); this.fallStartY = this.pos.y; }
  }

  startLadder(l) {
    this.mode = 'climb';
    this.ladder = l;
    this.pos.x = l.x; this.pos.z = l.z;
    this.vel.set(0, 0, 0);
    this.climbDir = this.pos.y < (l.top + l.bottom) / 2 ? 1 : -1;
    this.syncBody();
    this.avatar.play('ladderIn', 0.55);
  }

  updateLadder(dt, input) {
    const l = this.ladder;
    const dir = input.isDown('forward') ? 1 : input.isDown('back') ? -1 : 0;
    this.climbV = dir * 1.6;
    this.pos.y += this.climbV * dt;
    this.speed = Math.abs(dir) * 1.2;
    this.yaw = l.yaw ?? this.yaw;
    if (this.pos.y >= l.top - 0.05) {
      this.pos.y = l.top;
      const ax = l.exitX ?? l.cx ?? l.x, az = l.exitZ ?? l.cz ?? l.z;
      this.pos.x = ax; this.pos.z = az;
      this.mode = 'ground'; this.ladder = null;
      this.avatar.play('ladderOut', 0.7);
    } else if (this.pos.y <= l.bottom) {
      this.pos.y = l.bottom; this.mode = 'ground'; this.ladder = null;
      this.pos.x += Math.sin(this.yaw + Math.PI) * 0.6; this.pos.z += Math.cos(this.yaw + Math.PI) * 0.6;
    }
    if (input.wasPressed('jump')) { this.mode = 'ground'; this.ladder = null; }
    this.fallStartY = this.pos.y;
    this.root.position.copy(this.pos);
  }

  /** Üçüncü şahıs kamera: omuz üstü, duvar çarpışması, iniş titremesi */
  /**
   * Üçüncü şahıs kamera: yumuşak takip (yatayda hızlı, dikeyde yavaş: basamak/merdiven sarsıntısı süzülür),
   * duruşa göre yumuşak pivot yüksekliği ve omuz kayması, 5 ışınlı engel algılama (kenarlardan duvar içine
   * girmez; yaklaşırken hızlı, açılırken yavaş), yürüyüş adımına bağlı hafif sallanma, sarsıntı ve geri tepme.
   */
  updateCamera(dt) {
    const S = this.session;
    const cam = this.game.gfx.camera;
    const indoor = !!this.inside;
    const driving = this.mode === 'drive' || this.mode === 'seat';
    let dist = driving ? 8.5 : this.aiming ? 2.3 : indoor ? 3.2 : 4.4;
    if (this.mode === 'prone' || this.mode === 'downed') dist = 3.2;
    if (S.combat && S.combat.scoped && this.aiming) dist = 1.4;
    if (this.sprinting) dist += 0.45;
    this.camDist = damp(this.camDist, dist, 6, dt);
    this.camShoulder = damp(this.camShoulder ?? 0.42, this.aiming ? 0.62 : driving ? 0 : indoor ? 0.34 : 0.42, 9, dt);
    this.camDip = damp(this.camDip, 0, 7, dt);
    const pivotT = driving ? 2.2 : this.mode === 'prone' || this.mode === 'downed' ? 0.7 : this.mode === 'crouch' ? 1.25 : this.mode === 'swim' ? 1.0 : 1.62;
    this.camPivotY = damp(this.camPivotY ?? pivotT, pivotT, driving ? 12 : 7, dt);
    const base = driving && this.vehicle ? this.vehicle.vis || this.vehicle.pos : this.pos;
    // takip: araçta sıkı (hızda kadraj kaymasın), yürürken yatay hızlı / dikey yumuşak
    const cb = this.camBase || (this.camBase = base.clone());
    if (cb.distanceToSquared(base) > 36) cb.copy(base); // ışınlanma/araç değişimi
    cb.x = damp(cb.x, base.x, driving ? 40 : 22, dt);
    cb.z = damp(cb.z, base.z, driving ? 40 : 22, dt);
    cb.y = damp(cb.y, base.y, driving ? 25 : 11, dt);
    // adım sallanması: avatarın yürüyüş fazına bağlı (ayak basışında hafif çökme), koşuda belirgin, nişanda yok
    let bobY = 0, bobX = 0;
    if (!driving && !this.aiming && this.onGround && (this.mode === 'ground' || this.mode === 'crouch')) {
      const ph = (this.avatar.cycle || 0) * Math.PI * 2;
      const amp = Math.min(1, Math.max(0, (this.speed - 0.5) / 5)) * (this.sprinting ? 0.045 : 0.03);
      bobY = -Math.abs(Math.sin(ph)) * amp + amp * 0.5;
      bobX = Math.sin(ph) * amp * 0.45;
    }
    const pivotY = this.camPivotY - this.camDip + bobY;
    const yaw = this.camYaw, pitch = this.camPitch;
    const shoulder = this.camShoulder + bobX;
    const pivot = _v.set(cb.x, cb.y + pivotY, cb.z);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    pivot.x += rx * shoulder; pivot.z += rz * shoulder;
    const dirX = Math.sin(yaw) * Math.cos(pitch), dirY = -Math.sin(pitch), dirZ = Math.cos(yaw) * Math.cos(pitch);
    // engel: merkez + 4 köşe ışını (yakın düzlem genişliği kadar) → en kısa mesafe
    const filt = this._camFilt || (this._camFilt = (c) => c.blocksSight && c.kind !== 'tree' && !(c.owner && c.owner === this.inside && this.inside && c.kind === 'prop'));
    let free = this.camDist;
    const phys = S.world.physics;
    for (const [ox, oy] of [[0, 0], [0.22, 0.14], [-0.22, 0.14], [0.22, -0.14], [-0.22, -0.14]]) {
      const hit = phys.raycast(pivot.x + rx * ox, pivot.y + oy, pivot.z + rz * ox, dirX, dirY, dirZ, this.camDist + 0.3, filt);
      if (hit) free = Math.min(free, hit.dist - 0.28);
    }
    free = Math.max(0.55, free);
    // engel yaklaşınca hemen içeri, açılınca yavaşça geri
    this.camFree = this.camFree === undefined ? free : free < this.camFree ? damp(this.camFree, free, 30, dt) : damp(this.camFree, free, 3.5, dt);
    const d = Math.min(this.camDist, this.camFree);
    const tx = pivot.x + dirX * d, ty = pivot.y + dirY * d, tz = pivot.z + dirZ * d;
    const gy = S.world.terrain.heightAt(tx, tz) + 0.4;
    this.camPos.set(tx, Math.max(ty, gy), tz);
    cam.position.copy(this.camPos);
    if (this.camShake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.camShake * 0.25;
      cam.position.y += (Math.random() - 0.5) * this.camShake * 0.25;
      this.camShake = Math.max(0, this.camShake - dt * 3);
    }
    this.camTarget.set(pivot.x - dirX * 10, pivot.y - dirY * 10 + this.recoil * 0.4, pivot.z - dirZ * 10);
    cam.lookAt(this.camTarget);
  }

  /** Kameranın baktığı yön (nişan) */
  aimRay(out = { o: new THREE.Vector3(), d: new THREE.Vector3() }) {
    const cam = this.game.gfx.camera;
    out.o.copy(cam.position);
    cam.getWorldDirection(out.d);
    return out;
  }

  /** Ağ/animasyon durumu */
  animState() {
    const st = this.stats;
    const mode = this.vault ? (this.vault.climb ? 'ground' : 'air') : this.roll ? 'ground' : this.mode === 'swim' ? 'swim' : this.mode;
    // hareket yönü (gövdeye göre): strafe/geri animasyonları için
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const moveAngle = sp > 0.3 ? wrapAngle(Math.atan2(this.vel.x, this.vel.z) - this.yaw) : 0;
    return {
      mode, speed: this.mode === 'swim' ? this.speed * 0.6 : this.speed, vy: this.mode === 'climb' ? this.climbV || 0 : this.vel.y, yaw: this.yaw, pitch: -this.camPitch * 0.9,
      aim: this.aiming, recoil: this.recoil, steer: this.vehicle ? this.vehicle.steer : 0, emote: this.emote, carrying: !!this.carrying, carryBox: !!this.carryProp,
      mood: st && st.morale < 30 ? 1 : 0, tired: !!(st && st.stamina < 15), act: this.avatar.lastAct || null, moveAngle: this.roll ? 0 : moveAngle, grounded: this.onGround, sprint: this.sprinting, roll: !!this.roll,
    };
  }

  dispose() {
    if (this.unhook) this.unhook();
    if (this.body) this.body.dispose();
    this.avatar.dispose();
  }
}

export { wrapAngle };
