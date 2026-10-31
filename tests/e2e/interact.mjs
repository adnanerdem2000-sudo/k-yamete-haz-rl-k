// Etkileşim hizası ve zaman çizelgesi: oyuncu yerdeki eşyaya yan dururken E'ye basınca önce eşyaya döner,
// eşya envantere eğilme anında (hemen değil) girer; kapı kolu uzanma anında açılır. → /tmp/interact-*.png
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  // yazılım GPU'sunda ilk kareler saniyeler sürer: fizik adımıyla bekle, ısınmayı bekle
  const steps = () => evalJS(page, () => window.__game.session.game.phys.steps);
  const simWait = async (n, timeout = 90000) => { const s0 = await steps(); await page.waitForFunction((t) => window.__game.session.game.phys.steps >= t, s0 + n, { timeout, polling: 100 }); };
  const warmup = async () => { for (let i = 0; i < 40; i++) { const a = await steps(); await wait(1000); if ((await steps()) - a >= 30) return i; } return -1; };
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel(); });
  log('ısınma (sn)', await warmup());
  // 1) yerdeki eşya: oyuncunun 1,1 m sağ ön çaprazına bırak; oyuncu +Z'ye baksın (eşya ~55° sağda)
  const r0 = await evalJS(page, async () => {
    const S = window.__game.session, pl = S.local;
    const { makeStack } = await import('/src/data/items.js');
    pl.yaw = 0; pl.camYaw = Math.PI;
    const x = pl.pos.x + Math.sin(0.95) * 1.1, z = pl.pos.z + Math.cos(0.95) * 1.1;
    S.act('ground_drop', { stack: makeStack('bandage', 1), x, y: pl.pos.y, z });
    window.__bandage0 = S.inventory.count ? S.inventory.count('bandage') : S.inventory.items().filter((s) => s.id === 'bandage').reduce((a, s) => a + s.qty, 0);
    return { ground: S.ground.items.size, yaw: +pl.yaw.toFixed(2), bandage: window.__bandage0 };
  });
  log('eşya bırakıldı', r0);
  await simWait(30);
  const tgt = await evalJS(page, () => { try { const t = window.__game.session.interact.findTarget(); return t && { kind: t.kind, label: t.label, at: t.at && [+t.at.x.toFixed(2), +t.at.z.toFixed(2)] }; } catch (e) { return { err: e.stack.split('\n').slice(0, 4).join(' | ') }; } });
  log('hedef', tgt);
  check(tgt && tgt.kind === 'ground', 'yerdeki eşya hedef olmalı', tgt);
  const count = () => evalJS(page, () => { const S = window.__game.session; return S.inventory.items().filter((s) => s.id === 'bandage').reduce((a, s) => a + s.qty, 0); });
  // E: yazılım GPU'sunda ilk kareler (gölgelendirici derlemesi) saniyeler sürebilir; etkileşim gerçekten
  // başlayana (activate çağrılana) kadar en fazla 3 kez dene
  // zamanlama simülasyon zamanıyla ölçülür (yavaş karelerde duvar saati yanıltır): etkinleşme anı + kare kaydı
  await evalJS(page, () => {
    const S = window.__game.session, I = S.interact; window.__act = 0; window.__actT = null;
    const o = I.activate.bind(I); I.activate = (t) => { window.__act++; if (window.__actT === null) window.__actT = S.t; return o(t); };
    const cnt = () => S.inventory.items().filter((q) => q.id === 'bandage').reduce((a, q) => a + q.qty, 0);
    window.__rec = []; const u0 = S.update.bind(S);
    S.update = (dt) => { u0(dt); window.__rec.push({ t: +S.t.toFixed(3), bandage: cnt(), target: window.__door ? window.__door.target : null, yaw: +S.local.yaw.toFixed(2) }); if (window.__rec.length > 2000) window.__rec.shift(); };
  });
  // kayıttan: etkinleşmeden sonra `key` alanı ilk ne zaman değişti (sim sn) ve değişmeden önceki erken kare sayısı
  const timing = (key, base) => evalJS(page, ([key, base]) => {
    const t0 = window.__actT; if (t0 === null) return { err: 'etkinleşme yok' };
    const after = window.__rec.filter((r) => r.t >= t0);
    const idx = after.findIndex((r) => r[key] !== base);
    return { t0: +t0.toFixed(2), kareler: after.length, degisim: idx < 0 ? null : +(after[idx].t - t0).toFixed(3), erkenSabit: idx < 0 ? after.length : idx, ilk: after[0] && after[0][key], son: after.length ? after[after.length - 1][key] : null };
  }, [key, base]);
  const press = async () => {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('KeyE'); await wait(140); await page.keyboard.up('KeyE');
      for (let k = 0; k < 10; k++) { await wait(60); if (await evalJS(page, () => window.__act > 0)) return true; }
    }
    return false;
  };
  const pressed = await press();
  log('E basıldı', { activate: pressed });
  await simWait(80);
  const pk = await timing('bandage', r0.bandage);
  log('alma zamanlaması (sim sn)', pk);
  check(pk.degisim !== null && pk.degisim >= 0.2 && pk.degisim <= 0.9, 'eşya hemen değil, eğilme anında (0,28–0,42 sn) envantere girmeli', pk);
  const late = { bandage: await count(), yaw: await evalJS(page, () => +window.__game.session.local.yaw.toFixed(2)), ground: await evalJS(page, () => window.__game.session.ground.items.size) };
  log('E sonrası 1,3 sn', late);
  check(late.bandage === r0.bandage + 1, 'eşya eğilme anında envantere girmeli', late);
  check(Math.abs(late.yaw - 0.95) < 0.45, 'oyuncu eşyaya dönmeli (~0,95 rad)', late);
  await shot(page, '/tmp/interact-pickup.png');
  // 2) kapı: en yakın kapının önüne, kapıya 40° açıyla dur; E → önce dön, 0,22 sn sonra kapı hareket eder
  const d0 = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const home = S.world.home;
    const d = home.doors.find((q) => !q.locked && q.exterior !== false) || S.world.doors.find((q) => !q.locked);
    if (!d) return null;
    // kapının dışında 1,2 m: kapı normali bilinmiyor → merkezden ev merkezine ters yönde dene
    const cx = (home.box.minX + home.box.maxX) / 2, cz = (home.box.minZ + home.box.maxZ) / 2;
    let nx = d.center.x - cx, nz = d.center.z - cz; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const x = d.center.x + nx * 1.2, z = d.center.z + nz * 1.2;
    pl.spawnAt(x, S.world.terrain.heightAt(x, z) + 0.2, z, Math.atan2(-nx, -nz) + 0.7);
    pl.camYaw = pl.yaw + Math.PI;
    window.__door = d;
    return { id: d.id, open01: d.open01, target: d.target, yaw: +pl.yaw.toFixed(2), want: +Math.atan2(d.center.x - x, d.center.z - z).toFixed(2) };
  });
  log('kapı', d0);
  await simWait(40);
  const dt0 = await evalJS(page, () => {
    try {
      const t = window.__game.session.interact.findTarget();
      if (t && t.kind === 'door') { window.__door = t.d; const pl = window.__game.session.local; return { kind: t.kind, label: t.label, id: t.d.id, locked: t.d.locked, target: t.d.target, want: +Math.atan2(t.d.center.x - pl.pos.x, t.d.center.z - pl.pos.z).toFixed(2) }; }
      return t && { kind: t.kind, label: t.label };
    } catch (e) { return { err: e.stack.split('\n').slice(0, 5).join(' | ') }; }
  });
  log('kapı hedefi', dt0);
  if (dt0 && dt0.kind === 'door') {
    d0.target = dt0.target; d0.want = dt0.want;
    await evalJS(page, () => { window.__act = 0; window.__actT = null; window.__rec.length = 0; });
    await press();
    await simWait(80);
    const dk = await timing('target', d0.target);
    log('kapı zamanlaması (sim sn)', dk);
    check(dk.degisim !== null && dk.degisim >= 0.1 && dk.degisim <= 0.6, 'kapı hemen değil, uzanma anında (0,22 sn) hareket etmeli', dk);
    const d2 = await evalJS(page, () => ({ target: window.__door.target, open01: +window.__door.open01.toFixed(2), yaw: +window.__game.session.local.yaw.toFixed(2) }));
    log('E sonrası 1,3 sn', d2);
    check(d2.target !== d0.target, 'kapı açılmalı', d2);
    check(Math.abs(d2.yaw - d0.want) < 0.45, 'oyuncu kapıya dönmeli', { yaw: d2.yaw, want: d0.want });
    await shot(page, '/tmp/interact-door.png');
  } else log('kapı hedeflenemedi (konum uygun değil), kapı adımı atlandı');
};
