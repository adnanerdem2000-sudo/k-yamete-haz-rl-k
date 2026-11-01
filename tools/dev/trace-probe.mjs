// İz (trace) sondası: iki sekmeli oyun başladıktan WAIT sn sonra TRACE sn boyunca Chrome izi alınır ve
// tarayıcı sürecinin (Browser) iş parçacıklarında en çok süre alan görevler/dilimler yazılır.
// Hangi alt sistemin tarayıcı ana iş parçacığını meşgul edip bellek şişirdiğini gösterir.
// MODE=mp | single1 ; WAIT=20 ; TRACE=6 ; CATS=toplevel,ipc,mojom,cc,viz,gpu,ui,browser,navigation,loading,blink,v8,disabled-by-default-toplevel.flow
import fs from 'node:fs';
const MODE = process.env.MODE || 'mp';
const WAIT = +(process.env.WAIT || 20);
const TRACE = +(process.env.TRACE || 6);
const OUT = process.env.OUT || '/tmp/trace-probe.txt';
const CATS = (process.env.CATS || 'toplevel,ipc,mojom,cc,viz,gpu,ui,browser,navigation,loading,content,disabled-by-default-toplevel.flow').split(',');
export default async ({ page, url, wait, evalJS, log, newPage }) => {
  const browser = page.context().browser();
  const cdp = await browser.newBrowserCDPSession();
  const events = [];
  cdp.on('Tracing.dataCollected', (e) => { for (const ev of e.value || []) events.push(ev); });
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
  await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'recordContinuously', includedCategories: CATS } });
  await wait(TRACE * 1000);
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  await done;
  // süreç/iş parçacığı adları
  const pname = new Map(), tname = new Map();
  for (const ev of events) { if (ev.ph === 'M' && ev.name === 'process_name') pname.set(ev.pid, ev.args.name); if (ev.ph === 'M' && ev.name === 'thread_name') tname.set(ev.pid + ':' + ev.tid, ev.args.name); }
  const lines = [`# MODE=${MODE} WAIT=${WAIT} TRACE=${TRACE} olay=${events.length} süreçler=${[...pname.entries()].map(([p, n]) => p + '=' + n).join(' ')}`];
  // tamamlanmış dilimler (ph X) ve B/E çiftleri: ad bazında toplam süre (ms), süreç+iş parçacığı bazında
  const agg = new Map(); const open = new Map();
  const key = (ev, name) => `${pname.get(ev.pid) || ev.pid}|${tname.get(ev.pid + ':' + ev.tid) || ev.tid}|${name}`;
  const nameOf = (ev) => { const a = ev.args || {}; const src = a.src_func || (a.task && a.task.posted_from && a.task.posted_from.function_name) || ''; const file = a.src_file || (a.task && a.task.posted_from && a.task.posted_from.file_name) || ''; return ev.name + (src ? ` ← ${src}` : '') + (file ? ` (${String(file).split('/').slice(-2).join('/')})` : ''); };
  for (const ev of events) {
    if (ev.ph === 'X') { const k = key(ev, nameOf(ev)); const o = agg.get(k) || { n: 0, dur: 0 }; o.n++; o.dur += (ev.dur || 0) / 1000; agg.set(k, o); }
    else if (ev.ph === 'B') { open.set(ev.pid + ':' + ev.tid + ':' + ev.name, ev); }
    else if (ev.ph === 'E') { const b = open.get(ev.pid + ':' + ev.tid + ':' + ev.name); if (b) { open.delete(ev.pid + ':' + ev.tid + ':' + ev.name); const k = key(b, nameOf(b)); const o = agg.get(k) || { n: 0, dur: 0 }; o.n++; o.dur += (ev.ts - b.ts) / 1000; agg.set(k, o); } }
  }
  const rows = [...agg.entries()].sort((a, b) => b[1].dur - a[1].dur);
  const browserRows = rows.filter(([k]) => k.startsWith('Browser|')).slice(0, 40);
  lines.push('--- Browser süreci: en uzun toplam süreli dilimler (ms toplam / adet) ---');
  for (const [k, o] of browserRows) lines.push(`${o.dur.toFixed(0)} ms ×${o.n}  ${k}`);
  lines.push('--- tüm süreçler: ilk 25 ---');
  for (const [k, o] of rows.slice(0, 25)) lines.push(`${o.dur.toFixed(0)} ms ×${o.n}  ${k}`);
  // olay sayısı: ad bazında (Browser), bellek şişmesi çok sayıda küçük nesneyse yüksek adetli olaylar ipucu verir
  const cnt = new Map();
  for (const ev of events) if ((pname.get(ev.pid) || '') === 'Browser' && ev.ph !== 'M') { const k = `${ev.ph} ${ev.cat}|${ev.name}`; cnt.set(k, (cnt.get(k) || 0) + 1); }
  lines.push('--- Browser süreci: en sık olaylar ---');
  for (const [k, n] of [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) lines.push(`${n}  ${k}`);
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  fs.writeFileSync(OUT.replace(/\.txt$/, '') + '.events.json', JSON.stringify(events.slice(0, 200000)));
  log(lines.slice(0, 50).join('\n'));
};
