// Savaş sistemi (yerel oyuncu): yakın dövüş, ateşli silahlar, yay/arbalet mermileri,
// fırlatılabilirler (ses bombası, molotof). Ses seviyesi zombileri çeker; mühimmat sınırlı.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { clamp } from '../core/util.js';
import { Settings } from '../core/Settings.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class Combat {
  constructor(session) {
    this.s = session;
    this.cool = 0;
    this.swing = null;
    this.attacking = false;
    this.scoped = false;
    this.projectiles = [];
    this.reloading = null;
    this.spreadBloom = 0;
    const S = session;
    S.on('shot', (p, from) => { S.emit({ k: 'shot_fx', ...p, from }, { except: from }); S.applyAction('noise', { x: p.x, z: p.z, r: p.noise || 50, src: 'gun' }, from); });
    S.onEvt('shot_fx', (e) => {
      if (e.from === S.localId) return;
      S.fx.muzzle(e.x, e.y, e.z);
      S.fx.tracer(e.x, e.y, e.z, e.tx, e.ty, e.tz);
      S.audio.play(e.w || 'pistol', { at: e, vol: 0.9, range: 120 });
    });
    S.on('molotov', (p) => S.emit({ k: 'fire_area', x: p.x, y: p.y, z: p.z, r: p.r || 4, life: 12 }));
    S.onEvt('fire_area', (e) => { S.fx.fire(e.x, e.y, e.z, e.life, 1.4); S.audio.play('explosion', { at: e, vol: 0.6 }); if (S.isHost) this.fireAreas = [...(this.fireAreas || []), { ...e, t: e.life }]; });
  }

  get held() { return this.s.heldStack; }

  update(dt, input, blocking) {
    const S = this.s;
    const pl = S.local;
    this.cool = Math.max(0, this.cool - dt);
    this.spreadBloom = Math.max(0, this.spreadBloom - dt * 1.8);
    this.updateProjectiles(dt);
    this.updateFireAreas(dt);
    if (this.swing) this.updateSwing(dt);
    if (this.reloading) {
      this.reloading.t -= dt;
      if (this.reloading.t <= 0) this.finishReload();
    }
    const canAct = !blocking && input.locked && !S.localStats.downed && (pl.mode === 'ground' || pl.mode === 'crouch' || pl.mode === 'air' || pl.mode === 'prone');
    const st = this.held;
    const def = st ? ITEMS[st.id] : null;
    // nişan
    const canAim = canAct && def && (def.gun || def.throwable || def.id === 'binoculars');
    pl.aiming = canAim && input.mouse.right;
    this.scoped = pl.aiming && def && (def.id === 'binoculars' || (def.gun && def.gun.scope));
    const cam = S.game.gfx.camera;
    const fov = Settings.get('graphics.fov');
    // depar: hız hissi için hafif geniş açı; nişan/dürbün daraltır
    const targetFov = this.scoped ? (def.id === 'binoculars' ? 18 : 28) : pl.aiming ? fov - 14 : pl.sprinting ? fov + 7 : fov;
    if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * (pl.sprinting || cam.fov > fov ? 5 : 10)); cam.updateProjectionMatrix(); }
    S.ui.setCrosshair(pl.aiming || (def && def.gun) ? (this.scoped ? 'scope' : 'aim') : canAct ? 'dot' : null, this.currentSpread(def));
    this.attacking = this.swing !== null;
    if (!canAct || S.interact.hold || pl.carrying) return;
    // elde taşınan nesne: sol tık fırlatır (silah/vuruş yok)
    if (pl.carryProp) { if (input.mouse.leftPressed) pl.dropProp(true); return; }
    const reviveTarget = S.interact.target && S.interact.target.kind === 'revive';
    if (input.wasPressed('reload') && def && def.gun && !S.build.placing && !reviveTarget) this.reload();
    if (!(input.mouse.leftPressed || (input.mouse.left && def && def.gun && def.gun.auto))) return;
    if (S.build.placing) return;
    if (!def) { this.melee({ dmg: 9, speed: 1.4, range: 1.3, noise: 3, kind: 'blunt' }, null); return; }
    if (def.gun) this.fire(st, def);
    else if (def.melee) this.melee(def.melee, st);
    else if (def.throwable) this.throwItem(st, def);
    else if (def.use && input.mouse.leftPressed) S.useItem(S.hotbarIndex);
    else if (input.mouse.leftPressed) this.melee({ dmg: 9, speed: 1.4, range: 1.3, noise: 3, kind: 'blunt' }, null);
  }

  currentSpread(def) {
    if (!def || !def.gun) return 0;
    const pl = this.s.local;
    let s = def.gun.spread * (pl.aiming ? 1 : 3) + this.spreadBloom * 0.05;
    if (pl.speed > 1) s += 0.02 * Math.min(1, pl.speed / 4);
    if (pl.mode === 'crouch' || pl.mode === 'prone') s *= 0.7;
    s /= (this.s.localProfile.stats.aim || 1);
    return s;
  }

  // ======================================================================= yakın dövüş
  melee(m, stack) {
    const S = this.s;
    if (this.cool > 0 || this.swing) return;
    if (S.localStats.stamina < 5) { S.ui.toast('Çok yorgunsun!', 'warn', 1); return; }
    const dur = 0.55 / (m.speed || 1);
    this.cool = dur + 0.08;
    this.swing = { t: 0, dur, m, stack, hitDone: false };
    S.localStats.stamina -= 6 / (S.localProfile.stats.stamina / 100 || 1);
    S.local.avatar.play('melee', dur, S.local.avatar.holdKind === 'melee2' ? 'melee2' : 'melee1');
    S.audio.play('swing', { vol: 0.5 });
    // yüzü kameraya çevir
    S.local.yaw = S.local.camYaw + Math.PI;
  }

  updateSwing(dt) {
    const S = this.s;
    const sw = this.swing;
    sw.t += dt;
    if (!sw.hitDone && sw.t >= sw.dur * 0.48) {
      sw.hitDone = true;
      const pl = S.local;
      const m = sw.m;
      const range = m.range + 0.4;
      const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
      let hits = 0;
      const mul = (S.localProfile.stats.melee || 1);
      for (const [id, v] of S.zombies.views) {
        if (v.state.dead) continue;
        const dx = v.pos.x - pl.pos.x, dz = v.pos.z - pl.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > range + (v.type === 'heavy' || v.type === 'leader' ? 0.4 : 0)) continue;
        if (Math.abs(v.pos.y - pl.pos.y) > 1.5) continue;
        const dot = (dx * fx + dz * fz) / (d || 1);
        if (dot < 0.35 && d > 0.8) continue;
        const crit = Math.random() < 0.12;
        const dmg = Math.round(m.dmg * mul * (crit ? 1.8 : 1) * (0.9 + Math.random() * 0.2));
        S.act('zombie_hit', { id, dmg, dir: [dx / (d || 1), dz / (d || 1)], kind: 'melee' });
        S.fx.hit(v.pos.x, v.pos.y + 1.3, v.pos.z, 'flesh');
        if (Settings.get('gameplay.damageNumbers')) S.fx.text(v.pos.x, v.pos.y + 2.1, v.pos.z, String(dmg), crit ? '#ffd23f' : '#ffffff');
        v.flinch();
        hits++;
        if (m.kind !== 'blunt' || hits >= 2) break;
      }
      // düşman insanlar / NPC'ler / hayvanlar
      hits += S.npcs.meleeHit(pl.pos, fx, fz, range, m.dmg * mul);
      if (hits) {
        S.audio.play('hit', { vol: 0.9 });
        S.local.camShake = Settings.get('gameplay.cameraShake') ? 0.25 : 0;
        if (sw.stack && sw.stack.dur !== undefined) { sw.stack.dur -= 1; if (sw.stack.dur <= 0) this.breakItem(sw.stack); }
      } else {
        // ağaç kesme / yapıya vurma
        this.hitWorld(pl, fx, fz, range, sw.stack);
      }
      S.act('noise', { x: pl.pos.x, z: pl.pos.z, r: m.noise * 2, src: 'melee' });
    }
    if (sw.t >= sw.dur) this.swing = null;
  }

  hitWorld(pl, fx, fz, range, stack) {
    const S = this.s;
    const def = stack ? ITEMS[stack.id] : null;
    const px = pl.pos.x + fx * range * 0.8, pz = pl.pos.z + fz * range * 0.8;
    const list = S.world.physics.query(px - 0.6, pz - 0.6, px + 0.6, pz + 0.6);
    for (const c of list) {
      if (c.kind === 'tree' && def && def.tool && def.tool.includes('axe')) {
        c.chops = (c.chops || 0) + 1;
        S.fx.hit(c.x, pl.pos.y + 1.2, c.z, 'wood');
        S.audio.play('hit', { vol: 0.7, rate: 1.4 });
        if (c.chops >= 4) { c.chops = 0; S.giveLocal('log', 1); S.ui.toast('+1 Kütük', 'good', 1.5); if (stack.dur !== undefined) stack.dur -= 2; }
        return;
      }
      if (c.kind === 'structure' && c.owner) { S.fx.hit(px, pl.pos.y + 1, pz, 'wood'); S.audio.play('hit', { vol: 0.6 }); return; }
      if (c.kind === 'rock' && def && def.tool && def.tool.includes('hammer')) {
        S.fx.hit(px, pl.pos.y + 1, pz, 'stone');
        if (Math.random() < 0.15) { S.giveLocal('scrap_metal', 1); S.ui.toast('+1 Hurda Metal (taş arasında)', 'good', 1.5); }
        return;
      }
    }
  }

  breakItem(stack) {
    const S = this.s;
    const i = S.inventory.slots.indexOf(stack);
    if (i >= 0) { S.inventory.slots[i] = null; S.inventory.changed(); }
    S.ui.toast(`${ITEMS[stack.id].name} kırıldı!`, 'warn');
    S.selectHotbar(S.hotbarIndex);
    S.audio.play('break', { vol: 0.8 });
  }

  // ======================================================================= ateşli silahlar
  fire(stack, def) {
    const S = this.s;
    const g = def.gun;
    if (this.cool > 0 || this.reloading) return;
    if ((stack.ammo || 0) <= 0) {
      this.cool = 0.25;
      S.audio.play('empty', { vol: 0.8 });
      if (S.inventory.count(g.ammo) > 0) this.reload();
      else S.ui.toast(`${ITEMS[g.ammo].name} kalmadı!`, 'warn', 1.5);
      return;
    }
    this.cool = g.rate;
    stack.ammo--;
    if (stack.dur !== undefined) { stack.dur -= 0.5; if (stack.dur <= 0) { this.breakItem(stack); return; } }
    S.inventory.changed();
    const pl = S.local;
    pl.yaw = pl.camYaw + Math.PI;
    pl.recoil = Math.min(2, pl.recoil + g.recoil);
    pl.camPitch = clamp(pl.camPitch - g.recoil * 0.035, -1.25, 1.0);
    this.spreadBloom = Math.min(1.5, this.spreadBloom + g.recoil * 0.4);
    pl.avatar.play('shoot', 0.15);
    const cam = S.game.gfx.camera;
    cam.getWorldDirection(_d);
    _o.copy(cam.position);
    // namlu konumu ~ sağ el
    const mx = pl.pos.x + Math.sin(pl.yaw) * 0.6 + Math.cos(pl.yaw) * -0.25, my = pl.pos.y + 1.45, mz = pl.pos.z + Math.cos(pl.yaw) * 0.6 - Math.sin(pl.yaw) * -0.25;
    if (g.projectile) {
      this.spawnArrow(mx, my, mz, _d.clone(), g, stack);
      S.audio.play('bow', { vol: 0.8 });
      return;
    }
    const pellets = g.pellets || 1;
    const spread = this.currentSpread(def);
    let lastHit = null;
    for (let k = 0; k < pellets; k++) {
      const dir = _d.clone();
      dir.x += (Math.random() - 0.5) * spread * 2; dir.y += (Math.random() - 0.5) * spread * 2; dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      const res = this.raycastTargets(_o, dir, g.range);
      lastHit = res;
      const end = res.point;
      if (k < 3) S.fx.tracer(mx, my, mz, end.x, end.y, end.z);
      if (res.zombie) {
        const fall = res.dist > g.range * 0.5 ? 0.7 : 1;
        const head = res.head;
        const dmg = Math.round(g.dmg * (head ? 2 : 1) * fall * (S.localProfile.stats.aim > 1 ? 1.1 : 1));
        S.act('zombie_hit', { id: res.zombie, dmg, dir: [dir.x, dir.z], kind: 'gun' });
        S.fx.hit(end.x, end.y, end.z, 'flesh');
        if (Settings.get('gameplay.damageNumbers')) S.fx.text(end.x, end.y + 0.5, end.z, head ? `${dmg}!` : String(dmg), head ? '#ffd23f' : '#ffffff');
      } else if (res.npc) {
        S.npcs.shotHit(res.npc, g.dmg);
      } else if (res.prop) {
        S.fx.hit(end.x, end.y, end.z, res.prop.def.shape === 'cyl' ? 'metal' : 'wood');
        if (res.prop.def.shape === 'cyl') S.fx.sparks(end.x, end.y, end.z);
        S.props.shoot(res.prop, end, dir, (g.dmg / 30) / pellets);
      } else if (res.collider) {
        S.fx.hit(end.x, end.y, end.z, res.collider.kind === 'wall' ? 'stone' : res.collider.kind === 'window' ? 'metal' : 'wood');
        if (res.collider.kind === 'window' && res.collider.owner) S.act('window_damage', { id: res.collider.owner.id, dmg: 100 });
        if (res.collider.kind === 'vehicle') S.fx.sparks(end.x, end.y, end.z);
      } else S.fx.dust(end.x, end.y, end.z, 3);
    }
    S.fx.muzzle(mx, my, mz);
    const w = def.id === 'shotgun' ? 'shotgun' : def.id === 'rifle' ? 'rifle' : def.id === 'smg' ? 'smg' : 'pistol';
    S.audio.play(w, { vol: 1 });
    const end = lastHit ? lastHit.point : { x: mx, y: my, z: mz };
    S.act('shot', { x: mx, y: my, z: mz, tx: end.x, ty: end.y, tz: end.z, w, noise: g.noise });
    S.local.camShake = Settings.get('gameplay.cameraShake') ? g.recoil * 0.4 : 0;
  }

  /** Işın: dünya + zombi silindirleri + düşman NPC'ler */
  raycastTargets(o, d, range) {
    const S = this.s;
    const hit = S.world.physics.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range, (c) => c.blocksBullets && c.kind !== 'floor');
    let best = hit ? hit.dist : range;
    let res = { dist: best, collider: hit ? hit.collider : null, point: hit ? hit.point : { x: o.x + d.x * range, y: o.y + d.y * range, z: o.z + d.z * range } };
    // oyuncunun kendi gövdesini atlamak için kameradan başlayan ışında en az 1.5 m
    for (const [id, v] of S.zombies.views) {
      if (v.state.dead || !v.root.visible) continue;
      const r = v.type === 'heavy' || v.type === 'leader' ? 0.7 : v.type === 'bloater' ? 0.62 : v.type === 'crawler' ? 0.55 : v.type === 'dog' ? 0.45 : 0.42;
      const h = v.type === 'dog' ? 0.9 : v.type === 'crawler' ? 0.55 : v.type === 'heavy' || v.type === 'leader' ? 2.6 : 1.85;
      const t = rayCyl(o, d, v.pos.x, v.pos.z, r, v.pos.y, v.pos.y + h);
      if (t !== null && t > 1.5 && t < best) {
        best = t;
        const py = o.y + d.y * t;
        res = { dist: t, zombie: id, head: py > v.pos.y + h * 0.78, point: { x: o.x + d.x * t, y: py, z: o.z + d.z * t } };
      }
    }
    const n = S.npcs.rayHit(o, d, best);
    if (n) { res = n; best = n.dist ?? best; }
    // fiziksel nesneler (varil, kasa, çöp kutusu)
    const ph = S.props.rayHit(o, d, best);
    if (ph && ph.dist > 1.2 && ph.dist < best) res = { dist: ph.dist, prop: ph.prop, point: ph.point };
    return res;
  }

  reload() {
    const S = this.s;
    const st = this.held;
    if (!st) return;
    const def = ITEMS[st.id];
    if (!def.gun || this.reloading) return;
    const g = def.gun;
    const have = S.inventory.count(g.ammo);
    if ((st.ammo || 0) >= g.mag) return;
    if (!have) { S.ui.toast(`${ITEMS[g.ammo].name} yok!`, 'warn', 1.5); return; }
    this.reloading = { t: g.reload, stack: st };
    S.local.avatar.play('reload', g.reload);
    S.audio.play('weapon_change', { vol: 0.6 });
    S.ui.progress('Şarjör değiştiriliyor…', g.reload);
  }

  finishReload() {
    const S = this.s;
    const st = this.reloading.stack;
    this.reloading = null;
    if (!st || S.inventory.slots.indexOf(st) < 0) return;
    const g = ITEMS[st.id].gun;
    const need = g.mag - (st.ammo || 0);
    const got = S.inventory.remove(g.ammo, need);
    st.ammo = (st.ammo || 0) + got;
    S.inventory.changed();
  }

  // ======================================================================= ok / fırlatma
  spawnArrow(x, y, z, dir, g, stack) {
    const S = this.s;
    const mesh = S.game.itemModels.make('arrow');
    mesh.position.set(x, y, z);
    S.game.scene.add(mesh);
    const speed = 42;
    this.projectiles.push({ kind: 'arrow', mesh, x, y, z, vx: dir.x * speed, vy: dir.y * speed + 0.5, vz: dir.z * speed, dmg: g.dmg, life: 4, ammo: g.ammo });
    void stack;
  }

  throwItem(stack, def) {
    const S = this.s;
    if (this.cool > 0) return;
    this.cool = 0.8;
    const i = S.inventory.slots.indexOf(stack);
    S.inventory.takeAt(i, 1);
    S.selectHotbar(S.hotbarIndex);
    const cam = S.game.gfx.camera;
    cam.getWorldDirection(_d);
    const pl = S.local;
    const mesh = S.game.itemModels.make(def.id);
    const x = pl.pos.x, y = pl.pos.y + 1.6, z = pl.pos.z;
    mesh.position.set(x, y, z);
    S.game.scene.add(mesh);
    const sp = 16;
    this.projectiles.push({ kind: def.throwable.kind, mesh, x, y, z, vx: _d.x * sp, vy: _d.y * sp + 4, vz: _d.z * sp, life: 5, def });
    pl.avatar.play('throw', 0.5);
    S.audio.play('swing', { vol: 0.6 });
  }

  updateProjectiles(dt) {
    const S = this.s;
    const phys = S.world.physics;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vy -= (p.kind === 'arrow' ? 6 : 14) * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      const d = new THREE.Vector3(nx - p.x, ny - p.y, nz - p.z);
      const len = d.length();
      d.normalize();
      let done = false;
      if (p.kind === 'arrow') {
        const res = this.raycastTargets(new THREE.Vector3(p.x, p.y, p.z), d, len + 0.05);
        if (res.zombie && res.dist <= len + 0.05) {
          S.act('zombie_hit', { id: res.zombie, dmg: Math.round(p.dmg * (res.head ? 2 : 1)), dir: [d.x, d.z], kind: 'gun' });
          S.fx.hit(res.point.x, res.point.y, res.point.z, 'flesh');
          if (Settings.get('gameplay.damageNumbers')) S.fx.text(res.point.x, res.point.y + 0.5, res.point.z, String(Math.round(p.dmg * (res.head ? 2 : 1))), '#ffffff');
          if (Math.random() < 0.5) S.act('ground_drop', { stack: { id: p.ammo, qty: 1 }, x: res.point.x, y: res.point.y, z: res.point.z });
          done = true;
        } else if (res.npc && res.dist <= len + 0.05) { S.npcs.shotHit(res.npc, p.dmg); done = true; }
        else if (res.dist <= len) {
          S.fx.hit(res.point.x, res.point.y, res.point.z, 'wood');
          if (Math.random() < 0.65) S.act('ground_drop', { stack: { id: p.ammo, qty: 1 }, x: res.point.x, y: res.point.y + 0.2, z: res.point.z, v: [0, 0, 0] });
          done = true;
        }
        p.mesh.lookAt(nx + d.x, ny + d.y, nz + d.z);
        p.mesh.rotateY(Math.PI / 2);
      } else {
        const g = phys.groundHeight(nx, nz, p.y + 0.5);
        const r = phys.resolveCircle(nx, nz, 0.1, ny, ny + 0.2, 0.1);
        if (ny <= g + 0.1 || r.hit) done = true;
        p.mesh.rotation.x += dt * 8;
      }
      p.x = nx; p.y = ny; p.z = nz;
      p.mesh.position.set(nx, ny, nz);
      if (done || p.life <= 0) {
        S.game.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        if (p.kind === 'noise') {
          S.act('noise', { x: p.x, z: p.z, r: 70, src: 'lure' });
          S.fx.smoke(p.x, p.y + 0.3, p.z, 12, '#d0d0d0');
          S.audio.play('alert', { at: { x: p.x, y: p.y, z: p.z }, vol: 1, range: 70 });
          S.ui.toast('Ses bombası zombileri çekiyor!', 'info', 2);
        } else if (p.kind === 'glass') {
          // dikkat dağıtıcı: kırılan şişe (cam kırıkları + 32 m ses) → zombiler sesin yerine gider
          S.act('noise', { x: p.x, z: p.z, r: p.def.throwable.noise || 32, src: 'bottle' });
          if (S.props) S.props.burst(p.x, p.y + 0.1, p.z, 'glass', 1, [p.vx * 0.05, p.vz * 0.05]);
          S.audio.play('glass', { at: { x: p.x, y: p.y, z: p.z }, vol: 0.8, range: 40 });
        } else if (p.kind === 'fire') {
          S.act('molotov', { x: p.x, y: S.world.terrain.heightAt(p.x, p.z), z: p.z, r: 4 });
          S.act('noise', { x: p.x, z: p.z, r: 30, src: 'fire' });
          S.audio.play('glass', { at: { x: p.x, y: p.y, z: p.z }, vol: 1 });
        }
      }
    }
  }

  updateFireAreas(dt) {
    const S = this.s;
    if (!S.isHost || !this.fireAreas) return;
    for (let i = this.fireAreas.length - 1; i >= 0; i--) {
      const f = this.fireAreas[i];
      f.t -= dt;
      for (const z of S.zombies.list.values()) {
        if (z.dead) continue;
        if (Math.hypot(z.x - f.x, z.z - f.z) < f.r) { z.hp -= 18 * dt; z.slow = 0.4; if (z.hp <= 0) S.zombies.kill(z, null); }
      }
      if (f.t <= 0) this.fireAreas.splice(i, 1);
    }
  }
}

function rayCyl(o, d, cx, cz, r, y0, y1) {
  const fx = o.x - cx, fz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return null;
  const b = 2 * (fx * d.x + fz * d.z);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const y = o.y + d.y * t;
    if (y >= y0 && y <= y1) return t;
  }
  return null;
}

export { rayCyl };
