// memory-infra sondası: iki sekmeli (host+istemci) oyun başladıktan WAIT sn sonra Chrome'un memory-infra
// dökümünü alır ve süreç başına en büyük ayırıcıları (allocator) yazar. Tarayıcı sürecindeki şişmenin
// hangi alt sistemden geldiğini (blob_storage, mojo, malloc, skia, v8 ...) gösterir.
// MODE=mp (varsayılan) | single1 ; WAIT=60
import fs from 'node:fs';
const MODE = process.env.MODE || 'mp';
const WAIT = +(process.env.WAIT || 60);
const OUT = process.env.OUT || '/tmp/mem-infra.txt';
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
  await wait(WAIT * 1000);
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], memoryDumpConfig: { triggers: [] } } });
  const dump = await cdp.send('Tracing.requestMemoryDump', { deterministic: false, levelOfDetail: 'detailed' });
  log('döküm', dump);
  await wait(1500);
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  await done;
  const lines = [`# MODE=${MODE} WAIT=${WAIT} dökümler=${events.length}`];
  const byPid = new Map();
  for (const ev of events) {
    const al = ev.args && ev.args.dumps && ev.args.dumps.allocators; if (!al) continue;
    const m = byPid.get(ev.pid) || new Map(); byPid.set(ev.pid, m);
    for (const [name, a] of Object.entries(al)) {
      const sz = a.attrs && (a.attrs.effective_size || a.attrs.size); if (!sz) continue;
      const v = parseInt(sz.value, 16); if (!(v > 0)) continue;
      m.set(name, Math.max(m.get(name) || 0, v));
    }
  }
  for (const [pid, m] of byPid) {
    // yalnız üst düzey ve ikinci düzey girdiler; MB cinsinden, en büyük 18
    const rows = [...m.entries()].filter(([n]) => n.split('/').length <= 2).sort((a, b) => b[1] - a[1]).slice(0, 18);
    lines.push(`pid ${pid}: ` + rows.map(([n, v]) => `${n}=${(v / 1048576).toFixed(0)}MB`).join(' '));
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  log(lines.join('\n'));
};
