// Etkileşim sistemi: oyuncunun önündeki en uygun hedefi bulur (eşya, konteyner, kapı, pencere,
// yapı, araç, NPC, takım arkadaşı, özel noktalar), istemi gösterir ve eylemi başlatır.
// Kapı/pencere durumları da burada (host olaylarıyla) uygulanır.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { LOOT } from '../data/loot.js';
import { PROJECTS } from '../data/buildables.js';
import { clamp } from '../core/util.js';

export class Interact {
  constructor(session) {
    this.s = session;
    this.target = null;
    this.hold = null; // {target, t, dur, onDone}
    const S = session;
    const W = S.world;
    this.doorById = new Map(W.doors.map((d) => [d.id, d]));
    this.winById = new Map(W.windows.map((w) => [w.id, w]));
    for (const d of W.doors) if (d.origLocked === undefined) d.origLocked = d.locked;
    // ---- eylemler (host)
    S.on('door', (p, from) => {
      const d = this.doorById.get(p.id);
      if (!d || d.broken) return;
      if (d.locked && !p.unlock) return;
      S.emit({ k: 'door', id: d.id, target: p.open ? 1 : 0, locked: p.unlock ? false : d.locked });
    });
    S.on('door_damage', (p) => {
      const d = this.doorById.get(p.id);
      if (!d || d.broken) return;
      if (d.barricade > 0) { d.bhp = (d.bhp ?? 150) - p.dmg; if (d.bhp <= 0) { d.bhp = 150; S.emit({ k: 'door', id: d.id, barricade: d.barricade - 1 }); } return; }
      const hp = d.hp - p.dmg;
      if (hp <= 0) S.emit({ k: 'door', id: d.id, broken: true, hp: 0 });
      else { d.hp = hp; if (Math.random() < 0.25) S.emit({ k: 'door', id: d.id, hp }); }
    });
    S.on('door_reinforce', (p) => {
      const d = this.doorById.get(p.id);
      if (!d || d.broken || d.barricade >= 3) return;
      S.emit({ k: 'door', id: d.id, barricade: d.barricade + 1 });
    });
    S.on('door_repair', (p) => { const d = this.doorById.get(p.id); if (d) S.emit({ k: 'door', id: d.id, broken: false, hp: d.maxHp, target: 0 }); });
    S.on('window_damage', (p) => {
      const w = this.winById.get(p.id);
      if (!w) return;
      if (w.barricade > 0) {
        w.bhp = (w.bhp ?? 150) - p.dmg;
        if (w.bhp <= 0) { w.bhp = 150; S.emit({ k: 'window', id: w.id, barricade: w.barricade - 1 }); }
        return;
      }
      if (w.broken) return;
      const hp = w.hp - p.dmg;
      if (hp <= 0) S.emit({ k: 'window', id: w.id, broken: true, hp: 0 });
      else w.hp = hp;
    });
    S.on('window_board', (p, from) => {
      const w = this.winById.get(p.id);
      if (!w || w.barricade >= 3) return;
      S.emit({ k: 'window', id: w.id, barricade: w.barricade + 1 });
      if (w.building && w.building.id === 'home') S.applyAction('flag', { flag: 'window_boarded', add: 1 }, from);
    });
    // ---- olaylar (herkes)
    S.onEvt('door', (e) => { const d = this.doorById.get(e.id); if (d) this.applyDoorState(d, e); });
    S.onEvt('window', (e) => { const w = this.winById.get(e.id); if (w) this.applyWindowState(w, e); });
    this.prompt = { visible: false };
    this.tmpV = new THREE.Vector3();
  }

