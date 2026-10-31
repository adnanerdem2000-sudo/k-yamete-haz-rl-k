// Prosedürel animasyon kütüphanesi — CharacterRig için pozlar üretir.
// Açı kuralları (T-poz model uzayı, karakter +Z'ye bakar):
//   bacak/kol x<0 → ileri salınım;  gövde x>0 → öne eğilme;  sol kol z<0 / sağ kol z>0 → kolu indir
//   sol dirsek y<0 / sağ dirsek y>0 → dirseği öne bük;  diz x>0 → dizi bük
import { Pose, D } from './CharacterRig.js';

const sin = Math.sin, cos = Math.cos, max = Math.max, min = Math.min, abs = Math.abs;

/** Ayakta dinlenme (nefes alma, hafif ağırlık aktarma) */
export function idle(p, t, mood = 0) {
  p.reset();
  const br = sin(t * 1.8);
  p.set('Spine', (2 + br * 0.8) * D, sin(t * 0.4) * 2 * D, 0);
  p.set('Chest', (br * 1.2 - mood * 4) * D, 0, 0);
  p.set('Neck', -2 * D, sin(t * 0.35) * 4 * D, 0);
  p.set('Head', (2 - mood * 6) * D, sin(t * 0.5 + 1) * 5 * D, sin(t * 0.3) * 2 * D);
  p.set('LeftArm', 2 * D, 0, (-72 + br * 1.5) * D);
  p.set('RightArm', 2 * D, 0, (72 - br * 1.5) * D);
  p.set('LeftForeArm', 0, -12 * D, 0);
  p.set('RightForeArm', 0, 12 * D, 0);
  p.set('LeftShoulder', 0, 0, -br * 1 * D);
  p.set('RightShoulder', 0, 0, br * 1 * D);
  const sway = sin(t * 0.6) * 1.5;
  p.set('Hips', 0, 0, sway * D);
  p.set('LeftUpLeg', -1 * D, 0, (-1.5 - sway) * D);
  p.set('RightUpLeg', 1 * D, 0, (1.5 - sway) * D);
  p.set('LeftLeg', 3 * D, 0, 0);
  p.set('RightLeg', 3 * D, 0, 0);
  p.set('LeftFoot', -3 * D, 0, 0);
  p.set('RightFoot', -3 * D, 0, 0);
  p.hip.set(0, -0.005 + br * 0.004, 0);
  relaxHands(p);
  return p;
}

function relaxHands(p, curl = 15) {
  p.set('LeftHandIndex1', 0, 0, -curl * D); p.set('LeftHandIndex2', 0, 0, -curl * D);
  p.set('RightHandIndex1', 0, 0, curl * D); p.set('RightHandIndex2', 0, 0, curl * D);
}

/** Tutma pozu (yumruk) */
export function grip(p, side = 'Right', amount = 1) {
  const s = side === 'Left' ? -1 : 1;
  p.set(side + 'HandIndex1', 0, 0, s * 70 * amount * D);
  p.set(side + 'HandIndex2', 0, 0, s * 70 * amount * D);
  p.set(side + 'HandThumb1', 0, 0, s * 20 * amount * D);
}

/**
 * Yürüme/koşma döngüsü. phase: radyan, speed01: 0=yürüme, 1=koşu, 2=sprint
 */
