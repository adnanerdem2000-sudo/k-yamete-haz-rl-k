// Host göçü (yerel taşıyıcı, üç sekme): A host, B ve C istemci. B bir kapıyı açar; A sekmesi kapanır → oda sırasına
// göre B yeni host olur (oturum korunur: kapı açık kalır, envanter durur), C aynı kodla B'ye yeniden bağlanır,
// B'nin zombi simülasyonu başlar. Ağ göstergesi (ping/kayıp) de okunur.
export default async ({ page, url, wait, evalJS, log, newPage, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const A = page;
  await A.goto(url, { waitUntil: 'load', timeout: 120000 });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 1 } }); g.ui.menus.openLobby(); return c; });
  log('oda', code);
  const join = async (P, charId) => {
    await P.goto(url, { waitUntil: 'load', timeout: 120000 });
    await P.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
    const r = await evalJS(P, async ([c, ch]) => { const g = window.__game; try { await g.net.join(c, { local: true }); g.ui.menus.openLobby(); g.net.setLobby({ charId: ch }); g.net.setLobby({ ready: true }); return { ok: true, me: g.net.myId }; } catch (e) { return { ok: false, err: e.message }; } }, [code, charId]);
    return r;
  };
  const B = await newPage('pB', 960, 540, true);
  const C = await newPage('pC', 960, 540, true);
  const jb = await join(B, 'zulal'); const jc = await join(C, 'bora');
  log('katılım', jb, jc);
  await wait(1500);
  await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
  for (const P of [A, B, C]) await P.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(6000);
  const before = await evalJS(B, () => { const S = window.__game.session; return { isHost: S.isHost, players: [...S.players.values()].map((p) => p.name), inv: S.inventory.items().map((s) => s.id + 'x' + s.qty), bots: S.bots.list.length }; });
  log('B önce', before);
  // B bir kapı açar (host'ta uygulanır, herkese yayılır)
  const door = await evalJS(B, () => { const S = window.__game.session; const d = S.world.home.doors.find((q) => q.exterior && !q.locked); S.act('door', { id: d.id, open: true }); return d.id; });
  await wait(2000);
  log('kapı (C\'de)', await evalJS(C, (id) => { const d = window.__game.session.world.doors.find((q) => q.id === id); return { target: d.target }; }, door));
  // ağ göstergesi
  await wait(5500);
  const stats = await evalJS(B, () => ({ b: window.__game.net.netStats(), q: window.__game.net.netQuality(), hud: document.querySelector('.hud-net') && document.querySelector('.hud-net').textContent }));
  log('ağ (B)', stats);
  check(stats.b && stats.q !== 'bad', 'yerel taşıyıcıda bağlantı kopuk sayılmamalı', stats);
  log('ağ (A host)', await evalJS(A, () => window.__game.net.netStats()));
  // host ayrılır (sekme kapanır → beforeunload → close iletisi)
  const succ = await evalJS(B, () => window.__game.net.successor());
  log('aday', succ, 'B kimliği', jb.me);
  await evalJS(A, () => { window.dispatchEvent(new Event('beforeunload')); }); // sekme kapanışı: LocalTransport 'close' yayar
  await A.close();
  // B'nin host olmasını bekle
  await B.waitForFunction(() => window.__game.net.isHost && window.__game.session && window.__game.session.isHost, null, { timeout: 40000 }).catch(() => {});
  const after = await evalJS(B, () => { const S = window.__game.session; return { isHost: S.isHost, netHost: window.__game.net.isHost, mode: window.__game.net.mode, inv: S.inventory.items().map((s) => s.id + 'x' + s.qty), bots: S.bots.list.length, botProxies: S.bots.list.filter((b) => !b.think && b.constructor.name === 'BotProxy').length, room: window.__game.net.room && window.__game.net.room.players.map((p) => [p.name, p.isHost, p.online]) }; });
  log('B sonra', after);
  check(after.isHost && after.netHost, 'B yeni host olmalı', after);
  check(JSON.stringify(after.inv) === JSON.stringify(before.inv), 'göçte envanter korunmalı', { before: before.inv, after: after.inv });
  log('kapı (B host)', await evalJS(B, (id) => { const d = window.__game.session.world.doors.find((q) => q.id === id); return { target: d.target }; }, door));
  check((await evalJS(B, (id) => window.__game.session.world.doors.find((q) => q.id === id).target, door)) === 1, 'açılan kapı göçten sonra açık kalmalı');
  // C yeniden bağlanır
  await C.waitForFunction(() => window.__game.session && window.__game.net.mode === 'client' && !window.__game.net.reconnecting && window.__game.net.room && window.__game.net.room.players.some((p) => p.isHost && p.name), null, { timeout: 60000 }).catch(() => {});
  await wait(4000);
  const cState = await evalJS(C, () => { const g = window.__game, S = g.session; return { mode: g.net.mode, reconnecting: g.net.reconnecting, state: g.state, players: S ? [...S.players.values()].map((p) => p.name) : null, inv: S ? S.inventory.items().map((s) => s.id + 'x' + s.qty) : null, hostName: g.net.room && (g.net.room.players.find((p) => p.isHost) || {}).name }; });
  log('C sonra', cState);
  check(cState.mode === 'client' && !cState.reconnecting && cState.state === 'playing', 'C yeni host\'a yeniden bağlanmalı', cState);
  log('B oyuncular', await evalJS(B, () => [...window.__game.session.players.values()].map((p) => p.name)));
  // yeni host zombi simülasyonu
  await evalJS(B, () => { const S = window.__game.session; S.zombies.spawn('normal', S.local.pos.x + 8, S.local.pos.z + 8, {}); });
  await wait(3000);
  const z = await evalJS(B, () => window.__game.session.zombies.list.size);
  const zc = await evalJS(C, () => window.__game.session.zombies.views.size);
  log('zombi (B host liste / C görünüm)', z, zc);
  check(z >= 1 && zc >= 1, 'yeni host zombi simüle etmeli, istemci görmeli', { z, zc });
};