  // ======================================================================= kapı/pencere durumu
  applyDoorState(d, e, silent = false) {
    const S = this.s;
    const wasBroken = d.broken;
    if (e.target !== undefined) d.target = e.target;
    if (e.broken !== undefined) d.broken = e.broken;
    if (e.barricade !== undefined) {
      // tahta koptu: parçalar içeri saçılır
      if (!silent && e.barricade < d.barricade) S.props.burst(d.center.x, d.y0 + 0.8, d.center.z, 'wood', 2, [d.inward.x, d.inward.z]);
      d.barricade = e.barricade; this.updateDoorBoards(d);
    }
    if (e.locked !== undefined) d.locked = e.locked;
    if (e.hp !== undefined) d.hp = e.hp;
    const blocking = !d.broken && d.target < 0.5 || d.barricade > 0;
    S.world.physics.setEnabled(d.collider, blocking);
    if (!silent) {
      if (d.broken && !wasBroken) { S.audio.play('bash', { at: d.center, vol: 1 }); S.fx.hit(d.center.x, d.y0 + 1, d.center.z, 'wood'); S.world.doorRenderer.updateDoor(d); S.props.burst(d.center.x, d.y0 + 1, d.center.z, d.kind === 'metal' ? 'metal' : 'wood', 6, [d.inward.x, d.inward.z]); }
      else if (e.target !== undefined) S.audio.play('door', { at: d.center, vol: 0.8 });
      if (e.barricade !== undefined) S.audio.play('build', { at: d.center, vol: 0.8 });
    } else S.world.doorRenderer.updateDoor(d);
    if (silent) { d.open01 = d.target; S.world.doorRenderer.updateDoor(d); }
  }

