// Motion — aktarılmış hareket kütüphanesiyle (Universal Animation Library 1+2, CC0; tools/retarget-ual.mjs)
// tam gövde animasyon denetleyicisi. Avatar (oyuncu, ağ oyuncusu, NPC, bot) bu sınıfı kullanır.
//
//  Temel katman (durumlar): ayakta (bekleme ↔ yürüme ↔ koşu ↔ depar, 8 yön), eğilme (8 yön), sürünme ve yaralı
//  sürünme (4 yön), yüzme, merdiven, havada, sürüş, oturma. Durumlar arası yumuşak geçiş (ağırlık sönümü),
//  durum değişiminde geçiş klipleri (yere yatma/kalkma, eğilme).
//  Döngüler ortak fazla ilerler: her klip sol topuğun yere bastığı ana hizalıdır (ph), faz hızı karakterin gerçek
//  hızından ve kliplerin ölçülmüş yürüyüş hızından (ayak kayması ölçümü) hesaplanır → ayak kayması en aza iner.
//  Karıştırma: ağırlıklı dörtlü toplamı + normalleme (yarıküre hizalı), konumlar ağırlıklı ortalama.
//  Ayakta bekleme kişiliğe göredir (PERSONA); ara sıra beliren bekleme çeşitlerini (kıpırdanma) Motion zamanlamaz:
//  tek karar noktası Avatar.updateFidget'tir, Motion yalnız setIdleVariant ile isteneni oynatır.
//  Tek seferlik klipler (eylem katmanı): maskeli (tam / alt / üst gövde / kollar) üzerine yazma, giriş/çıkış sönümü,
//  aralık (from/to), döngü ve sonda bekleme (ölüm, uyku) desteği. Döngü kendi aralığında (loopFrom…to) döner ya da
//  uçlarda yön değiştirir (pingpong: diz çöküp onarma gibi girişi/çıkışı olan klipler başa sarıp yeniden çökmez);
//  exitTo: döngü durdurulunca klibin to…exitTo kısmı çıkış olarak oynar (diz çökmüşken ayağa kalkma).
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

// Kişilik (ana karakterler: Mert relaxed, Zülal agile, Deniz confident, Elif observer, Bora heavy, Ceren calm; yağmacı
// observer). idle: temel bekleme (ad ya da [[ad, ağırlık]] karışımı); idleFree: elde eşya/yük varken kolları meşgul eden
// temel beklemenin yerine; walk: ileri yürüyüş (ad ya da karışım — Walk_Loop ile Walk_Fwd_Loop birebir aynı klip, ayrım
// Walk_Fwd/Walk_Formal karışımı ve tempoyla); rate: adım temposu (±%8'i geçmez: ayak kayar); fidgets: [tür, ağırlık]
// kıpırdanma havuzu (türler Avatar FIDGETS'te; Motion zamanlamaz, yalnız setIdleVariant ile bekleme çeşidini oynatır);
// pose: duruş eki (derece; Avatar uygular): sp bel/gövde öne, ch göğüs öne (− dik), hd baş öne, ab kol açıklığı (yürürken)
export const PERSONA = {
  relaxed: { idle: 'Idle_Loop', walk: 'Walk_Fwd_Loop', rate: 0.97, pose: { sp: 6, hd: 7 }, fidgets: [['tinker', 3], ['stretch', 1], ['lookAround', 1]] },
  agile: { idle: [['Idle_Loop', 0.65], ['Sword_Idle', 0.35]], walk: 'Walk_Fwd_Loop', rate: 1.06, pose: { sp: 3, hd: -3, ab: -3 }, fidgets: [['peek', 2], ['lantern', 2], ['stretch', 1]] },
  confident: { idle: 'Idle_FoldArms_Loop', idleFree: 'Idle_Loop', walk: 'Walk_Fwd_Loop', pose: { sp: -3, ch: -4, hd: -4, ab: 4 }, fidgets: [['boxing', 2], ['stretch', 1], ['lookAround', 1]] },
  observer: { idle: 'Idle_LookAround_Loop', walk: [['Walk_Fwd_Loop', 0.4], ['Walk_Formal_Loop', 0.6]], pose: { sp: 2, ab: -2 }, fidgets: [['binoculars', 3], ['peek', 1]] },
  heavy: { idle: [['Idle_Loop', 0.72], ['Idle_Tired_Loop', 0.28]], idleFree: 'Idle_Loop', walk: 'Walk_Fwd_Loop', rate: 0.93, pose: { sp: 4, ch: -2, hd: 2, ab: 9 }, fidgets: [['stretch', 2], ['foldArms', 2], ['lookAround', 1]] },
  calm: { idle: [['Idle_Loop', 0.55], ['Idle_FoldArms_Loop', 0.45]], idleFree: 'Idle_Loop', walk: 'Walk_Formal_Loop', pose: { sp: -2, hd: 2, ab: -3 }, fidgets: [['watch', 2], ['radio', 2], ['lookAround', 1]] },
  formal: { idle: 'Idle_Loop', walk: 'Walk_Formal_Loop', fidgets: [['watch', 2], ['foldArms', 1]] },
  default: { idle: 'Idle_Loop', walk: 'Walk_Fwd_Loop', fidgets: [['stretch', 1], ['lookAround', 1]] },
};

