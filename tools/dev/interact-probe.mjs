// Etkileşim hata ayıklama v5: tuş olayı neden girdiye girmiyor
export default async ({ page, url, wait, evalJS, log }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { window.__input0 = window.__game.input; const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  await evalJS(page, async () => {
    const g = window.__game, S = g.session;
    for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel();
    const { makeStack } = await import('/src/data/items.js');
    const pl = S.local; pl.yaw = 0; pl.camYaw = Math.PI;
    S.act('ground_drop', { stack: makeStack('bandage', 1), x: pl.pos.x + Math.sin(0.95) * 1.1, y: pl.pos.y, z: pl.pos.z + Math.cos(0.95) * 1.1 });
    window.__ev = [];
    window.addEventListener('keydown', (e) => { const a = document.activeElement; window.__ev.push({ code: e.code, target: e.target && e.target.tagName, active: a && a.tagName + (a.id ? '#' + a.id : '') + (a.className ? '.' + a.className : ''), typing: g.input._isTyping(e), downHas: g.input.down.has(e.code), sameInput: g.input === window.__input0, listeners: g.input.listeners.length }); }, true);
    window.addEventListener('keydown', (e) => { window.__ev.push({ bubbleReached: true, pressedNow: g.input.pressed.has(e.code) }); }, false);
  });
  await wait(600);
  await page.keyboard.down('KeyE'); await wait(80); await page.keyboard.up('KeyE');
  await wait(400);
  log('olaylar', await evalJS(page, () => ({ ev: window.__ev, pressed: [...window.__game.input.pressed], down: [...window.__game.input.down] })));
  // ikinci deneme: body'ye odaklan ve tekrar bas
  await evalJS(page, () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); document.body.focus(); window.__ev = []; });
  await page.keyboard.down('KeyE'); await wait(80); await page.keyboard.up('KeyE');
  await wait(1000);
  log('odak sonrası', await evalJS(page, () => ({ ev: window.__ev, yaw: +window.__game.session.local.yaw.toFixed(2), bandage: window.__game.session.inventory.items().filter((s) => s.id === 'bandage').length })));
};
