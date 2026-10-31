// Duman testi 1: oyun yüklenir, ana menü görünür, menü ekranları açılır.
export default async ({ page, url, shot, wait, evalJS, log }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  log('menü hazır');
  await wait(1500);
  await shot(page, '/tmp/e2e-menu.png');
  const planks = await evalJS(page, () => [...document.querySelectorAll('.plank')].map((p) => p.textContent));
  log('tabelalar', planks);
  for (const [label, file] of [['KARAKTERLER', 'chars'], ['ÖZELLEŞTİRME', 'cust'], ['AYARLAR', 'settings'], ['NASIL OYNANIR?', 'howto'], ['KREDİLER', 'credits'], ['TEK OYNA', 'single'], ['ARKADAŞLARLA OYNA', 'multi']]) {
    await evalJS(page, (l) => { const b = [...document.querySelectorAll('.plank')].find((p) => p.textContent === l); b && b.click(); }, label);
    await wait(1200);
    await shot(page, `/tmp/e2e-${file}.png`);
    await evalJS(page, () => { const b = [...document.querySelectorAll('.screen-head .btn')].find((x) => x.textContent.includes('Geri')); b && b.click(); });
    await wait(400);
  }
};
