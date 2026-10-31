// Duman testi 2: tek oyunculu oyun başlar, HUD görünür, temel paneller açılır, oyuncu hareket eder.
export default async ({ page, url, shot, wait, evalJS, log }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await wait(800);
  await shot(page, '/tmp/s-menu.png');
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 2; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 120000 });
  log('oyun başladı');
  await wait(3000);
  await shot(page, '/tmp/s-hud.png');
  log(await evalJS(page, () => { const S = window.__game.session; return { day: S.time.day, pos: S.local.pos.toArray().map((v) => +v.toFixed(1)), inv: S.inventory.items().map((s) => s.id + 'x' + s.qty), bots: S.bots.count(), quests: S.quests.active(), weather: S.weather.label() }; }));
  // hareket
  await page.keyboard.down('KeyW'); await wait(1500); await page.keyboard.up('KeyW');
  log('yürüdükten sonra', await evalJS(page, () => window.__game.session.local.pos.toArray().map((v) => +v.toFixed(1))));
  for (const tab of ['inventory', 'crafting', 'character', 'quests', 'map']) {
    await evalJS(page, (t) => window.__game.ui.openJournal(t), tab);
    await wait(900);
    await shot(page, `/tmp/s-j-${tab}.png`);
  }
  await evalJS(page, () => window.__game.ui.closePanel());
  await evalJS(page, () => window.__game.ui.openBuildMenu()); await wait(800); await shot(page, '/tmp/s-build.png');
  await evalJS(page, () => window.__game.ui.closePanel());
  await evalJS(page, () => window.__game.ui.openTeam()); await wait(800); await shot(page, '/tmp/s-team.png');
  await evalJS(page, () => window.__game.ui.closePanel());
  await evalJS(page, () => window.__game.ui.openPause()); await wait(800); await shot(page, '/tmp/s-pause.png');
  await evalJS(page, () => window.__game.ui.closePanel());
  await wait(500);
  await shot(page, '/tmp/s-hud2.png');
};