// Durum değişiminde oynayan geçiş klipleri [klip, süre(sn), from, to]
const TRANSITIONS = {
  'stand>prone': ['Crawl_Enter', 0.95, 0, 1], 'crouch>prone': ['Crawl_Enter', 0.75, 0.2, 1],
  'prone>crouch': ['Crawl_Exit', 0.9, 0, 1], 'prone>stand': ['Crawl_Exit', 0.95, 0, 1],
  'stand>crouch': ['Crouch_Enter', 0.38, 0, 1], 'crouch>stand': ['Crouch_Exit', 0.4, 0, 1],
};

// Maskeler: kemik adı → ağırlık (üst gövde katmanında bel kısmen; bacaklar temel katmanda kalır). 'lower': kalça, bacaklar
// ve IK ayakları (yerinde dönüş adımları; konum izleri de yazılır), baş dönüşe öncülük eder; kollar/tutuşlar etkilenmez
const UPPER = { Abdomen: 0.45, Torso: 0.75, Chest: 1, Neck: 1, Head: 1 };
const ARM_RE = /^(Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/;
const LOWER_RE = /^(Body|Hips|UpperLeg|LowerLeg|Foot)/;
const LOWER = { Abdomen: 0.35, Neck: 0.4, Head: 0.6 };
function maskWeight(mask, name) {
  if (mask === 'full') return 1;
  if (mask === 'lower') return LOWER_RE.test(name) ? 1 : LOWER[name] ?? 0;
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
    this.persona = this.zombie ? { idle: 'Zombie_Idle_Loop', fidgets: [] } : PERSONA[opts.persona] || PERSONA.default;
    this.sets = this.zombie ? { ...SETS, walk: SETS.zwalk } : { ...SETS, walk: [this.persona.walk || SETS.walk[0], ...SETS.walk.slice(1)] };
    this.state = 'stand';
    this.sw = { stand: 1 }; // durum ağırlıkları
    this.phase = { stand: Math.random(), crouch: Math.random(), prone: Math.random() }; // durum → döngü fazı (0..1)
    this.t = Math.random() * 20;
    // ayakta bekleme: cur istenen bekleme (ad ya da karışım), x onun ağırlık payı (1: geçiş bitti); w: çapraz sönümdeki
    // beklemeler (bekleme → {w ağırlık, t0 klip başlangıcı}). Zamanlayıcı yok: kıpırdanma çeşidini Avatar seçer
    this.idle = { cur: this.persona.idle, prev: null, x: 1, w: new Map([[this.persona.idle, { w: 1, t0: 0 }]]) };
    this.variant = null; // kıpırdanma bekleme çeşidi (setIdleVariant)
    this.variantT = 0;
    this.shots = [];
    this.d8 = new Float32Array(8);
    this.fullW = 0; // tam gövde tek seferlik klip ağırlığı (prosedürel katman geri çekilir)
    this.upperW = 0;
    this.lowerW = 0; // alt gövde klibi (yerinde dönüş): tutuşlar, ayak IK'sı ve kıpırdanma sürer
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
        for (let i = 0; i < 8; i++) {
          if (d[i] <= 1e-3 || !g.set[i]) continue;
          const e = g.set[i];
          // karışık yön (kişilik yürüyüşü [[ad, ağırlık]]): eş süreli/eş fazlı klipler birlikte örneklenir
          if (Array.isArray(e)) { for (const [n, k] of e) { const s = this.sampler(n); if (s) parts.push([s, g.w * d[i] * k]); } }
          else { const s = this.sampler(e); if (s) parts.push([s, g.w * d[i]]); }
        }
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

  /** Bekleme klibi (döngü; t: klibin saati) ya da karışımı ([[ad, ağırlık]]) */
  _idle(entry, w, t = this.t) {
    if (Array.isArray(entry)) { for (const [n, k] of entry) this._idle(n, w * k, t); return; }
    const s = this.sampler(entry);
    if (s) this._add(s, frac(t / s.dur) * s.dur, w);
  }
  /**
   * Ayakta bekleme. Öncelik: konuşma > yorgunluk > kıpırdanma çeşidi (setIdleVariant; Avatar.updateFidget seçer) > elde
   * eşya/yük varken idleFree (kolları kavuşturan bekleme eşyayla çakışmasın) > kişiliğin temel beklemesi. Kendi
   * zamanlayıcısı yoktur. Geçiş 0,6 sn doğrusal çapraz sönüm; art arda değişimde de sıçramasın diye ağırlık haritası.
   * Harita her karede ilerler (_idleWeights; yürürken ve başka durumdayken de): yürüyüşle biten kıpırdanma çeşidi bir
   * sonraki duruşta yeniden belirmesin. Burada yalnız örneklenir.
   */
  _standIdle(w) {
    const W = this.idle.w;
    let tot = 0;
    for (const e of W.values()) tot += e.w;
    tot = tot || 1;
    for (const [k, e] of W) this._idle(k, (w * e.w) / tot, this.t - e.t0);
  }
  /** Bekleme ağırlık haritası: istenen bekleme 0,6 sn'de girer, diğerleri söner (her karede, örneklemeden bağımsız) */
  _idleWeights(dt, a) {
    const I = this.idle, P = this.persona, W = I.w;
    const want = a.talk && this.has('Idle_Talking_Loop') ? 'Idle_Talking_Loop'
      : a.tired && this.has('Idle_Tired_Loop') ? 'Idle_Tired_Loop'
        : this.variant && this.has(this.variant) ? this.variant
          : a.busy && P.idleFree ? P.idleFree : P.idle;
    if (want !== I.cur) { I.prev = I.cur; I.cur = want; }
    // kıpırdanma çeşidi kendi başından oynar (uzak avatarda da aynı noktadan: başlangıç ağdan gelir)
    if (!W.has(want)) W.set(want, { w: 0, t0: want === this.variant ? this.variantT : 0 });
    let tot = 0;
    for (const [k, e] of W) {
      e.w = k === want ? Math.min(1, e.w + dt / 0.6) : Math.max(0, e.w - dt / 0.6);
      if (e.w <= 0 && k !== want) W.delete(k); else tot += e.w;
    }
    I.x = W.get(want).w / (tot || 1);
  }
  /** Ayakta bekleme çeşidi (kıpırdanma: kollarını kavuşturma, etrafa bakınma, telsiz…); null: kişiliğin beklemesi. off: geçen süre */
  setIdleVariant(name, off = 0) {
    this.variant = name || null;
    this.variantT = this.t - off;
    // aynı çeşit sönerken yeniden istenirse kendi başından başlasın
    const e = name && this.idle.w.get(name);
    if (e && e.w <= 0.02) e.t0 = this.variantT;
  }

  // ---------------------------------------------------------------- tek seferlik klipler
  /**
   * o: { dur | rate, from, to (0..1), mask: full|lower|upper|arms|rarm|larm|head, w, fadeIn, fadeOut, hold, loop, group,
   *      loopFrom (0..1, döngünün başı; yoksa from), pingpong (uçlarda yön değiştir), exitTo (0..1, durdurulunca
   *      to…exitTo çıkış klibi), soft (tam gövde ama tam gövde ağırlığına sayılmaz: tutuş/prosedürel katman geri
   *      çekilmez — düşük ağırlıklı eklemeli his klipleri için) }. 'full' ve 'lower' konum izlerini de (kalça, IK
   *      ayakları) maske ağırlığıyla yazar.
   * @returns tanıtıcı (null: klip yok)
   */
  play(name, o = {}) {
    const s = this.sampler(name);
    if (!s) return null;
    const from = (o.from ?? 0) * s.dur, to = (o.to ?? 1) * s.dur;
    const rate = o.rate ?? (o.dur ? (to - from) / o.dur : 1);
    const group = o.group || name;
    for (const x of this.shots) if (x.group === group && !x.out) x.out = Math.max(1e-3, x.fadeOut);
    const maskName = o.mask || 'full';
    const lf = Math.min(to, Math.max(0, (o.loopFrom ?? o.from ?? 0) * s.dur));
    const exitTo = o.exitTo !== undefined ? Math.min(1, o.exitTo) * s.dur : 0;
    const shot = { name, s, t: from, from, to, lf, rate, dir: 1, pp: !!o.pingpong, exitTo, mask: this.maskOf(maskName), maskName, full: maskName === 'full', pos: maskName === 'full' || maskName === 'lower', soft: !!o.soft, w: o.w ?? 1, fadeIn: o.fadeIn ?? 0.12, fadeOut: o.fadeOut ?? 0.2, hold: !!o.hold, loop: !!o.loop, group, age: 0, out: 0, k: 0 };
    this.shots.push(shot);
    return shot;
  }
  /**
   * Belirli bir tek seferlik klibi sönümle bitir. exit (varsayılan): çıkış aralığı (exitTo) olan klipte önce
   * to…exitTo kısmı '<grup>/exit' grubunda oynar ve döngüyle çapraz sönümlenir (diz çökmüşken ayağa kalkar). Çıkış
   * yalnız döngü aralığına varılmışsa (t ≥ loopFrom: diz çökme bitmiş) oynar; giriş sürerken (erken bırakılan arama/
   * kaldırma) klip yalnız söner — ayaktaki karakter çıkış için diz çöküp yeniden kalkmasın.
   * Hareket halinde, ölümde ya da yerine yeni eylem geldiğinde exit = false verilir. Döner: çıkış klibi (yoksa null).
   */
  stopShot(x, exit = true) {
    if (!x || x.out) return null;
    let ex = null;
    if (exit && x.exitTo > x.to + 1e-3 && x.t >= x.lf - 1e-3) {
      ex = this.play(x.name, { mask: x.maskName, group: x.group + '/exit', from: x.to / x.s.dur, to: x.exitTo / x.s.dur, rate: Math.abs(x.rate) || 1, fadeIn: 0.18, fadeOut: 0.25, w: x.w });
      if (ex) ex.isExit = true;
    }
    x.out = ex ? 0.18 : Math.max(1e-3, x.fadeOut);
    return ex;
  }
  /** Süren çıkış kliplerini (ayağa kalkma) kes: yürümeye başlayınca, ölünce, moda göre */
  stopExits() { for (const x of this.shots) if (x.isExit && !x.out) x.out = Math.max(1e-3, x.fadeOut); }
  /** Gruptaki/adlı klibi sönümle bitir */
  stop(groupOrName) { for (const x of this.shots) if ((x.group === groupOrName || x.name === groupOrName) && !x.out) x.out = Math.max(1e-3, x.fadeOut); }
  playing(groupOrName) { return this.shots.some((x) => (x.group === groupOrName || x.name === groupOrName) && !x.out); }

  _shots(dt) {
    const B = this.bones;
    this.fullW = 0; this.upperW = 0; this.lowerW = 0;
    for (let n = 0; n < this.shots.length; n++) {
      const x = this.shots[n];
      x.age += dt;
      if (x.pp && x.loop) {
        // gidip gelen döngü: to'ya varınca geri, loopFrom'a varınca ileri (aralığın dışına çıkmaz, sıçrama yok)
        x.t += dt * x.rate * x.dir;
        if (x.t >= x.to) { x.t = Math.max(x.lf, 2 * x.to - x.t); x.dir = -1; }
        else if (x.dir < 0 && x.t <= x.lf) { x.t = Math.min(x.to, 2 * x.lf - x.t); x.dir = 1; }
      } else {
        x.t += dt * x.rate;
        if (x.t >= x.to) {
          if (x.loop) x.t = x.lf + ((x.t - x.lf) % Math.max(1e-3, x.to - x.lf));
          else if (x.hold || x.out) x.t = x.to;
          else { this.shots.splice(n--, 1); continue; } // bitti (son kısmı zaten sönümlendi)
        }
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
      if (x.pos) {
        for (const it of x.s.p) {
          const pw = M[it.i] * w;
          if (pw <= 0) continue;
          const r = it.f.evaluate(t), p = B[it.i].position;
          if (pw >= 0.999) p.set(r[0], r[1], r[2]); else { _v.set(r[0], r[1], r[2]); p.lerp(_v, pw); }
        }
      }
      if (x.full) { if (!x.soft) this.fullW = Math.max(this.fullW, w); }
      else if (x.maskName === 'lower') this.lowerW = Math.max(this.lowerW, w);
      else this.upperW = Math.max(this.upperW, w);
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
    this._idleWeights(dt, a);
    const s = a.speed || 0, ang = a.moveAngle || 0;
    for (const [key, w0] of Object.entries(this.sw)) {
      const w = w0 / tot;
      switch (key) {
        case 'stand': {
          if (this.zombie) {
            const run = smooth(1.7, 3.0, s), idleW = 1 - smooth(0.1, 0.4, s);
            if (idleW > 1e-3) this._standIdle(idleW * w);
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
          if (idleW > 1e-3) this._standIdle(idleW * w);
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
