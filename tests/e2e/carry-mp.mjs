// Çok oyunculu taşıma testi (iki sekme, BroadcastChannel): istemcinin aldığı kutu host'ta istemcinin önünde
// görünür ve onu izler; fırlatınca iki tarafta aynı yere düşer; aynı kutuyu iki kişi aynı anda alamaz;
// taşıyan oyundan çıkınca kutu düşer. → /tmp/carrymp-*.png
export default async ({ page, url, shot, wait, evalJS, log, newPage, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const A = page;
  await A.goto(url, { waitUntil: 'load', timeout: 120000 });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 0 } }); g.ui.menus.openLobby(); return c; });
  const B = await newPage('p1', 960, 540, true);
  await B.goto(url, { waitUntil: 'load', timeout: 120000 });
  await B.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(B, async (c) => { const g = window.__game; await g.net.join(c, { local: true }); g.ui.menus.openLobby(); }, code);
  await wait(1000);
  await evalJS(B, () => { const g = window.__game; g.net.setLobby({ charId: 'zulal' }); g.net.setLobby({ ready: true }); });
  await wait(1500);
  await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
  const ready = () => window.__game.state === 'playing' && window.__game.session && window.__game.session.props && window.__game.session.local;
  await A.waitForFunction(ready, null, { timeout: 120000 });
  await B.waitForFunction(ready, null, { timeout: 120000 });
  // yazılım GPU'sunda iki oyun aynı anda yüklenirken istemci host kalp atışını kaçırıp yeniden bağlanabilir
  // (oturum yeniden kurulur): istemci oturumu 4 sn değişmeden kalana dek bekle
  await B.waitForFunction(() => {
    const g = window.__game;
    if (!g.session || !g.session.local || !g.session.props) { window.__sid = null; return false; }
    if (window.__sid !== g.session) { window.__sid = g.session; window.__sidT = performance.now(); return false; }
    return performance.now() - window.__sidT > 4000;
  }, null, { timeout: 240000, polling: 500 });
  log('durum', await evalJS(A, () => window.__game.state), await evalJS(B, () => [window.__game.state, !!window.__game.session]));
  const bId = await evalJS(B, () => window.__game.session.localId);
  // iki tarafta da aynı kimlikle, istemcinin önüne bir kutu
  const at = await evalJS(B, () => { const pl = window.__game.session.local; return { x: pl.pos.x + Math.sin(pl.yaw) * 1.1, z: pl.pos.z + Math.cos(pl.yaw) * 1.1 }; });
  const add = (P) => evalJS(P, (a) => !!window.__game.session.props.addProp('box', a.x, a.z, 0, 'mp_box'), at);
  log('kutu eklendi', await add(A), await add(B));
  await wait(800);

  // 1) istemci alır → host görür
  await evalJS(B, () => { const S = window.__game.session; S.local.pickProp(S.props.byId.get('mp_box')); });
  await wait(1500);
  const probe = (P, id) => evalJS(P, (id) => {
    const S = window.__game.session, p = S.props.byId.get('mp_box');
    const rec = S.players.get(id), cp = rec && (rec.isLocal ? S.local.pos : rec.pos);
    const t = p.d.body.translation(), o = p.d.obj.position;
    // gorsel*: oyuncunun gördüğü (taşıyanın bu karedeki konumuna göre), dist/h: fizik gövdesi
    return { carrier: p.carrier, kinematic: !!p.d.carried, gorselMesafe: cp ? +Math.hypot(o.x - cp.x, o.z - cp.z).toFixed(2) : null, gorselH: cp ? +(o.y - cp.y).toFixed(2) : null, dist: cp ? +Math.hypot(t.x - cp.x, t.z - cp.z).toFixed(2) : null, h: cp ? +(t.y - cp.y).toFixed(2) : null, pos: [t.x, t.y, t.z].map((v) => +v.toFixed(2)) };
  }, id);
  const a1 = await probe(A, bId), b1 = await probe(B, bId);
  log('alındı (host)', a1, '(istemci)', b1);
  check(a1.carrier === bId && b1.carrier === bId && a1.kinematic && b1.kinematic, 'iki tarafta da taşıyıcı istemci olmalı', { a1, b1, bId });
  // 2) istemci yürür (ışınlanır) → kutu host'ta onu izler
  await evalJS(B, () => { const pl = window.__game.session.local; pl.spawnAt(pl.pos.x + 2.5, pl.pos.y, pl.pos.z + 1.5, pl.yaw); });
  await wait(2000);
  const a2 = await probe(A, bId), b2 = await probe(B, bId);
  log('taşınıyor (host)', a2, '(istemci)', b2);
  // görsel taşıyanın (host'taki enterpolasyonlu konumunun) 0,70 m önünde, 1,00 m yukarıda
  check(a2.gorselMesafe !== null && Math.abs(a2.gorselMesafe - 0.7) < 0.15 && Math.abs(a2.gorselH - 1.0) < 0.15, 'host görseli taşıyanın önünde olmalı', a2);
  await shot(A, '/tmp/carrymp-host.png');
  // 3) fırlatma → iki tarafta da dinamik, yakın konumda durur
  await evalJS(B, () => window.__game.session.local.dropProp(true));
  await wait(3500);
  const a3 = await probe(A, bId), b3 = await probe(B, bId);
  log('fırlatıldı (host)', a3, '(istemci)', b3, 'fark', +Math.hypot(a3.pos[0] - b3.pos[0], a3.pos[2] - b3.pos[2]).toFixed(2));
  // 4) çakışma: ikisi aynı anda almaya çalışır → tek taşıyıcı, iki taraf hemfikir
  await evalJS(A, () => { const S = window.__game.session, p = S.props.byId.get('mp_box'), t = p.d.body.translation(); S.local.spawnAt(t.x - 1, t.y, t.z, Math.PI / 2); });
  await evalJS(B, () => { const S = window.__game.session, p = S.props.byId.get('mp_box'), t = p.d.body.translation(); S.local.spawnAt(t.x + 1, t.y, t.z, -Math.PI / 2); });
  await wait(800);
  await Promise.all([
    evalJS(A, () => { const S = window.__game.session; S.local.pickProp(S.props.byId.get('mp_box')); }),
    evalJS(B, () => { const S = window.__game.session; S.local.pickProp(S.props.byId.get('mp_box')); }),
  ]);
  await wait(1500);
  const c = await Promise.all([A, B].map((P) => evalJS(P, () => { const S = window.__game.session, p = S.props.byId.get('mp_box'); return { me: S.localId, carrier: p.carrier, holding: S.local.carryProp === p }; })));
  log('çakışma', c, 'tek taşıyıcı', c[0].carrier === c[1].carrier && (c[0].holding !== c[1].holding));
  check(c[0].carrier && c[0].carrier === c[1].carrier && c[0].holding !== c[1].holding, 'aynı anda almada tek taşıyıcı olmalı', c);
  // 5) taşıyan istemciyse ayrılınca kutu host'ta düşer (değilse istemci alıp ayrılır)
  if (!c[1].holding) {
    await evalJS(A, () => window.__game.session.local.dropProp(false));
    await wait(800);
    await evalJS(B, () => { const S = window.__game.session; S.local.pickProp(S.props.byId.get('mp_box')); });
    await wait(1200);
  }
  log('ayrılmadan önce (host)', await probe(A, bId));
  await evalJS(B, () => window.__game.endSession(true));
  await wait(3000);
  const a5 = await probe(A, bId);
  log('ayrıldıktan sonra (host)', a5);
  check(a5.carrier === null && !a5.kinematic, 'taşıyan ayrılınca kutu düşmeli', a5);
};
