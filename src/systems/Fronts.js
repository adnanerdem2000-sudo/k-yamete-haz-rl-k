// Açılır ön yüzler: gardırop ve dolap kanatları, mutfak dolabı kapakları, buzdolabı kapakları (modelden ayrılmış),
// fırın kapağı (alttan menteşeli), ecza dolabının aynalı kapağı, kasa kapısı, içecek dolabının cam kapakları,
// laboratuvar tezgâhı kapakları, sandık kapakları (arkadan menteşeli) ve alet dolabının küçük çekmeceleri.
//  • Biri konteyneri ararken ya da depo panelini açıkken (yerel oyuncu, uzak oyuncu ya da bot: Loot.inUse, host
//    üzerinden eşitlenir) ön yüz menteşesinden tam açılır; kapanınca aranmış konteyner hafif aralık kalır (karıştırılmış
//    görünüm; aranma durumu zaten kayıtta ve ağda). Kilitliyken kapalıdır.
//  • Görsel: malzeme başına tek InstancedMesh (ahşap/boya, metal, cam, ayna, kulp, iç boşluk): yalnız oyuncuya
//    ≈56 m içindeki konteynerler etkin, toplam birkaç çizim çağrısı. Açılınca arkada koyu "iç boşluk" görünür (KayKit
//    modellerinin gövdeye gömülü kapağının önünü kapatır). Fizikli çekmeceler ayrı (physics/Drawers.js).
import * as THREE from 'three';
import { damp } from '../core/util.js';

// NEAR: iç mekân örneklerinin çizildiği mesafeye yakın (Instancer INTERIOR_DIST): uzaktan bakınca kapaksız buzdolabı ve
// kapaksız sandık görünmesin; yuvalar uzaklığa göre dağıtılır, sığmazsa en uzaktakiler düşer
const NEAR = 56, CAP = 768;
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _w = new THREE.Matrix4(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// birim kutu: x ∈ [0,1], y ∈ [0,1], z ∈ [-1,0] (ön yüz z = 0)
let UNIT = null;
function unitBox() { return UNIT || (UNIT = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, -0.5)); }

/** id'den 0..1 sözde rastgele (aralık açıklığı her istemcide aynı) */
function hash01(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }

/**
 * Konteyner türü ve mobilya ölçülerinden (Furnish: ct.yaw/fw/fd/fh/fy/fmodel/fcol) eşya-yerel ön yüz listesi.
 * Eşya yereli: orijin eşyanın taban ortası, +Z ön yüz, x genişlik. Öğe: k: door|flap|lid|drawer; x0,x1,y0,y1;
 * z: kapak/kapakçık/çekmecenin ön yüzü (kapak: arka kenar zb ile), t: kalınlık (çekmecede derinlik), hinge L|R,
 * mat: wood|metal|glass|mirror, color, max: açı (rad) ya da çekmece yolu (m), cav: koyu iç boşluğun z'si.
 */
