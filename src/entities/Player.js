// Yerel oyuncu: üçüncü şahıs hareket (yürü/koş/sprint/eğil/sürün/zıpla/tırman/yüz), kamera,
// etkileşim hedefleme, savaş girişi. Hareket Rapier karakter denetleyicisiyle sabit adımda yapılır:
// basamak çıkma, eğimde kayma, zemine yapışma, tavana çarpma, düşme hasarı. Çizim enterpolasyonludur.
import * as THREE from 'three';
import { Avatar } from './Avatar.js';
import { clamp, damp, dampAngle, wrapAngle } from '../core/util.js';
import { Settings } from '../core/Settings.js';

const GRAV = 21;
const JUMP_V = 6.1;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.14;
const _v = new THREE.Vector3();

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
      if (input.wasPressed('crouch')) this.wantStance = this.mode === 'crouch' ? 'stand' : 'crouch';
      if (input.wasPressed('prone')) this.wantStance = this.mode === 'prone' ? 'crouch' : 'prone';
    }
    if (st.downed) this.applyStance('downed');
    else if (this.mode === 'downed') { this.mode = 'ground'; this.applyStance('stand'); }
    else if (this.swimming) this.applyStance('stand');
    else this.applyStance(this.wantStance);
    const wantSprint = !uiBlocking && input.isDown('sprint') && moving && this.mode !== 'prone' && this.mode !== 'downed' && !this.aiming;
    const walkSlow = !uiBlocking && input.keyDown('AltLeft');
    const sm = st ? st.speedMul(this.session.overweight || 0) : 1;
    let target = 0;
    const base = 4.3 * (cs.speed || 1);
    if (moving) {
      if (this.mode === 'downed') target = 0.55;
      else if (this.mode === 'prone') target = 1.0;
      else if (this.mode === 'crouch') target = 2.0 * (cs.speed || 1);
      else if (walkSlow) target = 1.9;
      else if (wantSprint && st.stamina > 1) target = 6.7 * (cs.speed || 1);
      else target = this.aiming ? 2.4 : base;
      target *= sm;
      if (this.carrying) target *= 0.6;
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
    this.recoil = damp(this.recoil, 0, 9, dt);
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
  tryVault() {
    const phys = this.session.world.physics;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const px = this.pos.x + fx * 0.75, pz = this.pos.z + fz * 0.75;
    const c = phys.overlapsBox(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, this.pos.y + 0.3, this.pos.y + 1.2);
    if (!c) return false;
    const h = c.maxY - this.pos.y;
    if (h < 0.45 || h > 1.45) return false;
    const tx = this.pos.x + fx * 1.9, tz = this.pos.z + fz * 1.9;
    if (phys.overlapsBox(tx - 0.3, tz - 0.3, tx + 0.3, tz + 0.3, this.pos.y + 0.2, this.pos.y + 1.7)) return false;
    this.vault = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(tx, phys.groundHeight(tx, tz, this.pos.y + 0.6), tz), h: c.maxY + 0.35 };
    this.lockMove = 0.45;
    this.avatar.play('vault', 0.45);
    this.session.audio && this.session.audio.play('swing', { at: this.pos, vol: 0.4 });
    return true;
  }

  stepVault(dt) {
    const v = this.vault;
    if (!v) return;
    v.t += dt / 0.45;
    const k = Math.min(1, v.t);
    this.pos.lerpVectors(v.from, v.to, k);
    this.pos.y = THREE.MathUtils.lerp(v.from.y, v.to.y, k) + Math.sin(k * Math.PI) * Math.max(0.3, v.h - v.from.y);
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
  }

  updateLadder(dt, input) {
    const l = this.ladder;
    const dir = input.isDown('forward') ? 1 : input.isDown('back') ? -1 : 0;
    this.pos.y += dir * 2.2 * dt;
    this.speed = Math.abs(dir) * 1.5;
    this.yaw = l.yaw ?? this.yaw;
    if (this.pos.y >= l.top - 0.05) {
      this.pos.y = l.top;
      const ax = l.exitX ?? l.cx ?? l.x, az = l.exitZ ?? l.cz ?? l.z;
      this.pos.x = ax; this.pos.z = az;
      this.mode = 'ground'; this.ladder = null;
    } else if (this.pos.y <= l.bottom) {
      this.pos.y = l.bottom; this.mode = 'ground'; this.ladder = null;
      this.pos.x += Math.sin(this.yaw + Math.PI) * 0.6; this.pos.z += Math.cos(this.yaw + Math.PI) * 0.6;
    }
    if (input.wasPressed('jump')) { this.mode = 'ground'; this.ladder = null; }
    this.fallStartY = this.pos.y;
    this.root.position.copy(this.pos);
  }

  /** Üçüncü şahıs kamera: omuz üstü, duvar çarpışması, iniş titremesi */
  updateCamera(dt) {
    const S = this.session;
    const cam = this.game.gfx.camera;
    const indoor = !!this.inside;
    const driving = this.mode === 'drive' || this.mode === 'seat';
    let dist = driving ? 8.5 : this.aiming ? 2.3 : indoor ? 3.4 : 4.4;
    if (this.mode === 'prone') dist = 3.2;
    if (S.combat && S.combat.scoped && this.aiming) dist = 1.4;
    if (this.sprinting) dist += 0.35;
    this.camDist = damp(this.camDist, dist, 8, dt);
    const shoulder = this.aiming ? 0.62 : driving ? 0 : 0.42;
    this.camDip = damp(this.camDip, 0, 7, dt);
    const pivotY = (driving ? 2.2 : this.mode === 'prone' || this.mode === 'downed' ? 0.7 : this.mode === 'crouch' ? 1.3 : 1.62) - this.camDip;
    const base = driving && this.vehicle ? this.vehicle.vis || this.vehicle.pos : this.pos;
    const yaw = this.camYaw, pitch = this.camPitch;
    const pivot = _v.set(base.x, base.y + pivotY, base.z);
    const sx = Math.cos(yaw) * shoulder, sz = -Math.sin(yaw) * shoulder;
    pivot.x += sx; pivot.z += sz;
    const dirX = Math.sin(yaw) * Math.cos(pitch), dirY = -Math.sin(pitch), dirZ = Math.cos(yaw) * Math.cos(pitch);
    let d = this.camDist;
    const hit = S.world.physics.raycast(pivot.x, pivot.y, pivot.z, dirX, dirY, dirZ, d + 0.3, (c) => c.blocksSight && c.kind !== 'tree' && !(c.owner && c.owner === this.inside && indoor && c.kind === 'prop'));
    if (hit) d = Math.max(0.6, hit.dist - 0.3);
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
    const mode = this.vault ? 'air' : this.mode === 'swim' ? 'swim' : this.mode;
    // hareket yönü (gövdeye göre): strafe/geri animasyonları için
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const moveAngle = sp > 0.3 ? wrapAngle(Math.atan2(this.vel.x, this.vel.z) - this.yaw) : 0;
    return {
      mode, speed: this.mode === 'swim' ? this.speed * 0.6 : this.speed, vy: this.vel.y, yaw: this.yaw, pitch: -this.camPitch * 0.9,
      aim: this.aiming, recoil: this.recoil, steer: this.vehicle ? this.vehicle.steer : 0, emote: this.emote, carrying: !!this.carrying,
      mood: st && st.morale < 30 ? 1 : 0, moveAngle, grounded: this.onGround, sprint: this.sprinting,
    };
  }

  dispose() {
    if (this.unhook) this.unhook();
    if (this.body) this.body.dispose();
    this.avatar.dispose();
  }
}

export { wrapAngle };
