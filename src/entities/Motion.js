// Motion — aktarılmış hareket kütüphanesiyle (Universal Animation Library 1+2, CC0; tools/retarget-ual.mjs)
// tam gövde animasyon denetleyicisi. Avatar (oyuncu, ağ oyuncusu, NPC, bot) bu sınıfı kullanır.
//
//  Temel katman (durumlar): ayakta (bekleme ↔ yürüme ↔ koşu ↔ depar, 8 yön), eğilme (8 yön), sürünme ve yaralı
//  sürünme (4 yön), yüzme, merdiven, havada, sürüş, oturma. Durumlar arası yumuşak geçiş (ağırlık sönümü),
//  durum değişiminde geçiş klipleri (yere yatma/kalkma, eğilme).
//  Döngüler ortak fazla ilerler: her klip sol topuğun yere bastığı ana hizalıdır (ph), faz hızı karakterin gerçek
//  hızından ve kliplerin ölçülmüş yürüyüş hızından (ayak kayması ölçümü) hesaplanır → ayak kayması en aza iner.
//  Karıştırma: ağırlıklı dörtlü toplamı + normalleme (yarıküre hizalı), konumlar ağırlıklı ortalama.
//  Tek seferlik klipler (eylem katmanı): maskeli (tam / üst gövde / kollar) üzerine yazma, giriş/çıkış sönümü,
//  aralık (from/to), döngü ve sonda bekleme (ölüm, uyku) desteği.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const frac = (x) => x - Math.floor(x);

// 8 yön: açı k·45° (0 ileri, +90° sol); null → o yön yok (komşulara paylaştırılır)
const SETS = {
  walk: ['Walk_Fwd_Loop', 'Walk_Fwd_L_Loop', 'Walk_L_Loop', 'Walk_Bwd_L_Loop', 'Walk_Bwd_Loop', 'Walk_Bwd_R_Loop', 'Walk_R_Loop', 'Walk_Fwd_R_Loop'],
  jog: ['Jog_Fwd_Loop', 'Jog_Fwd_L_Loop', 'Jog_Left_Loop', 'Jog_Bwd_L_Loop', 'Jog_Bwd_Loop', 'Jog_Bwd_R_Loop', 'Jog_Right_Loop', 'Jog_Fwd_R_Loop'],
  crouch: ['Crouch_Fwd_Loop', 'Crouch_Fwd_L_Loop', 'Crouch_Left_Loop', 'Crouch_Bwd_L_Loop', 'Crouch_Bwd_Loop', 'Crouch_Bwd_R_Loop', 'Crouch_Right_Loop', 'Crouch_Fwd_R_Loop'],
  crawl: ['Crawl_Fwd_Loop', null, 'Crawl_Left_Loop', null, 'Crawl_Bwd_Loop', null, 'Crawl_Right_Loop', null],
  zwalk: ['Zombie_Walk_Fwd_Loop', null, 'Zombie_Walk_L_Loop', null, 'Zombie_Walk_Bwd_Loop', null, 'Zombie_Walk_R_Loop', null],
};

// Kişiliğe göre bekleme çeşitleri (ana + ara sıra kıpırdanma) ve ileri yürüyüş klibi
export const PERSONA = {
  relaxed: { idle: 'Idle_Loop', fidget: ['Idle_LookAround_Loop'], walk: 'Walk_Loop' },
  agile: { idle: 'Idle_Loop', fidget: ['Idle_LookAround_Loop'], walk: 'Walk_Fwd_Loop', rate: 1.05 },
  confident: { idle: 'Idle_Loop', fidget: ['Idle_FoldArms_Loop'], walk: 'Walk_Fwd_Loop' },
  observer: { idle: 'Idle_LookAround_Loop', fidget: ['Idle_Loop'], walk: 'Walk_Fwd_Loop' },
  heavy: { idle: 'Idle_Loop', fidget: ['Idle_FoldArms_Loop'], walk: 'Walk_Loop', rate: 0.95 },
  calm: { idle: 'Idle_Loop', fidget: ['Idle_TalkingPhone_Loop'], walk: 'Walk_Formal_Loop' },
  formal: { idle: 'Idle_Loop', fidget: ['Idle_FoldArms_Loop'], walk: 'Walk_Formal_Loop' },
  default: { idle: 'Idle_Loop', fidget: ['Idle_LookAround_Loop'], walk: 'Walk_Fwd_Loop' },
};

