// Bellek sondası v2: tüm chrome süreçleri (tarayıcı/gpu/render) yükleme aşamasından itibaren 10 sn'de bir ölçülür,
// her örnek anında OUT dosyasına yazılır (çökme olursa veri kaybolmaz). Sayfa içi sayaçlar: BroadcastChannel ileti
// sayısı/boyutu, console çağrıları, kare sayısı, JS yığını, renderer.info.
// MODE=mp (host+istemci, varsayılan) | single2 (iki bağımsız tek oyunculu sekme) | single1 (tek sekme)
// DISABLE=snap,pdata,ping,evt,state (yalnız mp) — host/istemci ağ yolları kapatılır. DUR=oyun içi ölçüm süresi (sn)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const OUT = process.env.OUT || '/tmp/mp-mem2.txt';
const MODE = process.env.MODE || 'mp';
const DUR = +(process.env.DUR || 150);
const dis = (process.env.DISABLE || '').split(',').filter(Boolean);
const t0 = Date.now();
const procs = () => {
  const out = [];
  try {
    const lines = execSync("ps -eo pid,args | grep chrome-headless-shel[l]").toString().trim().split('\n');
    for (const l of lines) {
      const m = l.trim().match(/^(\d+)\s+(.*)$/); if (!m) continue;
      const pid = m[1]; const tm = m[2].match(/--type=([a-z-]+)/); const type = tm ? tm[1] : 'browser';
      if (type === 'zygote') continue;
      let anon = 0, rss = 0, thr = 0;
      try { const st = fs.readFileSync(`/proc/${pid}/status`, 'utf8'); anon = +(st.match(/RssAnon:\s+(\d+)/) || [0, 0])[1]; rss = +(st.match(/VmRSS:\s+(\d+)/) || [0, 0])[1]; thr = +(st.match(/Threads:\s+(\d+)/) || [0, 0])[1]; } catch { /* yok */ }
      let fds = 0; try { fds = fs.readdirSync(`/proc/${pid}/fd`).length; } catch { /* yok */ }
      out.push(`${type}:${Math.round(rss / 1024)}MB(anon ${Math.round(anon / 1024)},thr ${thr},fd ${fds})`);
    }
  } catch { /* yok */ }
  return out.join(' ');
};
const write = (s) => { const line = `[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${s}`; fs.appendFileSync(OUT, line + '\n'); };
const INIT = () => {
  const c = (window.__cnt = { bc: 0, bcBytes: 0, bcIn: 0, con: 0, raf: 0 });
  const pm = BroadcastChannel.prototype.postMessage;
  BroadcastChannel.prototype.postMessage = function (m) { c.bc++; try { c.bcBytes += JSON.stringify(m).length; } catch { /* yok */ } return pm.call(this, m); };
  const ael = BroadcastChannel.prototype.addEventListener;
  BroadcastChannel.prototype.addEventListener = function (t, fn, o) { if (t === 'message') { const w = (e) => { c.bcIn++; return fn(e); }; return ael.call(this, t, w, o); } return ael.call(this, t, fn, o); };
  const desc = Object.getOwnPropertyDescriptor(BroadcastChannel.prototype, 'onmessage');
  if (desc && desc.set) Object.defineProperty(BroadcastChannel.prototype, 'onmessage', { set(fn) { desc.set.call(this, fn ? (e) => { c.bcIn++; return fn(e); } : fn); }, get() { return desc.get.call(this); }, configurable: true });
  for (const k of ['log', 'warn', 'error', 'info', 'debug']) { const o = console[k]; console[k] = function (...a) { c.con++; return o.apply(this, a); }; }
  const raf = window.requestAnimationFrame; window.requestAnimationFrame = function (fn) { return raf.call(window, (ts) => { c.raf++; return fn(ts); }); };
};
export default async ({ page, url, wait, evalJS, log, newPage }) => {
  fs.writeFileSync(OUT, `# MODE=${MODE} DISABLE=${dis.join(',')} DUR=${DUR}\n`);
  const pages = [];
  const sample = async (tag) => {
    const parts = [];
    for (const [name, P] of pages) {
      const s = await evalJS(P, () => { const c = window.__cnt || {}; const g = window.__game; const hp = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1; const out = { heap: hp, bc: c.bc, bcKB: Math.round((c.bcBytes || 0) / 1024), bcIn: c.bcIn, con: c.con, raf: c.raf, st: g ? g.state : '-' }; if (g && g.gfx && g.gfx.renderer) { const i = g.gfx.renderer.info; out.geo = i.memory.geometries; out.tex = i.memory.textures; out.prog = i.programs ? i.programs.length : -1; out.calls = i.render.calls; } return out; });
      parts.push(`${name}=${JSON.stringify(s)}`);
    }
    write(`${tag} ${procs()} | ${parts.join(' ')}`);
  };
  let running = true;
  const bg = (async () => { while (running) { await sample('bg'); await wait(10000); } })();
  const A = page; pages.push(['A', A]);
  await A.addInitScript(INIT);
  await A.goto(url, { waitUntil: 'load', timeout: 180000 });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  write('A menüde');
  let B = null;
  if (MODE !== 'single1') {
    B = await newPage('p1', 960, 540, true); pages.push(['B', B]);
    await B.addInitScript(INIT);
  }
  if (MODE === 'mp') {
    const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 0 } }); g.ui.menus.openLobby(); return c; });
    await B.goto(url, { waitUntil: 'load', timeout: 180000 });
    await B.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
    write('B menüde');
    await evalJS(B, async (c) => { const g = window.__game; await g.net.join(c, { local: true }); g.ui.menus.openLobby(); g.net.setLobby({ charId: 'zulal' }); g.net.setLobby({ ready: true }); }, code);
    await wait(1500);
    await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
    await A.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 300000 });
    write('A oyunda');
    await B.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 300000 });
    write('B oyunda');
    await evalJS(A, (dis) => { const n = window.__game.net; if (dis.includes('snap')) n.sendSnapshots = () => {}; if (dis.includes('pdata')) n.pdataT = 1e9; if (dis.includes('ping')) n.pingT = 1e9; if (dis.includes('evt')) n.broadcast = () => {}; }, dis);
    await evalJS(B, (dis) => { const n = window.__game.net; if (dis.includes('state')) n.sendState = () => {}; if (dis.includes('ping')) n.pingT = 1e9; }, dis);
  } else {
    await evalJS(A, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
    await A.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 300000 });
    write('A oyunda');
    if (B) {
      await B.goto(url, { waitUntil: 'load', timeout: 180000 });
      await B.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
      write('B menüde');
      await evalJS(B, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
      await B.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 300000 });
      write('B oyunda');
    }
  }
  for (let i = 0; i <= DUR; i += 10) { await sample(`t+${i}s`); if (i < DUR) await wait(10000); }
  running = false; await bg;
  write('bitti');
  log('bitti', OUT);
};
