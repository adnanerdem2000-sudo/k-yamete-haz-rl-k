// Üretim (CraftingManager): tarif kontrolü (malzeme, alet, istasyon, yakıt), süreli üretim,
// karakter yetenek bonusları. Malzemeler oyuncunun kendi envanterinden harcanır (yerel),
// görev ilerlemesi host'a bildirilir.
import { RECIPES, RECIPE_BY_ID } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import { clamp } from '../core/util.js';
import { toolName } from './Build.js';

const STATION_NAMES = { workbench: 'Çalışma Tezgâhı', fire: 'Ateş / Ocak', water_filter: 'Su Filtresi' };

export class Crafting {
  constructor(session) {
    this.s = session;
    this.busy = null;
  }

  stations() { return this.s.build.stations(this.s.local.pos); }

  /** Yakındaki ve envanterdeki üs depolarını da sayar mı? Hayır: üretim taşıdığın malzemeyle yapılır. */
  have(id) { return this.s.inventory.count(id); }

  fuelAvailable() {
    let f = 0;
    for (const s of this.s.inventory.slots) if (s && s.id === 'jerrycan') f += s.fuel || 0;
    return f;
  }

  perkMul(r) {
    const st = this.s.localProfile.stats;
    if (!r.perk) return 1;
    return st[r.perk] || 1;
  }

  /** Tarif yapılabilir mi? {ok, why, missing:[{id,need,have}], station} */
  check(r, st = this.stations()) {
    const out = { ok: true, why: null, missing: [], stationOk: true, toolsOk: true };
    for (const [id, n] of r.in) {
      const h = this.have(id);
      if (h < n) { out.ok = false; out.missing.push({ id, need: n, have: h }); }
    }
    if (out.missing.length) out.why = 'Malzeme eksik';
    for (const t of r.tools || []) {
      if (!this.s.build.hasTool(t)) { out.ok = false; out.toolsOk = false; out.why = out.why || `${toolName(t)} gerekli`; }
    }
    if (r.station === 'workbench' && st.workbench < Math.max(1, r.level)) { out.ok = false; out.stationOk = false; out.why = out.why || (r.level > 1 ? `Seviye ${r.level} tezgâh gerekli` : 'Çalışma tezgâhı yanında olmalısın'); }
    if (r.station === 'fire' && !st.fire) { out.ok = false; out.stationOk = false; out.why = out.why || 'Ateş ya da ocak yanında olmalısın'; }
    if (r.station === 'water_filter' && !st.water_filter) { out.ok = false; out.stationOk = false; out.why = out.why || 'Su filtresi yanında olmalısın'; }
    if (r.fuel && this.fuelAvailable() < r.fuel) { out.ok = false; out.why = out.why || `${r.fuel} L yakıt gerekli (dolu bidon)`; }
    if (this.busy) { out.ok = false; out.why = out.why || 'Zaten bir şey üretiyorsun'; }
    return out;
  }

  stationLabel(r) {
    if (r.station === 'none') return 'El ile';
    return STATION_NAMES[r.station] + (r.station === 'workbench' && r.level > 1 ? ` (Sv. ${r.level})` : '');
  }

  /** Gerçek süre (sn): oyun dakikasından türetilir, yetenek hızlandırır */
  duration(r) { return clamp(r.time * 0.32, 1.2, 14) / this.perkMul(r); }

  outputQty(r) {
    let q = r.qty;
    if (r.perk === 'hunt' && (this.s.localProfile.stats.hunt || 1) > 1.4 && (r.out === 'arrow' || r.out === 'bolt')) q += 2;
    if (r.perk === 'heal' && (this.s.localProfile.stats.heal || 1) > 1.4 && r.out === 'bandage') q += 1;
    return q;
  }

  craft(id) {
    const S = this.s;
    const r = RECIPE_BY_ID[id];
    if (!r) return false;
    const c = this.check(r);
    if (!c.ok) { S.ui.toast(c.why || 'Üretilemez.', 'warn'); S.audio.play('error', { vol: 0.5 }); return false; }
    // malzemeleri hemen ayır (iptalde iade)
    for (const [it, n] of r.in) S.inventory.remove(it, n);
    let fuelTaken = 0;
    if (r.fuel) {
      let need = r.fuel;
      for (const s of S.inventory.slots) if (s && s.id === 'jerrycan' && need > 0) { const t = Math.min(need, s.fuel || 0); s.fuel -= t; need -= t; fuelTaken += t; }
      S.inventory.changed();
    }
    const dur = this.duration(r);
    this.busy = { id, t: 0, dur };
    const anim = r.station === 'fire' || r.cat === 'cook' ? 'search' : 'hammer';
    S.local.avatar.play(anim, dur);
    S.audio.play(r.station === 'fire' ? 'fire_whoosh' : 'craft', { vol: 0.6 });
    S.ui.progress(`${r.name}…`, dur, () => {
      this.busy = null;
      const q = this.outputQty(r);
      S.giveLocal(r.out, q);
      S.results.crafted++;
      S.ui.itemToast(r.out, q);
      S.audio.play('success', { vol: 0.4 });
      S.quests.onCraft(r.out);
      if (r.cat === 'weapon' || r.out === 'radio') S.act('noise', { x: S.local.pos.x, z: S.local.pos.z, r: 8, src: 'craft' });
    }, () => {
      // iptal: malzemeleri geri ver
      this.busy = null;
      for (const [it, n] of r.in) S.giveLocal(it, n);
      if (fuelTaken) { const jc = S.inventory.slots.find((s) => s && s.id === 'jerrycan'); if (jc) { jc.fuel += fuelTaken; S.inventory.changed(); } }
      S.ui.toast('Üretim iptal edildi.', 'info', 2);
    });
    return true;
  }

  /** Arayüz için: kategoriye göre tarifler, yapılabilir olanlar önce */
  list(cat = 'all') {
    const st = this.stations();
    return RECIPES.filter((r) => cat === 'all' || r.cat === cat).map((r) => ({ r, c: this.check(r, st) }))
      .sort((a, b) => (b.c.ok - a.c.ok) || (b.c.stationOk - a.c.stationOk) || a.r.name.localeCompare(b.r.name, 'tr'));
  }

  itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }
}