// Durum değişiminde oynayan geçiş klipleri [klip, süre(sn), from, to]
const TRANSITIONS = {
  'stand>prone': ['Crawl_Enter', 0.95, 0, 1], 'crouch>prone': ['Crawl_Enter', 0.75, 0.2, 1],
  'prone>crouch': ['Crawl_Exit', 0.9, 0, 1], 'prone>stand': ['Crawl_Exit', 0.95, 0, 1],
  'stand>crouch': ['Crouch_Enter', 0.38, 0, 1], 'crouch>stand': ['Crouch_Exit', 0.4, 0, 1],
};

// Maskeler: kemik adı → ağırlık (üst gövde katmanında bel kısmen; bacaklar temel katmanda kalır)
const UPPER = { Abdomen: 0.45, Torso: 0.75, Chest: 1, Neck: 1, Head: 1 };
const ARM_RE = /^(Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/;
function maskWeight(mask, name) {
  if (mask === 'full') return 1;
  if (mask === 'upper') return UPPER[name] ?? (ARM_RE.test(name) ? 1 : 0);
  if (mask === 'arms') return ARM_RE.test(name) ? 1 : name === 'Chest' ? 0.3 : 0;
  if (mask === 'rarm') return ARM_RE.test(name) && name.endsWith('R') ? 1 : 0;
  if (mask === 'larm') return ARM_RE.test(name) && name.endsWith('L') ? 1 : 0;
  if (mask === 'head') return name === 'Neck' ? 0.6 : name === 'Head' ? 1 : 0;
  return 0;
}

/** Bir klibin izlerini modelin kemik dizinlerine bağlar (iz başına interpolant, karakter başına bir kez) */
class Sampler {
  constructor(clip, index) {
    this.clip = clip;
    this.dur = clip.duration;
    this.info = clip.userData || {};
    this.q = []; this.p = [];
    for (const t of clip.tracks) {
      const dot = t.name.lastIndexOf('.');
      const i = index.get(t.name.slice(0, dot));
      if (i === undefined) continue;
      const prop = t.name.slice(dot + 1);
      if (prop === 'quaternion') this.q.push({ i, f: t.createInterpolant() });
      else if (prop === 'position') this.p.push({ i, f: t.createInterpolant() });
    }
  }
}

export class Motion {
  /** @param ch CharacterFactory.create çıktısı (ch.anim: klip sözlüğü) @param opts {persona} */
  constructor(ch, opts = {}) {
    this.lib = ch.anim;
    this.model = ch.model;
    this.bones = [];
    this.index = new Map();
    ch.model.traverse((o) => { if (o.isBone && !this.index.has(o.name)) { this.index.set(o.name, this.bones.length); this.bones.push(o); } });
    const n = this.bones.length;
    this.aq = new Float32Array(n * 4); this.wq = new Float32Array(n);
    this.ap = new Float32Array(n * 3); this.wp = new Float32Array(n);
    this.samplers = new Map();
    this.masks = new Map();
    // zombi: kendi bekleme/yürüme/koşu kümesi; bireysel hız çarpanı (sürü aynı adımla yürümesin)
    this.zombie = opts.kind === 'zombie';
    this.rateMul = opts.rate || 1;
    this.persona = this.zombie ? { idle: 'Zombie_Idle_Loop', fidget: [] } : PERSONA[opts.persona] || PERSONA.default;
    this.sets = this.zombie ? { ...SETS, walk: SETS.zwalk } : { ...SETS, walk: [this.persona.walk || SETS.walk[0], ...SETS.walk.slice(1)] };
    this.state = 'stand';
    this.sw = { stand: 1 }; // durum ağırlıkları
    this.phase = { stand: Math.random(), crouch: Math.random(), prone: Math.random() }; // durum → döngü fazı (0..1)
    this.t = Math.random() * 20;
    this.idle = { cur: this.persona.idle, prev: null, x: 1, until: 6 + Math.random() * 8, fidget: false };
    this.shots = [];
    this.d8 = new Float32Array(8);
    this.fullW = 0; // tam gövde tek seferlik klip ağırlığı (prosedürel katman geri çekilir)
    this.upperW = 0;
    this.tmpBody = new THREE.Vector3();
  }

  has(name) { return !!(this.lib && this.lib[name]); }
  sampler(name) {
    let s = this.samplers.get(name);
    if (s === undefined) { const c = this.lib[name]; s = c ? new Sampler(c, this.index) : null; this.samplers.set(name, s); }
    return s;
  }
  maskOf(mask) {
    let m = this.masks.get(mask);
    if (!m) { m = new Float32Array(this.bones.length); this.bones.forEach((b, i) => { m[i] = maskWeight(mask, b.name); }); this.masks.set(mask, m); }
    return m;
  }

  // ---------------------------------------------------------------- birikim
  _begin() { this.aq.fill(0); this.wq.fill(0); this.ap.fill(0); this.wp.fill(0); }
  _add(s, t, w) {
    if (!s || w <= 1e-4) return;
    const aq = this.aq, wq = this.wq;
    for (const it of s.q) {
      const r = it.f.evaluate(t), k = it.i * 4;
      let x = r[0], y = r[1], z = r[2], ww = r[3];
      if (wq[it.i] > 0 && aq[k] * x + aq[k + 1] * y + aq[k + 2] * z + aq[k + 3] * ww < 0) { x = -x; y = -y; z = -z; ww = -ww; }
      aq[k] += x * w; aq[k + 1] += y * w; aq[k + 2] += z * w; aq[k + 3] += ww * w; wq[it.i] += w;
    }
    const ap = this.ap, wp = this.wp;
    for (const it of s.p) {
      const r = it.f.evaluate(t), k = it.i * 3;
      ap[k] += r[0] * w; ap[k + 1] += r[1] * w; ap[k + 2] += r[2] * w; wp[it.i] += w;
    }
  }
  _write() {
    const B = this.bones, aq = this.aq, wq = this.wq, ap = this.ap, wp = this.wp;
    for (let i = 0; i < B.length; i++) {
      if (wq[i] > 0) {
        const k = i * 4, l = Math.hypot(aq[k], aq[k + 1], aq[k + 2], aq[k + 3]) || 1;
        B[i].quaternion.set(aq[k] / l, aq[k + 1] / l, aq[k + 2] / l, aq[k + 3] / l);
      }
      if (wp[i] > 0) { const k = i * 3, w = wp[i]; B[i].position.set(ap[k] / w, ap[k + 1] / w, ap[k + 2] / w); }
    }
  }

  /** 8 yön ağırlıkları (komşu iki yön arasında doğrusal); eksik yönler komşulara paylaştırılır */
  _dirs(angle, set) {
    const d = this.d8;
    d.fill(0);
    const f = frac(angle / TAU) * 8;
    const i0 = Math.floor(f) % 8, i1 = (i0 + 1) % 8, t = f - Math.floor(f);
    d[i0] = 1 - t; d[i1] = t;
    for (let i = 0; i < 8; i++) if (d[i] > 0 && !set[i]) { const a = d[i] / 2; d[i] = 0; d[(i + 7) % 8] += a; d[(i + 1) % 8] += a; }
    return d;
  }

  /**
   * Hareket kümesi: hız ve yöne göre klip ağırlıkları, ortak fazla örnekleme.
   * groups: [{ set (8'li ad listesi) | clip (tek ad), w }] — ağırlıklar toplamı 1. Döner: hareket ağırlığı.
   */
  _loco(key, groups, angle, speed, idleClip, idleW, sw, dt, rateMul = 1) {
    // katkıları topla
    const parts = [];
    let wsum = 0, dist = 0, dur = 0;
    const moveW = 1 - idleW;
    if (moveW > 1e-3) {
      for (const g of groups) {
        if (g.w <= 1e-3) continue;
        if (g.clip) { const s = this.sampler(g.clip); if (s) parts.push([s, g.w]); continue; }
        const d = this._dirs(angle, g.set);
        for (let i = 0; i < 8; i++) if (d[i] > 1e-3 && g.set[i]) { const s = this.sampler(g.set[i]); if (s) parts.push([s, g.w * d[i]]); }
      }
      for (const [s, w] of parts) { wsum += w; dist += w * (s.info.speed || 1) * s.dur; dur += w * s.dur; }
    }
    // faz hızı: gerçek hız / karışık döngü mesafesi (sınırlı: aşırı hızlı/yavaş oynatma olmasın)
    let ph = this.phase[key] || 0;
    if (wsum > 0) {
      dist /= wsum; dur /= wsum;
      const rate = Math.min(1.85 / dur, Math.max(0.5 / dur, (speed / Math.max(0.05, dist)) * rateMul));
      ph = frac(ph + rate * dt);
    }
    this.phase[key] = ph;
    if (idleW > 1e-3 && idleClip) this._idle(idleClip, idleW * sw);
    if (wsum > 0) for (const [s, w] of parts) this._add(s, frac(ph + (s.info.ph || 0)) * s.dur, (w / wsum) * moveW * sw);
    return moveW;
  }

  /** Bekleme klibi (ayakta: kişilik çeşitleri arasında yumuşak geçiş) */
  _idle(name, w) {
    const s = this.sampler(name);
    if (s) this._add(s, frac(this.t / s.dur) * s.dur, w);
  }
  _standIdle(w, dt, a) {
    const I = this.idle;
    I.until -= dt;
    // yorgunken nefes nefese bekleme; konuşurken el kol hareketli konuşma
    const want = a.talk && this.has('Idle_Talking_Loop') ? 'Idle_Talking_Loop' : a.tired && this.has('Idle_Tired_Loop') ? 'Idle_Tired_Loop' : null;
    if (want && I.cur !== want) { I.prev = I.cur; I.cur = want; I.x = 0; I.until = 4; }
    else if (!want && (I.cur === 'Idle_Talking_Loop' || I.cur === 'Idle_Tired_Loop') && I.cur !== this.persona.idle) { I.prev = I.cur; I.cur = this.persona.idle; I.x = 0; I.fidget = false; I.until = 6 + Math.random() * 6; }
    else if (!want && I.until <= 0 && this.persona.fidget.length) {
      const P = this.persona;
      const next = I.fidget || I.cur === 'Idle_Tired_Loop' || I.cur === 'Idle_Talking_Loop' ? P.idle : P.fidget[Math.floor(Math.random() * P.fidget.length)];
      I.fidget = next !== P.idle;
      if (next !== I.cur && this.has(next)) { I.prev = I.cur; I.cur = next; I.x = 0; }
      const s = this.sampler(I.cur);
      I.until = I.fidget ? Math.max(3, (s ? s.dur : 3) * (1 + Math.floor(Math.random() * 2))) : 7 + Math.random() * 10;
    }
    I.x = Math.min(1, I.x + dt / 0.6);
    if (I.prev && I.x < 1) this._idle(I.prev, w * (1 - I.x));
    this._idle(I.cur, w * (I.x < 1 && I.prev ? I.x : 1));
  }

  // ---------------------------------------------------------------- tek seferlik klipler
  /**
   * o: { dur | rate, from, to (0..1), mask: full|upper|arms|rarm|larm|head, w, fadeIn, fadeOut, hold, loop, group }
   * @returns tanıtıcı (null: klip yok)
   */
  play(name, o = {}) {
    const s = this.sampler(name);
    if (!s) return null;
    const from = (o.from ?? 0) * s.dur, to = (o.to ?? 1) * s.dur;
    const rate = o.rate ?? (o.dur ? (to - from) / o.dur : 1);
    const group = o.group || name;
    for (const x of this.shots) if (x.group === group && !x.out) x.out = Math.max(1e-3, x.fadeOut);
    const shot = { name, s, t: from, from, to, rate, mask: this.maskOf(o.mask || 'full'), full: (o.mask || 'full') === 'full', w: o.w ?? 1, fadeIn: o.fadeIn ?? 0.12, fadeOut: o.fadeOut ?? 0.2, hold: !!o.hold, loop: !!o.loop, group, age: 0, out: 0, k: 0 };
    this.shots.push(shot);
    return shot;
  }
  /** Belirli bir tek seferlik klibi sönümle bitir */
  stopShot(x) { if (x && !x.out) x.out = Math.max(1e-3, x.fadeOut); }
  /** Gruptaki/adlı klibi sönümle bitir */
  stop(groupOrName) { for (const x of this.shots) if ((x.group === groupOrName || x.name === groupOrName) && !x.out) x.out = Math.max(1e-3, x.fadeOut); }
  playing(groupOrName) { return this.shots.some((x) => (x.group === groupOrName || x.name === groupOrName) && !x.out); }

  _shots(dt) {
    const B = this.bones;
    this.fullW = 0; this.upperW = 0;
    for (let n = 0; n < this.shots.length; n++) {
      const x = this.shots[n];
      x.age += dt;
      x.t += dt * x.rate;
      if (x.t >= x.to) {
        if (x.loop) x.t = x.from + ((x.t - x.from) % Math.max(1e-3, x.to - x.from));
        else if (x.hold || x.out) x.t = x.to;
        else { this.shots.splice(n--, 1); continue; } // bitti (son kısmı zaten sönümlendi)
      }
      // ağırlık: giriş sönümü × bitişe yaklaşırken çıkış sönümü × durdurma sönümü
      let w = Math.min(1, x.age / Math.max(1e-3, x.fadeIn));
      if (!x.loop && !x.hold) w = Math.min(w, (x.to - x.t) / Math.max(1e-3, x.fadeOut * x.rate));
      if (x.out) {
        x.k += dt;
        w = Math.min(w, 1 - x.k / x.out);
        if (w <= 0) { this.shots.splice(n--, 1); continue; }
      }
      w = Math.max(0, w) * x.w;
      x.cur = w;
      if (w <= 1e-4) continue;
      const t = Math.min(x.t, x.s.dur - 1e-4);
      const M = x.mask;
      for (const it of x.s.q) {
        const mw = M[it.i] * w;
        if (mw <= 0) continue;
        const r = it.f.evaluate(t), b = B[it.i].quaternion;
        if (mw >= 0.999) b.set(r[0], r[1], r[2], r[3]);
        else { _q.set(r[0], r[1], r[2], r[3]); b.slerp(_q, mw); }
      }
      if (x.full) {
        for (const it of x.s.p) {
          const r = it.f.evaluate(t), p = B[it.i].position;
          if (w >= 0.999) p.set(r[0], r[1], r[2]); else { _v.set(r[0], r[1], r[2]); p.lerp(_v, w); }
        }
        this.fullW = Math.max(this.fullW, w);
      } else this.upperW = Math.max(this.upperW, w);
    }
  }

  // ---------------------------------------------------------------- kare güncellemesi
  /**
   * a: Avatar anim durumu {mode, speed (yumuşatılmış), moveAngle (yumuşatılmış), vy, tired, ...}
   * Kemikleri yazar. Döner: etkin durum adı.
   */
  update(dt, a) {
    this.t += dt;
    const mode = a.mode || 'ground';
    const target = { ground: 'stand', crouch: 'crouch', prone: 'prone', downed: 'downed', swim: 'swim', climb: 'climb', air: 'air', drive: 'drive', seat: 'seat' }[mode] || 'stand';
    if (target !== this.state) this._enter(this.state, target, a.speed || 0);
    // durum ağırlıkları: hedef 1'e, diğerleri 0'a sönümlenir
    const k = target === 'air' || this.state === 'air' ? 12 : 9;
    let tot = 0;
    for (const key of Object.keys(this.sw)) { this.sw[key] = damp(this.sw[key], key === target ? 1 : 0, k, dt); if (this.sw[key] < 1e-3 && key !== target) delete this.sw[key]; else tot += this.sw[key]; }
    if (!(target in this.sw)) { this.sw[target] = 1 - Math.min(1, tot); tot += this.sw[target]; }
    this._begin();
    const s = a.speed || 0, ang = a.moveAngle || 0;
    for (const [key, w0] of Object.entries(this.sw)) {
      const w = w0 / tot;
      switch (key) {
        case 'stand': {
          if (this.zombie) {
            const run = smooth(1.7, 3.0, s), idleW = 1 - smooth(0.1, 0.4, s);
            if (idleW > 1e-3) this._standIdle(idleW * w, dt, a);
            this._loco('stand', [{ set: this.sets.walk, w: 1 - run }, { clip: 'Zombie_Run_Fwd_Loop', w: run }], ang, s, null, idleW, w, dt, this.rateMul);
            break;
          }
          // yerinde dönüş: dururken hızlı dönülürse dönüş yönüne yan adım (ayaklar yerde kaymasın)
          const turn = a.turn || 0;
          const turnW = smooth(0.7, 2.0, Math.abs(turn)) * (1 - smooth(0.25, 0.6, s));
          const sEff = turnW > 0.01 ? Math.max(s, 0.6 * turnW) : s;
          const aEff = turnW > 0.01 && s < 0.25 ? (turn > 0 ? Math.PI / 2 : -Math.PI / 2) : ang;
          const idleW = 1 - smooth(0.12, 0.5, sEff);
          const jog = smooth(1.5, 2.9, s), spr = smooth(5.0, 6.3, s) * Math.max(0, Math.cos(ang));
          const pr = (this.persona.rate || 1) * this.rateMul;
          if (idleW > 1e-3) this._standIdle(idleW * w, dt, a);
          this._loco('stand', [{ set: this.sets.walk, w: 1 - jog }, { set: this.sets.jog, w: jog * (1 - spr) }, { clip: 'Sprint_Loop', w: jog * spr }], aEff, sEff, null, idleW, w, dt, pr);
          break;
        }
        case 'crouch': this._loco('crouch', [{ set: this.sets.crouch, w: 1 }], ang, s, 'Crouch_Idle_Loop', 1 - smooth(0.08, 0.35, s), w, dt); break;
        case 'prone': this._loco('prone', [{ set: this.sets.crawl, w: 1 }], ang, s, 'Crawl_Idle_Loop', 1 - smooth(0.05, 0.25, s), w, dt); break;
        case 'downed': this._loco('downed', [{ set: this.sets.crawl, w: 1 }], ang, s, 'Crawl_Idle_Loop', 1 - smooth(0.05, 0.25, s), w, dt, 0.8); break;
        case 'swim': {
          const mv = smooth(0.15, 0.9, s);
          const si = this.sampler('Swim_Idle_Loop'), sf = this.sampler('Swim_Fwd_Loop');
          this.phase.swim = frac((this.phase.swim || 0) + dt * (0.75 + Math.min(0.6, s * 0.25)) / (sf ? sf.dur : 1.3));
          if (si) this._add(si, frac(this.t / si.dur) * si.dur, (1 - mv) * w);
          if (sf) this._add(sf, this.phase.swim * sf.dur, mv * w);
          break;
        }
        case 'climb': {
          const vy = a.vy || 0;
          const up = smooth(0.1, 0.5, vy), down = smooth(0.1, 0.5, -vy), still = 1 - up - down;
          const cu = this.sampler('Climb_Up_Loop'), cd = this.sampler('Climb_Down_Loop'), ci = this.sampler('Climb_Idle_Loop');
          this.phase.climb = frac((this.phase.climb || 0) + dt * Math.min(2.4, Math.abs(vy) * 1.35) / (cu ? cu.dur : 1.27));
          if (ci) this._add(ci, frac(this.t / ci.dur) * ci.dur, still * w);
          if (cu) this._add(cu, this.phase.climb * cu.dur, up * w);
          if (cd) this._add(cd, this.phase.climb * cd.dur, down * w);
          break;
        }
        case 'air': { const j = this.sampler('Jump_Loop'); if (j) this._add(j, frac(this.t / j.dur) * j.dur, w); break; }
        case 'drive': { const d = this.sampler('Driving_Loop'); if (d) this._add(d, frac(this.t / d.dur) * d.dur, w); break; }
        case 'seat': { const d = this.sampler(a.talk ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop'); if (d) this._add(d, frac(this.t / d.dur) * d.dur, w); break; }
        default: break;
      }
    }
    this._write();
    this._shots(dt);
    return target;
  }

  /** Durum geçişi: uygun geçiş klibi (yatma/kalkma) */
  _enter(from, to, speed) {
    const tr = TRANSITIONS[`${from}>${to}`];
    this.state = to;
    // hareket halinde geçiş klibi (duran pozdan başlar) uymaz: yalnızca durumlar arası karışım
    if (tr && this.has(tr[0]) && speed < 0.6) {
      this.play(tr[0], { dur: tr[1], from: tr[2], to: tr[3], group: 'trans', fadeIn: 0.08, fadeOut: 0.18 });
      // geçiş klibi pozu taşıdığı için temel durum hemen hedefe geçer
      for (const k of Object.keys(this.sw)) delete this.sw[k];
      this.sw[to] = 1;
    } else this.stop('trans');
  }

  /** Model kökü uzayında kalça (Body) konumu (oturma/sürüşte koltuğa hizalamak için) */
  bodyLocal(out = this.tmpBody) {
    const b = this.bones[this.index.get('Body')];
    if (!b) return out.set(0, 0.9, 0);
    this.model.updateMatrixWorld(true);
    b.getWorldPosition(out);
    return this.model.worldToLocal(out);
  }
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