  updateDoorBoards(d) {
    if (d.boards) { this.s.game.scene.remove(d.boards); d.boards = null; }
    if (!d.barricade) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xa47648, roughness: 0.85 });
    for (let i = 0; i < d.barricade * 2; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(d.width + 0.4, 0.2, 0.06), mat);
      b.position.set(0, 0.5 + i * 0.32, 0.1 * (d.inward ? -1 : 1));
      b.rotation.z = (i % 2 ? 0.15 : -0.12);
      b.castShadow = true;
      g.add(b);
    }
    g.position.set(d.center.x - d.inward.x * 0.15, d.y0, d.center.z - d.inward.z * 0.15);
    g.rotation.y = Math.atan2(d.along.x, d.along.z) - Math.PI / 2;
    this.s.game.scene.add(g);
    d.boards = g;
  }

  applyWindowState(w, e, silent = false) {
    const S = this.s;
    const wasBroken = w.broken;
    if (e.broken !== undefined) w.broken = e.broken;
    if (e.hp !== undefined) w.hp = e.hp;
    if (e.barricade !== undefined) {
      if (!silent && e.barricade < w.barricade) S.props.burst(w.center.x, w.center.y, w.center.z, 'wood', 2, [w.inward.x, w.inward.z]);
      w.barricade = e.barricade; this.updateWindowBoards(w);
    }
    S.world.setPaneVisible(w.paneIndex, !w.broken);
    S.world.physics.setEnabled(w.collider, !w.broken || w.barricade > 0);
    if (!silent && w.broken && !wasBroken) { S.audio.play('glass', { at: w.center, vol: 1 }); S.fx.emit(w.center.x, w.center.y, w.center.z, 14, { color: '#cfefff', speed: 3, life: 0.6, size: 0.1 }); S.props.burst(w.center.x, w.center.y, w.center.z, 'glass', 7, [w.inward.x * 0.6, w.inward.z * 0.6]); }
    if (!silent && e.barricade !== undefined) S.audio.play('build', { at: w.center, vol: 0.8 });
  }

  updateWindowBoards(w) {
    if (w.boards) { this.s.game.scene.remove(w.boards); w.boards = null; }
    if (!w.barricade) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xa47648, roughness: 0.85 });
    for (let i = 0; i < w.barricade * 2; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w.width + 0.35, 0.18, 0.05), mat);
      b.position.set(0, -w.height / 2 + 0.15 + (i * w.height) / (w.barricade * 2), 0);
      b.rotation.z = i % 2 ? 0.18 : -0.15;
      b.castShadow = true;
      g.add(b);
    }
    g.position.set(w.center.x + w.inward.x * 0.18, w.center.y, w.center.z + w.inward.z * 0.18);
    g.rotation.y = Math.atan2(w.along.x, w.along.z) - Math.PI / 2;
    this.s.game.scene.add(g);
    w.boards = g;
  }

  // ======================================================================= hedef bulma
  findTarget() {
    const S = this.s;
    const pl = S.local;
    if (pl.mode === 'drive' || pl.mode === 'seat') {
      return { kind: 'vehicle_exit', label: 'Araçtan İn', key: 'E' };
    }
    if (pl.mode === 'sleep' || pl.mode === 'climb') return null;
    if (pl.carrying) {
      const who = S.players.get(pl.carrying) || S.bots.byId(pl.carrying);
      return { kind: 'carry_drop', label: `${who ? who.name : 'Arkadaşın'} sırtında — Yere bırak`, key: S.game.input.label('reload'), sub: 'Güvenli yere bırakıp E basılı tutarak ayağa kaldır' };
    }
    const px = pl.pos.x, py = pl.pos.y, pz = pl.pos.z;
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    // kamera yönünü de hesaba kat
    const cam = S.game.gfx.camera;
    cam.getWorldDirection(this.tmpV);
    const cfx = this.tmpV.x, cfz = this.tmpV.z;
    const cands = [];
    const consider = (o, x, y, z, range, extra = 0) => {
      const dx = x - px, dz = z - pz;
      const d = Math.hypot(dx, dz);
      if (d > range || Math.abs(y - (py + 1)) > 2.2) return;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const camFacing = d > 0.01 ? (dx * cfx + dz * cfz) / d : 1;
      if (facing < -0.2 && camFacing < 0.2 && d > 0.8) return;
      const score = d - Math.max(facing, camFacing) * 0.8 + extra;
      cands.push({ ...o, score, d });
    };
    // takım arkadaşları (yere düşmüş)
    for (const p of S.players.values()) {
      if (p.isLocal || !p.summary || !p.summary.downed) continue;
      if (p.carriedBy) continue;
      consider({ kind: 'revive', id: p.id, name: p.name, label: `${p.name} — Ayağa Kaldır`, holdTime: 4, sub: `${S.game.input.label('reload')}: Sırtla ve taşı` }, p.pos.x, p.pos.y + 0.5, p.pos.z, 2.2, -1);
    }
    for (const b of S.bots.list) if (b.stats.downed && !b.carriedBy) consider({ kind: 'revive', id: b.id, name: b.name, label: `${b.name} — Ayağa Kaldır`, holdTime: 3, sub: `${S.game.input.label('reload')}: Sırtla ve taşı` }, b.pos.x, b.pos.y + 0.5, b.pos.z, 2.2, -1);
    // yerdeki eşyalar
    for (const it of S.ground.items.values()) consider({ kind: 'ground', id: it.id, label: `Al: ${ITEMS[it.stack.id].name}${it.stack.qty > 1 ? ' x' + it.stack.qty : ''}` }, it.x, it.y + 0.5, it.z, 1.7, -0.3);
    // konteynerler
    for (const c of S.world.containers) {
      if (Math.abs(c.x - px) > 3 || Math.abs(c.z - pz) > 3) continue;
      const st = S.loot.get(c.id);
      const locked = st ? st.locked : c.type === 'safe' ? 2 : 0;
      const searched = st && st.searched;
      consider({ kind: 'container', c, label: locked ? `Kilitli: ${c.label}` : searched ? `Aç: ${c.label}` : `Ara: ${c.label}`, locked, searched }, c.x, c.y, c.z, 1.85);
    }
    // kapılar
    for (const d of S.world.doors) {
      if (Math.abs(d.center.x - px) > 3 || Math.abs(d.center.z - pz) > 3) continue;
      if (d.broken) continue;
      const lbl = d.locked ? (d.lockLevel >= 2 ? 'Kilitli Kapı (Güvenlik Kartı)' : 'Kilitli Kapı') : d.target > 0.5 ? 'Kapıyı Kapat' : 'Kapıyı Aç';
      consider({ kind: 'door', d, label: lbl }, d.center.x, d.y0 + 1, d.center.z, 1.8, 0.15);
    }
    // pencereler (güçlendirme)
    for (const w of S.world.windows) {
      if (Math.abs(w.center.x - px) > 2.5 || Math.abs(w.center.z - pz) > 2.5) continue;
      if (w.barricade >= 3) continue;
      consider({ kind: 'window', w, label: w.broken && !w.barricade ? 'Kırık Pencere — Tahtayla Kapat' : 'Pencereyi Güçlendir', holdTime: 3 }, w.center.x, w.center.y, w.center.z, 1.6, 0.4);
    }
    // özel noktalar
    for (const it of S.world.interactables) {
      if (Math.abs(it.x - px) > 4 || Math.abs(it.z - pz) > 4) continue;
      const info = this.describeInteractable(it);
      if (info) consider({ kind: 'special', it, ...info }, it.x, it.y, it.z, info.range || 2.0);
    }
    // oyuncu yapıları
    for (const st of S.build.structures.values()) {
      if (Math.abs(st.x - px) > 4 || Math.abs(st.z - pz) > 4) continue;
      const info = S.build.describe(st);
      if (info) consider({ kind: 'structure', st, ...info }, st.x, st.y + 0.8, st.z, info.range || 2.0);
    }
    // araçlar
    for (const v of S.vehicles.list) {
      const d = Math.hypot(v.pos.x - px, v.pos.z - pz);
      if (d > 4.5) continue;
      for (const opt of S.vehicles.options(v, pl)) consider({ kind: 'vehicle', v, ...opt }, opt.x ?? v.pos.x, v.pos.y + 1, opt.z ?? v.pos.z, opt.range || 3.2, opt.bias || 0);
    }
    // NPC'ler
    for (const n of S.npcs.list) if (n.visible && !n.hostile) consider({ kind: 'npc', n, label: `Konuş: ${n.def.name}` }, n.pos.x, n.pos.y + 1, n.pos.z, 2.4, -0.2);
    cands.sort((a, b) => a.score - b.score);
    return cands[0] || null;
  }

  describeInteractable(it) {
    const S = this.s;
    switch (it.type) {
      case 'generator': return S.build.generatorInfo(it);
      case 'bunker': return S.build.bunkerInfo(it);
      case 'campfire_pit': return { label: S.build.fireAt(it) ? 'Ateş: Yemek Pişir' : 'Ateş Yak (1 tahta + çakmak)', holdTime: S.build.fireAt(it) ? 0 : 2 };
      case 'garden_plot': return S.build.gardenInfo(it);
      case 'fuel_pump': return { label: 'Bidonu Doldur (Yakıt Pompası)', holdTime: 3 };
      case 'fishing_spot': return { label: 'Balık Tut', holdTime: 0 };
      case 'water_spring': return { label: 'Şişe Doldur (Temiz Su)', holdTime: 2 };
      case 'rain_spot': return S.build.structures.size ? null : null;
      case 'ladder': return { label: `Tırman: ${it.name}`, range: 1.6 };
      case 'helipad': return S.time.day >= 30 ? { label: 'Helikopteri Bekle (Tahliye)' } : { label: 'Helikopter Pisti' + (S.time.day >= 10 ? ' — 30. gün 20:00' : '') };
      case 'boat_dock': return S.endings.boatInfo();
      case 'lab_gate': return S.world.labGate.open ? null : { label: 'Güvenlik Kapısı (Kart Okuyucu)', holdTime: 1 };
      case 'mountain_camp': return { label: 'Dağ Kampı: Erzak Bırak / Durum', holdTime: 0 };
      case 'bed': return { label: 'Uyu (Yatak)' };
      case 'bridge_end': return { label: 'Anakaraya Köprü — Konvoy Durumu' };
      case 'lighthouse': return S.storyWorld.lighthouseInfo(it);
      case 'dam_control': return S.storyWorld.damInfo(it);
      case 'tow_point': return S.storyWorld.towInfo(it);
      case 'plane': return S.storyWorld.flight ? null : { label: 'Tek Motorlu Uçak — Onar / Yakıt / Durum', range: 4.5 };
      default: return { label: it.name || it.type };
    }
  }

  // ======================================================================= güncelle + girdi
  update(dt, input, blocking) {
    const S = this.s;
    const pl = S.local;
    // kapı animasyonları
    for (const d of S.world.doors) {
      const tgt = d.broken ? 1 : d.target;
      if (d.open01 !== tgt && !d.broken) {
        d.open01 += Math.sign(tgt - d.open01) * Math.min(Math.abs(tgt - d.open01), dt * 2.6);
        S.world.doorRenderer.updateDoor(d);
      }
    }
    if (blocking || S.localStats.downed) { this.cancelHold(); S.ui.setPrompt(null); return; }
    // bekleyen basılı tutma
    if (this.hold) {
      const h = this.hold;
      const moved = pl.speed > 0.6;
      if (!input.isDown('interact') && !h.auto || moved) { this.cancelHold(); }
      else {
        h.t += dt;
        S.ui.setPrompt({ label: h.label, key: 'E', progress: Math.min(1, h.t / h.dur) });
        if (h.t >= h.dur) { const fn = h.onDone; this.hold = null; S.local.avatar.action = null; fn(); }
        return;
      }
    }
    // elde taşınan nesne: E bırak (sol tık fırlatma Player'da)
    if (pl.carryProp) {
      S.ui.setPrompt({ label: 'Bırak', key: input.label('interact'), sub: 'Sol tık: fırlat' });
      if (input.wasPressed('interact')) pl.dropProp(false);
      return;
    }
    const t = this.findTarget();
    this.target = t;
    // önündeki hafif nesneyi (kutu, kasa, çöp kovası…) eline al: başka hedef yoksa ya da nesne ondan yakınsa
    let cp = !pl.carrying && (pl.mode === 'ground' || pl.mode === 'crouch') && S.props ? S.props.nearestCarryable(pl.pos.x, pl.pos.y, pl.pos.z, pl.yaw) : null;
    if (cp && t && t.d !== undefined && t.d < cp.dist) cp = null;
    if (cp && t && t.d === undefined) cp = null; // mesafesiz özel hedefler (araçtan in, sırttaki arkadaş) öncelikli
    if (cp) {
      this.target = null;
      S.ui.setPrompt({ label: 'Taşı', key: input.label('interact') });
      if (input.wasPressed('interact')) pl.pickProp(cp);
      return;
    }
    S.ui.setPrompt(t ? { label: t.label, key: t.key || input.label('interact'), sub: t.sub, holdHint: t.holdTime > 0 } : null);
    // yaralı arkadaşı sırtlama / bırakma
    if (input.wasPressed('reload')) {
      if (pl.carrying) { S.act('carry', { target: pl.carrying, drop: true }); return; }
      if (t && t.kind === 'revive') { S.act('carry', { target: t.id }); return; }
    }
    if (t && t.kind === 'carry_drop') return;
    if (t && input.wasPressed('interact')) this.activate(t);
  }

  startHold(label, dur, onDone, anim = 'search', auto = false) {
    this.hold = { label, dur, t: 0, onDone, auto };
    if (anim) this.s.local.avatar.play(anim, dur + 0.3, anim === 'search' ? 'low' : null);
    if (this.s.local.avatar.action) this.s.local.avatar.action.loop = true;
  }
  cancelHold() {
    if (!this.hold) return;
    this.hold = null;
    if (this.s.local.avatar.action) this.s.local.avatar.action = null;
    this.s.ui.setPrompt(null);
  }

  /** Oyun dakikası maliyetini gerçek süreye çevir (tek oyunculuda zaman da ilerler) */
  timed(gameMinutes, mul = 1) {
    const S = this.s;
    const real = clamp(gameMinutes * 0.42 / mul, 0.9, 6);
    return { real, extra: S.net.active ? 0 : Math.max(0, gameMinutes - real * S.time.rate) };
  }

  activate(t) {
    const S = this.s;
    const pl = S.local;
    const inv = S.inventory;
    switch (t.kind) {
      case 'ground': pl.avatar.play('pickup', 0.5); S.act('ground_pickup', { id: t.id }); S.audio.play('pickup', { vol: 0.5 }); break;
      case 'revive': {
        const mul = S.localProfile.stats.heal || 1;
        this.startHold(t.label, t.holdTime / mul, () => { S.act('revive', { target: t.id, hp: 25 + 15 * (mul - 1) }); S.results.rescued += 0; }, 'revive');
        break;
      }
      case 'container': this.useContainer(t); break;
      case 'door': this.useDoor(t.d); break;
      case 'window': {
        const w = t.w;
        if (!inv.has('plank', 2) || !inv.has('nails', 4)) { S.ui.toast('Pencereyi güçlendirmek için 2 tahta ve 4 çivi gerekli.', 'warn'); return; }
        if (!inv.has('hammer')) { S.ui.toast('Çekiç gerekli.', 'warn'); return; }
        const tm = this.timed(PROJECTS.window.time, S.localProfile.stats.build || 1);
        this.startHold('Pencere güçlendiriliyor…', tm.real, () => {
          if (!inv.has('plank', 2) || !inv.has('nails', 4)) return;
          inv.remove('plank', 2); inv.remove('nails', 4);
          S.act('window_board', { id: w.id });
          if (tm.extra) S.time.advance(tm.extra);
        }, 'hammer');
        break;
      }
      case 'special': this.useSpecial(t.it, t); break;
      case 'structure': S.build.use(t.st, t); break;
      case 'vehicle': S.vehicles.useOption(t.v, t); break;
      case 'vehicle_exit': S.vehicles.exitLocal(); break;
      case 'npc': S.npcs.talk(t.n); break;
      default: break;
    }
  }

  useContainer(t) {
    const S = this.s;
    const c = t.c;
    const inv = S.inventory;
    if (t.locked) {
      if (t.locked >= 2) {
        if (c.type === 'safe' && inv.has('vault_code')) { this.startHold('Şifre giriliyor…', 1.5, () => { S.act('unlock', { id: c.id }); S.ui.toast('Kasa açıldı!', 'good'); }, 'search'); return; }
        if (inv.has('crowbar')) {
          const tm = this.timed(30);
          this.startHold('Levyeyle zorlanıyor… (gürültülü)', tm.real + 2, () => { S.act('unlock', { id: c.id }); S.act('noise', { x: c.x, z: c.z, r: 30, src: 'pry' }); S.ui.toast('Kasa zorla açıldı!', 'good'); }, 'search');
          return;
        }
        S.ui.toast('Bu kasa için şifre ya da levye gerekli.', 'warn');
        return;
      }
      if (inv.has('lockpick')) {
        const skill = S.localProfile.stats.lockpick || 1;
        this.startHold('Kilit açılıyor…', 2.5 / skill, () => { if (Math.random() < 0.4 / skill) inv.remove('lockpick', 1); S.act('unlock', { id: c.id }); }, 'search');
        return;
      }
      S.ui.toast('Kilitli. Maymuncuk ya da levye gerekli.', 'warn');
      return;
    }
    if (t.searched) { S.ui.openStorage({ kind: 'container', id: c.id, label: c.label }); return; }
    const T = LOOT[c.type] || LOOT.crate;
    const skill = S.localProfile.charId === 'zulal' ? 1.4 : 1;
    const tm = this.timed(T.search, skill);
    S.audio.play('door', { at: c, vol: 0.35, rate: 1.5 });
    this.startHold(`${c.label} aranıyor…`, tm.real, () => {
      S.act('search_done', { id: c.id });
      if (tm.extra) S.time.advance(tm.extra);
      S.act('noise', { x: c.x, z: c.z, r: 8, src: 'search' });
    }, 'search');
  }

  useDoor(d) {
    const S = this.s;
    const inv = S.inventory;
    if (d.locked) {
      if (d.lockLevel >= 2) {
        if (inv.has('keycard')) { S.act('door', { id: d.id, open: true, unlock: true }); S.ui.toast('Kart okutuldu. Erişim onaylandı.', 'good'); S.audio.play('success', { vol: 0.5 }); return; }
        if (d.kind === 'vault' && inv.has('vault_code')) { S.act('door', { id: d.id, open: true, unlock: true }); S.ui.toast('Şifre doğru! Kasa dairesi açıldı.', 'good'); return; }
        S.ui.toast(d.kind === 'vault' ? 'Kasa dairesi şifreli. Bankacının notunu bul.' : 'Erişim reddedildi. Güvenlik kartı gerekli.', 'warn');
        S.audio.play('empty', { vol: 0.8 });
        return;
      }
      if (d.building && d.building.id === 'armory' && inv.has('armory_key')) { S.act('door', { id: d.id, open: true, unlock: true }); S.ui.toast('Anahtar uydu!', 'good'); return; }
      if (inv.has('lockpick')) {
        const skill = S.localProfile.stats.lockpick || 1;
        this.startHold('Kilit açılıyor…', 3 / skill, () => { if (Math.random() < 0.5 / skill) inv.remove('lockpick', 1); S.act('door', { id: d.id, open: true, unlock: true }); }, 'search');
        return;
      }
      if (inv.has('crowbar')) {
        this.startHold('Kapı zorlanıyor… (gürültülü)', 4, () => { S.act('door', { id: d.id, open: true, unlock: true }); S.act('noise', { x: d.center.x, z: d.center.z, r: 35, src: 'pry' }); }, 'push');
        return;
      }
      S.ui.toast('Kilitli. Maymuncuk, levye ya da anahtar gerekli.', 'warn');
      return;
    }
    S.act('door', { id: d.id, open: d.target < 0.5 });
    S.local.avatar.play('interact', 0.55); // kapı koluna uzanma (yerden alma değil)
  }

  useSpecial(it, t) {
    const S = this.s;
    const inv = S.inventory;
    switch (it.type) {
      case 'generator': S.build.useGenerator(it); break;
      case 'bunker': S.build.useBunker(it); break;
      case 'campfire_pit': S.build.useFirePit(it); break;
      case 'garden_plot': S.build.useGarden(it); break;
      case 'fuel_pump': {
        const i = inv.slots.findIndex((s) => s && s.id === 'jerrycan' && (s.fuel || 0) < 20);
        if (i < 0) { S.ui.toast('Doldurulacak yakıt bidonun yok.', 'warn'); return; }
        if (S.time.day >= 11 && !S.flags.gas_power) { S.ui.toast('Pompalar elektriksiz çalışmıyor (11. gün sonrası). Tankerleri dene.', 'warn'); return; }
        this.startHold('Yakıt dolduruluyor…', 3, () => { const s = inv.slots[i]; if (s) { s.fuel = 20; inv.changed(); S.ui.toast('Bidon doldu (20 L).', 'good'); S.act('noise', { x: it.x, z: it.z, r: 10, src: 'pump' }); } }, 'search');
        break;
      }
      case 'water_spring': {
        const n = inv.count('empty_bottle');
        if (!n) { S.ui.toast('Boş şişen yok.', 'warn'); return; }
        this.startHold('Şişeler dolduruluyor…', 2, () => { const k = inv.remove('empty_bottle', n); S.giveLocal('water_bottle', k); }, 'search');
        break;
      }
      case 'fishing_spot': S.npcs.startFishing(it); break;
      case 'ladder': S.local.startLadder({ x: it.x, z: it.z, top: it.top, bottom: it.bottom, exitX: it.x - 1.4, exitZ: it.z, yaw: -Math.PI / 2 }); break;
      case 'helipad': S.endings.helipad(it); break;
      case 'boat_dock': S.endings.useBoat(it); break;
      case 'lab_gate': {
        if (!inv.has('keycard')) { S.ui.toast('Kart okuyucu kırmızı yanıyor. Güvenlik kartı gerekli.', 'warn'); S.audio.play('empty', { vol: 0.8 }); return; }
        S.act('lab_gate', {});
        break;
      }
      case 'mountain_camp': S.endings.useMountainCamp(it); break;
      case 'bed': S.trySleep({ x: it.x, y: it.y, z: it.z, rot: it.rot || 0 }); break;
      case 'lighthouse': S.storyWorld.useLighthouse(it); break;
      case 'dam_control': S.storyWorld.useDam(it); break;
      case 'tow_point': S.storyWorld.useTow(it); break;
      case 'plane': S.endings.usePlane(it); break;
      case 'bridge_end': { const r = S.endings.readiness().convoy; S.ui.toast(S.time.day >= 30 && S.time.hour >= 21 ? (r.ok ? 'Köprü açık! Hazır bir araçla buradan anakaraya geç.' : 'Köprüden geçmek için hazır bir araç gerekli: ' + r.detail) : `Konvoy 30. gün 21:00'de köprüden geçecek. Araç: ${r.detail}`, r.ok ? 'good' : 'info', 6); break; }
      default: break;
    }
    void t;
  }
}
