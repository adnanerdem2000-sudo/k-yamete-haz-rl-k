// Gerçek fare tıklamasıyla arayüz testi (diğer senaryolar menü işlevlerini doğrudan çağırır; bu senaryo
// görünmez bir katmanın tıklamaları yutmasını yakalar): ana menü düğmeleri en üstte mi, Tek Oyna → karakter
// seç → Oyuna Başla tıklamayla çalışıyor mu, oyunda ekran ortası oyun tuvali mi (fare kilidi), duraklat
// menüsündeki "Devam Et" tıklanıyor mu. → /tmp/ui-*.png
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  // tıklanacak noktada en üstteki öğe düğmenin kendisi (ya da içi) mi
  const topAt = (sel) => evalJS(page, (sel) => {
    const out = [];
    for (const b of document.querySelectorAll(sel)) {
      if (!b.offsetParent) continue;
      const r = b.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      out.push({ text: b.textContent.trim().slice(0, 30), ok: t === b || b.contains(t), top: t ? t.tagName.toLowerCase() + '.' + String(t.className).trim().replace(/\s+/g, '.') : null });
    }
    return out;
  }, sel);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 200000 });
  await wait(2000);
  const menu = await topAt('.main-menu button');
  log('ana menü düğmeleri', menu);
  check(menu.length >= 5 && menu.every((m) => m.ok), 'ana menü düğmeleri tıklanabilir olmalı (üstte başka katman var)', menu.filter((m) => !m.ok));
  // Playwright tıklaması: düğmenin önünde başka öğe varsa (tıklamayı yakalayan katman) zaman aşımıyla hata verir
  await page.getByRole('button', { name: 'TEK OYNA' }).click({ timeout: 15000 });
  await wait(1200);
  await shot(page, '/tmp/ui-single.png');
  const start = page.getByRole('button', { name: 'OYUNA BAŞLA' });
  await start.scrollIntoViewIfNeeded({ timeout: 15000 });
  await start.click({ timeout: 15000 });
  await page.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 200000 });
  await wait(2500);
  // açılış paneli/diyaloğu varsa tıklayarak kapat (gerçek kullanıcı gibi)
  for (let i = 0; i < 3; i++) {
    const closeBtn = page.locator('.panel-layer.open button, .modal-wrap button').first();
    if (!(await closeBtn.count())) break;
    log('açık panel kapatılıyor', await closeBtn.textContent());
    await closeBtn.click({ timeout: 10000 }).catch((e) => log('panel kapatma tıklaması başarısız', e.message.split('\n')[0]));
    await wait(800);
  }
  // oyunda: ekran ortası oyun tuvali olmalı (tıklama fare kilidini alır, ateş eder)
  const center = await evalJS(page, () => { const t = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return t ? (t.id || t.tagName.toLowerCase() + '.' + String(t.className).trim().replace(/\s+/g, '.')) : null; });
  log('ekran ortasındaki öğe', center);
  check(center === 'game-canvas', 'oyunda ekran ortası oyun tuvali olmalı (HUD/katman tıklamayı yakalıyor)', center);
  const hot = await topAt('.hotbar .slot');
  check(hot.length > 0 && hot.every((m) => m.ok), 'kısayol çubuğu yuvaları tıklanabilir olmalı', hot.filter((m) => !m.ok));
  await shot(page, '/tmp/ui-playing.png');
  // duraklat → "Devam Et"
  await page.keyboard.press('Escape');
  await wait(1000);
  const resume = page.getByRole('button', { name: 'Devam Et' });
  if (await resume.count()) {
    await resume.click({ timeout: 10000 });
    await wait(800);
    const open = await evalJS(page, () => !!(window.__game.ui.panel));
    log('Devam Et sonrası panel açık mı', open);
    check(!open, '"Devam Et" tıklanınca duraklat menüsü kapanmalı', open);
  } else log('duraklat menüsü açılmadı (Escape bu ortamda başka işe bağlı olabilir)');
};
