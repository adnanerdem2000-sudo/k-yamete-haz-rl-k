// 6 oyunculu test ortamı + ortak dünya eşitlemesi (yerel taşıyıcı). A host ve B istemci gerçek oyun sekmeleri; dört
// oyuncu daha protokol düzeyinde sahte eş olarak hafif bir sayfadan (aynı köken, BroadcastChannel) katılır:
// connect → hello → welcome → joined, 10/sn durum paketi, ping'e pong, kalp atışı. Yazılım GPU'sunda altı tam dünya
// kurmak yerine host'un 6 oyuncuyu taşıması ve gerçek istemcinin 5 uzak oyuncuyu görmesi doğrulanır. Ayrıca:
// 7. oyuncuya "Oda dolu", sahte eşin ayrılıp aynı jetonla geri gelmesi, sahte eşten sohbet eylemi, anlık görüntü boyutu;
// hayvan anlık görüntüsü (host'ta doğan hayvan istemcide aynı yerde görünür, istemcinin vuruşu host'ta öldürür, saldıran
// yaban domuzunun hasarı istemciye ulaşır), tüccar stoğu (istemci satın alır → host stoğu düşer, para/eşya istemcide),
// eylem klibinin başlangıç ofseti (uzak avatar klibi ileriden başlatır).
export default async ({ page, url, wait, evalJS, log, newPage, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const until = (P, fn, arg, ms = 180000) => P.waitForFunction(fn, arg, { timeout: ms, polling: 500 }).then(() => true).catch(() => false);
  const A = page;
  await A.goto(url, { waitUntil: 'load', timeout: 180000 });
  await A.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const code = await evalJS(A, async () => { const g = window.__game; const c = await g.net.host({ local: true, settings: { aiFill: 0 } }); g.ui.menus.openLobby(); return c; });
  const B = await newPage('pB', 960, 540, true);
  await B.goto(url, { waitUntil: 'load', timeout: 180000 });
  await B.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const jb = await evalJS(B, async (c) => { const g = window.__game; try { await g.net.join(c, { local: true }); g.ui.menus.openLobby(); g.net.setLobby({ charId: 'zulal' }); g.net.setLobby({ ready: true }); return { ok: true, me: g.net.myId }; } catch (e) { return { ok: false, err: e.message }; } }, code);
  log('B katılım', jb);
  await wait(1500);
  await evalJS(A, () => { window.__game.ui.menus.hide(); window.__game.net.startGame(); });
  for (const P of [A, B]) await P.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 600000 });
  const bId = await evalJS(B, () => window.__game.session.localId);
  const aId = await evalJS(A, () => window.__game.session.localId);
  // ------------------------------------------------------------------ 4 sahte eş
  const ver = await evalJS(A, async () => (await import('/src/net/Net.js')).PROTOCOL);
  const F = await newPage('pF', 640, 360, true);
  await F.goto(url + 'CREDITS.md', { waitUntil: 'load', timeout: 60000 });
  await evalJS(F, ([code, ver]) => {
    const CH = ['mert', 'zulal', 'bora', 'elif', 'deniz', 'kaan'];
    window.__fakes = [];
    window.__mkFake = (i, token, rejoin) => {
      const f = { i, id: 'Lf' + i + Math.random().toString(36).slice(2, 7), token: token || 'fake' + i + Math.random().toString(36).slice(2, 7), rejoin: !!rejoin, hostId: null, snaps: 0, maxPl: 0, snapBytes: 0, pings: 0, seq: 0, ang: i * 1.3, evts: {}, alive: true };
      f.ch = new BroadcastChannel('kiyamet-room-' + code);
      f.post = (m) => { if (f.alive) f.ch.postMessage(m); };
      f.send = (d) => f.post({ k: 'data', from: f.id, to: f.hostId, d });
      f.ch.onmessage = (ev) => {
        const m = ev.data;
        if (m.to && m.to !== f.id) return;
        if (m.k === 'accept' && !f.hostId) { f.hostId = m.from; f.send({ t: 'hello', ver, token: f.token, name: 'Sahte' + i, charId: CH[(i + 2) % 6], look: {}, rejoin: f.rejoin }); return; }
        if (m.from !== f.hostId) return;
        if (m.k === 'close') { f.hostClosed = true; return; }
        if (m.k !== 'data') return;
        const d = m.d;
        if (d.t === 'welcome') {
          f.welcome = { you: d.you, players: (d.w.players || []).length, trade: !!d.w.trade };
          const h = (d.w.players || [])[0] || { x: 0, y: 0, z: 0 };
          f.cx = h.x; f.cy = h.y; f.cz = h.z;
          f.send({ t: 'joined' });
          f.timer = setInterval(() => {
            f.ang += 0.04;
            f.x = f.cx + Math.cos(f.ang) * (3 + i); f.z = f.cz + Math.sin(f.ang) * (3 + i);
            f.send({ t: 'st', n: ++f.seq, p: [Math.round(f.x * 100) / 100, f.cy, Math.round(f.z * 100) / 100], a: { mode: 'ground', speed: 1.5, vy: 0, yaw: Math.round(f.ang * 100) / 100, pitch: 0, aim: false, steer: 0, emote: null, carrying: false, moveAngle: 0, roll: 0, tired: 0, carryBox: 0, act: null, actT: 0 }, v: 0, s: 0, h: { health: 100, maxHealth: 100, hunger: 80, thirst: 80, downed: false, radio: 0 }, held: null, spk: 0 });
          }, 100);
        } else if (d.t === 'snap') { f.snaps++; f.maxPl = Math.max(f.maxPl, d.pl.length); f.lastIds = d.pl.map((q) => q[0]); f.snapBytes += JSON.stringify(d).length; if (d.an) f.animals = d.an.length; }
        else if (d.t === 'ping') { f.send({ t: 'pong', ts: d.ts }); f.pings++; }
        else if (d.t === 'reject') f.rejected = d.reason;
        else if (d.t === 'evt') { f.evts[d.e.k] = (f.evts[d.e.k] || 0) + 1; if (d.e.k === 'chat') f.lastChat = d.e.text; }
      };
      f.hb = setInterval(() => { if (f.hostId) f.post({ k: 'hb', from: f.id, to: f.hostId }); }, 1500);
      f.leave = () => { clearInterval(f.timer); clearInterval(f.hb); f.post({ k: 'close', from: f.id }); f.alive = false; try { f.ch.close(); } catch { /* yoksay */ } };
      f.post({ k: 'connect', from: f.id });
      return f;
    };
    for (let i = 0; i < 4; i++) window.__fakes.push(window.__mkFake(i));
  }, [code, ver]);
  const six = await until(A, () => window.__game.session.players.size === 6, null, 240000);
  const sixB = await until(B, () => window.__game.session.players.size === 6, null, 240000);
  log('oyuncular (A / B)', await evalJS(A, () => [...window.__game.session.players.values()].map((p) => p.name)), await evalJS(B, () => window.__game.session.players.size));
  check(six && sixB, 'host ve istemci 6 oyuncu görmeli', { six, sixB });
  await until(F, () => window.__fakes.every((f) => f.maxPl >= 6), null, 120000);
  const fk = await evalJS(F, () => window.__fakes.map((f) => ({ welcome: f.welcome, snaps: f.snaps, maxPl: f.maxPl, avgSnap: f.snaps ? Math.round(f.snapBytes / f.snaps) : 0, pings: f.pings })));
  log('sahte eşler', fk);
  check(fk.every((f) => f.welcome && f.maxPl === 6), 'her sahte eş hoş geldin almalı ve anlık görüntüde 6 oyuncu görmeli', fk);
  check(fk.every((f) => f.avgSnap > 0 && f.avgSnap < 8000), 'anlık görüntü boyutu makul olmalı (< 8 KB)', fk.map((f) => f.avgSnap));
  // 7. oyuncu
  await evalJS(F, () => { window.__seventh = window.__mkFake(6); });
  await until(F, () => !!window.__seventh.rejected, null, 60000);
  const rej = await evalJS(F, () => window.__seventh.rejected || null);
  log('7. oyuncu', rej);
  check(rej === 'Oda dolu.', '7. oyuncu reddedilmeli', rej);
  await evalJS(F, () => window.__seventh.leave());
  // sohbet eylemi (sahte eş → host → herkese)
  await evalJS(F, () => window.__fakes[0].send({ t: 'req', type: 'chat', p: { text: 'Sahte merhaba' } }));
  const chatB = await until(B, () => [...document.querySelectorAll('.chat-row')].some((e) => e.textContent.includes('Sahte merhaba')), null, 60000);
  check(chatB, 'sahte eşin sohbet iletisi gerçek istemcide görünmeli');
  // hareket: B, sahte eş 1'in avatarını hareket ederken görür
  const fid = await evalJS(F, () => window.__fakes[1].welcome.you);
  const p1 = await evalJS(B, (id) => { const r = window.__game.session.players.get(id); return r && r.pos ? [r.pos.x, r.pos.z] : null; }, fid);
  await wait(4000);
  const p2 = await evalJS(B, (id) => { const r = window.__game.session.players.get(id); return r && r.pos ? [r.pos.x, r.pos.z] : null; }, fid);
  const moved = p1 && p2 ? Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) : 0;
  log('sahte eş hareketi (B görünümü, m)', +moved.toFixed(2));
  check(moved > 0.3, 'istemci sahte eşin hareketini görmeli', { p1, p2 });
  // ayrılma ve aynı jetonla geri gelme
  const tok = await evalJS(F, () => { const f = window.__fakes[3]; f.leave(); return f.token; });
  const five = await until(A, () => window.__game.session.players.size === 5, null, 120000);
  const fiveB = await until(B, () => window.__game.session.players.size === 5, null, 120000);
  check(five && fiveB, 'ayrılan oyuncu host ve istemciden düşmeli', { five, fiveB });
  await evalJS(F, (t) => { window.__fakes[3] = window.__mkFake(3, t, true); }, tok);
  const back = await until(A, () => window.__game.session.players.size === 6, null, 180000);
  const backB = await until(B, () => window.__game.session.players.size === 6, null, 180000);
  const roomN = await evalJS(A, () => window.__game.net.room.players.length);
  log('geri gelme', { back, backB, odaKaydi: roomN });
  check(back && backB && roomN === 6, 'aynı jetonla geri gelen oyuncu aynı oda kaydına dönmeli (çift kayıt yok)', { back, backB, roomN });
  log('host ağ istatistiği', await evalJS(A, () => window.__game.net.netStats()));
  // ------------------------------------------------------------------ hayvan eşitlemesi
  const deer = await evalJS(A, (bid) => { const S = window.__game.session; const r = S.players.get(bid); const a = S.npcs.spawnAnimal('deer', r.pos.x + 7, r.pos.z + 5); return { id: a.id, x: a.x, z: a.z }; }, bId);
  const seen = await until(B, (id) => window.__game.session.npcs.animals.some((a) => a.id === id), deer.id, 120000);
  const dB = await evalJS(B, (id) => { const a = window.__game.session.npcs.animals.find((q) => q.id === id); return a ? { x: a.x, z: a.z, remote: !!a.remote } : null; }, deer.id);
  const dA = await evalJS(A, (id) => { const a = window.__game.session.npcs.animals.find((q) => q.id === id); return a ? { x: a.x, z: a.z } : null; }, deer.id);
  log('geyik (A / B)', dA, dB);
  check(seen && dB && dB.remote, 'host\'ta doğan hayvan istemcide (kopya olarak) görünmeli', { seen, dB });
  check(dA && dB && Math.hypot(dA.x - dB.x, dA.z - dB.z) < 4, 'hayvan konumu host ile istemcide yakın olmalı (< 4 m)', { dA, dB });
  await evalJS(B, (id) => window.__game.session.act('animal_hit', { id, dmg: 999 }), deer.id);
  const deadA = await until(A, (id) => { const a = window.__game.session.npcs.animals.find((q) => q.id === id); return !a || a.dead; }, deer.id, 60000);
  const deadB = await until(B, (id) => { const a = window.__game.session.npcs.animals.find((q) => q.id === id); return !a || a.dead; }, deer.id, 60000);
  check(deadA && deadB, 'istemcinin vuruşu hayvanı host\'ta öldürmeli, istemcide de ölü görünmeli', { deadA, deadB });
  // saldıran yaban domuzu: hasar istemciye ulaşır
  await evalJS(B, () => { const S = window.__game.session; window.__dmg = []; const orig = S.applyEvent.bind(S); S.applyEvent = (e) => { if (e.k === 'dmg_player') window.__dmg.push([e.from, e.amount]); return orig(e); }; S.localStats.health = S.localStats.maxHealth; });
  const boar = await evalJS(A, (bid) => { const S = window.__game.session; const r = S.players.get(bid); const a = S.npcs.spawnAnimal('boar', r.pos.x + 2.5, r.pos.z + 1); a.state = 'attack'; a.target = bid; return a.id; }, bId);
  const hurt = await until(B, (id) => (window.__dmg || []).some((d) => d[0] === id), boar, 240000);
  log('domuz hasarı (B olayları)', await evalJS(B, () => window.__dmg.slice(0, 4)), 'B can', await evalJS(B, () => Math.round(window.__game.session.localStats.health)));
  check(hurt, 'host\'taki hayvanın saldırısı uzak oyuncuya hasar olarak ulaşmalı');
  await evalJS(A, (id) => { const S = window.__game.session; S.npcs.hitAnimal(id, 999, null); }, boar);
  // ------------------------------------------------------------------ tüccar stoğu
  const trade = await evalJS(A, () => { const S = window.__game.session; const st = S.npcs.tradeStock('riza'); const it = st.find((x) => x.qty > 1) || st[0]; return { id: it.id, qty: it.qty, day: S.time.day }; });
  await evalJS(B, (t) => { const S = window.__game.session; S.giveLocal('money', 100); window.__money0 = S.inventory.count('money'); window.__item0 = S.inventory.count(t.id); S.act('trade_buy', { npc: 'riza', day: t.day, id: t.id, price: 10 }); }, trade);
  const bought = await until(B, (t) => window.__game.session.inventory.count(t.id) === window.__item0 + 1, trade, 60000);
  const tB = await evalJS(B, (t) => { const S = window.__game.session; return { money: S.inventory.count('money') - window.__money0, item: S.inventory.count(t.id) - window.__item0, stock: S.npcs.tradeStock('riza', t.day).find((x) => x.id === t.id).qty }; }, trade);
  const tA = await evalJS(A, (t) => window.__game.session.npcs.tradeStock('riza', t.day).find((x) => x.id === t.id).qty, trade);
  log('takas', trade, 'B', tB, 'A stok', tA);
  check(bought && tB.money === -10 && tB.item === 1, 'istemci para ödeyip eşyayı almalı', tB);
  check(tA === trade.qty - 1 && tB.stock === tA, 'stok host ve istemcide birlikte düşmeli', { before: trade.qty, A: tA, B: tB.stock });
  // ------------------------------------------------------------------ eylem klibi başlangıç ofseti
  // ısınma: uzak avatar ilk gördüğü eylemi, süresi dolmuşsa bilerek oynatmaz (yeni katılan eski eylemleri görmesin).
  // Yazılım GPU'sunda bu 6 oyunculu ortamda host karesi ~2 sn sürebildiği için 2,5 sn'lik eylem istemciye ilk kez
  // ulaştığında bitmiş sayılabiliyordu. Önce kısa bir eylemle B'nin A'nın eylem sırasını görmesi beklenir; ölçülen
  // eylem sonra gelir (sıra numarası değişince süresi ne olursa olsun ofsetle oynatılır).
  await evalJS(A, () => window.__game.session.local.avatar.play('pickup', 0.6));
  await until(B, (hid) => { const p = window.__game.session.players.get(hid); return !!(p && p.avatar && p.avatar._ractN !== undefined); }, aId, 60000);
  await evalJS(B, (hid) => { const av = window.__game.session.players.get(hid).avatar; window.__offs = []; const orig = av.play.bind(av); av.play = (t, d, k, off) => { window.__offs.push([t, Math.round((off || 0) * 1000) / 1000]); return orig(t, d, k, off); }; }, aId);
  await evalJS(A, () => window.__game.session.local.avatar.play('search', 2.5));
  const gotAct = await until(B, () => (window.__offs || []).some((o) => o[0] === 'search'), null, 60000);
  const offs = await evalJS(B, () => window.__offs);
  log('uzak eylem (tür, ofset sn)', offs);
  check(gotAct && offs.some((o) => o[0] === 'search' && o[1] > 0), 'uzak avatar eylemi başlangıç ofsetiyle oynatmalı', offs);
  await evalJS(F, () => { for (const f of window.__fakes) f.leave(); });
};
