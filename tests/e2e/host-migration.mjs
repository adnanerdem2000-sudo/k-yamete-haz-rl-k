// Host göçü (yerel taşıyıcı, iki sekme + sonradan katılan): A host, B istemci. B bir kapıyı açar; A sekmesi kapanır →
// B yeni host olur (oturum korunur: kapı açık kalır, envanter durur, bot vekili gerçek bota döner); C göçten sonra
// aynı oda koduyla yeni host'a katılır ve kapı durumunu hoş geldin paketinden alır; B'nin zombi simülasyonu başlar.
// Ağ göstergesi (ping/kayıp) de okunur. Üç eşzamanlı sekmeli takip yolu: host-migration3.mjs.
export default async ({ page, url, wait, evalJS, log, newPage, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const A = page;
  await A.goto(url, { waitUntil: 'load', timeout: 120000 });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 1 } }); g.ui.menus.openLobby(); return c; });
  log('oda', code);
  const join = async (P, charId) => {
    await P.goto(url, { waitUntil: 'load', timeout: 180000 });
    await P.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
    const r = await evalJS(P, async ([c, ch]) => { const g = window.__game; try { await g.net.join(c, { local: true }); g.ui.menus.openLobby(); g.net.setLobby({ charId: ch }); g.net.setLobby({ ready: true }); return { ok: true, me: g.net.myId }; } catch (e) { return { ok: false, err: e.message }; } }, [code, charId]);
    return r;
  };
  // C göçten sonra katılır (sonradan katılan oyuncu yolu)
  const B = await newPage('pB', 960, 540, true);
  const jb = await join(B, 'zulal');
  log('katılım', jb);
  await wait(1500);
  await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
  for (const P of [A, B]) await P.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 300000 });
  await wait(6000);
  const before = await evalJS(B, () => { const S = window.__game.session; return { isHost: S.isHost, players: [...S.players.values()].map((p) => p.name), inv: S.inventory.items().map((s) => s.id + 'x' + s.qty), bots: S.bots.list.length }; });
  log('B önce', before);
  // B bir kapı açar (host'ta uygulanır, herkese yayılır)
  const door = await evalJS(B, () => { const S = window.__game.session; const d = S.world.home.doors.find((q) => q.exterior && !q.locked); S.act('door', { id: d.id, open: true }); return d.id; });
  await wait(2000);
  log('kapı (A host)', await evalJS(A, (id) => { const d = window.__game.session.world.doors.find((q) => q.id === id); return { target: d.target }; }, door));
  // ağ göstergesi
  await wait(5500);
  const stats = await evalJS(B, () => ({ b: window.__game.net.netStats(), q: window.__game.net.netQuality(), hud: document.querySelector('.hud-net') && document.querySelector('.hud-net').textContent }));
  log('ağ (B)', stats);
  check(stats.b && typeof stats.b.rtt === 'number' && typeof stats.b.loss === 'number' && /Oda/.test(stats.hud || ''), 'ağ göstergesi gecikme/kayıp alanlarını ve oda kodunu göstermeli', stats);
  log('ağ (A host)', await evalJS(A, () => window.__game.net.netStats()));
  // host ayrılır (sekme kapanır → beforeunload → close iletisi)
  const succ = await evalJS(B, () => window.__game.net.successor());
  log('aday', succ, 'B kimliği', jb.me);
  await evalJS(A, () => { window.dispatchEvent(new Event('beforeunload')); }); // sekme kapanışı: LocalTransport 'close' yayar
  await A.close();
  // B'nin host olmasını bekle
  await B.waitForFunction(() => window.__game.net.isHost && window.__game.session && window.__game.session.isHost, null, { timeout: 90000 }).catch(() => {});
  const after = await evalJS(B, () => { const S = window.__game.session; return { isHost: S.isHost, netHost: window.__game.net.isHost, mode: window.__game.net.mode, inv: S.inventory.items().map((s) => s.id + 'x' + s.qty), bots: S.bots.list.length, botProxies: S.bots.list.filter((b) => !b.think && b.constructor.name === 'BotProxy').length, room: window.__game.net.room && window.__game.net.room.players.map((p) => [p.name, p.isHost, p.online]) }; });
  log('B sonra', after);
  check(after.isHost && after.netHost, 'B yeni host olmalı', after);
  check(JSON.stringify(after.inv) === JSON.stringify(before.inv), 'göçte envanter korunmalı', { before: before.inv, after: after.inv });
  log('kapı (B host)', await evalJS(B, (id) => { const d = window.__game.session.world.doors.find((q) => q.id === id); return { target: d.target }; }, door));
  check((await evalJS(B, (id) => window.__game.session.world.doors.find((q) => q.id === id).target, door)) === 1, 'açılan kapı göçten sonra açık kalmalı');
  // C yeni host'a (aynı oda kodu) katılır: oyun sürerken doğrudan karşılama
  const C = await newPage('pC', 960, 540, true);
  let jc = await join(C, 'bora');
  for (let i = 0; i < 2 && !(jc && jc.ok); i++) { await wait(5000); jc = await evalJS(C, async ([c, ch]) => { const g = window.__game; try { await g.net.join(c, { local: true }); g.ui.menus.openLobby(); g.net.setLobby({ charId: ch }); g.net.setLobby({ ready: true }); return { ok: true, me: g.net.myId, retry: true }; } catch (e) { return { ok: false, err: e.message }; } }, [code, 'bora']); }
  log('C katılım', jc);
  await evalJS(C, (id) => { window.__doorId = id; }, door);
  await C.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 300000 }).catch(() => {});
  await wait(4000);
  const cState = await evalJS(C, () => { const g = window.__game, S = g.session; return { mode: g.net.mode, reconnecting: g.net.reconnecting, state: g.state, players: S ? [...S.players.values()].map((p) => p.name) : null, inv: S ? S.inventory.items().map((s) => s.id + 'x' + s.qty) : null, hostName: g.net.room && (g.net.room.players.find((p) => p.isHost) || {}).name, doorTarget: S ? (S.world.doors.find((q) => q.id === window.__doorId) || {}).target : null }; });
  log('C sonra', cState);
  check(jc && jc.ok && cState.mode === 'client' && cState.state === 'playing', 'C yeni host\'a katılmalı', cState);
  // geç katılan yeni host'un oyuncu listesinde olmalı ve kapıyı açık görmeli
  const bListHasC = await B.waitForFunction(() => window.__game.session.players.size >= 2, null, { timeout: 120000 }).then(() => true).catch(() => false);
  log('B oyuncular', await evalJS(B, () => [...window.__game.session.players.values()].map((p) => p.name)));
  check(bListHasC, 'yeni host geç katılanı oyuncu listesinde görmeli');
  check(cState && cState.doorTarget === 1, 'geç katılan açılmış kapıyı açık görmeli', cState && cState.doorTarget);
  // yeni host zombi simülasyonu
  await evalJS(B, () => { const S = window.__game.session; S.zombies.spawn('normal', S.local.pos.x + 8, S.local.pos.z + 8, {}); });
  await wait(3000);
  const z = await evalJS(B, () => window.__game.session.zombies.list.size);
  const zc = await evalJS(C, () => window.__game.session.zombies.views.size);
  log('zombi (B host liste / C görünüm)', z, zc);
  check(z >= 1 && zc >= 1, 'yeni host zombi simüle etmeli, istemci görmeli', { z, zc });
};