export function frontSpec(ct) {
  if (ct.yaw === undefined || !ct.fw) return null;
  const W = ct.fw, D = ct.fd, H = ct.fh, m = ct.fmodel || '', col = ct.fcol;
  const E = [];
  const door = (o) => E.push({ k: 'door', handle: true, max: 1.75, ...o });
  const pair = (x0, x1, y0, y1, face, t, mat, color, max = 1.75, handle = true) => {
    const mid = (x0 + x1) / 2;
    door({ x0, x1: mid - 0.006, y0, y1, z: face + t + 0.002, t, hinge: 'L', mat, color, max, handle, cav: face + 0.001 });
    door({ x0: mid + 0.006, x1, y0, y1, z: face + t + 0.002, t, hinge: 'R', mat, color, max, handle, cav: face + 0.001 });
  };
  switch (ct.type) {
    case 'wardrobe': pair(-W / 2 + 0.01, W / 2 - 0.01, 0.05, H - 0.05, D / 2, 0.03, 'wood', col || '#8a6244'); break;
    case 'weapon_locker': pair(-W / 2 + 0.02, W / 2 - 0.02, 0.05, H - 0.05, D / 2, 0.03, 'metal', col || '#556b2f', 1.65); break;
    case 'locker':
      if (m === 'Box_A') return null; // hücre emanet kutusu: kapaksız kutu modeli
      if (W <= 0.75) door({ x0: -W / 2 + 0.015, x1: W / 2 - 0.015, y0: 0.04, y1: H - 0.04, z: D / 2 + 0.032, t: 0.03, hinge: 'L', mat: 'metal', color: col || '#7f8c8d', max: 1.7, cav: D / 2 + 0.001, vents: true });
      else pair(-W / 2 + 0.02, W / 2 - 0.02, 0.06, H - 0.06, D / 2, 0.025, 'wood', col || '#8b6a45');
      break;
    case 'kitchen_cabinet': // KayKit tezgâh: ön yüz z = 0,50
      if (m.startsWith('kitchencounter')) pair(-0.64, 0.64, 0.08, 0.7, 0.5, 0.02, 'wood', '#e6dfd1', 1.7);
      break;
    case 'stove': // KayKit fırın: ön yüz z ≈ 0,53; fırın kapağı alttan menteşeli
      if (m.startsWith('stove')) E.push({ k: 'flap', x0: -0.42, x1: 0.42, y0: 0.1, y1: 0.56, z: 0.53 + 0.024, t: 0.022, mat: 'metal', color: '#2e3134', max: 1.45, handle: true, cav: 0.531 });
      break;
    case 'fridge': { // KayKit buzdolabı ('nodoor' varyantı: kapaklar burada); gövde ön yüzü z = 0,21, kapak 0,31 kalın
      if (!m.startsWith('fridge')) break;
      const base = { k: 'door', x0: -0.5, x1: 0.5, z: 0.52, t: 0.31, hinge: 'R', mat: 'wood', color: '#dfe3e6', max: 1.9, handle: true, cav: 0.212 };
      if (m === 'fridge_B') E.push({ ...base, y0: 0.0, y1: 1.8 });
      else { E.push({ ...base, y0: 0.0, y1: 1.075 }); E.push({ ...base, y0: 1.085, y1: 1.8 }); }
      break;
    }
    case 'bathroom_cabinet': // aynalı dolap (lavabonun üstünde, duvara yakın)
      if (m === 'proto') door({ x0: -0.35, x1: 0.35, y0: 1.25, y1: 1.9, z: -0.13 + 0.022, t: 0.02, hinge: 'L', mat: 'mirror', color: '#e8eef2', max: 1.6, cav: -0.129 });
      break;
    case 'safe': door({ x0: -W / 2 + 0.05, x1: W / 2 - 0.05, y0: 0.05, y1: H - 0.05, z: D / 2 + 0.06, t: 0.055, hinge: 'L', mat: 'metal', color: '#6c7a7b', max: 1.5, cav: D / 2 + 0.001, wheel: true }); break;
    case 'shelf_drinks': pair(-W / 2 + 0.01, W / 2 - 0.01, 0.05, H - 0.05, D / 2, 0.02, 'glass', '#dbeef7', 1.6); break;
    case 'lab_bench': if (m === 'proto' && W >= 1.5) pair(-W / 2 + 0.05, W / 2 - 0.05, 0.08, 0.84, D / 2, 0.02, 'wood', '#e9ecee', 1.7); break;
    case 'cabin_chest': E.push({ k: 'lid', x0: -0.52, x1: 0.52, y0: 0.55, zb: -0.32, z: 0.32, t: 0.07, mat: 'wood', color: col || '#6e4b1f', max: 1.9, cav: 0.552 }); break;
    case 'ammo_crate': E.push({ k: 'lid', x0: -0.62, x1: 0.62, y0: 0.6, zb: -0.37, z: 0.37, t: 0.06, mat: 'wood', color: col || '#3d4820', max: 1.9, cav: 0.602 }); break;
    case 'toolbox': // kırmızı alet dolabı: üst iki çekmece kayar (geniş tezgâh türü değil)
      if (m === 'proto' && W <= 0.8) for (const [y0, y1] of [[0.44, 0.57], [0.6, 0.73]]) E.push({ k: 'drawer', x0: -0.3, x1: 0.3, y0, y1, z: 0.25 + 0.018, t: 0.36, mat: 'metal', color: '#b03a2e', max: 0.26, handle: true, cav: 0.251 });
      break;
    default: return null;
  }
  return E.length ? E : null;
}

