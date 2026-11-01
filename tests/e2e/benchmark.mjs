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
  // sonuç tablosu (Ayarlar → Grafik): dört sahne satırı; yazılım GPU'sunda "gerçek ekran kartı performansı değildir" uyarısı
  const ui = await evalJS(page, () => {
    const g = window.__game, r = g.benchmark.last;
    if (!r) return null;
    const el = g.ui.menus.benchTable(r);
    return { rows: el.querySelectorAll('tbody tr').length, sw: el.textContent.includes('Yazılım GPU'), mixed: el.textContent.includes('karışık ölçüm'), changed: r.settingsChanged, res: r.resolution };
  });
  log('sonuç tablosu', ui);
  check(ui && ui.rows === 4 && ui.sw && !ui.mixed && ui.changed === false, 'sonuç tablosu dört satır + yazılım GPU uyarısı göstermeli', ui);
  // performans testi sonrası oyuncu eski yerine döner, sürü kaldırılır
  const after = await evalJS(page, () => { const S = window.__game.session; return { zombies: S.zombies.list.size, running: window.__game.benchmark.running }; });
  log('test sonrası', after);
  check(after && !after.running && after.zombies < 30, 'test sonrası sürü kaldırılmalı', after);
  // sağlamlık: araçtayken reddedilir; duraklatılınca ölçüm devam edince baştan alınır; test sırasında gelen otomatik
  // kayıt sona ertelenir; oyun kapanırsa test iptal edilir (en sonda: oturum kapanır)
  const rb = await evalJS(page, async () => {
    const g = window.__game, S = g.session, out = {};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    S.local.vehicle = { stub: true };
    try { await g.benchmark.run({ scenes: ['us'], seconds: 1 }); out.vehicle = 'çalıştı'; } catch (e) { out.vehicle = e.message; }
    S.local.vehicle = null;
    let saves = 0;
    const save0 = S.saves.save;
    S.saves.save = () => { saves++; return true; };
    const t0 = performance.now();
    const p = g.benchmark.run({ scenes: ['us'], seconds: 1, warm: 0, warmFrames: 1, minFrames: 2, maxSeconds: 60 });
    await sleep(300);
    S.saves.autosave(); // gün dönümü
    out.savesDuring = saves;
    S.paused = true;
    await sleep(1500);
    out.runningWhilePaused = g.benchmark.running;
    S.paused = false;
    try { const r = await p; out.frames = r.results[0].frames; } catch (e) { out.err = e.message; }
    out.ms = Math.round(performance.now() - t0);
    out.savesAfter = saves;
    S.saves.save = save0;
    const p2 = g.benchmark.run({ scenes: ['sehir'], seconds: 30, warm: 0, warmFrames: 1, minFrames: 2, maxSeconds: 60 });
    await sleep(500);
    g.endSession(true);
    try { await p2; out.abort = 'tamamlandı'; } catch (e) { out.abort = e.message; }
    out.runningAfterAbort = g.benchmark.running;
    out.state = g.state;
    return out;
  });
  log('sağlamlık', rb);
  check(rb && /Araçtayken/.test(rb.vehicle), 'araçtayken performans testi reddedilmeli', rb);
  check(rb && rb.savesDuring === 0 && rb.savesAfter === 1, 'test sırasında otomatik kayıt yapılmamalı, sonda bir kez yapılmalı', rb);
  check(rb && rb.runningWhilePaused === true && rb.frames > 0 && rb.ms >= 2500 && !rb.err, 'duraklatmadan sonra ölçüm tamamlanmalı (duraklatma süresi ölçüme girmez)', rb);
  check(rb && /iptal/.test(rb.abort) && rb.runningAfterAbort === false && rb.state === 'menu', 'oyun kapanınca test iptal edilmeli', rb);
  fs.writeFileSync('/tmp/benchmark.json', JSON.stringify(out, null, 2));
  log('yazıldı', '/tmp/benchmark.json');
};
