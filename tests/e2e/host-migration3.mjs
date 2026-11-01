// Host göçü, üç eşzamanlı sekme (yerel taşıyıcı): A host, B ve C istemci. C bir konteyneri yağmalar (envanteri
// başlangıç setinden farklılaşır), B bir kapı açar; C'nin kayıt verisi B'ye 'pdata' ile ulaşınca A sekmesi kapanır.
// Beklenen: oda sırasına göre B yeni host olur; C aynı oda koduyla kendiliğinden B'ye yeniden bağlanır (göç sonrası
// takip yolu), envanteri ve kapı durumu korunur; B'nin oyuncu listesinde C vardır; B'nin zombileri C'de görünür.
// Oyun zamanlayıcıları kare başına en fazla 0,1 sn ilerlediği için (yazılım GPU'sunda kareler yavaş) sabit bekleme
// yerine koşul beklenir.
export default async ({ page, url, wait, evalJS, log, newPage, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const A = page;
  await A.goto(url, { waitUntil: 'load', timeout: 180000 });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 1 } }); g.ui.menus.openLobby(); return c; });
  log('oda', code);
  const join = async (P, charId) => {
    await P.goto(url, { waitUntil: 'load', timeout: 180000 });
    await P.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
    return evalJS(P, async ([c, ch]) => { const g = window.__game; try { await g.net.join(c, { local: true }); g.ui.menus.openLobby(); g.net.setLobby({ charId: ch }); g.net.setLobby({ ready: true }); return { ok: true, me: g.net.myId, token: g.net.token }; } catch (e) { return { ok: false, err: e.message }; } }, [code, charId]);
  };
  const B = await newPage('pB', 960, 540, true);
  const jb = await join(B, 'zulal');
  const C = await newPage('pC', 960, 540, true);
  const jc = await join(C, 'bora');
  log('katılım B', jb, 'C', jc);
  check(jb && jb.ok && jc && jc.ok, 'B ve C lobiye katılmalı', { jb, jc });
  await wait(2000);
  await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
  for (const P of [A, B, C]) await P.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 900000 });
  log('üç sekme oyunda');
  // C yağmalar (host üzerinden), B kapı açar
  const loot = await evalJS(C, () => { const S = window.__game.session; const c = S.world.containers.find((q) => q.building === 'home' && !q.locked && q.id !== 'home:0'); S.act('search_done', { id: c.id }); return c.id; });
  await C.waitForFunction((id) => { const st = window.__game.session.loot.get(id); return st && st.searched; }, loot, { timeout: 120000 }).catch(() => {});
  await evalJS(C, (id) => window.__game.session.act('loot_take_all', { id }), loot);
  const door = await evalJS(B, () => { const S = window.__game.session; const d = S.world.home.doors.find((q) => q.exterior && !q.locked); S.act('door', { id: d.id, open: true }); return d.id; });
  await B.waitForFunction((id) => window.__game.session.world.doors.find((q) => q.id === id).target === 1, door, { timeout: 120000 }).catch(() => {});
  // C'nin envanteri değişene ve kayıt verisi B'ye (pdata) ulaşana kadar bekle
  const startKit = ['flashlightx1', 'lockpickx3', 'energy_drinkx1', 'water_bottlex2'];
  await C.waitForFunction((kit) => JSON.stringify(window.__game.session.inventory.items().map((s) => s.id + 'x' + s.qty)) !== JSON.stringify(kit), startKit, { timeout: 120000 }).catch(() => {});
  const cInvBefore = await evalJS(C, () => window.__game.session.inventory.items().map((s) => s.id + 'x' + s.qty));
  const cSer = await evalJS(C, () => JSON.stringify(window.__game.session.inventory.serialize()));
  log('C envanter (göç öncesi)', cInvBefore);
  check(JSON.stringify(cInvBefore) !== JSON.stringify(startKit), 'C yağmayla eşya almalı (göç testi için envanter başlangıç setinden farklı olmalı)', cInvBefore);
  const synced = await B.waitForFunction(([tok, ser]) => { const S = window.__game.session; const d = S.offlinePlayers && S.offlinePlayers[tok]; return !!d && JSON.stringify(d.inv) === ser; }, [jc.token, cSer], { timeout: 600000 }).then(() => true).catch(() => false);
  log('C kayıt verisi B\'de', synced);
  check(synced, 'C\'nin güncel kayıt verisi pdata ile B\'ye ulaşmalı');
  // B'nin gördüğü (eski host'un) zombileri: göçte aynı yerlerde gerçek zombiye dönüşmeli
  await evalJS(A, () => { const S = window.__game.session; const r = [...S.players.values()].find((p) => !p.isLocal); for (let i = 0; i < 3; i++) S.zombies.spawn('normal', r.pos.x + 14 + i * 2, r.pos.z + 12, {}); });
  await B.waitForFunction(() => [...window.__game.session.zombies.views.values()].filter((v) => !v.state.dead).length >= 3, null, { timeout: 120000 }).catch(() => {});
  const zBefore = await evalJS(B, () => [...window.__game.session.zombies.views.values()].filter((v) => !v.state.dead).map((v) => [v.type, Math.round(v.pos.x), Math.round(v.pos.z)]));
  log('B zombi görünümleri (göç öncesi)', zBefore.length);
  const succ = await evalJS(B, () => window.__game.net.successor());
  log('aday', succ, 'B', jb.me, 'C', jc.me);
  check(succ === jb.me, 'göç adayı B olmalı (oda sırası)', { succ, b: jb.me });
  // host ayrılır
  const t0 = Date.now();
  await evalJS(A, () => { window.dispatchEvent(new Event('beforeunload')); });
  await A.close();
  const bHost = await B.waitForFunction(() => window.__game.net.isHost && window.__game.session && window.__game.session.isHost, null, { timeout: 180000 }).then(() => true).catch(() => false);
  log('B host oldu', bHost, 'sn', Math.round((Date.now() - t0) / 1000));
  check(bHost, 'B yeni host olmalı');
  const zAfter = await evalJS(B, () => { const S = window.__game.session; return { promoted: S.promotedZombies, list: [...S.zombies.list.values()].filter((z) => !z.dead).map((z) => [z.type, Math.round(z.x), Math.round(z.z)]), zoneState: !!S.zoneState }; });
  log('B zombiler (göç sonrası)', { promoted: zAfter.promoted, list: zAfter.list.length, zoneState: zAfter.zoneState });
  const near = zBefore.filter(([t, x, z]) => zAfter.list.some(([t2, x2, z2]) => t2 === t && Math.hypot(x2 - x, z2 - z) < 4)).length;
  check(zAfter.promoted >= Math.min(3, zBefore.length) && near >= Math.min(3, zBefore.length), 'göçte görülen zombiler aynı yerlerde korunmalı', { once: zBefore.length, korunan: near, promoted: zAfter.promoted });
  check(zAfter.zoneState, 'bölge nüfusu (öldürülen sayıları) yeni host\'a pdata ile ulaşmış olmalı');
  // C kendiliğinden B'ye bağlanır ve dünyayı hoş geldin paketinden yeniden kurar
  const cBack = await C.waitForFunction(() => { const g = window.__game; return g.net.mode === 'client' && !g.net.reconnecting && g.state === 'playing' && g.session && g.session.players && g.session.players.size >= 2; }, null, { timeout: 900000 }).then(() => true).catch(() => false);
  log('C yeniden bağlandı', cBack, 'sn', Math.round((Date.now() - t0) / 1000));
  await wait(3000);
  const cAfter = await evalJS(C, (id) => { const g = window.__game, S = g.session; return { mode: g.net.mode, state: g.state, players: S ? [...S.players.values()].map((p) => p.name) : null, inv: S ? S.inventory.items().map((s) => s.id + 'x' + s.qty) : null, door: S ? S.world.doors.find((q) => q.id === id).target : null }; }, door);
  log('C sonra', cAfter);
  check(cBack && cAfter && cAfter.mode === 'client' && cAfter.state === 'playing', 'C yeni host B\'ye yeniden bağlanmalı', cAfter);
  check(cAfter && JSON.stringify(cAfter.inv) === JSON.stringify(cInvBefore), 'C\'nin envanteri göçten sonra korunmalı', { before: cInvBefore, after: cAfter && cAfter.inv });
  check(cAfter && cAfter.door === 1, 'açılan kapı C\'de de açık görünmeli', cAfter);
  const bPlayers = await evalJS(B, () => [...window.__game.session.players.values()].map((p) => p.name));
  log('B oyuncular', bPlayers);
  check(bPlayers && bPlayers.length >= 2, 'B\'nin oyuncu listesinde C olmalı', bPlayers);
  log('konteyner (B host / C)', await evalJS(B, (id) => { const st = window.__game.session.loot.get(id); return st && st.slots.filter(Boolean).length; }, loot), await evalJS(C, (id) => { const st = window.__game.session.loot.get(id); return st && st.slots.filter(Boolean).length; }, loot));
  // yeni host zombi simülasyonu → C görür
  await evalJS(B, () => { const S = window.__game.session; S.zombies.spawn('normal', S.local.pos.x + 8, S.local.pos.z + 8, {}); });
  const zc = await C.waitForFunction(() => window.__game.session.zombies.views.size >= 1, null, { timeout: 120000 }).then(() => true).catch(() => false);
  const z = await evalJS(B, () => window.__game.session.zombies.list.size);
  log('zombi (B host liste / C görünüm var)', z, zc);
  check(z >= 1 && zc, 'yeni host zombi simüle etmeli, istemci görmeli', { z, zc });
  log('ağ (C)', await evalJS(C, () => window.__game.net.netStats()));
};
