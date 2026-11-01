// Gerçek fare tıklamasıyla arayüz testi (diğer senaryolar menü işlevlerini doğrudan çağırır; bu senaryo
// görünmez bir katmanın tıklamaları yutmasını yakalar): ana menü düğmeleri en üstte mi, Tek Oyna → karakter
// seç → Oyuna Başla tıklamayla çalışıyor mu, oyunda ekran ortası oyun tuvali mi (fare kilidi), duraklat
// menüsündeki "Devam Et" tıklanıyor mu. Ayrıca ana menünün altı tabelası (ekran açılır, ← Geri döner), ayarların dört
// sekmesi ve kalite seçimi, oyunda günlüğün altı sekmesi, duraklat → Ayarlar (sekmeler, ✕) → Nasıl Oynanır? (✕)
// gerçek tıklamayla. Yıkıcı düğmeler (Ana Menüye Dön, Sıfırla, Oyundan Çık) tıklanmaz. → /tmp/ui-*.png
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
  // ana menü tabelaları gerçek tıklamayla: her biri kendi ekranını açar, "← Geri" ana menüye döndürür; ayarların dört
  // sekmesi ve kalite seçimi de tıklanır
  const screens = [['ARKADAŞLARLA OYNA', 'multi'], ['KARAKTERLER', 'characters'], ['ÖZELLEŞTİRME', 'customize'], ['AYARLAR', 'settings'], ['NASIL OYNANIR?', 'howto'], ['KREDİLER', 'credits']];
  const visited = [];
  for (const [label, name] of screens) {
    await page.locator('.main-menu button.plank', { hasText: label }).first().click({ timeout: 15000 });
    await wait(700);
    const scr = await evalJS(page, () => window.__game.ui.menus.screen);
    let extra = null;
    if (name === 'settings') {
      const tabsSeen = [];
      for (const t of ['Ses', 'Kontroller', 'Oyun', 'Grafik']) {
        await page.locator('.settings .tabs button.tab', { hasText: t }).first().click({ timeout: 10000 });
        await wait(300);
        tabsSeen.push(await evalJS(page, () => { const a = document.querySelector('.settings .tabs button.tab.active'); return a ? a.textContent : null; }));
      }
      await page.locator('.settings button.seg-btn', { hasText: /^Yüksek$/ }).first().click({ timeout: 10000 });
      await wait(300);
      const q1 = await evalJS(page, () => window.__game.settings.get('graphics.quality'));
      await page.locator('.settings button.seg-btn', { hasText: /^Orta$/ }).first().click({ timeout: 10000 });
      await wait(300);
      const q2 = await evalJS(page, () => window.__game.settings.get('graphics.quality'));
      extra = { tabsSeen, q1, q2 };
    }
    await page.getByRole('button', { name: '← Geri' }).first().click({ timeout: 10000 });
    await wait(600);
    visited.push({ label, scr, back: await evalJS(page, () => window.__game.ui.menus.screen), extra });
  }
  log('ana menü ekranları', visited);
  check(visited.every((v, i) => v.scr === screens[i][1] && v.back === 'main'), 'her tabela kendi ekranını açmalı, ← Geri ana menüye döndürmeli', visited);
  const stv = visited.find((v) => v.extra);
  check(stv && stv.extra.tabsSeen.join(',') === 'Ses,Kontroller,Oyun,Grafik' && stv.extra.q1 === 'high' && stv.extra.q2 === 'medium', 'ayar sekmeleri ve kalite seçimi tıklamayla çalışmalı', stv);
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
  // günlük (Tab): altı sekme gerçek tıklamayla
  await page.keyboard.press('Tab');
  await wait(900);
  const jt = [];
  for (const t of ['ÜRETİM', 'KARAKTER', 'GÖREVLER', 'ZAMAN ÇİZELGESİ', 'HARİTA', 'ENVANTER']) {
    const ok = await page.locator('.journal .tabs button.tab', { hasText: t }).first().click({ timeout: 10000 }).then(() => true, (e) => e.message.split('\n')[0]);
    await wait(400);
    jt.push(ok === true ? await evalJS(page, () => window.__game.ui.journal.tab) : ok);
  }
  log('günlük sekmeleri', jt);
  check(jt.join(',') === 'crafting,character,quests,timeline,map,inventory', 'günlük sekmeleri tıklamayla değişmeli', jt);
  await page.keyboard.press('Tab');
  await wait(700);
  // duraklat → Ayarlar (dört sekme, performans testi düğmesi görünür) → ✕ → Nasıl Oynanır? → ✕ → "Devam Et"
  const panelName = () => evalJS(page, () => window.__game.ui.panel && window.__game.ui.panel.name);
  for (let i = 0; i < 3 && (await panelName()) !== 'pause'; i++) { await page.keyboard.press('Escape'); await wait(1000); }
  const pz = { start: await panelName() };
  if (pz.start === 'pause') {
    await page.getByRole('button', { name: 'Ayarlar', exact: true }).click({ timeout: 10000 });
    await wait(700);
    pz.settings = await evalJS(page, () => window.__game.ui.panel && window.__game.ui.panel.name);
    pz.tabs = [];
    for (const t of ['Ses', 'Kontroller', 'Oyun', 'Grafik']) {
      await page.locator('.settings-panel .tabs button.tab', { hasText: t }).first().click({ timeout: 10000 });
      await wait(300);
      pz.tabs.push(await evalJS(page, () => { const a = document.querySelector('.settings-panel .tabs button.tab.active'); return a ? a.textContent : null; }));
    }
    pz.benchButton = await page.getByRole('button', { name: /Performans testini başlat/ }).count();
    await page.locator('.settings-panel button.close').first().click({ timeout: 10000 });
    await wait(700);
    pz.afterSettings = await evalJS(page, () => window.__game.ui.panel && window.__game.ui.panel.name);
    await page.getByRole('button', { name: 'Nasıl Oynanır?', exact: true }).click({ timeout: 10000 });
    await wait(700);
    pz.howto = await evalJS(page, () => window.__game.ui.panel && window.__game.ui.panel.name);
    await page.locator('.panel-layer.open button.close').first().click({ timeout: 10000 });
    await wait(700);
    pz.afterHowto = await evalJS(page, () => window.__game.ui.panel && window.__game.ui.panel.name);
  }
  log('duraklat menüsü', pz);
  check(pz.start === 'pause' && pz.settings === 'settings' && pz.tabs.join(',') === 'Ses,Kontroller,Oyun,Grafik' && pz.benchButton === 1 && pz.afterSettings === 'pause' && pz.howto === 'howto' && pz.afterHowto === 'pause', 'duraklat menüsü düğmeleri tıklamayla çalışmalı', pz);
  const resume = page.getByRole('button', { name: 'Devam Et' });
  if (await resume.count()) {
    await resume.click({ timeout: 10000 });
    await wait(800);
    const open = await evalJS(page, () => !!(window.__game.ui.panel));
    log('Devam Et sonrası panel açık mı', open);
    check(!open, '"Devam Et" tıklanınca duraklat menüsü kapanmalı', open);
  } else log('duraklat menüsü açılmadı (Escape bu ortamda başka işe bağlı olabilir)');
};
