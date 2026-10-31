// Oynanış testi: yağma, tüketim, üretim, inşa, zombi + YZ arkadaş savaşı, araç, gece/uyku, olay, kayıt.
export default async ({ page, url, shot, wait, evalJS, log }) => {
  const S = (fn, arg) => evalJS(page, fn, arg);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => { const g = window.__game; g.ui.menus.opts.ai = 2; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1500);
  // 1) yağma: evdeki bir dolabı ara
  const c = await S(() => { const S = window.__game.session; const c = S.world.containers.find((q) => q.building === 'home' && !q.locked); S.act('search_done', { id: c.id }); return { id: c.id, label: c.label, slots: (S.loot.get(c.id) || {}).slots }; });
  log('arandı', c);
  await wait(1200); await shot(page, '/tmp/g-storage.png');
  await S((id) => { window.__game.session.act('loot_take_all', { id }); window.__game.ui.closePanel(); }, c.id);
  await wait(500);
  // 2) tüketim
  log('yemek öncesi', await S(() => { const S = window.__game.session; const i = S.inventory.firstSlotOf('canned_food'); S.localStats.hunger = 40; S.useItem(i); return S.localStats.hunger; }));
  await page.waitForFunction(() => !window.__game.ui.prog, null, { timeout: 60000 });
  log('yemek sonrası', await S(() => Math.round(window.__game.session.localStats.hunger)));
  // 3) üretim
  await S(() => { const S = window.__game.session; S.giveLocal('cloth', 4, null); S.crafting.craft('bandage'); });
  await page.waitForFunction(() => !window.__game.ui.prog, null, { timeout: 60000 });
  log('bandaj', await S(() => window.__game.session.inventory.count('bandage')));
  // 4) inşa: yerleştirme hayaleti + doğrudan yerleştirip tamamla
  await S(() => { const S = window.__game.session; S.giveLocal('plank', 10); S.giveLocal('nails', 20); S.build.startPlacing('barricade_wood'); });
  await wait(1500); await shot(page, '/tmp/g-place.png');
  const built = await S(() => { const S = window.__game.session; S.build.cancelPlacing(); const p = S.local.pos; S.act('build_place', { type: 'barricade_wood', x: p.x + 3, y: p.y, z: p.z - 4, rot: 0 }); const st = [...S.build.structures.values()].pop(); if (st) S.act('build_work', { id: st.id, amount: 1 }); return st ? { type: st.type, built: st.built } : null; });
  log('yapı', built, await S(() => window.__game.session.build.defenseScore()));
  // 5) zombi + YZ arkadaşlar
  await S(() => { const S = window.__game.session; const p = S.local.pos; S.zombies.spawn('normal', p.x + 7, p.z - 7, {}); S.zombies.spawn('runner', p.x - 8, p.z - 6, {}); });
  await wait(6000); await shot(page, '/tmp/g-fight.png');
  log('savaş', await S(() => { const S = window.__game.session; return { kills: S.results.kills, zombies: [...S.zombies.list.values()].filter((z) => !z.dead).map((z) => [z.type, Math.round(z.hp), z.state]), hp: Math.round(S.localStats.health), bots: S.bots.list.map((b) => [b.name, Math.round(b.stats.health), b.held]) }; }));
  await wait(6000);
  log('savaş2', await S(() => { const S = window.__game.session; return { kills: S.results.kills, alive: [...S.zombies.list.values()].filter((z) => !z.dead).length, hp: Math.round(S.localStats.health) }; }));
  // 6) araç
  const veh = await S(() => { const S = window.__game.session; const v = S.vehicles.byId('family_car'); S.local.spawnAt(v.pos.x + 2.5, v.pos.y, v.pos.z, 0); S.act('vehicle_enter', { id: v.id, seat: 0 }); return { id: v.id, fuel: v.fuel, mode: S.local.mode }; });
  log('araç', veh);
  await page.keyboard.down('KeyW'); await wait(2500); await page.keyboard.up('KeyW');
  await shot(page, '/tmp/g-drive.png');
  log('sürüş', await S(() => { const S = window.__game.session; const v = S.vehicles.byId('family_car'); return { speed: +v.speed.toFixed(1), pos: [Math.round(v.pos.x), Math.round(v.pos.z)], mode: S.local.mode }; }));
  await S(() => window.__game.session.vehicles.exitLocal());
  // 7) gece + uyku + gün atlama
  await S(() => { const S = window.__game.session; S.time.advance((22 * 60) - S.time.minuteOfDay); });
  await wait(2500); await shot(page, '/tmp/g-night.png');
  await S(() => { const S = window.__game.session; for (const z of S.zombies.list.values()) z.dead = true; S.zombies.threatLevel = 0; S.localStats.energy = 20; S.trySleep(null); });
  await wait(2000); await shot(page, '/tmp/g-sleep.png');
  log('uyku', await S(() => { const S = window.__game.session; return { ff: S.time.ff, mode: S.local.mode, sleep: S.sleepState }; }));
  await S(() => { const S = window.__game.session; S.wake(); S.time.advance(9 * 60); });
  await wait(3000); await shot(page, '/tmp/g-day2.png');
  log('gün 2', await S(() => { const S = window.__game.session; return { day: S.time.day, hour: S.time.hour, broadcasts: S.events.broadcasts.length, schedule: S.events.schedule.length, panel: window.__game.ui.panel && window.__game.ui.panel.name }; }));
  // 8) olay kartı
  await S(() => { const S = window.__game.session; window.__game.ui.closePanel(); S.events.trigger('injured_kid'); });
  await wait(1500); await shot(page, '/tmp/g-event.png');
  await S(() => { const p = window.__game.ui.panel; if (p && p.name === 'event') document.querySelector('.event-card .choice').click(); });
  await wait(800);
  // 9) kayıt
  log('kayıt', await S(() => { const S = window.__game.session; S.saves.save('1'); return JSON.parse(localStorage.getItem('kiyamet_saves_index') || '{}'); }));
  log('kayıt boyutu', await S(() => (localStorage.getItem('kiyamet_save_1') || '').length));
  // 10) yaralı YZ arkadaşı sırtlama → taşıma → bırakma → ayağa kaldırma
  log('taşıma', await S(() => {
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
  }));
  // 11) harita
  await S(() => window.__game.ui.openJournal('map')); await wait(1500); await shot(page, '/tmp/g-map.png');
  await S(() => window.__game.ui.closePanel());
  // 12) zaman çizelgesi
  await S(() => window.__game.ui.openJournal('timeline')); await wait(1200); await shot(page, '/tmp/g-timeline.png');
  log('çizelge', await S(() => { const T = window.__game.session.timeline; return { n: T.list.length, kinds: [...new Set(T.list.map((e) => e.kind))], days: [...new Set(T.list.map((e) => e.day))], dom: document.querySelectorAll('.tl-entry').length }; }));
  await S(() => window.__game.ui.closePanel());
  await wait(500); await shot(page, '/tmp/g-hud.png');
};
