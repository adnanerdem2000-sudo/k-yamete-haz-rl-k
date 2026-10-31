// Animasyon kütüphanesi üretimi: Quaternius Universal Animation Library 1+2 (CC0) kliplerini oyunun
// karakter iskeletlerine (modüler erkek/kadın) aktarır ve sıkıştırılmış klip paketi (.kan) yazar.
// Aktarım tarayıcıda yapılır (tests/dev/retarget.html, three.js ile); bu araç sayfayı Playwright ile sürer,
// izleri toplar, anahtar karelerini sadeleştirir, kök hareketi ve yürüyüş hızını ölçer ve paketler
// (biçim: src/entities/AnimPack.js). glTF yerine özel biçim: 8000+ iz için glTF JSON'u ikili veriden büyüktü.
// Önkoşul: geliştirme sunucusu (npm start) ve tests/dev/_preview/UAL1.glb, UAL2.glb (tilakverse-assets'ten).
// Kullanım: node tools/retarget-ual.mjs [url]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { encodePack, decodePack } from '../src/entities/AnimPack.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const url = process.argv[2] || 'http://localhost:8080/tests/dev/retarget.html';
const OUT = path.resolve('assets/models/rigged');

// Oyunda kullanılan klipler (kaynak dosyaya göre)
const CLIPS = {
  UAL1: [
    'Idle_Loop', 'Idle_LookAround_Loop', 'Idle_Tired_Loop', 'Idle_Talking_Loop', 'Idle_Torch_Loop',
    'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Jog_Bwd_Loop', 'Jog_Left_Loop', 'Jog_Right_Loop', 'Jog_Fwd_L_Loop', 'Jog_Fwd_R_Loop', 'Jog_Bwd_L_Loop', 'Jog_Bwd_R_Loop',
    'Sprint_Enter', 'Sprint_Loop', 'Sprint_Exit',
    'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Crouch_Bwd_Loop', 'Crouch_Left_Loop', 'Crouch_Right_Loop', 'Crouch_Fwd_L_Loop', 'Crouch_Fwd_R_Loop', 'Crouch_Bwd_L_Loop', 'Crouch_Bwd_R_Loop', 'Crouch_Enter', 'Crouch_Exit',
    'Crawl_Idle_Loop', 'Crawl_Fwd_Loop', 'Crawl_Bwd_Loop', 'Crawl_Left_Loop', 'Crawl_Right_Loop', 'Crawl_Enter', 'Crawl_Exit',
    'Turn90_L', 'Turn90_R', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Roll', 'Dodge_Left', 'Dodge_Right',
    'Swim_Idle_Loop', 'Swim_Fwd_Loop', 'Climb_Enter', 'Climb_Exit', 'Climb_Idle_Loop', 'Climb_Up_Loop', 'Climb_Down_Loop', 'ClimbLedge',
    'Push_Enter', 'Push_Loop', 'Push_Exit', 'Driving_Loop',
    'Interact', 'PickUp_Kneeling', 'PickUp_Table', 'Fixing_Kneeling', 'Drink',
    'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Exit', 'Sitting_Talking_Loop', 'GroundSit_Enter', 'GroundSit_Idle_Loop', 'GroundSit_Exit',
    'Celebration', 'Dance_Loop', 'Crying',
    'Punch_Jab', 'Punch_Cross', 'Kick', 'Sword_Attack', 'Sword_Idle',
    'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down', 'Pistol_Shoot', 'Pistol_Reload',
    'Hit_Chest', 'Hit_Head', 'Hit_Shoulder_L', 'Hit_Shoulder_R', 'Hit_Stomach', 'Death01', 'Death02',
  ],
  UAL2: [
    'Idle_FoldArms_Loop', 'Idle_No_Loop', 'Idle_TalkingPhone_Loop', 'Idle_Lantern_Loop', 'Yes', 'Surprise',
    'Walk_Fwd_Loop', 'Walk_Bwd_Loop', 'Walk_L_Loop', 'Walk_R_Loop', 'Walk_Fwd_L_Loop', 'Walk_Fwd_R_Loop', 'Walk_Bwd_L_Loop', 'Walk_Bwd_R_Loop', 'Walk_Carry_Loop',
    'Turn180_L', 'Turn180_R', 'ClimbUp_1m', 'ClimbUp_2m', 'SafetyVault', 'StepUp', 'Slide_Start', 'Slide_Loop', 'Slide_Exit',
    'Bandage_Loop', 'Chest_Open', 'Consume', 'TreeChopping_Loop', 'Mining_Loop', 'Fish_Cast', 'Fish_Cast_Idle_Loop', 'Fish_Reel', 'Fish_Reel_Failed',
    'Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering', 'OverhandThrow',
    'IdleToLay', 'LayToIdle', 'KipUp', 'Hit_Knockback',
    'Melee_Hook', 'Melee_Uppercut', 'Melee_Knee', 'Melee_Combo', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Heavy_A', 'Sword_Block',
    'Bow_Aim_Neutral', 'Bow_Shoot', 'Bow_Notch',
    'Zombie_Idle_Loop', 'Zombie_Walk_Fwd_Loop', 'Zombie_Walk_Bwd_Loop', 'Zombie_Walk_L_Loop', 'Zombie_Walk_R_Loop',
    'Zombie_Run_Fwd_Loop', 'Zombie_Run_L_Loop', 'Zombie_Run_R_Loop', 'Zombie_Bite', 'Zombie_Scratch', 'Zombie_Spawn', 'MonsterTransformation',
  ],
};

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[sayfa hatası]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });


// ---- anahtar kare sadeleştirme: doğrusal ara değerle temsil edilebilen kareleri at (aralıktaki tüm kareler denetlenir)
function reduceKeys(values, w, n, tol) {
  const keep = [0];
  let a = 0;
  const err = (i0, i1) => {
    for (let k = i0 + 1; k < i1; k++) {
      const t = (k - i0) / (i1 - i0);
      for (let c = 0; c < w; c++) {
        const v = values[i0 * w + c] + (values[i1 * w + c] - values[i0 * w + c]) * t;
        if (Math.abs(v - values[k * w + c]) > tol) return true;
      }
    }
    return false;
  };
  for (let i = 2; i < n; i++) {
    // a..i aralığı tek doğruyla temsil edilemiyorsa i-1 anahtar olur; aralık 255 kareyi aşamaz (u8 fark)
    if (i - a > 255 || err(a, i)) { keep.push(i - 1); a = i - 1; }
  }
  if (n > 1) keep.push(n - 1);
  return keep;
}

// ---- çözümleme: kök hareketi ve (döngülerde) basış fazındaki ayak kaymasından yürüyüş hızı
function analyse(r) {
  const P = r.probe, n = r.frames, fps = r.fps;
  const at = (a, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
  const b0 = at(P.Body, 0), b1 = at(P.Body, n - 1);
  const rm = [b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]].map((x) => Math.round(x * 1000) / 1000);
  // basış: topuk yüksekliği kendi aralığının alt %25'inde (topuk kemiği yere tam inmez, ayak yuvarlanır);
  // basan ayağın kayma hızının ortancası (gürültüye dayanıklı) → karakter hızı bunun tersi.
  const vxs = [], vzs = [];
  for (const s of ['L', 'R']) {
    const H = P['Foot' + s];
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) { minY = Math.min(minY, H[i * 3 + 1]); maxY = Math.max(maxY, H[i * 3 + 1]); }
    if (maxY - minY < 0.03) continue; // ayak kalkmıyor (bekleme, sürünmede bacaklar)
    const thr = minY + (maxY - minY) * 0.25;
    for (let i = 0; i < n - 1; i++) {
      if (H[i * 3 + 1] > thr || H[(i + 1) * 3 + 1] > thr) continue;
      vxs.push((H[(i + 1) * 3] - H[i * 3]) * fps); vzs.push((H[(i + 1) * 3 + 2] - H[i * 3 + 2]) * fps);
    }
  }
  const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const cnt = vxs.length;
  // faz başlangıcı: sol topuğun salınımdan basışa geçtiği an (döngüler bu ana hizalanır → yön/hız karışımı uyumlu)
  let ph = 0;
  {
    const H = P.FootL;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) { minY = Math.min(minY, H[i * 3 + 1]); maxY = Math.max(maxY, H[i * 3 + 1]); }
    const thr = minY + (maxY - minY) * 0.25;
    for (let i = 1; i < n; i++) if (H[(i - 1) * 3 + 1] > thr && H[i * 3 + 1] <= thr) { ph = (i - 1) / (n - 1); break; }
  }
  const rmv = [rm[0] / r.duration, rm[2] / r.duration];
  const v = cnt ? [-med(vxs) + rmv[0], -med(vzs) + rmv[1]] : rmv;
  return { rm, v: v.map((x) => Math.round(x * 1000) / 1000), stance: cnt, ph: Math.round(ph * 1000) / 1000 };
}