export function locomotion(p, phase, speed01, t = 0) {
  p.reset();
  const run = min(1, max(0, speed01));
  const sprint = max(0, speed01 - 1);
  const s = sin(phase), c = cos(phase);
  const legAmp = (24 + run * 18 + sprint * 8) * D;
  const kneeAmp = (40 + run * 45 + sprint * 15) * D;
  const fL = s, fR = -s;
  p.set('LeftUpLeg', -fL * legAmp - run * 8 * D, 0, -2 * D);
  p.set('RightUpLeg', -fR * legAmp - run * 8 * D, 0, 2 * D);
  p.set('LeftLeg', (6 + max(0, c) * kneeAmp / D + run * 10 * max(0, -c)) * D, 0, 0);
  p.set('RightLeg', (6 + max(0, -c) * kneeAmp / D + run * 10 * max(0, c)) * D, 0, 0);
  p.set('LeftFoot', (-6 + fL * 12 - max(0, c) * 15) * D, 0, 0);
  p.set('RightFoot', (-6 + fR * 12 - max(0, -c) * 15) * D, 0, 0);
  const armAmp = (18 + run * 30 + sprint * 12) * D;
  const elbow = (14 + run * 70 + sprint * 10) * D;
  p.set('LeftArm', -fR * armAmp, 0, (-74 + run * 6) * D);
  p.set('RightArm', -fL * armAmp, 0, (74 - run * 6) * D);
  p.set('LeftForeArm', 0, -(elbow + max(0, fR) * run * 20 * D), 0);
  p.set('RightForeArm', 0, elbow + max(0, fL) * run * 20 * D, 0);
  const lean = (3 + run * 9 + sprint * 8) * D;
  p.set('Spine', lean, s * (4 + run * 4) * D, 0);
  p.set('Chest', run * 3 * D, s * (3 + run * 3) * D, 0);
  p.set('Neck', -lean * 0.6, -s * 3 * D, 0);
  p.set('Head', -lean * 0.3, -s * 2 * D, 0);
  p.set('Hips', 0, -s * (5 + run * 3) * D, 0);
  const bob = 0.025 + run * 0.035;
  p.hip.set(0, -abs(s) * bob + bob * 0.4 - run * 0.03, 0);
  grip(p, 'Left', 0.3 + run * 0.5); grip(p, 'Right', 0.3 + run * 0.5);
  return p;
}

/** Çömelme (durma + yürüme). phase/move01 */
export function crouch(p, phase, move01, t = 0) {
  p.reset();
  const s = sin(phase), c = cos(phase);
  const m = min(1, move01);
  const legAmp = 18 * m * D;
  p.set('LeftUpLeg', (-62 - s * legAmp / D) * D, 0, -6 * D);
  p.set('RightUpLeg', (-62 + s * legAmp / D) * D, 0, 6 * D);
  p.set('LeftLeg', (95 + max(0, c) * 25 * m) * D, 0, 0);
  p.set('RightLeg', (95 + max(0, -c) * 25 * m) * D, 0, 0);
  p.set('LeftFoot', -30 * D, 0, 0);
  p.set('RightFoot', -30 * D, 0, 0);
  p.set('Spine', 22 * D, s * 4 * m * D, 0);
  p.set('Chest', 8 * D, 0, 0);
  p.set('Neck', -18 * D, 0, 0);
  p.set('Head', -8 * D, 0, 0);
  p.set('LeftArm', (-25 + s * 12 * m) * D, 0, -62 * D);
  p.set('RightArm', (-25 - s * 12 * m) * D, 0, 62 * D);
  p.set('LeftForeArm', 0, -45 * D, 0);
  p.set('RightForeArm', 0, 45 * D, 0);
  p.hip.set(0, -0.36 - abs(s) * 0.015 * m + sin(t * 1.6) * 0.004, -0.04);
  grip(p, 'Left', 0.5); grip(p, 'Right', 0.5);
  return p;
}

/** Sürünme: model kökü öne yatırılır (-90°), uzuvlar emekleme döngüsü yapar */
export function prone(p, phase, move01) {
  p.reset();
  const s = sin(phase), m = min(1, move01);
  p.set('Neck', -55 * D, 0, 0);
  p.set('Head', -25 * D, 0, 0);
  p.set('LeftArm', (-150 + s * 25 * m) * D, 0, -30 * D);
  p.set('RightArm', (-150 - s * 25 * m) * D, 0, 30 * D);
  p.set('LeftForeArm', 0, (-50 - max(0, s) * 30 * m) * D, 0);
  p.set('RightForeArm', 0, (50 + max(0, -s) * 30 * m) * D, 0);
  p.set('LeftUpLeg', (-8 - s * 18 * m) * D, 0, -12 * D);
  p.set('RightUpLeg', (-8 + s * 18 * m) * D, 0, 12 * D);
  p.set('LeftLeg', (10 + max(0, s) * 50 * m) * D, 0, 0);
  p.set('RightLeg', (10 + max(0, -s) * 50 * m) * D, 0, 0);
  p.set('Spine', 0, s * 6 * m * D, 0);
  return p;
}

