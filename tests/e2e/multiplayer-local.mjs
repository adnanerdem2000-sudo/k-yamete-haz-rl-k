// Çok oyunculu test: aynı tarayıcıda iki sekme (BroadcastChannel taşıyıcısı).
// Oda kur → katıl → karakter seç/hazır → başlat → oyuncu eşitleme, istemci eylemi, zombi anlık görüntüsü.
export default async ({ page, url, shot, wait, evalJS, log, newPage, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
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
  // host kendi aracını sürer: eskiden kendi durum mesajı host işleyicisinden geçip aracı kinematiğe (ağdan izlenen)
  // çeviriyordu ve host araç süremiyordu. İstemci de aracın hareketini görmeli.
  const d0 = await evalJS(A, () => {
    const g = window.__game, S = g.session, T = S.world.terrain;
    g.ui.onLockChange = () => {};
    for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel();
    const v = S.vehicles.list.find((x) => x.abandoned && !x.broken && !x.wrecked && x.health / x.maxHealth > 0.5);
    v.fuel = v.maxFuel;
    const px = v.pos.x + Math.cos(v.yaw) * v.def.wid, pz = v.pos.z - Math.sin(v.yaw) * v.def.wid;
    S.local.spawnAt(px, T.heightAt(px, pz) + 0.1, pz, 0);
    S.act('vehicle_enter', { id: v.id, seat: 0 });
    window.__hv = { id: v.id, p0: v.pos.toArray() };
    return { id: v.id, p0: v.pos.toArray().map((x) => +x.toFixed(1)) };
  });
  await wait(1500);
  const b0 = await evalJS(B, (id) => window.__game.session.vehicles.byId(id).pos.toArray(), d0.id);
  await evalJS(A, () => { const g = window.__game; window.__gas = setInterval(() => g.input.down.add('KeyW'), 50); window.__t0 = g.session.t; });
  // yazılım GPU'sunda iki sekmeyle kare hızı çok düşük: süre yerine oyun zamanı/yol bekle (en çok 60 sn)
  for (let i = 0; i < 30; i++) {
    await wait(2000);
    const st = await evalJS(A, () => { const S = window.__game.session, v = S.vehicles.byId(window.__hv.id), [x, , z] = window.__hv.p0; return { yol: Math.hypot(v.pos.x - x, v.pos.z - z), t: S.t - window.__t0 }; });
    if (st.yol > 12 || st.t > 12) break;
  }
  const d1 = await evalJS(A, () => {
    const g = window.__game, S = g.session, v = S.vehicles.byId(window.__hv.id);
    clearInterval(window.__gas); g.input.down.delete('KeyW');
    const [x, y, z] = window.__hv.p0;
    return { mode: S.local.mode, surucu: S.vehicles.local === v, kinematik: v.body.isKinematic(), yol: +Math.hypot(v.pos.x - x, v.pos.z - z).toFixed(1), oyunSn: +(S.t - window.__t0).toFixed(1), p: v.pos.toArray().map((q) => +q.toFixed(1)) };
  });
  await wait(3000);
  const b1 = await evalJS(B, (id) => window.__game.session.vehicles.byId(id).pos.toArray(), d0.id);
  const bMoved = +Math.hypot(b1[0] - b0[0], b1[2] - b0[2]).toFixed(1);
  log('host sürüşü', d0, d1, 'istemcide yol', bMoved);
  check(d1.surucu && !d1.kinematik && d1.yol > 8, 'host kendi aracını sürebilmeli (gövde dinamik kalmalı)', d1);
  check(bMoved > 5, 'istemci host aracının hareketini görmeli', { bMoved, d1 });
  await evalJS(A, () => { const S = window.__game.session; if (S.vehicles.local) S.vehicles.exitLocal(); });
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
