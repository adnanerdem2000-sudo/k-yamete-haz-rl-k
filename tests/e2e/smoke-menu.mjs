// Duman testi 1: oyun yüklenir, ana menü görünür, menü ekranları açılır.
// Denetimler: yükleme ekranı kalkar, ana menü katmanı görünür ve bütün tabelalar var; menü arka planında kamp
// ateşi başındaki altı karakter yüklü; her tabela kendi ekranını başlığıyla açar ve Geri ana menüye döner;
// karakter ekranında her karakterin kartı var, özelleştirmede 3B vitrin karakteri kurulur ve çıkınca kaldırılır;
// özelleştirmenin Kıyafet sekmesinde "Taban rengi" satırı her karakterde, "İkinci renk (gömlek / yelek)" satırı yalnız
// gövdesinde ikinci kumaş olan karakterde (Ceren: Takım) görünür ve taban rengi seçimi kaydedilip vitrine uygulanır.
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
  // Kıyafet sekmesi: taban rengi ve ikinci renk satırları (tıklamayla; sonunda görünüm kaydı geri alınır)
  await evalJS(page, () => { const b = [...document.querySelectorAll('.plank')].find((p) => p.textContent === 'ÖZELLEŞTİRME'); b && b.click(); });
  await wait(1200);
  const kiyafet = await evalJS(page, async () => {
    const { Settings } = await import('/src/core/Settings.js');
    const g = window.__game, out = {};
    const tikla = (sel, text) => { const b = [...document.querySelectorAll(sel)].find((x) => (text ? x.textContent === text : true)); if (b) b.click(); return !!b; };
    const etiketler = () => [...document.querySelectorAll('.cust-body .opt-label')].map((x) => x.textContent);
    for (const [id, ad] of [['ceren', 'CEREN'], ['deniz', 'DENİZ']]) {
      const ok = tikla(`.cust-char[title="${ad}"]`) && tikla('.tabs .tab', 'Kıyafet');
      out[id] = { ok, etiket: etiketler() };
    }
    // Ceren: taban rengi seç (#c0392b) → kayıt + vitrin
    tikla('.cust-char[title="CEREN"]');
    const lbl = [...document.querySelectorAll('.cust-body .opt-label')].find((x) => x.textContent === 'Taban rengi');
    const sw = lbl && lbl.nextElementSibling ? [...lbl.nextElementSibling.querySelectorAll('.sw')].find((b) => b.title === '#c0392b') : null;
    if (sw) sw.click();
    out.kayit = ((Settings.get('player.appearance') || {}).ceren || {}).soleColor || null;
    out.vitrin = g.menu.sc && g.menu.sc.av && g.menu.sc.av.ch.look ? g.menu.sc.av.ch.look.soleColor || null : null;
    const all = { ...(Settings.get('player.appearance') || {}) };
    delete all.ceren; delete all.deniz;
    Settings.set('player.appearance', all);
    tikla('.tabs .tab', 'Koleksiyonlar');
    const geri = [...document.querySelectorAll('.screen-head .btn')].find((x) => x.textContent.includes('Geri'));
    if (geri) geri.click();
    return out;
  });
  log('kıyafet sekmesi', kiyafet);
  const IKINCI = 'İkinci renk (gömlek / yelek)';
  check(kiyafet && kiyafet.ceren.ok && kiyafet.deniz.ok && kiyafet.ceren.etiket.includes('Taban rengi') && kiyafet.deniz.etiket.includes('Taban rengi') && kiyafet.ceren.etiket.includes(IKINCI) && !kiyafet.deniz.etiket.includes(IKINCI) && kiyafet.kayit === '#c0392b' && kiyafet.vitrin === '#c0392b',
    'Kıyafet sekmesinde taban rengi satırı olmalı, ikinci renk satırı yalnız ikinci kumaşlı gövdede (Ceren) görünmeli; taban rengi seçimi kaydedilip vitrine uygulanmalı', kiyafet);
};
