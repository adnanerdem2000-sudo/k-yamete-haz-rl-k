// Oyuncu ihtiyaçları ve durumları (saf mantık). Oranlar oyun saati başınadır.
// Göstergeler: sağlık, açlık, susuzluk (100 = tok/su içmiş), enerji, moral, vücut sıcaklığı.
// Durumlar: kanama, enfeksiyon, zehirlenme, yaralanma, hastalık, uykusuzluk, üşüme.
import { clamp } from '../core/util.js';

export const RATES = {
  hunger: 4.2, thirst: 6.0, energyAwake: 3.4, energySleep: 14, moralDrift: 2,
  regen: 1.6, starve: 3, dehydrate: 5, bleed: 9, infectionGrow: 4, sickDmg: 2.5, poisonDmg: 3,
};

export class PlayerStats {
  constructor(charStats = {}, difficulty = 1) {
    this.maxHealth = charStats.health || 100;
    this.health = this.maxHealth;
    this.hunger = 85; this.thirst = 85; this.energy = 90; this.morale = 70;
    this.temp = 37;
    this.maxStamina = charStats.stamina || 100;
    this.stamina = this.maxStamina;
    this.cond = { bleeding: 0, infection: 0, poisoned: 0, injury: 0, sick: false, wet: 0 };
    this.buffs = {};
    this.downed = false; this.downTime = 0; this.dead = false;
    this.armor = 0;
    this.charArmor = charStats.armor || 1;
    this.difficulty = difficulty;
    this.lastHitAt = -999;
    this.version = 0;
  }

  get sleepDeprived() { return this.energy < 15; }
  get cold() { return this.temp < 35.6; }
  get hot() { return this.temp > 38.6; }

  /** Hareket hızı çarpanı */
  speedMul(overweight = 0) {
    let m = 1;
    if (this.cond.injury > 0 && !this.buffs.painkiller) m *= 1 - 0.32 * this.cond.injury;
    if (this.thirst < 15) m *= 0.85;
    if (this.energy < 10) m *= 0.8;
    if (this.cold) m *= 0.9;
    if (overweight > 0) m *= Math.max(0.45, 1 - overweight * 0.05);
    return m;
  }

  staminaMaxNow() { return this.maxStamina * (this.energy < 20 ? 0.6 : 1) * (this.hunger < 10 ? 0.75 : 1); }

  /**
   * Oyun dakikası kadar ilerlet. env: {ambient (°C), wet (0..1), sheltered, nearFire, sleeping, resting, comfort (0..1), alone, night, inBase, warmth}
   * Dönüş: olay dizisi
   */
  tick(minutes, env = {}) {
    if (this.dead) return [];
    const h = minutes / 60;
    const ev = [];
    const sleeping = !!env.sleeping;
    const diff = this.difficulty;
    if (this.downed) return ev;
    // açlık/susuzluk
    this.hunger = clamp(this.hunger - RATES.hunger * h * (sleeping ? 0.6 : 1) * diff, 0, 100);
    const heat = (env.ambient !== undefined && env.ambient > 30 ? 1.5 : 1) * (1 + (env.sun || 0) * 0.6); // güneş altında daha çok susar
    this.thirst = clamp(this.thirst - RATES.thirst * h * (sleeping ? 0.6 : 1) * heat * diff, 0, 100);
    // enerji
    if (sleeping) this.energy = clamp(this.energy + RATES.energySleep * h * (env.comfort ? 1 + env.comfort * 0.4 : 1), 0, 100);
    else this.energy = clamp(this.energy - RATES.energyAwake * h * (this.hunger < 20 ? 1.3 : 1), 0, 100);
    // vücut sıcaklığı
    const amb = env.ambient ?? 18;
    // öğle güneşinde açıkta kalmak vücudu ısıtır (sıcak havada 39,5 °C üstü: güneş çarpması hasarı); gölge/bina serin
    let target = 37 + (amb - 18) * 0.06 + (env.warmth || 0) * 0.08 - (env.wet || 0) * 1.4 + (env.nearFire ? 1.2 : 0) + (env.sheltered ? (amb > 26 ? -0.3 : 0.5) : 0) + (env.sun || 0) * 2.8;
    target = clamp(target, 33, 40.5);
    const prevT = this.temp;
    this.temp += (target - this.temp) * Math.min(1, h * (env.sun ? 1.2 : 0.8));
    if (prevT <= 38.6 && this.temp > 38.6) ev.push('heat');
    if (prevT <= 39.5 && this.temp > 39.5) ev.push('heatstroke');
    // moral
    let mTarget = 55 + (env.comfort || 0) * 30 + (env.inBase ? 6 : 0) - (env.alone ? 8 : 0) - (env.night && !env.inBase ? 6 : 0);
    if (this.hunger < 25) mTarget -= 12;
    if (this.thirst < 25) mTarget -= 12;
    if (this.health < 40) mTarget -= 10;
    if (this.cond.sick) mTarget -= 10;
    this.morale += clamp(mTarget - this.morale, -RATES.moralDrift * h * 3, RATES.moralDrift * h * 3);
    this.morale = clamp(this.morale, 0, 100);
    // hasar kaynakları
    let dmg = 0;
    if (this.hunger <= 0) dmg += RATES.starve * h;
    if (this.thirst <= 0) dmg += RATES.dehydrate * h;
    if (this.cond.bleeding > 0) { dmg += RATES.bleed * this.cond.bleeding * h; this.cond.bleeding = Math.max(0, this.cond.bleeding - 0.03 * h); }
    if (this.cond.infection > 0) {
      this.cond.infection = clamp(this.cond.infection + RATES.infectionGrow * h * (this.buffs.vitamins ? 0.5 : 1), 0, 100);
      if (this.cond.infection > 60 && !this.cond.sick) { this.cond.sick = true; ev.push('sick'); }
    }
    if (this.cond.sick) dmg += RATES.sickDmg * h * (this.cond.infection >= 100 ? 2 : 1);
    if (this.cond.poisoned > 0) {
      dmg += RATES.poisonDmg * h;
      this.thirst = clamp(this.thirst - 6 * h, 0, 100);
      this.cond.poisoned = Math.max(0, this.cond.poisoned - minutes);
      if (this.cond.poisoned <= 0) ev.push('poison_end');
    }
    if (this.temp < 35) dmg += 2.5 * h;
    if (this.temp > 39.5) dmg += 1.5 * h;
    // iyileşme
    if (this.hunger > 45 && this.thirst > 45 && this.cond.bleeding <= 0 && !this.cond.sick && this.cond.poisoned <= 0) {
      this.health = Math.min(this.maxHealth, this.health + RATES.regen * h * (sleeping ? 3 : 1) * (this.buffs.vitamins ? 1.6 : 1) * (this.morale > 70 ? 1.2 : 1));
      if (this.cond.injury > 0) this.cond.injury = Math.max(0, this.cond.injury - 0.02 * h * (sleeping ? 3 : 1));
    }
    // ıslaklık
    this.cond.wet = clamp(this.cond.wet + ((env.wet || 0) > 0 ? 0.8 * h : -0.5 * h) * (env.nearFire ? 3 : 1), 0, 1);
    // tamponlar
    for (const k of Object.keys(this.buffs)) { this.buffs[k] -= minutes; if (this.buffs[k] <= 0) delete this.buffs[k]; }
    if (dmg > 0) this.applyDamage(dmg, 'internal');
    this.version++;
    return ev;
  }

