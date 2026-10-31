// Final testi: 30. gün akşamı Son Işık başlar, sığınak finali ile kaçış → sonuç ekranı.
export default async ({ page, url, shot, wait, evalJS, log }) => {
  const S = (fn, arg) => evalJS(page, fn, arg);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => window.__game.ui.menus.startSingle());
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1000);
  log('son gün öncesi', await S(() => { const S = window.__game.session; S.time.set(29 * 1440 + 19 * 60 + 58); return { day: S.time.day, countdown: S.time.countdown }; }));
  await wait(4000);
  log('son ışık', await S(() => { const S = window.__game.session; return { active: S.endings.active, doom: S.env.doom, readiness: Object.fromEntries(Object.entries(S.endings.readiness()).map(([k, v]) => [k, v.ok])) }; }));
  await shot(page, '/tmp/e-lastlight.png');
  await S(() => window.__game.session.act('escape', { how: 'bunker' }));
  await wait(3000);
  log('sonuç', await S(() => { const el = document.querySelector('.results'); return el ? el.querySelector('h1').textContent + ' | ' + el.querySelector('.rating b').textContent : null; }));
  await shot(page, '/tmp/e-results.png');
  await S(() => { const b = [...document.querySelectorAll('.results .btn')].find((x) => x.textContent.includes('Ana Menü')); b && b.click(); });
  await wait(2500);
  log('menüye dönüş', await S(() => ({ state: window.__game.state, session: !!window.__game.session, menu: !!document.querySelector('.main-menu') })));
};
