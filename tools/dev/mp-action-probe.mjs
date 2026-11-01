// İstemci → host eylem yolu sondası (carry-mp hatası): host 'req' sayar, istemci gönderimleri sayar; durumlar
export default async ({ page, url, wait, evalJS, log, newPage }) => {
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
  // sayaçlar
  await evalJS(A, () => { const n = window.__game.net; window.__cnt = {}; const o = n.onPeerMsg.bind(n); n.onPeerMsg = (pid, m) => { const k = m && m.t; window.__cnt[k] = (window.__cnt[k] || 0) + 1; if (k === 'req') (window.__reqs = window.__reqs || []).push(m.type); return o(pid, m); }; });
  await evalJS(B, () => { const n = window.__game.net; window.__sent = {}; const o = n.sendToHost.bind(n); n.sendToHost = (m) => { const k = m && m.t; window.__sent[k] = (window.__sent[k] || 0) + 1; return o(m); }; window.__hostLost = 0; const h = n.onHostLost.bind(n); n.onHostLost = () => { window.__hostLost++; return h(); }; });
  const stateB = () => evalJS(B, () => { const g = window.__game, n = g.net; return { mode: n.mode, phase: n.phase, reconnecting: n.reconnecting, hostId: n.transport && n.transport.hostId, isHost: g.session && g.session.isHost, sid: g.session && g.session.localId, sent: window.__sent, hostLost: window.__hostLost, lastHostAge: n.transport && n.transport.lastHost ? Math.round(performance.now() - n.transport.lastHost) : null }; });
  const stateA = () => evalJS(A, () => { const g = window.__game, n = g.net; return { peers: [...n.peers.values()].map((p) => ({ id: p.id, inGame: p.inGame, age: Math.round(performance.now() - p.lastSeen) })), cnt: window.__cnt, reqs: window.__reqs, tpeers: n.transport && n.transport.peers ? [...n.transport.peers.keys()] : null }; });
  for (let i = 1; i <= 4; i++) {
    await wait(5000);
    await evalJS(B, (i) => { window.__game.session.act('chat', { text: 'ping ' + i }); }, i);
    await wait(1500);
    log(`tur ${i} istemci`, await stateB());
    log(`tur ${i} host`, await stateA());
    log(`tur ${i} host sohbet`, await evalJS(A, () => [...document.querySelectorAll('.chat-row')].map((e) => e.textContent).slice(-2)));
  }
};