// UAL klipleri yerinde (kök kemiği sabit); kalça çevirisi poz olarak kalır. Döngülerde kayma yok (çözümleme raporu).
const TOL = { q: 6e-4, qFinger: 2.5e-3, p: 4e-4 };
const FINGER = /^(Index|Middle|Ring|Pinky|Thumb)/;
for (const tgt of ['men', 'women']) {
  const results = [];
  for (const [src, names] of Object.entries(CLIPS)) {
    for (let i = 0; i < names.length; i += 8) {
      const part = await page.evaluate(([t, s, n]) => window.retarget(t, s, n), [tgt, src, names.slice(i, i + 8)]);
      for (const r of part) { if (r.missing) console.warn('  eksik klip:', r.name); else results.push(r); }
      process.stdout.write(`\r${tgt}: ${results.length} klip`);
    }
  }
  console.log();
  const bones = [];
  const boneIdx = (b) => { let i = bones.indexOf(b); if (i < 0) { i = bones.length; bones.push(b); } return i; };
  const clips = [];
  let keys = 0, allKeys = 0;
  const report = [];
  for (const r of results) {
    const info = analyse(r);
    const loop = /_Loop$/.test(r.name);
    const tracks = [];
    for (const [key, values] of Object.entries(r.tracks)) {
      const [bone, prop] = key.split('.');
      const q = prop === 'quaternion';
      const w = q ? 4 : 3;
      const n = r.frames;
      let maxDev = 0;
      for (let i = w; i < values.length; i += w) for (let k = 0; k < w; k++) maxDev = Math.max(maxDev, Math.abs(values[i + k] - values[k]));
      const tol = q ? (FINGER.test(bone) ? TOL.qFinger : TOL.q) : TOL.p;
      const constant = maxDev < tol * 2;
      const frames = constant ? [0] : reduceKeys(values, w, n, tol);
      const vals = [];
      for (const f of frames) for (let k = 0; k < w; k++) vals.push(values[f * w + k]);
      tracks.push({ bone: boneIdx(bone), q, frames, values: vals });
      keys += frames.length; allKeys += n;
    }
    clips.push({ name: r.name, duration: r.duration, fps: r.fps, frames: r.frames, loop, rm: info.rm, v: loop ? info.v : [0, 0], ph: loop ? info.ph : 0, tracks });
    report.push(`${r.name.padEnd(24)} ${r.duration.toFixed(2).padStart(5)}s rm=[${info.rm.join(',')}] v=[${info.v.join(',')}] st=${info.stance} ph=${info.ph}`);
  }
  const raw = encodePack({ bones, clips });
  const gz = zlib.gzipSync(raw, { level: 9 });
  const file = path.join(OUT, 'anims_' + tgt + '.kan');
  fs.writeFileSync(file, gz);
  // doğrulama: çöz ve karşılaştır
  const back = decodePack(new Uint8Array(zlib.gunzipSync(gz)));
  let maxErr = 0;
  for (let c = 0; c < clips.length; c++) for (let t = 0; t < clips[c].tracks.length; t++) {
    const A = clips[c].tracks[t].values, B = back.clips[c].tracks[t].values;
    for (let i = 0; i < A.length; i++) maxErr = Math.max(maxErr, Math.abs(A[i] - B[i]));
  }
  fs.writeFileSync(path.join('tools/dev', 'anims_' + tgt + '.txt'), report.join('\n') + '\n');
  console.log(tgt.padEnd(6), (raw.length / 1024).toFixed(0) + ' KB ham,', (gz.length / 1024).toFixed(0) + ' KB gzip,', clips.length, 'klip,', keys, '/', allKeys, 'anahtar, en büyük nicemleme hatası', maxErr.toExponential(2), '→', file);
}
await browser.close();
