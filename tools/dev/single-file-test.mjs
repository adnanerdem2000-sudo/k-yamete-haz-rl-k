// Tek dosyalık sürümü file:// üzerinden (çift tıklama gibi) açar: yükleme, menüde gerçek tıklama, oyuna giriş,
// hiç ağ isteği yapılmadan (yalnız gömülü veriler). Kullanım: node tools/scenario.mjs tools/dev/single-file-test.mjs file:///…/KiyamettenOnce.html
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const external = [];
  page.on('request', (r) => { const u = r.url(); if (!/^(data:|blob:|file:)/.test(u)) external.push(u); });
  const failed = [];
  // medya öğeleri (müzik) parçalı okurken istekleri iptal edebilir: ERR_ABORTED gerçek hata sayılmaz
  page.on('requestfailed', (r) => { const f = (r.failure() || {}).errorText || '?'; failed.push({ url: r.url().slice(0, 60), type: r.resourceType(), err: f }); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  log('menü açıldı', { sn: Math.round((Date.now() - t0) / 1000) });
  await wait(2000);
  await shot(page, '/tmp/single-menu.png');
  await page.getByRole('button', { name: 'TEK OYNA' }).click({ timeout: 15000 });
  await wait(1000);
  const start = page.getByRole('button', { name: 'OYUNA BAŞLA' });
  await start.scrollIntoViewIfNeeded({ timeout: 15000 });
  await start.click({ timeout: 15000 });
  await page.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 300000 });
  await wait(3000);
  await shot(page, '/tmp/single-playing.png');
  const st = await evalJS(page, () => {
    const g = window.__game, S = g.session;
    return { state: g.state, players: S.players.size, zombies: S.zombies.list ? S.zombies.list.size : null, kits: Object.keys(g.assets.kits || {}).length, anims: Object.keys(g.assets.anims || {}).length, sounds: Object.keys(g.assets.sounds || {}).length };
  });
  log('oyun', st);
  log('dış istek', external.slice(0, 5), 'başarısız istek', failed.slice(0, 5));
  // müzik çalabiliyor mu (blob URL'den)
  log('müzik', await evalJS(page, async () => {
    const a = new Audio('assets/audio/music/battle_theme_a.mp3');
    return await new Promise((res) => { a.addEventListener('canplaythrough', () => res({ ok: true, sn: Math.round(a.duration) }), { once: true }); a.addEventListener('error', () => res({ ok: false, err: a.error && a.error.code }), { once: true }); a.load(); setTimeout(() => res({ ok: 'zaman aşımı' }), 15000); });
  }));
  const real = failed.filter((f) => !/ERR_ABORTED/.test(f.err));
  if (real.length) errors.push('[assert] başarısız istekler: ' + JSON.stringify(real.slice(0, 5)));
};