/** Zıplama / düşme. vy: dikey hız */
export function airborne(p, vy, t) {
  p.reset();
  const up = max(-1, min(1, vy / 5));
  p.set('LeftUpLeg', (-35 - up * 10) * D, 0, -6 * D);
  p.set('RightUpLeg', (5 - up * 10) * D, 0, 6 * D);
  p.set('LeftLeg', 60 * D, 0, 0);
  p.set('RightLeg', 25 * D, 0, 0);
  p.set('Spine', 6 * D, 0, 0);
  const flail = up < -0.3 ? sin(t * 14) * 12 : 0;
  p.set('LeftArm', (-30 + flail) * D, 0, (-35 + up * 15) * D);
  p.set('RightArm', (-30 - flail) * D, 0, (35 - up * 15) * D);
  p.set('LeftForeArm', 0, -30 * D, 0);
  p.set('RightForeArm', 0, 30 * D, 0);
  p.set('Head', -6 * D, 0, 0);
  return p;
}

/** Arama/karıştırma: öne eğilip ellerle karıştırır */
export function search(p, t, low = 0) {
  p.reset();
  const k = sin(t * 7), k2 = sin(t * 7 + 1.7);
  p.set('Spine', (20 + low * 25) * D, sin(t * 1.3) * 6 * D, 0);
  p.set('Chest', (10 + low * 10) * D, 0, 0);
  p.set('Neck', -10 * D, 0, 0);
  p.set('Head', 12 * D, sin(t * 2.1) * 10 * D, 0);
  p.set('LeftArm', (-55 - low * 15 + k * 10) * D, 0, (-35 + k2 * 6) * D);
  p.set('RightArm', (-55 - low * 15 - k * 10) * D, 0, (35 - k2 * 6) * D);
  p.set('LeftForeArm', 0, (-40 + k2 * 15) * D, 0);
  p.set('RightForeArm', 0, (40 - k * 15) * D, 0);
  p.set('LeftUpLeg', (-10 - low * 50) * D, 0, -6 * D);
  p.set('RightUpLeg', (-10 - low * 50) * D, 0, 6 * D);
  p.set('LeftLeg', (15 + low * 80) * D, 0, 0);
  p.set('RightLeg', (15 + low * 80) * D, 0, 0);
  p.hip.set(0, -0.03 - low * 0.32, -0.05);
  grip(p, 'Left', 0.6); grip(p, 'Right', 0.6);
  return p;
}

/** Yerden eşya alma (0→1→0 eğrisi) */
export function pickup(p, k) {
  p.reset();
  const a = sin(min(1, k) * Math.PI);
  p.set('Spine', 35 * a * D, 0, 0);
  p.set('Chest', 15 * a * D, 0, 0);
  p.set('Head', 10 * a * D, 0, 0);
  p.set('RightArm', (-60 * a) * D, 0, (72 - 40 * a) * D);
  p.set('LeftArm', (-10 * a) * D, 0, (-72 + 10 * a) * D);
  p.set('RightForeArm', 0, 10 * D, 0);
  p.set('LeftForeArm', 0, -20 * D, 0);
  p.set('LeftUpLeg', -55 * a * D, 0, -4 * D);
  p.set('RightUpLeg', -40 * a * D, 0, 4 * D);
  p.set('LeftLeg', 85 * a * D, 0, 0);
  p.set('RightLeg', 70 * a * D, 0, 0);
  p.hip.set(0, -0.32 * a, -0.03 * a);
  return p;
}

