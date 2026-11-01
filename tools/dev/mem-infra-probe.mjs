// memory-infra sondası: iki sekmeli (host+istemci) oyun başladıktan WAIT sn sonra Chrome'un memory-infra
// dökümünü alır ve süreç başına en büyük ayırıcıları (allocator) yazar. Tarayıcı sürecindeki şişmenin
// hangi alt sistemden geldiğini (blob_storage, mojo, malloc, skia, v8 ...) gösterir.
// MODE=mp (varsayılan) | single1 ; WAIT=60
import fs from 'node:fs';
const MODE = process.env.MODE || 'mp';
const WAIT = +(process.env.WAIT || 60);
const OUT = process.env.OUT || '/tmp/mem-infra.txt';
const LEVEL = process.env.LEVEL || 'light'; // light | detailed (detaylı: Oilpan sınıf/arena kırılımı; bellek sınırına yakınken süreç çökertebilir)
export default async ({ page, url, wait, evalJS, log, newPage }) => {
  const browser = page.context().browser();
  const cdp = await browser.newBrowserCDPSession();
  const events = [];
  cdp.on('Tracing.dataCollected', (e) => { for (const ev of e.value || []) if (ev.ph === 'v') events.push(ev); });
  const A = page;
  await A.goto(url, { waitUntil: 'load', timeout: 180000 });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  if (MODE === 'mp') {
    const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 0 } }); g.ui.menus.openLobby(); return c; });
    const B = await newPage('p1', 960, 540, true);
    await B.goto(url, { waitUntil: 'load', timeout: 180000 });
    await B.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
    await evalJS(B, async (c) => { const g = window.__game; await g.net.join(c, { local: true }); g.ui.menus.openLobby(); g.net.setLobby({ charId: 'zulal' }); g.net.setLobby({ ready: true }); }, code);
    await wait(1500);
    await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
    await A.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 300000 });
    await B.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 300000 });
  } else {
    await evalJS(A, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
    await A.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 300000 });
  }
  log('oyunda; bekleniyor', WAIT);
  // izleme oyun başlarken açılır: 10 sn'de bir hafif (light) periyodik döküm + sonda açık istek; detaylı döküm
  // bellek sınırına yakın süreçleri çökertebiliyor
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'recordContinuously', includedCategories: ['disabled-by-default-memory-infra'], memoryDumpConfig: { triggers: [{ mode: LEVEL, periodic_interval_ms: 10000 }] } } });
  await wait(WAIT * 1000);
  try { const dump = await cdp.send('Tracing.requestMemoryDump', { deterministic: false, levelOfDetail: LEVEL }); log('döküm', dump); } catch (e) { log('döküm hatası', e.message); }
  await wait(1500);
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  await done;
  log('olaylar', events.length);
  const lines = [`# MODE=${MODE} WAIT=${WAIT} dökümler=${events.length}`];
  const byPid = new Map();
  const series = new Map(); // pid -> [ts, totals]
  for (const ev of events.sort((a, b) => a.ts - b.ts)) {
    const d = ev.args && ev.args.dumps; if (!d) continue;
    const pt = d.process_totals; if (pt) { const arr = series.get(ev.pid) || []; series.set(ev.pid, arr); const rsb = pt.resident_set_bytes || pt.private_footprint_bytes || '0'; arr.push(`${Math.round((ev.ts || 0) / 1e6)}s:${Math.round(parseInt(rsb, 16) / 1048576)}MB`); }
    const al = d.allocators; if (!al) continue;
    const m = byPid.get(ev.pid) || new Map(); byPid.set(ev.pid, m); // aynı pid'in dökümleri birleştirilir, aynı ad için en son değer
    for (const [name, a] of Object.entries(al)) {
      const sz = a.attrs && (a.attrs.effective_size || a.attrs.size); if (!sz) continue;
      const v = parseInt(sz.value, 16); if (!(v > 0)) continue;
      m.set(name, v);
    }
  }
  for (const [pid, arr] of series) lines.push(`pid ${pid} RSS zaman serisi: ${arr.join(' ')}`);
  for (const [pid, m] of byPid) {
    // yalnız üst düzey ve ikinci düzey girdiler; MB cinsinden, en büyük 18
    const rows = [...m.entries()].filter(([n]) => n.split('/').length <= 2).sort((a, b) => b[1] - a[1]).slice(0, 18);
    lines.push(`pid ${pid}: ` + rows.map(([n, v]) => `${n}=${(v / 1048576).toFixed(0)}MB`).join(' '));
    if (LEVEL === 'detailed') {
      // Oilpan (blink_gc), v8 ve partition_alloc alt girdileri: ilk 30 (MB)
      const deep = [...m.entries()].filter(([n]) => /^(blink_gc|v8|partition_alloc|malloc|mojo|blob|discardable|skia)\//.test(n) && n.split('/').length > 2).sort((a, b) => b[1] - a[1]).slice(0, 30);
      if (deep.length) lines.push(`pid ${pid} ayrıntı: ` + deep.map(([n, v]) => `${n}=${(v / 1048576).toFixed(1)}MB`).join(' '));
    }
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  fs.writeFileSync(OUT.replace(/\.txt$/, '') + '.dumps.json', JSON.stringify(events));
  log(lines.join('\n'));
};
