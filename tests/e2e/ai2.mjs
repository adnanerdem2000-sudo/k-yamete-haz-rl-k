// Zombi ve bot YZ 2 (Aşama 6): üst üste binme yok (sürü ayrışması), oyuncunun içinden geçmeme, şişeyle dikkat
// dağıtma (kırılma sesi → zombiler araştırır), bot emirleri: yağma (konteyner arar, eşya çantaya girer), inşaat
// (bitmemiş yapıyı tamamlar), takım ekranı emir metni. Sabit adımlı döngü (physics senaryosu gibi).
export default async ({ page, url, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 2; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  await evalJS(page, () => {
    const g = window.__game, S = g.session; cancelAnimationFrame(g.raf); g.loop = () => {};
    g.ui.onLockChange = () => {};
    for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel();
    window.__step = (frames, keys = [], each = null) => { const inp = g.input; for (let i = 0; i < frames; i++) { inp.down.clear(); for (const k of keys) inp.down.add(k); S.update(1 / 60); if (each) each(i); inp.endFrame(); } };
    S.dayThreats.t = 1e9; // gündüz tehditleri (yağmacı devriyesi, başıboş köpek) bu senaryonun konusu değil: daynight denetler
    // botlar bütün yaralarından arınır (bot adımlarından önce: önceki adımlardaki ısırık ve kanama emri bozmasın)
    window.__healBots = () => { for (const bt of S.bots.list) { const down = bt.stats.downed; bt.stats.revive(bt.stats.maxHealth || 100); bt.stats.cond.infection = 0; bt.stats.cond.poisoned = 0; if (down) { bt.mode = 'ground'; bt.downT = 0; } } };
    // 1–3. adımlar yalnız zombi davranışını ölçer: takipçi botlar zombilerle dövüşüp sonucu bozmasın diye 60+ m
    // uzakta beklesin (su ve bina dışında bir yer)
    const pl = S.local;
    let spot = null;
    for (let k = 0; k < 16 && !spot; k++) { const a = (k / 16) * Math.PI * 2, x = pl.pos.x + Math.cos(a) * 75, z = pl.pos.z + Math.sin(a) * 75; if (!S.world.terrain.isWater(x, z) && !S.world.buildingAt(x, z)) spot = { x, z }; }
    S.bots.list.forEach((bt, i) => { if (spot) { const x = spot.x + i * 2, z = spot.z; bt.pos.set(x, S.world.physics.groundHeight(x, z, S.world.terrain.heightAt(x, z) + 2), z); bt.path = null; } S.applyAction('bot_order', { id: bt.id, order: 'stay' }, S.localId); });
  });
  // 1) ayrışma: 12 zombi aynı noktaya doğar, 3 sn sonra en yakın çift ≥ 0,45 m
  const sep = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const x = pl.pos.x + 12, z = pl.pos.z + 12;
    const ids = [];
    for (let i = 0; i < 12; i++) { const zb = S.zombies.spawn('normal', x + (i % 3) * 0.1, z + Math.floor(i / 3) * 0.1, {}); if (zb) { zb.state = 'wander'; zb.target = null; ids.push(zb.id); } }
    window.__step(180);
    let minD = 99, pairs = 0;
    const zs = ids.map((id) => S.zombies.list.get(id)).filter(Boolean);
    for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) { const d = Math.hypot(zs[i].x - zs[j].x, zs[i].z - zs[j].z); minD = Math.min(minD, d); if (d < 0.45) pairs++; }
    return { n: zs.length, minD: +minD.toFixed(2), ustUste: pairs };
  });
  log('ayrışma', sep);
  check(sep.n >= 10 && sep.minD >= 0.45 && sep.ustUste === 0, 'zombiler üst üste binmemeli (≥ 0,45 m)', sep);
  // 2) oyuncunun içinden geçmeme: zombi oyuncuya kovalarken 3 sn boyunca mesafe ≥ 0,6 m
  const pass = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    for (const z of S.zombies.list.values()) z.dead = true; // öncekileri temizle
    const zb = S.zombies.spawn('normal', pl.pos.x + 3, pl.pos.z, { chase: S.localId });
    let minD = 99;
    window.__step(180, [], () => { if (zb && !zb.dead) minD = Math.min(minD, Math.hypot(zb.x - pl.pos.x, zb.z - pl.pos.z)); });
    return { minD: +minD.toFixed(2), state: zb && zb.state };
  });
  log('içinden geçme', pass);
  check(pass.minD >= 0.6, 'zombi oyuncunun içine girmemeli (≥ 0,6 m)', pass);
  // 3) dikkat dağıtma: boş şişe fırlat → kırılma sesi → yakın zombi 'investigate' ile sesin yakınına gider
  const lure = await evalJS(page, async () => {
    const S = window.__game.session, pl = S.local;
    const { makeStack, ITEMS } = await import('/src/data/items.js');
    for (const z of S.zombies.list.values()) z.dead = true;
    window.__step(5);
    const zb = S.zombies.spawn('normal', pl.pos.x + 14, pl.pos.z + 2, {}); zb.state = 'idle'; zb.target = null; zb.alert = 0;
    // zombi oyuncuya sırtı dönük: doğuşta yönü rastgele (görüş konisi ±1,25 rad), oyuncuya bakarsa sesten önce onu görüp
    // kovalıyordu (kovalayan zombi 8 m'den uzak sesleri yok sayar) — denetim sesin araştırılmasını ölçer
    zb.yaw = Math.atan2(zb.x - pl.pos.x, zb.z - pl.pos.z);
    S.inventory.addStack(makeStack('empty_bottle', 2));
    const slot = S.inventory.slots.findIndex((s) => s && s.id === 'empty_bottle');
    S.selectHotbar(slot);
    // kamera +x yönüne baksın, fırlat (sol tık = fire)
    pl.yaw = Math.PI / 2; pl.camYaw = pl.yaw + Math.PI; pl.camPitch = -0.1;
    const before = S.inventory.count('empty_bottle');
    S.combat.cool = 0;
    S.combat.throwItem(S.inventory.slots[slot], ITEMS.empty_bottle);
    let landed = null, investigated = false, dmin = 99;
    window.__step(240, [], () => { if (!landed && S.combat.projectiles.length === 0) landed = { x: pl.pos.x, z: pl.pos.z }; if (zb.state === 'investigate') investigated = true; if (zb.target && zb.target.kind === 'pos') dmin = Math.min(dmin, Math.hypot(zb.x - zb.target.x, zb.z - zb.target.z)); });
    return { atildi: before - S.inventory.count('empty_bottle'), investigated, state: zb.state, hedefMesafe: dmin === 99 ? null : +dmin.toFixed(1), zx: +zb.x.toFixed(1), px: +pl.pos.x.toFixed(1) };
  });
  log('şişe', lure);
  check(lure.atildi === 1 && lure.investigated, 'şişe kırılınca zombi sesi araştırmalı', lure);
  // 4) bot yağma emri: botun 10 m yakınına aranmamış konteyner olan bir noktaya ışınla, emir ver, 30 sn sim
  const loot = await evalJS(page, () => {
    const S = window.__game.session, b = S.bots.list[0];
    if (!b) return { err: 'bot yok' };
    for (const id of [...S.zombies.list.keys()]) S.zombies.removeZombie(id); // önceki testlerin zombileri botlara saldırmasın
    window.__healBots();
    const home = S.world.home;
    const c = S.world.containers.find((q) => q.building === 'home' && !(S.loot.state.get(q.id) || {}).searched && q.type !== 'safe' && home.roomAt(q.x, q.z));
    if (!c) return { err: 'ev konteyneri yok' };
    const room = home.roomAt(c.x, c.z);
    const cx = (room.minX + room.maxX) / 2, cz = (room.minZ + room.maxZ) / 2;
    b.pos.set(cx, home.floorY, cz); b.path = null;
    S.local.spawnAt(cx + 0.8, home.floorY + 0.1, cz + 0.8, 0);
    const inv0 = b.inv.reduce((a, s) => a + s.qty, 0);
    S.applyAction('bot_order', { id: b.id, order: 'loot' }, S.localId);
    let searched = false; let t = 0;
    window.__step(1800, [], () => { t++; if (!searched && (S.loot.state.get(c.id) || {}).searched) searched = t; });
    const inv1 = b.inv.reduce((a, s) => a + s.qty, 0);
    const aranan = [...(b.lootDone || [])].filter((id) => (S.loot.state.get(id) || {}).searched).length;
    return { order: b.order, searchedAt: searched ? +(searched / 60).toFixed(1) : null, hedefKonteyner: c.id, oda: room.type, botArananlar: aranan, cantaOnce: inv0, cantaSonra: inv1, lootDone: b.lootDone ? b.lootDone.size : null, downed: b.stats.downed };
  });
  log('yağma emri', loot);
  check(loot && !loot.err && loot.botArananlar >= 1 && loot.cantaSonra >= loot.cantaOnce, 'bot yağma emrinde konteyner aramalı ve eşyaları almalı', loot);
  // 5) bot inşaat emri: yarım bir tahta duvar yerleştir, emir ver, 30 sn sonra tamamlanmış olmalı
  const build = await evalJS(page, () => {
    const S = window.__game.session, b = S.bots.list[0];
    if (!b) return { err: 'bot yok' };
    for (const id of [...S.zombies.list.keys()]) S.zombies.removeZombie(id);
    window.__healBots();
    const home = S.world.home, fr = home.frame;
    // evin önünde geçerli bir yer: birkaç aday dene (bahçe, yol kenarı değil)
    let st = null, p = null, y = 0;
    for (const [tx, tz] of [[home.tpl.w / 2, home.tpl.d + 6], [home.tpl.w / 2 + 4, home.tpl.d + 7], [home.tpl.w / 2 - 4, home.tpl.d + 7], [-5, home.tpl.d / 2], [home.tpl.w + 5, home.tpl.d / 2]]) {
      p = fr.pt(tx, tz); y = S.world.terrain.heightAt(p.x, p.z);
      S.applyAction('build_place', { type: 'wood_fence', x: p.x, y, z: p.z, rot: 0 }, S.localId);
      st = [...S.build.structures.values()].find((q) => q.type === 'wood_fence' && Math.hypot(q.x - p.x, q.z - p.z) < 1);
      if (st) break;
    }
    if (!st) return { err: 'yapı yerleşmedi' };
    b.pos.set(p.x + 3, y, p.z + 3); b.path = null;
    S.applyAction('bot_order', { id: b.id, order: 'build' }, S.localId);
    let doneAt = null, t = 0;
    window.__step(1800, [], () => { t++; if (!doneAt && st.built >= 1) doneAt = t; });
    return { order: b.order, built: +st.built.toFixed(2), doneAt: doneAt ? +(doneAt / 60).toFixed(1) : null, downed: b.stats.downed, mesafe: +Math.hypot(b.pos.x - st.x, b.pos.z - st.z).toFixed(1) };
  });
  log('inşaat emri', build);
  check(build && !build.err && build.built >= 1, 'bot inşaat emrinde yapıyı tamamlamalı', build);
  // 6) takım ekranı: bot kartında emir metni ve çanta sayısı
  const team = await evalJS(page, () => { const g = window.__game; g.ui.panels.openTeam(); const txt = [...document.querySelectorAll('.team-card')].map((e) => e.textContent); g.ui.closePanel(); return txt; });
  log('takım ekranı', team);
  check(team.some((t) => /İnşaata yardım et|Çevreyi yağmala|Takip et/.test(t) && /çanta/.test(t)), 'takım kartında bot emri ve çanta sayısı', team);
};