/** Yakın dövüş: k = vuruş ilerlemesi (0..1); heavy: iki elli */
export function meleeSwing(p, k, heavy = false) {
  // 0-0.35 kaldır, 0.35-0.6 vur, 0.6-1 toparla
  let raise, swing;
  if (k < 0.35) { raise = k / 0.35; swing = 0; } else if (k < 0.6) { raise = 1; swing = (k - 0.35) / 0.25; } else { raise = 1 - (k - 0.6) / 0.4; swing = 1 - (k - 0.6) / 0.4; }
  raise = easeOut(raise);
  const arc = raise * (1 - swing) - swing * 0.6;
  p.set('Spine', (5 + swing * 18) * D, (-25 * raise + 40 * swing) * D * (1 - Math.max(0, k - 0.6) * 2.5), 0);
  p.set('Chest', swing * 8 * D, (-10 * raise + 15 * swing) * D, 0);
  p.set('RightArm', (-30 - arc * 110 - swing * 40) * D, (-10 * raise) * D, (60 - raise * 20 + swing * 25) * D);
  p.set('RightForeArm', 0, (70 * raise * (1 - swing) + 15) * D, 0);
  if (heavy) {
    p.set('LeftArm', (-40 - arc * 90 - swing * 45) * D, 0, (-50 + raise * 10) * D);
    p.set('LeftForeArm', 0, (-60 * raise * (1 - swing) - 30) * D, 0);
  } else {
    p.set('LeftArm', (-20 + swing * 30) * D, 0, -60 * D);
    p.set('LeftForeArm', 0, -50 * D, 0);
  }
  grip(p, 'Right', 1);
  if (heavy) grip(p, 'Left', 1);
  return p;
}

/** Nişan: kind = 'pistol' | 'rifle' | 'bow'; pitch: yukarı (+) / aşağı (-) bakış (radyan) */
export function aim(p, kind, pitch = 0, recoil = 0) {
  const pd = pitch / D;
  p.set('Spine', (4 - pd * 0.25) * D, 0, 0);
  p.set('Chest', (-pd * 0.2 - recoil * 4) * D, 0, 0);
  p.set('Neck', -pd * 0.25 * D, 0, 0);
  p.set('Head', -pd * 0.25 * D, 0, 0);
  if (kind === 'pistol') {
    p.set('RightArm', (-88 + pd * -0.5 - recoil * 18) * D, -6 * D, 90 * D);
    p.set('RightForeArm', 0, (4 + recoil * 20) * D, 0);
    grip(p, 'Right', 1);
  } else if (kind === 'bow') {
    p.set('Spine', 4 * D, 30 * D, 0);
    p.set('LeftArm', (-90 - pd * 0.5) * D, 30 * D, -90 * D);
    p.set('LeftForeArm', 0, 0, 0);
    p.set('RightArm', (-95 - pd * 0.5) * D, 0, 40 * D);
    p.set('RightForeArm', 0, 140 * D, 0);
    grip(p, 'Left', 1); grip(p, 'Right', 0.8);
  } else {
    // tüfek: sağ el göğüs önünde tetikte, sol el IK ile kabzanın önünde
    p.set('Spine', (4 - pd * 0.25) * D, 18 * D, 0);
    p.set('Head', -pd * 0.25 * D, -18 * D, 0);
    p.set('RightArm', (-50 - pd * 0.6 - recoil * 10) * D, -10 * D, 70 * D);
    p.set('RightForeArm', 0, (95 - recoil * 10) * D, 0);
    grip(p, 'Right', 1); grip(p, 'Left', 1);
  }
  return p;
}

/** Oturma (araç sürme/yolcu). steer: -1..1 */
export function seated(p, steer = 0, t = 0, driving = true) {
  p.reset();
  p.set('LeftUpLeg', -85 * D, 0, -8 * D);
  p.set('RightUpLeg', -85 * D, 0, 8 * D);
  p.set('LeftLeg', 80 * D, 0, 0);
  p.set('RightLeg', 80 * D, 0, 0);
  p.set('Spine', -6 * D, 0, 0);
  p.set('Head', 4 * D, steer * 10 * D, 0);
  if (driving) {
    p.set('LeftArm', (-55 + steer * 12) * D, 0, (-45 - steer * 8) * D);
    p.set('RightArm', (-55 - steer * 12) * D, 0, (45 - steer * 8) * D);
    p.set('LeftForeArm', 0, -50 * D, 0);
    p.set('RightForeArm', 0, 50 * D, 0);
    grip(p, 'Left', 1); grip(p, 'Right', 1);
  } else {
    p.set('LeftArm', -30 * D, 0, -65 * D);
    p.set('RightArm', -30 * D, 0, 65 * D);
    p.set('LeftForeArm', 0, -60 * D, 0);
    p.set('RightForeArm', 0, 60 * D, 0);
  }
  p.hip.set(0, -0.42, -0.05);
  return p;
}