export class Fronts {
  constructor(session) {
    this.s = session;
    this.cands = [];
    for (const ct of session.world.containers) { const spec = frontSpec(ct); if (spec) this.cands.push({ ct, spec, ajar: 0.18 + hash01(ct.id) * 0.22 }); }
    this.active = []; // {ct, spec, els: [{e, open, slot, hslot, cslot}]}
    this.t = 0;
    this.localUse = null; // yerel oyuncunun açık tuttuğu konteyner
    this.group = new THREE.Group();
    this.group.name = 'fronts';
    session.game.scene.add(this.group);
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.mats = {
      wood: std({ color: 0xffffff, roughness: 0.78, metalness: 0 }),
      metal: std({ color: 0xffffff, roughness: 0.45, metalness: 0.45 }),
      glass: std({ color: 0xdbeef7, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false }),
      mirror: std({ color: 0xe8eef2, roughness: 0.06, metalness: 0.95 }),
      handle: std({ color: 0xc9cdd1, roughness: 0.3, metalness: 0.8 }),
      cavity: std({ color: 0x15120f, roughness: 1, metalness: 0 }),
    };
    this.meshes = {};
    for (const [k, mat] of Object.entries(this.mats)) {
      const im = new THREE.InstancedMesh(unitBox(), mat, CAP);
      im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true;
      im.name = 'fronts:' + k;
      if (k === 'glass') im.renderOrder = 2;
      this.group.add(im);
      this.meshes[k] = im;
    }
  }

  /** Konteyner açık mı olmalı: yerel kullanım (anında), ağdan kullanım sayısı, aranmışsa aralık, kilitliyse kapalı */
  target(c) {
    const ct = c.ct, L = this.s.loot;
    const st = L.state.get(ct.id);
    if ((st && st.locked) || (!st && ct.locked)) return 0;
    if (this.localUse === ct.id || L.inUse.has(ct.id)) return 1;
    return st && st.searched ? c.ajar : 0;
  }

  /** Yerel oyuncunun açık tuttuğu konteyner: arama süren ya da depo paneli açık olan */
  localUseId() {
    const S = this.s, I = S.interact;
    const hold = I && I.hold;
    const ls = I && I.lastSearch; // arama yeni bitti: depo paneli host'un yanıtıyla (bir gidiş-dönüş sonra) açılacak
    if (hold && hold.container) { if (ls && ls.id !== hold.container.id) I.lastSearch = null; return hold.container.id; }
    const st = S.ui && S.ui.panels && S.ui.panels.storage;
    if (st && st.kind === 'container' && S.ui.panel && S.ui.panel.name === 'storage') { if (ls) I.lastSearch = null; return st.id; }
    // aradaki birkaç karede kullanım sürer: yoksa istemci aramasında kapak herkeste bir an kapanıp yeniden açılıyordu
    if (ls) { if (!hold && !S.ui.panel && S.t - ls.t < 1.5) return ls.id; I.lastSearch = null; }
    return null;
  }

