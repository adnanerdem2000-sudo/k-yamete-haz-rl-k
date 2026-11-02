// Yer altı sığınakları (oturum tarafı): giriş/çıkış (kararmalı ışınlama), kilit (levye/maymuncuk ya da anahtar kartı),
// jeneratör (ana ışıklar), ışıkların yalnız aynı yer altı bölgesinde yanması, grup görünürlüğü, kayıt ve ağ.
// Durum host-otoriter: S.act('shelter') → host doğrular → S.emit({k:'shelter'}) → herkes uygular. Geometri ve bölgeler
// dünya kurulumunda (world/Underground.js).
import { ITEMS } from '../data/items.js';

export class Shelters {
  constructor(session) {
    this.s = session;
    const W = session.world;
    this.list = W.shelters || [];
    this.byId = new Map(this.list.map((sh) => [sh.def.id, sh]));
    this.state = new Map(this.list.map((sh) => [sh.def.id, { locked: sh.def.lock || 0, power: false, seen: false }]));
    // sığınak ışıkları ortam ışık havuzuna (Environment.extraLights; bölgesi olan ışık yalnız o bölgedeyken seçilir)
    for (const sh of this.list) { for (const l of sh.lights) { l.on = l.emergency ? true : false; session.env.extraLights.push(l); } if (sh.mainMat) sh.mainMat.emissiveIntensity = 0; }
    const S = session;
    S.on('shelter', (p, from) => {
      const st = this.state.get(p.id);
      if (!st) return;
      if (p.op === 'unlock') st.locked = 0;
      else if (p.op === 'power') st.power = !!p.on;
      else if (p.op === 'seen') st.seen = true;
      S.emit({ k: 'shelter', id: p.id, locked: st.locked, power: st.power, seen: st.seen, by: from });
    });
    S.onEvt('shelter', (e) => {
      const st = this.state.get(e.id);
      if (!st) return;
      st.locked = e.locked; st.power = e.power; st.seen = !!e.seen;
      this.applyLights(e.id);
    });
  }

  applyLights(id) {
    const sh = this.byId.get(id), st = this.state.get(id);
    if (!sh || !st) return;
    for (const l of sh.lights) if (l.main) l.on = st.power;
    if (sh.mainMat) sh.mainMat.emissiveIntensity = st.power ? 1 : 0; // lamba gövdeleri de yanar/söner
  }

  /** Interact etiketleri */
  describe(it) {
    const st = this.state.get(it.shelter), sh = this.byId.get(it.shelter), entry = sh ? sh.def.entry : null;
    switch (it.type) {
      case 'shelter': {
        if (st && st.locked) return { label: `${it.name}: kilitli (${st.locked >= 2 ? 'anahtar kartı' : 'levye ya da maymuncuk'})`, holdTime: st.locked >= 2 ? 1 : 3, range: 2.4 };
        const verb = { stairs: 'Sığınağa in', hatch: 'Kapağı aç, aşağı in', mine: 'Galeriye gir', pit: 'İp merdivenden in', cellar: 'Mahzene in' }[entry] || 'Sığınağa in';
        return { label: `${verb}: ${it.name}`, holdTime: 0.6, range: 2.4 };
      }
      case 'shelter_exit': {
        const verb = { mine: 'Galeriden çık', pit: 'İp merdivenle tırman', cellar: 'Mahzenden çık' }[entry] || 'Merdivenden yukarı çık';
        return { label: `${verb} (yüzeye)`, holdTime: 0.4, range: 2.4 };
      }
      case 'shelter_power': return { label: st && st.power ? 'Jeneratörü kapat' : 'Jeneratörü çalıştır (ışıklar)', holdTime: 1.2, range: 2.0 };
      default: return null;
    }
  }

