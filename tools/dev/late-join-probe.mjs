// Göç sonrası geç katılan sondası: A host + B istemci → A kapanır → B host olur → C katılır. B'de oyuncu ekleme/çıkarma,
// eş düşürme ve eş iletileri zaman damgasıyla kaydedilir; sonda B'nin oyuncu listesi ve kayıt yazdırılır.
export default async ({ page, url, wait, evalJS, log, newPage }) => {
  const A = page;
  await A.goto(url, { waitUntil: 'load', timeout: 180000 });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 0 } }); g.ui.menus.openLobby(); return c; });
  const join = async (P, ch) => {
    await P.goto(url, { waitUntil: 'load', timeout: 180000 });
    await P.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
    return evalJS(P, async ([c, ch]) => { const g = window.__game; try { await g.net.join(c, { local: true }); g.ui.menus.openLobby(); g.net.setLobby({ charId: ch }); g.net.setLobby({ ready: true }); return { ok: true, me: g.net.myId }; } catch (e) { return { ok: false, err: e.message }; } }, [code, ch]);
  };
  const B = await newPage('pB', 960, 540, true);
  log('B', await join(B, 'zulal'));
  await wait(1500);
  await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
  for (const P of [A, B]) await P.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 600000 });
  // B'de kayıt kancaları (göçten sonra da aynı Net/Session nesneleri)
  await evalJS(B, () => {
    const g = window.__game, n = g.net, S = g.session, t0 = performance.now();
    const L = (window.__L = []);
    const rec = (k, d) => L.push([Math.round((performance.now() - t0) / 100) / 10, k, d]);
    const add = S.addRemotePlayer.bind(S); S.addRemotePlayer = (info) => { rec('add', info.id); return add(info); };
    const rem = S.removeRemotePlayer.bind(S); S.removeRemotePlayer = (id) => { rec('remove', id + ' ← ' + (new Error().stack.split('\n')[2] || '').trim().slice(0, 80)); return rem(id); };
    const drop = n.dropPeer.bind(n); n.dropPeer = (pid, i) => { const p = n.peers.get(pid); rec('dropPeer', (p && p.id) + ' intentional=' + i + ' inGame=' + (p && p.inGame) + ' since=' + (p && p.lastSeen ? Math.round(performance.now() - p.lastSeen) : '?')); return drop(pid, i); };
    const msg = n.onPeerMsg.bind(n); n.onPeerMsg = (pid, m) => { if (m && m.t !== 'st' && m.t !== 'ping' && m.t !== 'pong' && m.t !== 'save') rec('peerMsg', m.t + ' ' + ((n.peers.get(pid) || {}).id || pid)); return msg(pid, m); };
    const mig = n.migrateToHost.bind(n); n.migrateToHost = async () => { rec('migrate', 'başladı'); const r = await mig(); rec('migrate', 'bitti host=' + n.isHost); return r; };
  });
  await wait(6000);
  await evalJS(A, () => { window.dispatchEvent(new Event('beforeunload')); });
  await A.close();
  const bHost = await B.waitForFunction(() => window.__game.net.isHost, null, { timeout: 180000 }).then(() => true).catch(() => false);
  log('B host', bHost, await evalJS(B, () => window.__L));
  const C = await newPage('pC', 960, 540, true);
  log('C', await join(C, 'bora'));
  await C.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 600000 }).catch(() => {});
  for (let i = 0; i < 6; i++) {
    await wait(10000);
    log(`t+${(i + 1) * 10}s`, { B: await evalJS(B, () => [...window.__game.session.players.values()].map((p) => p.name)), C: await evalJS(C, () => ({ mode: window.__game.net.mode, rec: window.__game.net.reconnecting, state: window.__game.state, players: window.__game.session ? window.__game.session.players.size : null })) });
  }
  log('B kayıt', await evalJS(B, () => window.__L));
};