  /** Doğrudan hasar (zırh uygulanır) */
  damage(amount, kind = 'zombie', rng = Math.random) {
    if (this.downed || this.dead) return { downed: false, dealt: 0 };
    let a = amount * (1 - this.armor) * this.charArmor;
    const res = { dealt: a, bleed: false, infected: false, downed: false };
    if (kind === 'zombie') {
      if (rng() < 0.22) { this.cond.bleeding = Math.min(1, this.cond.bleeding + 0.4); res.bleed = true; }
      if (rng() < 0.12 && this.cond.infection <= 0) { this.cond.infection = 8; res.infected = true; }
    } else if (kind === 'bullet') {
      if (rng() < 0.45) { this.cond.bleeding = Math.min(1, this.cond.bleeding + 0.5); res.bleed = true; }
    } else if (kind === 'fall') {
      if (amount > 14) { this.cond.injury = Math.min(1, this.cond.injury + 0.6); res.injury = true; }
    } else if (kind === 'heavy') {
      if (rng() < 0.5) { this.cond.injury = Math.min(1, this.cond.injury + 0.4); res.injury = true; }
      if (rng() < 0.3) { this.cond.bleeding = Math.min(1, this.cond.bleeding + 0.4); res.bleed = true; }
    }
    this.applyDamage(a, kind);
    res.downed = this.downed;
    return res;
  }

  applyDamage(a, kind) {
    this.health -= a;
    this.lastHitKind = kind;
    if (this.health <= 0) {
      this.health = 0;
      this.downed = true;
      this.downTime = 0;
    }
    this.version++;
  }

  heal(n) { if (this.dead) return; this.health = Math.min(this.maxHealth, this.health + n); this.version++; }

  revive(hp = 30) {
    this.downed = false; this.dead = false; this.health = Math.max(hp, 1);
    this.cond.bleeding = 0; this.downTime = 0; this.version++;
  }

  /** Eşya kullanımı (def.use). healMul: Ceren bonusu */
  consume(use, healMul = 1, rng = Math.random) {
    const out = [];
    if (use.hunger) this.hunger = clamp(this.hunger + use.hunger, 0, 100);
    if (use.thirst) this.thirst = clamp(this.thirst + use.thirst, 0, 100);
    if (use.energy) this.energy = clamp(this.energy + use.energy, 0, 100);
    if (use.morale) this.morale = clamp(this.morale + use.morale, 0, 100);
    if (use.health) this.heal(use.health * healMul);
    if (use.infection) { this.cond.infection = clamp(this.cond.infection + use.infection * healMul, 0, 100); if (this.cond.infection < 40) this.cond.sick = false; }
    if (use.cure) for (const c of use.cure) {
      if (c === 'bleeding') this.cond.bleeding = 0;
      if (c === 'injury') this.cond.injury = 0;
      if (c === 'poisoned') this.cond.poisoned = 0;
      if (c === 'sick') { this.cond.sick = false; this.cond.infection = Math.min(this.cond.infection, 10); }
    }
    if (use.buff) this.buffs[use.buff[0]] = use.buff[1];
    if (use.poison && rng() < use.poison) { this.cond.poisoned = 180; out.push('poisoned'); }
    this.version++;
    return out;
  }

  serialize() {
    return { health: this.health, maxHealth: this.maxHealth, hunger: this.hunger, thirst: this.thirst, energy: this.energy, morale: this.morale, temp: this.temp, cond: { ...this.cond }, buffs: { ...this.buffs }, downed: this.downed, stamina: this.stamina };
  }
  load(o) { Object.assign(this, { ...o, cond: { ...this.cond, ...(o.cond || {}) }, buffs: { ...(o.buffs || {}) } }); this.version++; }
}
