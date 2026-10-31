// Yerel oyuncu: üçüncü şahıs hareket (yürü/koş/sprint/eğil/sürün/zıpla/tırman/yüz), kamera,
// etkileşim hedefleme, savaş girişi. Durumu ağa Avatar anim nesnesiyle yayınlanır.
import * as THREE from 'three';
import { Avatar } from './Avatar.js';
import { clamp, damp, dampAngle, wrapAngle } from '../core/util.js';
import { Settings } from '../core/Settings.js';

const GRAV = 19;
const RADIUS = 0.32;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _res = { x: 0, z: 0, hit: false, hits: [] };

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
    this.mode = 'ground'; // ground | crouch | prone | air | climb | drive | seat | downed | sleep | dead | swim
    this.onGround = true;
    this.sprinting = false;
    this.aiming = false;
    this.walkToggle = false;
    this.speed = 0;
    this.noise = 0;
    this.fallStartY = 0;
    this.ladder = null;
    this.vehicle = null;
    this.seat = -1;
    this.lockMove = 0; // aksiyon kilidi (sn)
    this.recoil = 0;
    this.camShake = 0;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.lastSafe = new THREE.Vector3();
    this.inside = null; // içinde olunan bina
    this.emote = null;
    this.carrying = null;
  }

  get stats() { return this.session.localStats; }
  get charStats() { return this.profile.stats; }

  spawnAt(x, y, z, rot = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = rot; this.camYaw = rot + Math.PI;
    this.avatar.visYaw = rot;
    this.lastSafe.copy(this.pos);
    this.root.position.copy(this.pos);
    this.camPos.set(x - Math.sin(rot) * 4, y + 2.5, z - Math.cos(rot) * 4);
  }

  /** Yerel girdiyle hareket. dt sn */
  update(dt, input, uiBlocking) {
    const S = this.session;
    const phys = S.world.physics;
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
    if (st.downed) this.mode = 'downed';
    if (this.mode === 'drive' || this.mode === 'seat') { this.updateCamera(dt); return; }
    if (this.mode === 'sleep') { this.updateCamera(dt); return; }
    if (this.mode === 'climb') { this.updateLadder(dt, input, uiBlocking); this.updateCamera(dt); return; }
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
    // kameraya göre ileri yön = kameradan karaktere
    const fx = cy, fz = cyc;
    const rx = fz, rz = -fx; // sol/sağ
    let dx = fx * mz + rx * mx, dz = fz * mz + rz * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 0) { dx /= dl; dz /= dl; }
    // ---- duruş geçişleri
    if (!uiBlocking && st && !st.downed) {
      if (input.wasPressed('crouch')) this.mode = this.mode === 'crouch' ? 'ground' : this.mode === 'prone' ? 'crouch' : 'crouch';
      if (input.wasPressed('prone')) this.mode = this.mode === 'prone' ? 'crouch' : 'prone';
    }
    if (this.mode === 'downed' && !st.downed) this.mode = 'ground';
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
    }
    this.sprinting = wantSprint && st.stamina > 1 && target > base * sm;
    if (this.sprinting) st.stamina = Math.max(0, st.stamina - 13 * dt);
    else st.stamina = Math.min(st.staminaMaxNow(), st.stamina + (moving ? 6 : 11) * dt);
    // su içinde
    const terrain = S.world.terrain;
    const waterLvl = terrain.waterLevelAt(this.pos.x, this.pos.z);
    const groundH = terrain.heightAt(this.pos.x, this.pos.z);
    const swimming = waterLvl - groundH > 1.15 && this.pos.y < waterLvl - 0.6;
    if (swimming) { target *= 0.45; this.mode = this.mode === 'downed' ? 'downed' : 'swim'; st.stamina = Math.max(0, st.stamina - 4 * dt); }
    else if (this.mode === 'swim') this.mode = 'ground';
    // ivme
    const accel = this.onGround || swimming ? 14 : 3;
    const tvx = dx * target, tvz = dz * target;
    this.vel.x = damp(this.vel.x, tvx, accel, dt);
    this.vel.z = damp(this.vel.z, tvz, accel, dt);
    // yön: nişan alırken kameraya, değilse hareket yönüne
    if (this.aiming || (this.session.combat && this.session.combat.attacking)) this.yaw = dampAngle(this.yaw, this.camYaw + Math.PI, 30, dt);
    else if (moving && target > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), this.mode === 'prone' ? 4 : 12, dt);
    // zıplama / tırmanma (vault)
    if (!uiBlocking && input.wasPressed('jump') && st && !st.downed) {
      if (this.mode === 'crouch' || this.mode === 'prone') this.mode = 'ground';
      else if (this.onGround && !swimming && this.tryVault()) { /* vault */ }
      else if (this.onGround && st.stamina > 6) {
        this.vel.y = 5.6; this.onGround = false; this.mode = 'air'; st.stamina -= 6;
        this.fallStartY = this.pos.y;
        S.audio && S.audio.play('jump', { at: this.pos, vol: 0.4 });
      }
    }
    // yerçekimi
    if (swimming) { this.vel.y = damp(this.vel.y, (waterLvl - 0.85 - this.pos.y) * 4, 6, dt); }
    else this.vel.y -= GRAV * dt;
    // ---- entegrasyon + çarpışma
    const height = this.mode === 'prone' || this.mode === 'downed' ? 0.6 : this.mode === 'crouch' ? 1.2 : 1.75;
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    let ny = this.pos.y + this.vel.y * dt;
    const res = phys.resolveCircle(nx, nz, RADIUS, this.pos.y, this.pos.y + height, 0.55, null, _res);
    nx = res.x; nz = res.z;
    if (res.hit) this.lastHits = res.hits; else this.lastHits = null;
    // araçlarla çarpışma (dinamik)
    if (S.vehicles) { const p = S.vehicles.pushOut(nx, nz, RADIUS, this.pos.y); nx = p.x; nz = p.z; }
    const g = phys.groundHeight(nx, nz, this.pos.y, 0.55, RADIUS * 0.5);
    if (ny <= g + 0.001) {
      if (!this.onGround) {
        const fall = this.fallStartY - g;
        if (fall > 3.2 && st) { const dmg = (fall - 3.2) * 9; st.damage(dmg, 'fall'); this.session.onLocalDamaged(dmg, 'fall'); }
        if (this.vel.y < -4) S.audio && S.audio.play('land', { at: this.pos, vol: 0.5 });
        if (this.mode === 'air') this.mode = 'ground';
      }
      ny = g; this.vel.y = 0; this.onGround = true;
    } else {
      if (this.onGround && ny < g + 0.6 && this.vel.y <= 0) { ny = g; this.vel.y = 0; } // aşağı basamak
      else { if (this.onGround) this.fallStartY = this.pos.y; this.onGround = false; if (this.mode !== 'swim' && this.mode !== 'downed') this.mode = 'air'; }
    }
    if (ny < -30) { ny = this.lastSafe.y + 1; nx = this.lastSafe.x; nz = this.lastSafe.z; } // zemin altına düşme koruması
    this.pos.set(nx, ny, nz);
    if (this.onGround && !swimming) this.lastSafe.copy(this.pos);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    // gürültü: koşu/sprint ses yapar, eğilmek sessiz
    const stealth = cs.stealth || 1;
    this.noise = this.speed < 0.3 ? 0 : (this.mode === 'crouch' || this.mode === 'prone' ? 2 : this.sprinting ? 14 : this.speed > 3 ? 8 : 4) / stealth;
    this.lockMove = Math.max(0, this.lockMove - dt);
    this.recoil = damp(this.recoil, 0, 9, dt);
    this.root.position.copy(this.pos);
    this.updateCamera(dt);
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
    // karşı taraf boş mu
    const tx = this.pos.x + fx * 1.9, tz = this.pos.z + fz * 1.9;
    if (phys.overlapsBox(tx - 0.3, tz - 0.3, tx + 0.3, tz + 0.3, this.pos.y + 0.2, this.pos.y + 1.7)) return false;
    this.vault = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(tx, phys.groundHeight(tx, tz, this.pos.y + 0.6), tz), h: c.maxY + 0.35 };
    this.lockMove = 0.45;
    this.avatar.play('pickup', 0.45);
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
    if (k >= 1) { this.vault = null; this.vel.set(0, 0, 0); }
  }

  startLadder(l) {
    this.mode = 'climb';
    this.ladder = l;
    this.pos.x = l.x; this.pos.z = l.z;
    this.vel.set(0, 0, 0);
    this.climbDir = this.pos.y < (l.top + l.bottom) / 2 ? 1 : -1;
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
    this.root.position.copy(this.pos);
  }

  /** Üçüncü şahıs kamera: omuz üstü, duvar çarpışması */
  updateCamera(dt) {
    const S = this.session;
    const cam = this.game.gfx.camera;
    const indoor = !!this.inside;
    const driving = this.mode === 'drive' || this.mode === 'seat';
    let dist = driving ? 8.5 : this.aiming ? 2.3 : indoor ? 3.4 : 4.4;
    if (this.mode === 'prone') dist = 3.2;
    if (S.combat && S.combat.scoped && this.aiming) dist = 1.4;
    this.camDist = damp(this.camDist, dist, 8, dt);
    const shoulder = this.aiming ? 0.62 : driving ? 0 : 0.42;
    const pivotY = driving ? 2.2 : this.mode === 'prone' || this.mode === 'downed' ? 0.7 : this.mode === 'crouch' ? 1.3 : 1.62;
    const base = driving && this.vehicle ? this.vehicle.pos : this.pos;
    const yaw = this.camYaw, pitch = this.camPitch;
    const pivot = _v.set(base.x, base.y + pivotY, base.z);
    // omuz kayması (kamera sağa)
    const sx = Math.cos(yaw) * shoulder, sz = -Math.sin(yaw) * shoulder;
    pivot.x += sx; pivot.z += sz;
    const dirX = Math.sin(yaw) * Math.cos(pitch), dirY = -Math.sin(pitch), dirZ = Math.cos(yaw) * Math.cos(pitch);
    let d = this.camDist;
    // duvar çarpışması
    const hit = S.world.physics.raycast(pivot.x, pivot.y, pivot.z, dirX, dirY, dirZ, d + 0.3, (c) => c.blocksSight && c.kind !== 'tree' && !(c.owner && c.owner === this.inside && indoor && c.kind === 'prop'));
    if (hit) d = Math.max(0.6, hit.dist - 0.3);
    const tx = pivot.x + dirX * d, ty = pivot.y + dirY * d, tz = pivot.z + dirZ * d;
    // araziye gömülmesin
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
    const mode = this.vault ? 'air' : this.mode === 'swim' ? 'ground' : this.mode;
    return {
      mode, speed: this.mode === 'swim' ? this.speed * 0.6 : this.speed, vy: this.vel.y, yaw: this.yaw, pitch: -this.camPitch * 0.9,
      aim: this.aiming, recoil: this.recoil, steer: this.vehicle ? this.vehicle.steer : 0, emote: this.emote, carrying: !!this.carrying,
      mood: st && st.morale < 30 ? 1 : 0,
    };
  }
}

export { wrapAngle };