/** Yerde yatarken (yaralı/baygın): kök sırt üstü döndürülür */
export function downed(p, t, crawl = 0) {
  p.reset();
  const s = sin(t * 3);
  p.set('Spine', -10 * D, 0, 0);
  p.set('Neck', 25 * D, 0, 0);
  p.set('Head', 15 * D, sin(t * 0.8) * 15 * D, 0);
  p.set('RightArm', (-120 + s * 15 * (0.4 + crawl)) * D, 0, 30 * D); // yardım için kol kaldırma
  p.set('RightForeArm', 0, 30 * D, 0);
  p.set('LeftArm', 10 * D, 0, -60 * D);
  p.set('LeftForeArm', 0, -50 * D, 0);
  p.set('LeftUpLeg', (-25 - s * 15 * crawl) * D, 0, -10 * D);
  p.set('RightUpLeg', (-10 + s * 15 * crawl) * D, 0, 10 * D);
  p.set('LeftLeg', 50 * D, 0, 0);
  p.set('RightLeg', 20 * D, 0, 0);
  return p;
}

/** Uyuma (yatakta) */
export function sleeping(p, t) {
  p.reset();
  const br = sin(t * 1.2);
  p.set('Chest', br * 2 * D, 0, 0);
  p.set('Head', 0, 25 * D, 0);
  p.set('LeftArm', 10 * D, 0, -80 * D);
  p.set('RightArm', -20 * D, 0, 70 * D);
  p.set('RightForeArm', 0, 70 * D, 0);
  p.set('LeftUpLeg', -10 * D, 0, -3 * D);
  p.set('RightUpLeg', -20 * D, 0, 3 * D);
  p.set('RightLeg', 25 * D, 0, 0);
  return p;
}

/** Merdiven tırmanma. phase ilerledikçe eller ve ayaklar sırayla */
export function climb(p, phase) {
  p.reset();
  const s = sin(phase);
  p.set('LeftArm', (-150 + s * 20) * D, 0, -20 * D);
  p.set('RightArm', (-150 - s * 20) * D, 0, 20 * D);
  p.set('LeftForeArm', 0, (-40 - s * 25) * D, 0);
  p.set('RightForeArm', 0, (40 - s * 25) * D, 0);
  p.set('LeftUpLeg', (-45 - s * 25) * D, 0, -5 * D);
  p.set('RightUpLeg', (-45 + s * 25) * D, 0, 5 * D);
  p.set('LeftLeg', (70 + s * 20) * D, 0, 0);
  p.set('RightLeg', (70 - s * 20) * D, 0, 0);
  p.set('Head', -15 * D, 0, 0);
  p.hip.set(0, -0.08, 0);
  grip(p, 'Left', 1); grip(p, 'Right', 1);
  return p;
}

/** Bir şey yeme/içme (elini ağzına götürür) */
export function consume(p, k) {
  const a = sin(min(1, k) * Math.PI);
  p.set('RightArm', (-30 - 50 * a) * D, -20 * a * D, (72 - 30 * a) * D);
  p.set('RightForeArm', 0, (20 + 120 * a) * D, 0);
  p.set('Head', -8 * a * D, 0, 0);
  grip(p, 'Right', 1);
  return p;
}

/** Çekiçleme / inşa etme */
export function hammer(p, t) {
  const k = (sin(t * 9) + 1) / 2;
  p.set('Spine', 18 * D, -10 * D, 0);
  p.set('RightArm', (-60 - k * 60) * D, 0, 55 * D);
  p.set('RightForeArm', 0, (40 + k * 50) * D, 0);
  p.set('LeftArm', -50 * D, 0, -45 * D);
  p.set('LeftForeArm', 0, -40 * D, 0);
  grip(p, 'Right', 1);
  return p;
}

/** Taşıma (arkadaşını omuzda taşıma) */
export function carryPose(p) {
  p.set('RightArm', -60 * D, 0, 40 * D);
  p.set('RightForeArm', 0, 100 * D, 0);
  p.set('LeftArm', -20 * D, 0, -62 * D);
  p.set('Spine', 8 * D, 0, 0);
  grip(p, 'Right', 1);
  return p;
}