  /** Etkin kümeyi yeniden kur (yarım saniyede bir): kameraya yakın konteynerler, örnek yuvaları baştan dağıtılır */
  rebuild() {
    const cam = this.s.local.pos; // oyuncu (kamera hep birkaç metre yakınında; ışınlanınca kamera geç yetişir)
    const prev = new Map(this.active.map((a) => [a.ct.id, a]));
    const next = [];
    for (const c of this.cands) {
      const dx = c.ct.x - cam.x, dz = c.ct.z - cam.z, d2 = dx * dx + dz * dz;
      if (d2 > NEAR * NEAR || Math.abs(c.ct.fy - cam.y) > 12) continue;
      const old = prev.get(c.ct.id);
      const a = old || { ...c, els: c.spec.map((e) => ({ e, open: this.target(c) })) };
      a.d2 = d2;
      next.push(a);
    }
    next.sort((p, q) => p.d2 - q.d2); // yuvalar yakından uzağa: taşma olursa en uzaktakiler çizilmez
    const n = { wood: 0, metal: 0, glass: 0, mirror: 0, handle: 0, cavity: 0 };
    for (const a of next) for (const el of a.els) {
      const e = el.e;
      el.slot = n[e.mat] < CAP ? n[e.mat]++ : -1;
      el.hslot = e.handle || e.vents || e.wheel ? (n.handle < CAP - 4 ? (n.handle += e.vents ? 4 : 1) - (e.vents ? 4 : 1) : -1) : -1;
      el.cslot = e.cav !== undefined && n.cavity < CAP ? n.cavity++ : -1;
      el.dirty = true;
    }
    for (const [k, im] of Object.entries(this.meshes)) { im.count = n[k]; }
    this.active = next;
    for (const a of next) for (const el of a.els) if (el.slot >= 0) this.meshes[el.e.mat].setColorAt(el.slot, _c.set(el.e.color || '#ffffff'));
    for (const im of Object.values(this.meshes)) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  /** Bir öğenin matrislerini yaz (açıklık 0..1) */
  write(a, el) {
    const e = el.e, ct = a.ct, k = el.open;
    _w.makeRotationY(ct.yaw).setPosition(ct.x, ct.fy, ct.z); // eşya yerel → dünya
    const w = e.x1 - e.x0, h = (e.y1 ?? e.y0) - e.y0;
    let base; // ölçeksiz öğe dönüşümü (kulp için)
    if (e.k === 'door') {
      const a1 = e.max * k * (e.hinge === 'L' ? -1 : 1);
      base = new THREE.Matrix4().makeTranslation(e.hinge === 'L' ? e.x0 : e.x1, e.y0, e.z).multiply(_m2.makeRotationY(a1));
      if (e.hinge === 'R') base.multiply(_m2.makeTranslation(-w, 0, 0));
      _m.copy(base).multiply(_m2.makeScale(w, h, e.t));
    } else if (e.k === 'flap') {
      base = new THREE.Matrix4().makeTranslation(e.x0, e.y0, e.z).multiply(_m2.makeRotationX(e.max * k));
      _m.copy(base).multiply(_m2.makeScale(w, h, e.t));
    } else if (e.k === 'lid') {
      const depth = e.z - e.zb;
      base = new THREE.Matrix4().makeTranslation(e.x0, e.y0, e.zb).multiply(_m2.makeRotationX(-e.max * k)).multiply(_m2.makeTranslation(0, 0, depth));
      _m.copy(base).multiply(_m2.makeScale(w, e.t, depth));
    } else { // drawer
      base = new THREE.Matrix4().makeTranslation(e.x0, e.y0, e.z + e.max * k);
      _m.copy(base).multiply(_m2.makeScale(w, h, e.t));
    }
    if (el.slot >= 0) this.meshes[e.mat].setMatrixAt(el.slot, _m.premultiply(_w));
    // kulp / havalandırma yarıkları / kasa çarkı
    if (el.hslot >= 0) {
      const H = this.meshes.handle;
      const put = (i, x, y, z, sx, sy, sz) => { _m.copy(base).multiply(_m2.makeTranslation(x, y, z)).multiply(_m2.makeScale(sx, sy, sz)).premultiply(_w); H.setMatrixAt(el.hslot + i, _m); };
      // taban dönüşümünde kanat x ∈ [0, w]: sol menteşe x = 0'da (serbest kenar w), sağ menteşe x = w'da (serbest kenar 0)
      const free = e.hinge === 'L' ? w - 0.07 : 0.045;
      if (e.vents) { for (let i = 0; i < 3; i++) put(i, 0.12, h * 0.8 + i * 0.06, 0.006, w - 0.24, 0.018, 0.006); put(3, free, h * 0.5, 0.03, 0.025, 0.16, 0.03); }
      else if (e.wheel) put(0, e.hinge === 'L' ? w * 0.7 : w * 0.3 - 0.07, h * 0.5 - 0.11, 0.06, 0.07, 0.22, 0.06);
      else if (e.k === 'door') put(0, free, Math.min(h * 0.5, 1.05) - 0.08, 0.03, 0.025, Math.min(0.18, h * 0.3), 0.03);
      else if (e.k === 'flap') put(0, w * 0.5 - 0.17, h - 0.07, 0.035, 0.34, 0.022, 0.035);
      else if (e.k === 'drawer') put(0, w * 0.5 - 0.07, h * 0.5 - 0.011, 0.03, 0.14, 0.022, 0.03);
    }
    // iç boşluk: kapalıyken görünmez (sıfır ölçek), açılınca gömülü kapağın önünü kapatır
    if (el.cslot >= 0) {
      if (k < 0.01) this.meshes.cavity.setMatrixAt(el.cslot, ZERO);
      else {
        if (e.k === 'lid') _m.makeTranslation(e.x0 + 0.03, e.cav, e.z - 0.03).multiply(_m2.makeScale(w - 0.06, 0.004, e.z - e.zb - 0.06));
        else _m.makeTranslation(e.x0, e.y0 + 0.004, e.cav + 0.004).multiply(_m2.makeScale(w, Math.max(0.01, h - 0.008), 0.004));
        this.meshes.cavity.setMatrixAt(el.cslot, _m.premultiply(_w));
      }
    }
  }

  update(dt) {
    const S = this.s;
    if (!S.local || !S.loot) return;
    // yerel kullanım değişti → host'a bildir (herkes görsün); tek noktadan yoklama: arama iptali, panel kapanışı,
    // uzaklaşma, başka panel… hepsini kapsar
    const use = this.localUseId();
    if (use !== this.localUse) {
      if (this.localUse) S.act('cont_use', { id: this.localUse, on: false });
      if (use) S.act('cont_use', { id: use, on: true });
      this.localUse = use;
    }
    this.t -= dt;
    if (this.t <= 0) { this.t = 0.5; this.rebuild(); }
    const touched = new Set();
    for (const a of this.active) {
      const tgt = this.target(a);
      for (const el of a.els) {
        if (Math.abs(el.open - tgt) > 0.001) {
          const opening = tgt > el.open && el.open < 0.02;
          el.open = damp(el.open, tgt, tgt > el.open ? 5.5 : 4, dt);
          if (Math.abs(el.open - tgt) < 0.003) el.open = tgt;
          el.dirty = true;
          // aramayı başlatan yerel oyuncu için Interact zaten kapı sesini çaldı (iki ses üst üste binmesin)
          const ownStart = a.ct.id === this.localUse && S.interact && S.interact.hold && S.interact.hold.container === a.ct;
          if (opening && el === a.els[0] && S.audio && !ownStart) S.audio.play('door', { at: a.ct, vol: 0.28, rate: el.e.mat === 'metal' ? 0.85 : el.e.k === 'lid' ? 1.2 : 1.55 });
        }
        if (el.dirty) { this.write(a, el); el.dirty = false; touched.add(el.e.mat); if (el.hslot >= 0) touched.add('handle'); if (el.cslot >= 0) touched.add('cavity'); }
      }
    }
    for (const k of touched) this.meshes[k].instanceMatrix.needsUpdate = true;
  }

  /** Test/görsel denetim: konteynerin ön yüz açıklıkları */
  openOf(id) { const a = this.active.find((q) => q.ct.id === id); return a ? a.els.map((el) => +el.open.toFixed(3)) : null; }

  dispose() {
    if (this.localUse && this.s.net && this.s.net.active) { try { this.s.act('cont_use', { id: this.localUse, on: false }); } catch { /* oturum kapanıyor */ } }
    for (const im of Object.values(this.meshes)) im.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.s.game.scene.remove(this.group);
  }
}
