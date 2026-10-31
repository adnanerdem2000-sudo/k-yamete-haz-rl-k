// Menü düğmelerine GERÇEK fare tıklaması: hangi öğe en üstte, Playwright tıklamayı neyin kestiğini söylüyor mu.
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 200000 });
  await wait(2500);
  await shot(page, '/tmp/clickprobe/menu.png');
  const info = await evalJS(page, () => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).slice(0, 8);
    return btns.map((b) => {
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      const path = (el) => { const out = []; for (let e = el; e && e !== document.body; e = e.parentElement) out.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '')); return out.slice(0, 4).join(' < '); };
      return { text: b.textContent.trim().slice(0, 24), x: Math.round(x), y: Math.round(y), topIsButton: top === b || b.contains(top), top: path(top) };
    });
  });
  for (const i of info) log('düğme', i);
  const first = info.find((i) => i.text);
  if (first) {
    try { await page.mouse.click(first.x, first.y); log('fare tıklandı', first.text); } catch (e) { log('fare hatası', e.message.split('\n')[0]); }
    await wait(1500);
    await shot(page, '/tmp/clickprobe/after-click.png');
    log('tıklama sonrası durum', await evalJS(page, () => ({ state: window.__game.state, screen: window.__game.ui.menus && window.__game.ui.menus.current })));
  }
};