  /** Interact: etkileşim */
  use(it) {
    const S = this.s, st = this.state.get(it.shelter);
    if (it.type === 'shelter') {
      if (st && st.locked) {
        const inv = S.inventory;
        if (st.locked >= 2) {
          if (!inv.has('keycard')) { S.ui.toast('Çelik kapı anahtar kartı istiyor (laboratuvar yöneticisinin kartı).', 'warn', 4); return; }
          S.act('shelter', { id: it.shelter, op: 'unlock' }); S.ui.toast('Kart okuyucu yeşile döndü. Kapı açıldı.', 'good', 3);
        } else {
          const tool = inv.has('crowbar') ? 'crowbar' : inv.has('lockpick') ? 'lockpick' : null;
          if (!tool) { S.ui.toast('Paslı çelik kapı: levye ya da maymuncuk gerekli.', 'warn', 4); return; }
          if (tool === 'lockpick') inv.remove('lockpick', 1);
          S.act('shelter', { id: it.shelter, op: 'unlock' }); S.ui.toast(`Kapıyı ${ITEMS[tool].name.toLowerCase()} ile açtın.`, 'good', 3);
          S.act('noise', { x: it.x, z: it.z, r: 18 });
        }
        return;
      }
      this.enter(it.shelter);
      return;
    }
    if (it.type === 'shelter_exit') { this.exit(it.shelter); return; }
    if (it.type === 'shelter_power') {
      S.audio.play('toggle', { at: it, vol: 0.7 });
      S.act('shelter', { id: it.shelter, op: 'power', on: !(st && st.power) });
    }
  }

  /** Aşağı in: kararma + ışınlama (merdivenin dibi) */
  enter(id) {
    const S = this.s, sh = this.byId.get(id);
    if (!sh) return;
    const sp = sh.zone.spawn;
    S.ui.fadeFlash && S.ui.fadeFlash();
    S.local.spawnAt(sp.x, sp.y, sp.z, sp.yaw);
    S.local.camYaw = sp.yaw + Math.PI;
    S.audio.play('door', { vol: 0.5, rate: 0.7 });
    const st = this.state.get(id);
    // ilk iniş: sığınağın ne işe yaradığını anlat; sonrakilerde yalnız adı
    if (st && !st.seen) { S.act('shelter', { id, op: 'seen' }); S.ui.toast(`${sh.def.name}. Zombiler buraya inemez — gece burada güvende uyuyabilirsin.${!st.power ? ' Jeneratörü çalıştırırsan ışıklar yanar.' : ''}`, 'info', 6); }
    else S.ui.toast(sh.def.name, 'info', 2);
  }

  /** Yukarı çık: girişin önüne (ev sığınağı: bahçedeki kapağın yanına) */
  exit(id) {
    const S = this.s, sh = this.byId.get(id);
    let o = sh && sh.entry.out;
    if (!sh && id === 'ev' && S.world.bunkerPos) { const bp = S.world.bunkerPos; o = { x: bp.x + 1.8, z: bp.z, y: S.world.terrain.heightAt(bp.x + 1.8, bp.z), yaw: Math.PI / 2 }; }
    if (!o) return;
    S.ui.fadeFlash && S.ui.fadeFlash();
    S.local.spawnAt(o.x, S.world.physics.groundHeight(o.x, o.z, o.y + 3) + 0.05, o.z, o.yaw);
    S.local.camYaw = o.yaw + Math.PI;
    S.audio.play('door', { vol: 0.5, rate: 0.7 });
  }

  /** Her kare: yalnız içinde bulunulan sığınağın ağları çizilir (yüzeyden zaten görünmez; çizim çağrısı tasarrufu) */
  update() {
    const z = this.s.local && this.s.local.zone;
    for (const sh of this.list) { const v = !!z && z.id === sh.def.id; if (sh.group.visible !== v) sh.group.visible = v; }
  }

  serialize() { const o = {}; for (const [id, st] of this.state) o[id] = [st.locked, st.power ? 1 : 0, st.seen ? 1 : 0]; return o; }
  load(o) {
    if (!o) return;
    for (const [id, v] of Object.entries(o)) { const st = this.state.get(id); if (!st || !Array.isArray(v)) continue; st.locked = v[0] | 0; st.power = !!v[1]; st.seen = !!v[2]; this.applyLights(id); }
  }

  dispose() {
    const S = this.s, ex = S.env.extraLights;
    for (const sh of this.list) { for (const l of sh.lights) { const i = ex.indexOf(l); if (i >= 0) ex.splice(i, 1); } sh.group.visible = false; }
    S.env.underground = null; // dünya ve ortam oturumlar arasında kalır: menü/sonraki oyun yer altı karartmasıyla başlamasın
  }
}
