// Performans ölçümü (Aşama 8): oyun içi performans testi (src/systems/Benchmark.js: şehir merkezi, orman, üs, 40
// zombilik sürü) dört kalite seviyesinde (Düşük/Orta/Yüksek/Ultra) çalıştırılır. Ölçülen: FPS, ort. kare süresi,
// %1 low, CPU kare süresi, GPU kare süresi (zaman sorgusu varsa), çizim çağrısı, üçgen, JS yığını, zombi ve fizik
// gövdesi sayısı. Sonuç: /tmp/benchmark.json. YAZILIM GPU'SU (SwiftShader) mutlak değerleri gerçek donanım performansı
// DEĞİLDİR; burada kalite seviyelerinin yükü gerçekten değiştirdiği (çizim/üçgen/AO/yansıma) doğrulanır. Gerçek donanım
// raporu için oyuncu Duraklat → Ayarlar → Grafik → "Performans testini başlat" ile aynı testi çalıştırır.
import fs from 'node:fs';
export default async ({ page, url, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, () => { const g = window.__game; g.ui.onLockChange = () => {}; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 300000 });
  const out = { when: new Date().toISOString(), note: 'Başsız Chromium + SwiftShader (yazılım GPU): mutlak değerler gerçek donanımı temsil etmez.', runs: {} };
  for (const q of ['low', 'medium', 'high', 'ultra']) {
    const r = await evalJS(page, async (q) => {
      const g = window.__game;
      const m = await import('/src/core/Settings.js');
      m.applyQualityPreset(q);
      // test ortamı: çözünürlük ölçeği sabit (yazılım GPU'su), otomatik ölçek kapalı
      m.Settings.setMany('graphics', { renderScale: 0.6, autoScale: false });
      const w = g.world.water, refl0 = w ? w.reflCount : 0;
      const res = await g.benchmark.run({ seconds: 3, warm: 1, warmFrames: 2, minFrames: 3, maxSeconds: 60 });
      return { ...res, ao: !!(g.gfx.gtaoPass && g.gfx.gtaoPass.enabled), reflections: w ? w.reflCount - refl0 : 0, passes: g.gfx.composer.passes.filter((p) => p.enabled).map((p) => p.constructor.name) };
    }, q);
    if (!r) { check(false, 'performans testi çalışmadı', q); continue; }
    out.runs[q] = r;
    log(q, { ao: r.ao, yansima: r.reflections, gecisler: r.passes, gpu: r.gpu });
    for (const s of r.results) log(`  ${q}/${s.scene}`, { fps: s.fps, ms: s.frameMs, low1: s.low1, cpu: s.cpuMs, gpu: s.gpuMs, cizim: s.calls, ucgen: s.triangles, zombi: s.zombies, fizik: `${s.physAwake}/${s.physBodies}`, yigin: s.heapMB });
    check(r.results.length === 4 && r.results.every((s) => s.frames > 0 && s.calls > 0), 'dört sahne ölçülmeli (kare ve çizim > 0)', { q, n: r.results.length });
  }
  const R = out.runs;
  if (R.low && R.ultra) {
    const sum = (q, k) => R[q].results.reduce((a, s) => a + (s[k] || 0), 0);
    log('toplam çizim (düşük / orta / yüksek / ultra)', ['low', 'medium', 'high', 'ultra'].map((q) => R[q] ? sum(q, 'calls') : null));
    log('toplam üçgen (düşük / ultra)', sum('low', 'triangles'), sum('ultra', 'triangles'));
    check(sum('ultra', 'calls') > sum('low', 'calls'), 'Ultra, Düşük\'ten daha fazla çizim yapmalı (AO + yansıma + bitki)', { low: sum('low', 'calls'), ultra: sum('ultra', 'calls') });
    check(R.ultra.ao && !R.low.ao, 'AO yalnız Ultra\'da açık olmalı', { low: R.low.ao, ultra: R.ultra.ao });
    check(R.ultra.reflections > 0 && R.low.reflections === 0, 'su yansıması Ultra\'da (orman gölü) çizilmeli, Düşük\'te çizilmemeli', { low: R.low.reflections, ultra: R.ultra.reflections });
    const horde = R.ultra.results.find((s) => s.scene === 'suru');
    check(horde && horde.zombies >= 30, 'sürü sahnesinde en az 30 zombi ölçülmeli', horde && horde.zombies);
  }
  // performans testi sonrası oyuncu eski yerine döner, sürü kaldırılır
  const after = await evalJS(page, () => { const S = window.__game.session; return { zombies: S.zombies.list.size, running: window.__game.benchmark.running }; });
  log('test sonrası', after);
  check(after && !after.running && after.zombies < 30, 'test sonrası sürü kaldırılmalı', after);
  fs.writeFileSync('/tmp/benchmark.json', JSON.stringify(out, null, 2));
  log('yazıldı', '/tmp/benchmark.json');
};
