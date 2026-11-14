// Duman testi 1: oyun yüklenir, ana menü görünür, menü ekranları açılır.
// Denetimler: yükleme ekranı kalkar, ana menü katmanı görünür ve bütün tabelalar var; menü arka planında kamp
// ateşi başındaki altı karakter yüklü; her tabela kendi ekranını başlığıyla açar ve Geri ana menüye döner;
// karakter ekranında her karakterin kartı var, özelleştirmede 3B vitrin karakteri kurulur ve çıkınca kaldırılır.
export default async ({ page, url, shot, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  log('menü hazır');
  await wait(1500);
  await shot(page, '/tmp/e2e-menu.png');
  const planks = await evalJS(page, () => [...document.querySelectorAll('.plank')].map((p) => p.textContent));
  log('tabelalar', planks);
  const ana = await evalJS(page, () => {
    const g = window.__game, el = document.querySelector('.menu-layer .main-menu'), r = el ? el.getBoundingClientRect() : null;
    const meshes = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh) n++; }); return n; };
    return {
      screen: g.ui.menus.screen, layer: !g.ui.menuLayer.classList.contains('hidden'), size: r ? [Math.round(r.width), Math.round(r.height)] : null,
      loading: !!document.querySelector('#loading-screen:not(.done)'),
      scene: g.menu.group.visible, campfire: g.menu.avatars.map(({ av }) => av.root.visible && meshes(av.root) > 0),
    };
  });
  log('ana menü', ana);
  const TABELALAR = ['TEK OYNA', 'ARKADAŞLARLA OYNA', 'KARAKTERLER', 'ÖZELLEŞTİRME', 'AYARLAR', 'NASIL OYNANIR?', 'KREDİLER', 'OYUNDAN ÇIK'];
  check(ana && ana.screen === 'main' && ana.layer && ana.size && ana.size[0] > 0 && ana.size[1] > 0 && !ana.loading,
    'ana menü görünür olmalı (yükleme ekranı kalkmış, menü katmanı açık, ana menü boyutlu)', ana);
  check(Array.isArray(planks) && TABELALAR.every((t) => planks.includes(t)), 'ana menüde bütün tabelalar olmalı', { planks, beklenen: TABELALAR });
  check(ana && ana.scene && ana.campfire.length === 6 && ana.campfire.every(Boolean), 'menü arka planında kamp ateşi başındaki altı karakter yüklü (modelli) ve görünür olmalı', ana);
  // [tabela, görüntü dosyası, Menus.screen adı, ekran başlığı (banner)]
  const ekranlar = [];
  for (const [label, file, name, title] of [['KARAKTERLER', 'chars', 'characters', 'KARAKTER SEÇİMİ'], ['ÖZELLEŞTİRME', 'cust', 'customize', 'ÖZELLEŞTİRME'], ['AYARLAR', 'settings', 'settings', 'AYARLAR'], ['NASIL OYNANIR?', 'howto', 'howto', 'NASIL OYNANIR?'], ['KREDİLER', 'credits', 'credits', 'KREDİLER'], ['TEK OYNA', 'single', 'single', 'TEK OYNA'], ['ARKADAŞLARLA OYNA', 'multi', 'multi', 'ARKADAŞLARLA OYNA']]) {
    const tik = await evalJS(page, (l) => { const b = [...document.querySelectorAll('.plank')].find((p) => p.textContent === l); b && b.click(); return !!b; }, label);
    await wait(1200);
    const acik = await evalJS(page, () => {
      const g = window.__game, head = document.querySelector('.menu-layer .screen-head .banner');
      return {
        screen: g.ui.menus.screen, title: head ? head.textContent : null,
        cards: document.querySelectorAll('.menu-layer .char-card').length, chars: Object.keys(g.characters).length,
        showcase: !!(g.menu.sc && g.menu.sc.av && g.menu.sc.av.root.parent),
        start: [...document.querySelectorAll('.menu-layer .btn')].some((b) => b.textContent.includes('OYUNA BAŞLA')),
      };
    });
    await shot(page, `/tmp/e2e-${file}.png`);
    const geri = await evalJS(page, () => { const b = [...document.querySelectorAll('.screen-head .btn')].find((x) => x.textContent.includes('Geri')); b && b.click(); return !!b; });
    await wait(400);
    const don = await evalJS(page, () => ({ screen: window.__game.ui.menus.screen, main: !!document.querySelector('.menu-layer .main-menu'), showcase: !!window.__game.menu.sc }));
    ekranlar.push({ label, name, title, tik, acik, geri, don });
  }
  log('ekranlar', ekranlar.map((e) => [e.label, e.acik && e.acik.screen, e.acik && e.acik.title, e.don && e.don.screen]));
  const acilmayan = ekranlar.filter((e) => !(e.tik && e.acik && e.acik.screen === e.name && e.acik.title === e.title));
  check(acilmayan.length === 0, 'her tabela kendi ekranını başlığıyla açmalı', acilmayan);
  const donmeyen = ekranlar.filter((e) => !(e.geri && e.don && e.don.screen === 'main' && e.don.main));
  check(donmeyen.length === 0, 'her ekranın Geri düğmesi ana menüye dönmeli', donmeyen);
  const by = Object.fromEntries(ekranlar.map((e) => [e.name, e]));
  const karakter = by.characters && by.characters.acik, tek = by.single && by.single.acik;
  check(karakter && karakter.chars >= 6 && karakter.cards === karakter.chars && tek && tek.cards === tek.chars && tek.start,
    'karakter ve tek oyuncu ekranlarında her karakterin kartı olmalı; tek oyuncu ekranında OYUNA BAŞLA düğmesi olmalı', { karakter, tek });
  const ozel = by.customize;
  check(ozel && ozel.acik && ozel.acik.showcase && ozel.don && !ozel.don.showcase && Object.values(by).every((e) => e.name === 'customize' || (e.acik && !e.acik.showcase)),
    'özelleştirme ekranı 3B vitrin karakterini kurmalı, ekrandan çıkınca vitrin kaldırılmalı (diğer ekranlarda vitrin olmamalı)', { ozel });
};
