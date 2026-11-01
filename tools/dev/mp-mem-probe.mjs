// Çok oyunculu bellek sondası: host + istemci, oyun başladıktan sonra 150 sn boyunca iki render sürecinin RSS'i
// (ps) ve sayfa yığınları; DISABLE=snap,pdata,state,ping ile host/istemci ağ yolları kapatılır (bisect)
import { execSync } from 'node:child_process';
export default async ({ page, url, wait, evalJS, log, newPage }) => {
  const dis = (process.env.DISABLE || '').split(',').filter(Boolean);
  const rss = () => { try { return execSync("ps -eo rss,args | grep -- '--type=renderer' | grep -v grep | sort -rn | head -2 | awk '{printf \"%d \", $1/1024}'").toString().trim(); } catch { return '?'; } };
  const A = page;
  await A.goto(url, { waitUntil: 'load', timeout: 180000 });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 0 } }); g.ui.menus.openLobby(); return c; });
  const B = await newPage('p1', 960, 540, true);
  await B.goto(url, { waitUntil: 'load', timeout: 180000 });
  await B.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(B, async (c) => { const g = window.__game; await g.net.join(c, { local: true }); g.ui.menus.openLobby(); g.net.setLobby({ charId: 'zulal' }); g.net.setLobby({ ready: true }); }, code);
  await wait(1500);
  await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
  await A.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 300000 });
  await B.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 300000 });
  log('kapalı', dis);
  await evalJS(A, (dis) => { const n = window.__game.net; if (dis.includes('snap')) n.sendSnapshots = () => {}; if (dis.includes('pdata')) n.pdataT = 1e9; if (dis.includes('ping')) n.pingT = 1e9; if (dis.includes('evt')) n.broadcast = () => {}; }, dis);
  await evalJS(B, (dis) => { const n = window.__game.net; if (dis.includes('state')) n.sendState = () => {}; if (dis.includes('ping')) n.pingT = 1e9; }, dis);
  const heap = (P) => evalJS(P, () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  const dom = (P) => evalJS(P, () => document.getElementsByTagName('*').length);
  for (let i = 0; i <= 150; i += 15) {
    log(`t+${i}s`, { rss: rss(), heapA: await heap(A), heapB: await heap(B), domA: await dom(A), domB: await dom(B) });
    if (i < 150) await wait(15000);
  }
};
