// Çok oyunculu test: aynı tarayıcıda iki sekme (BroadcastChannel taşıyıcısı).
// Oda kur → katıl → karakter seç/hazır → başlat → oyuncu eşitleme, istemci eylemi, zombi anlık görüntüsü.
export default async ({ page, url, shot, wait, evalJS, log, newPage }) => {
  const A = page;
  await A.goto(url, { waitUntil: 'load' });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 0 } }); g.ui.menus.openLobby(); return c; });
  log('oda kodu', code);
  const B = await newPage('p1', 960, 540, true);
  await B.goto(url, { waitUntil: 'load' });
  await B.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  const joined = await evalJS(B, async (c) => { const g = window.__game; try { await g.net.join(c, { local: true }); g.ui.menus.openLobby(); return { ok: true, players: g.net.room.players.map((p) => p.name + ':' + p.charId) }; } catch (e) { return { ok: false, err: e.message }; } }, code);
  log('katılım', joined);
  await wait(1000);
  await evalJS(B, () => { const g = window.__game; g.net.setLobby({ charId: 'zulal' }); g.net.setLobby({ ready: true }); });
  await wait(1500);
  await shot(A, '/tmp/mp-lobby-host.png');
  log('lobi (host)', await evalJS(A, () => ({ players: window.__game.net.room.players.map((p) => [p.name, p.charId, p.ready]), canStart: window.__game.net.canStart() })));
  await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
  await A.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await B.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  log('ikisi de oyunda');
  await wait(4000);
  log('host oyuncular', await evalJS(A, () => [...window.__game.session.players.values()].map((p) => [p.id, p.name, p.charId, !!p.avatar || p.isLocal])));
  log('istemci oyuncular', await evalJS(B, () => [...window.__game.session.players.values()].map((p) => [p.id, p.name, p.charId, !!p.avatar || p.isLocal])));
  // istemci hareket eder → host görür
  await evalJS(B, () => { const S = window.__game.session; S.local.spawnAt(S.local.pos.x + 3, S.local.pos.y, S.local.pos.z - 2, 0); });
  await wait(2500);
  log('konum eşitleme', await evalJS(A, () => { const S = window.__game.session; const r = [...S.players.values()].find((p) => !p.isLocal); return r ? r.pos.toArray().map((v) => +v.toFixed(1)) : null; }), await evalJS(B, () => window.__game.session.local.pos.toArray().map((v) => +v.toFixed(1))));
  // istemci yağma eylemi
  const loot = await evalJS(B, () => { const S = window.__game.session; const c = S.world.containers.find((q) => q.building === 'home' && !q.locked && q.id !== 'home:0'); S.act('search_done', { id: c.id }); return c.id; });
  await wait(2500);
  log('istemci yağma', await evalJS(B, (id) => { const S = window.__game.session; const st = S.loot.get(id); return { searched: st && st.searched, slots: st && st.slots.filter(Boolean).map((s) => s.id + 'x' + s.qty), panel: window.__game.ui.panel && window.__game.ui.panel.name }; }, loot));
  await evalJS(B, (id) => { window.__game.session.act('loot_take_all', { id }); }, loot);
  await wait(2500);
  log('istemci envanter', await evalJS(B, () => window.__game.session.inventory.items().map((s) => s.id + 'x' + s.qty)));
  log('host konteyner', await evalJS(A, (id) => { const st = window.__game.session.loot.get(id); return st && st.slots.filter(Boolean).length; }, loot));
  // zombi anlık görüntüsü
  await evalJS(A, () => { const S = window.__game.session; const r = [...S.players.values()].find((p) => !p.isLocal); S.zombies.spawn('normal', r.pos.x + 8, r.pos.z + 8, {}); });
  await wait(3000);
  log('istemci zombi görünümleri', await evalJS(B, () => window.__game.session.zombies.views.size), 'host zombi', await evalJS(A, () => window.__game.session.zombies.list.size));
  // sohbet
  await evalJS(B, () => window.__game.session.act('chat', { text: 'Merhaba takım!' }));
  await wait(1500);
  log('host sohbet', await evalJS(A, () => [...document.querySelectorAll('.chat-row')].map((e) => e.textContent)));
  await shot(A, '/tmp/mp-host.png');
  await shot(B, '/tmp/mp-client.png');
  // istemci ayrılır
  await evalJS(B, () => window.__game.endSession(true));
  await wait(3000);
  log('ayrılma sonrası host oyuncular', await evalJS(A, () => [...window.__game.session.players.values()].map((p) => p.name)));
};