/** Taşınan kişi: omuz üzerinde sarkar */
export function carriedPose(p, t) {
  p.reset();
  const s = sin(t * 4) * 6;
  p.set('Spine', 0, 0, 0);
  p.set('LeftArm', (s - 10) * D, 0, -85 * D);
  p.set('RightArm', (-s - 10) * D, 0, 85 * D);
  p.set('LeftForeArm', 0, -10 * D, 0);
  p.set('RightForeArm', 0, 10 * D, 0);
  p.set('LeftLeg', 30 * D, 0, 0);
  p.set('RightLeg', 40 * D, 0, 0);
  p.set('Head', 20 * D, 0, 0);
  return p;
}

/** Darbe tepkisi (eklemeli): dir = 1 önden, -1 arkadan */
export function hitReact(p, k, dir = 1) {
  const a = sin(min(1, k) * Math.PI) * (1 - k * 0.5);
  p.add('Spine', -12 * a * dir * D, 0, 0);
  p.add('Chest', -8 * a * dir * D, 0, 0);
  p.add('Head', -15 * a * dir * D, 0, 0);
  p.add('LeftArm', 0, 0, 15 * a * D);
  p.add('RightArm', 0, 0, -15 * a * D);
  return p;
}

/** Sevinç / el sallama / dans gibi kısa ifadeler */
export function emote(p, kind, t) {
  p.reset();
  if (kind === 'wave') {
    idle(p, t);
    p.set('RightArm', -10 * D, 0, (-30 + sin(t * 9) * 18) * D);
    p.set('RightForeArm', 0, 0, 0);
    p.set('RightForeArm', 0, (20 + sin(t * 9) * 25) * D, 0);
  } else if (kind === 'cheer') {
    idle(p, t);
    const j = abs(sin(t * 6));
    p.set('LeftArm', -10 * D, 0, (-10 + j * 20) * D);
    p.set('RightArm', -10 * D, 0, (10 - j * 20) * D);
    p.set('LeftForeArm', 0, -20 * D, 0);
    p.set('RightForeArm', 0, 20 * D, 0);
    p.hip.y = j * 0.12;
  } else if (kind === 'dance') {
    const b = sin(t * 8), c = cos(t * 4);
    p.set('Hips', 0, c * 20 * D, b * 6 * D);
    p.set('Spine', 0, -c * 15 * D, -b * 8 * D);
    p.set('LeftArm', (-40 + b * 40) * D, 0, (-40 + c * 30) * D);
    p.set('RightArm', (-40 - b * 40) * D, 0, (40 + c * 30) * D);
    p.set('LeftForeArm', 0, -70 * D, 0);
    p.set('RightForeArm', 0, 70 * D, 0);
    p.set('LeftUpLeg', -abs(b) * 30 * D, 0, -8 * D);
    p.set('RightUpLeg', -abs(sin(t * 8 + 1.5)) * 30 * D, 0, 8 * D);
    p.set('LeftLeg', abs(b) * 50 * D, 0, 0);
    p.set('RightLeg', abs(sin(t * 8 + 1.5)) * 50 * D, 0, 0);
    p.hip.y = -abs(b) * 0.06;
    p.set('Head', b * 10 * D, c * 15 * D, 0);
  } else if (kind === 'laugh') {
    idle(p, t);
    const j = sin(t * 18) * 0.5 + 0.5;
    p.set('Spine', (10 + j * 8) * D, 0, 0);
    p.set('Head', (-15 - j * 10) * D, 0, 0);
    p.set('LeftArm', -40 * D, 0, -50 * D);
    p.set('LeftForeArm', 0, -100 * D, 0);
    p.set('RightArm', -40 * D, 0, 50 * D);
    p.set('RightForeArm', 0, 100 * D, 0);
  } else if (kind === 'point') {
    idle(p, t);
    p.set('RightArm', -85 * D, 0, 85 * D);
    p.set('RightForeArm', 0, 0, 0);
    p.set('Head', 0, 0, 0);
  }
  return p;
}

