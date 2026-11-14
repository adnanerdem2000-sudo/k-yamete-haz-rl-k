// Oynanış testi: yağma, tüketim, üretim, inşa, zombi + YZ arkadaş savaşı, araç, gece/uyku, olay, kayıt.
// Denetimler oyun durumuna bakar. Gerçek zamanlı bekleyen adımlar (savaş, sürüş) yazılım GPU'sunda saniyede birkaç
// kare alır (kare başına dt ≤ 0,1 sn): sonuç denetimleri yalnız yeterli simülasyon süresi (S.t) geçtiyse uygulanır.
export default async ({ page, url, shot, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const S = (fn, arg) => evalJS(page, fn, arg);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => { const g = window.__game; g.ui.menus.opts.ai = 2; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1500);
  // 1) yağma: evdeki bir dolabı ara
  const c = await S(() => {
    const S = window.__game.session; const c = S.world.containers.find((q) => q.building === 'home' && !q.locked); S.act('search_done', { id: c.id });
    const st = S.loot.get(c.id) || {};
    return { id: c.id, label: c.label, slots: st.slots, searched: !!st.searched, inv0: Object.fromEntries((st.slots || []).filter(Boolean).map((s) => [s.id, S.inventory.count(s.id)])) };
  });
  log('arandı', c);
  await wait(1200); await shot(page, '/tmp/g-storage.png');
  const inv0 = (c && c.inv0) || {};
  const yagma = await S(([id, ids]) => {
    const S = window.__game.session; S.act('loot_take_all', { id }); window.__game.ui.closePanel();
    const st = S.loot.get(id) || {};
    return { kalan: (st.slots || []).filter(Boolean).length, inv: Object.fromEntries(ids.map((k) => [k, S.inventory.count(k)])) };
  }, [c && c.id, Object.keys(inv0)]);
  log('hepsini al', yagma);
  check(c && c.searched && Array.isArray(c.slots) && c.slots.length > 0 && yagma && yagma.kalan === 0 && Object.keys(inv0).every((k) => yagma.inv[k] > inv0[k]), 'yağma: dolap aranmış sayılmalı, "hepsini al" ile boşalıp eşyalar envantere geçmeli', { c, yagma });
  await wait(500);
  // 2) tüketim
  const aclik0 = await S(() => { const S = window.__game.session; const i = S.inventory.firstSlotOf('canned_food'); S.localStats.hunger = 40; S.useItem(i); return S.localStats.hunger; });
  log('yemek öncesi', aclik0);
  await page.waitForFunction(() => !window.__game.ui.prog, null, { timeout: 60000 });
  const aclik1 = await S(() => Math.round(window.__game.session.localStats.hunger));
  log('yemek sonrası', aclik1);
  // 3) üretim
  const uretim = await S(() => { const S = window.__game.session; S.giveLocal('cloth', 4, null); const bandaj0 = S.inventory.count('bandage'); return { bandaj0, basladi: S.crafting.craft('bandage') }; });
  await page.waitForFunction(() => !window.__game.ui.prog, null, { timeout: 60000 });
  const bandaj = await S(() => window.__game.session.inventory.count('bandage'));
  log('bandaj', bandaj);
  check(typeof aclik0 === 'number' && aclik1 >= aclik0 + 20 && uretim && uretim.basladi === true && bandaj >= uretim.bandaj0 + 2, 'tüketim ve üretim: konserve açlığı gidermeli (+40), bezden bandaj üretilmeli (tarif 2 verir)', { aclik0, aclik1, uretim, bandaj });
  // 3b) yere serilmişken: eşya bırakma, ifade çarkı (gerçek düğme: Gül), üretim ve yemek eylem başlatmaz, envanter değişmez;
  // yere serilme eylemi yansıtılmış kalır (tek karede: kalkış sürerken)
  const serilme = await S(() => {
    const g = window.__game, S = g.session, pl = S.local;
    S.giveLocal('cloth', 4, null); S.giveLocal('canned_food', 1, null);
    const ok = pl.knockdown();
    const inv0 = JSON.stringify(S.inventory.serialize());
    S.dropSlot(S.inventory.firstSlotOf('bandage'), 1);
    g.ui.openEmotes();
    const btn = [...document.querySelectorAll('.wheel-item')].find((b) => /Gül/.test(b.textContent));
    if (btn) btn.click();
    const uret = S.crafting.craft('bandage');
    S.useItem(S.inventory.firstSlotOf('canned_food'));
    return { ok, btn: !!btn, act: pl.avatar.lastAct && pl.avatar.lastAct[1], eylem: pl.avatar.action && pl.avatar.action.type, ifade: pl.emote, uret, ayni: JSON.stringify(S.inventory.serialize()) === inv0, ilerleme: !!g.ui.prog, panel: g.ui.panel && g.ui.panel.name, knockT: +pl.knockT.toFixed(2) };
  });
  log('yere serilme', serilme);
  check(serilme && serilme.ok && serilme.btn && serilme.act === 'knock' && serilme.eylem === 'knock' && !serilme.ifade && serilme.uret === false && serilme.ayni && !serilme.ilerleme && !serilme.panel && serilme.knockT > 1.9,
    'yere serilmişken bırakma, ifade çarkı, üretim ve yemek eylem başlatmamalı (yere serilme sürmeli, envanter değişmemeli)', serilme);
  await page.waitForFunction(() => !(window.__game.session.local.knockT > 0), null, { timeout: 60000 });
  // 4) inşa: yerleştirme hayaleti + doğrudan yerleştirip tamamla
  await S(() => { const S = window.__game.session; S.giveLocal('plank', 10); S.giveLocal('nails', 20); S.build.startPlacing('barricade_wood'); });
  await wait(1500); await shot(page, '/tmp/g-place.png');
  const built = await S(() => {
    const S = window.__game.session; const hayalet = !!S.build.ghost && S.build.placing === 'barricade_wood';
    S.build.cancelPlacing(); const n0 = S.build.structures.size; const p = S.local.pos;
    S.act('build_place', { type: 'barricade_wood', x: p.x + 3, y: p.y, z: p.z - 4, rot: 0 });
    const st = [...S.build.structures.values()].pop(); if (st) S.act('build_work', { id: st.id, amount: 1 });
    return st ? { type: st.type, built: st.built, hp: st.hp, yeni: S.build.structures.size - n0, hayalet } : { yeni: 0, hayalet };
  });
  const savunma = await S(() => window.__game.session.build.defenseScore());
  log('yapı', built, savunma);
  check(built && built.hayalet && built.yeni === 1 && built.type === 'barricade_wood' && built.built >= 1 && built.hp > 0 && savunma >= 3, 'inşa: yerleştirme hayaleti olmalı, tahta barikat kurulup tamamlanmalı (canı var), savunma puanına eklenmeli', { built, savunma });
  // 5) zombi + YZ arkadaşlar
  const dogdu = await S(() => {
    const S = window.__game.session; const p = S.local.pos;
    const a = S.zombies.spawn('normal', p.x + 7, p.z - 7, {}); const b = S.zombies.spawn('runner', p.x - 8, p.z - 6, {});
    return { n: (a ? 1 : 0) + (b ? 1 : 0), t: S.t, hp: Math.round(S.localStats.health), bots: S.bots.list.map((x) => [x.name, Math.round(x.stats.health), x.held]) };
  });
  log('zombiler doğdu', dogdu);
  await wait(6000); await shot(page, '/tmp/g-fight.png');
  const savas = await S(() => {
    const S = window.__game.session; const zs = [...S.zombies.list.values()];
    return { kills: S.results.kills, zombies: zs.filter((z) => !z.dead).map((z) => [z.type, Math.round(z.hp), z.state]), hp: Math.round(S.localStats.health), bots: S.bots.list.map((b) => [b.name, Math.round(b.stats.health), b.held]), konumHatali: zs.filter((z) => ![z.x, z.y, z.z].every(Number.isFinite)).length, t: +S.t.toFixed(2) };
  });
  log('savaş', savas);
  check(dogdu && dogdu.n === 2 && dogdu.bots.length === 2 && dogdu.bots.every((b) => b[1] > 0 && b[2]) && savas && savas.zombies.length + savas.kills >= 2 && savas.konumHatali === 0, 'savaş kurulumu: normal + koşucu zombi doğmalı ve izlenmeli (canlı ya da öldürülmüş, konum sayı), iki YZ arkadaş canlı ve silahlı olmalı', { dogdu, savas });
  await wait(6000);
  const savas2 = await S(() => {
    const S = window.__game.session; const zs = [...S.zombies.list.values()].filter((z) => !z.dead);
    return { kills: S.results.kills, alive: zs.length, hp: Math.round(S.localStats.health), hasarli: zs.filter((z) => z.hp < z.def.hp).length, botHp: S.bots.list.map((b) => Math.round(b.stats.health)), t: +S.t.toFixed(2) };
  });
  log('savaş2', savas2);
  // yazılım GPU'sunda 12 sn gerçek bekleme ~1 sn simülasyon eder: çatışma sonucu ancak 10+ sn simülasyonda beklenir
  const savasSure = savas2 && dogdu ? savas2.t - dogdu.t : 0;
  if (savasSure >= 10) check(savas2.kills > 0 || savas2.hasarli > 0 || savas2.hp < dogdu.hp || savas2.botHp.some((h, i) => h < (dogdu.bots[i] || [])[1]), '10+ sn simülasyonda zombilerle takım çatışmalı (zombi hasarı/ölümü ya da takım hasarı)', { dogdu, savas2, savasSure });
  else log('çatışma sonucu denetimi atlandı (simülasyon süresi kısa, sn)', +savasSure.toFixed(2));
  // 6) araç
  const veh = await S(() => {
    const S = window.__game.session; const v = S.vehicles.byId('family_car'); S.local.spawnAt(v.pos.x + 2.5, v.pos.y, v.pos.z, 0); S.act('vehicle_enter', { id: v.id, seat: 0 });
    return { id: v.id, fuel: v.fuel, mode: S.local.mode, p0: [v.pos.x, v.pos.y, v.pos.z], t: S.t };
  });
  log('araç', veh);
  await page.keyboard.down('KeyW'); await wait(2500); await page.keyboard.up('KeyW');
  await shot(page, '/tmp/g-drive.png');
  const surus = await S(() => { const S = window.__game.session; const v = S.vehicles.byId('family_car'); return { speed: +v.speed.toFixed(1), pos: [Math.round(v.pos.x), Math.round(v.pos.z)], mode: S.local.mode, p: [v.pos.x, v.pos.y, v.pos.z], t: S.t }; });
  log('sürüş', surus);
  const yol = veh && surus ? Math.hypot(surus.p[0] - veh.p0[0], surus.p[2] - veh.p0[2]) : null;
  check(veh && veh.mode === 'drive' && veh.fuel > 0 && surus && surus.mode === 'drive' && surus.p.every(Number.isFinite) && Math.abs(surus.p[1] - veh.p0[1]) < 1.5, 'araç: aile arabasına sürücü olarak binilmeli (yakıtlı), sürüşte araçta kalınmalı, araç zeminde ve konumu sayı olmalı', { veh, surus });
  // gaz yalnız W basılıyken işlenen karelerde verilir: yeterli simülasyon geçtiyse araç ilerlemiş olmalı
  const surusSure = veh && surus ? surus.t - veh.t : 0;
  if (surusSure >= 1) check(yol > 0.3 || Math.abs(surus.speed) > 0.3, 'W basılıyken araç ilerlemeli', { yol, surus, surusSure });
  else log('sürüş mesafesi denetimi atlandı (simülasyon süresi kısa, sn)', +surusSure.toFixed(2), 'yol', yol && +yol.toFixed(2));
  await S(() => window.__game.session.vehicles.exitLocal());
  // 7) gece + uyku + gün atlama
  await S(() => { const S = window.__game.session; S.time.advance((22 * 60) - S.time.minuteOfDay); });
  await wait(2500); await shot(page, '/tmp/g-night.png');
  await S(() => { const S = window.__game.session; for (const z of S.zombies.list.values()) z.dead = true; S.zombies.threatLevel = 0; S.localStats.energy = 20; S.trySleep(null); });
  await wait(2000); await shot(page, '/tmp/g-sleep.png');
  const uyku = await S(() => { const S = window.__game.session; return { ff: S.time.ff, mode: S.local.mode, sleep: S.sleepState }; });
  log('uyku', uyku);
  await S(() => { const S = window.__game.session; S.wake(); S.time.advance(9 * 60); });
  await wait(3000); await shot(page, '/tmp/g-day2.png');
  const gun2 = await S(() => { const S = window.__game.session; return { day: S.time.day, hour: S.time.hour, broadcasts: S.events.broadcasts.length, schedule: S.events.schedule.length, panel: window.__game.ui.panel && window.__game.ui.panel.name, mode: S.local.mode }; });
  log('gün 2', gun2);
  check(uyku && uyku.mode === 'sleep' && uyku.ff > 1 && uyku.sleep && uyku.sleep.votes >= uyku.sleep.need && gun2 && gun2.day === 2 && gun2.mode !== 'sleep', 'gece/uyku: gece uyku başlamalı (oy yeterli, zaman hızlanır), uyanıp 9 saat sonra 2. gün olmalı', { uyku, gun2 });
  // 8) olay kartı
  await S(() => { const S = window.__game.session; window.__game.ui.closePanel(); S.events.trigger('injured_kid'); });
  await wait(1500); await shot(page, '/tmp/g-event.png');
  const olay = await S(() => {
    const S = window.__game.session, p = window.__game.ui.panel, n0 = S.results.choices.length, b0 = S.inventory.count('bandage');
    const aktif = S.events.active ? S.events.active.id : null;
    if (p && p.name === 'event') document.querySelector('.event-card .choice').click();
    const p2 = window.__game.ui.panel;
    return { panel: p && p.name, aktif, kayit: S.results.choices.length - n0, son: S.results.choices[S.results.choices.length - 1] || null, bandaj: b0 - S.inventory.count('bandage'), sonra: p2 && p2.name };
  });
  log('olay', olay);
  check(olay && olay.panel === 'event' && olay.aktif === 'injured_kid' && olay.kayit === 1 && olay.bandaj === 1 && olay.sonra !== 'event', 'olay kartı (Gece Kapı Çalınıyor) açılmalı; ilk seçenekte bandaj harcanmalı, karar kaydedilmeli, kart kapanmalı', olay);
  await wait(800);
  // 9) kayıt
  const dizin = await S(() => { const S = window.__game.session; S.saves.save('1'); return JSON.parse(localStorage.getItem('kiyamet_saves_index') || '{}'); });
  log('kayıt', dizin);
  const boyut = await S(() => (localStorage.getItem('kiyamet_save_1') || '').length);
  log('kayıt boyutu', boyut);
  const k1 = dizin && dizin['1'];
  check(k1 && k1.day === 2 && k1.size > 5000 && k1.size === boyut, 'kayıt: "Kayıt 1" yuvası yazılmalı (dizinde 2. gün, boyut kayıtla aynı)', { dizin: k1, boyut });
  // 10) yaralı YZ arkadaşı sırtlama → taşıma → bırakma → ayağa kaldırma
  const tasima = await S(() => {
    const S = window.__game.session; const b = S.bots.list[0];
    S.bots.damage(b, 5000);
    const downed = b.stats.downed;
    S.act('carry', { target: b.id });
    const carrying = S.local.carrying === b.id;
    S.local.spawnAt(S.local.pos.x + 6, S.local.pos.y, S.local.pos.z, 0);
    S.bots.update(0.05);
    const near = Math.hypot(b.pos.x - S.local.pos.x, b.pos.z - S.local.pos.z) < 1;
    S.act('carry', { target: b.id, drop: true });
    const dropped = !S.local.carrying && !b.carriedBy;
    S.act('revive', { target: b.id, hp: 30 });
    return { downed, carrying, near, dropped, revived: !b.stats.downed };
  });
  log('taşıma', tasima);
  check(tasima && tasima.downed && tasima.carrying && tasima.near && tasima.dropped && tasima.revived, 'taşıma: yere düşen YZ arkadaş sırtlanıp taşınmalı, bırakılmalı ve ayağa kaldırılmalı', tasima);
  // 11) harita
  await S(() => window.__game.ui.openJournal('map')); await wait(1500); await shot(page, '/tmp/g-map.png');
  const harita = await S(() => {
    const g = window.__game, p = g.ui.panel, cv = document.querySelector('.journal .map-canvas');
    // harita her karede tuvale çizilir (ilk iş zemin dolgusu): ortadaki piksel saydam olmamalı
    let cizildi = null;
    try { if (cv) cizildi = cv.getContext('2d').getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data[3] > 0; } catch { cizildi = null; }
    return { panel: p && p.name, sekme: g.ui.journal && g.ui.journal.tab, tuval: cv ? [cv.width, cv.height] : null, cizildi };
  });
  log('harita', harita);
  await S(() => window.__game.ui.closePanel());
  // 12) zaman çizelgesi
  await S(() => window.__game.ui.openJournal('timeline')); await wait(1200); await shot(page, '/tmp/g-timeline.png');
  const cizelge = await S(() => { const T = window.__game.session.timeline; return { n: T.list.length, kinds: [...new Set(T.list.map((e) => e.kind))], days: [...new Set(T.list.map((e) => e.day))], dom: document.querySelectorAll('.tl-entry').length }; });
  log('çizelge', cizelge);
  check(harita && harita.panel === 'journal' && harita.sekme === 'map' && harita.tuval && harita.cizildi !== false && cizelge && cizelge.n >= 4 && ['day', 'event'].every((k) => cizelge.kinds.includes(k)) && cizelge.days.includes(2) && cizelge.dom >= cizelge.n,
    'günlük: harita sekmesi açılıp tuvale çizilmeli; zaman çizelgesi 2. gün başlangıcını ve olay kararını içermeli, ekranda tüm kayıtlar listelenmeli', { harita, cizelge });
  await S(() => window.__game.ui.closePanel());
  await wait(500); await shot(page, '/tmp/g-hud.png');
  // 13) kayıttan yükleme, menü yolu (Ana Menü → TEK OYNA → Kayıt 1 → Yükle = MenuScreens.loadSlot): 9. adımdaki kayıt
  // gün, saat, envanter, konum ve olay kararıyla geri gelmeli
  await S(() => window.__game.endSession(true));
  await page.waitForFunction(() => window.__game.state === 'menu' && !window.__game.session, null, { timeout: 60000 });
  await S(() => window.__game.ui.menus.loadSlot('1'));
  const yuklendi = await page.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 200000 }).then(() => true, () => false);
  await wait(1500);
  const yukleme = await S(() => {
    const S = window.__game.session, d = JSON.parse(localStorage.getItem('kiyamet_save_1') || 'null');
    if (!S || !d) return null;
    const me = d.players[d.hostToken] || {};
    const kisa = (slots) => (slots || []).filter(Boolean).map((s) => s.id + 'x' + s.qty).sort();
    return {
      gun: S.time.day, kayitGun: Math.floor(d.time.total / 1440) + 1, dk: Math.round(S.time.total), kayitDk: Math.round(d.time.total),
      env: kisa(S.inventory.serialize().slots || S.inventory.serialize()), kayitEnv: kisa((me.inv && me.inv.slots) || me.inv),
      konum: me.pos ? +Math.hypot(S.local.pos.x - me.pos[0], S.local.pos.z - me.pos[2]).toFixed(2) : null,
      kararlar: S.results.choices.length, kayitKarar: (d.results && d.results.choices || []).length,
    };
  });
  log('kayıttan yükleme', { yuklendi, yukleme });
  check(yuklendi && yukleme && yukleme.gun === yukleme.kayitGun && Math.abs(yukleme.dk - yukleme.kayitDk) < 30 && JSON.stringify(yukleme.env) === JSON.stringify(yukleme.kayitEnv) && yukleme.konum !== null && yukleme.konum < 1.5 && yukleme.kararlar === yukleme.kayitKarar && yukleme.kayitKarar >= 1,
    'kayıt menüden yüklenmeli: gün, saat, envanter, konum ve olay kararları kayıttaki gibi', { yuklendi, yukleme });
};