// ---------------------------------------------------------------- ZOMBİLER

/** Zombi yürüyüşü: topallayan, kollar önde, baş yana yatık */
export function zombieWalk(p, phase, speed01, t, style = 0) {
  p.reset();
  const s = sin(phase), c = cos(phase);
  const run = min(1, speed01);
  const limp = style % 2 === 0 ? 1 : -1;
  p.set('LeftUpLeg', (-s * (20 + run * 25) - run * 10) * D, 0, -4 * D);
  p.set('RightUpLeg', (s * (16 + run * 25) - run * 10) * D, limp * 6 * D, 4 * D);
  p.set('LeftLeg', (10 + max(0, c) * (30 + run * 50)) * D, 0, 0);
  p.set('RightLeg', (14 + max(0, -c) * (20 + run * 50)) * D, 0, 0);
  p.set('LeftFoot', (-8 - max(0, c) * 10) * D, 0, 0);
  p.set('RightFoot', (-8 - max(0, -c) * 10) * D, limp * 10 * D, 0);
  const sway = sin(phase * 0.5) * 8;
  p.set('Hips', 0, s * 6 * D, (sway * 0.5 + limp * 3) * D);
  p.set('Spine', (12 + run * 14) * D, s * 6 * D, (-sway * 0.6 - limp * 4) * D);
  p.set('Chest', 6 * D, 0, limp * 3 * D);
  p.set('Neck', (-12 - run * 10) * D, sin(t * 0.7) * 10 * D, 0);
  p.set('Head', -10 * D, sin(t * 0.9) * 8 * D, (limp * 18 + sin(t * 1.3) * 6) * D);
  if (style === 2 || run > 0.6) {
    // kollar sallanır
    p.set('LeftArm', (-30 + s * 40 * (0.5 + run)) * D, 0, -60 * D);
    p.set('RightArm', (-30 - s * 40 * (0.5 + run)) * D, 0, 60 * D);
    p.set('LeftForeArm', 0, -30 * D, 0);
    p.set('RightForeArm', 0, 30 * D, 0);
  } else {
    // klasik: kollar öne uzanmış
    p.set('LeftArm', (-78 + s * 6 + sin(t * 2.1) * 5) * D, 0, (-80 + sin(t * 1.7) * 6) * D);
    p.set('RightArm', (-70 - s * 6 + sin(t * 1.9) * 5) * D, 0, (82 + sin(t * 1.3) * 6) * D);
    p.set('LeftForeArm', 0, (-12 + sin(t * 2.3) * 8) * D, 0);
    p.set('RightForeArm', 0, (20 + sin(t * 2.0) * 8) * D, 0);
  }
  relaxHands(p, 35);
  p.hip.set(0, -abs(s) * 0.04 - 0.02 - run * 0.03, 0);
  return p;
}

/** Zombi saldırısı: iki kolla savurma / ısırma atılması */
export function zombieAttack(p, k) {
  const a = sin(min(1, k) * Math.PI);
  p.set('Spine', (14 + a * 22) * D, sin(k * 6) * 10 * D, 0);
  p.set('LeftArm', (-80 - a * 50) * D, 0, (-60 + a * 30) * D);
  p.set('RightArm', (-80 - a * 50) * D, 0, (60 - a * 30) * D);
  p.set('LeftForeArm', 0, (-40 + a * 30) * D, 0);
  p.set('RightForeArm', 0, (40 - a * 30) * D, 0);
  p.set('Head', (-20 + a * 25) * D, 0, 0);
  return p;
}

/** Barikata/kapıya vurma döngüsü */
export function zombieBash(p, t) {
  const k = (sin(t * 6) + 1) / 2;
  p.set('Spine', (15 + k * 15) * D, 0, 0);
  p.set('LeftArm', (-100 - k * 40) * D, 0, (-60) * D);
  p.set('RightArm', (-140 + k * 40) * D, 0, 60 * D);
  p.set('LeftForeArm', 0, -30 * D, 0);
  p.set('RightForeArm', 0, 30 * D, 0);
  return p;
}

function easeOut(x) { return 1 - (1 - x) * (1 - x); }

export function newPose() { return new Pose(); }
