// Final testi: 30. gün akşamı Son Işık başlar, sığınak finali ile kaçış → sonuç ekranı.
// Denetimler: saat 30. gün 19:58'e alınır; 20:00'de Son Işık başlamalı (son gece hızlanır), yedi kaçış planının
// hazırlık listesi okunmalı; sığınak kaçışı finali bitirip sığınak finalinin sonuç ekranını (kazanma, S–D derece)
// açmalı; Ana Menü düğmesi oturumu kapatıp ana menüye dönmeli. Beklemeler oyun durumuna bağlıdır: zaman aşımı
// yutulmaz, denetim hatası olur.
export default async ({ page, url, shot, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const S = (fn, arg) => evalJS(page, fn, arg);
  // koşul beklemesi: zaman aşımında false döner (sonucu denetim raporlar)
  const until = (fn, timeout) => page.waitForFunction(fn, null, { timeout, polling: 250 }).then(() => true, () => false);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => window.__game.ui.menus.startSingle());
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1000);
  const once = await S(() => { const S = window.__game.session; S.time.set(29 * 1440 + 19 * 60 + 58); return { day: S.time.day, countdown: S.time.countdown }; });
  log('son gün öncesi', once);
  check(once && once.day === 30 && once.countdown > 0 && once.countdown <= 125, 'saat 30. gün 19:58\'e alınmalı (Son Işık 22:00\'ye ~2 saat kalmalı)', once);
  await wait(4000);
  // yazılım GPU'sunda kare 1 sn'yi aşabilir ve dt 0,1 sn ile sınırlı: 2 oyun dakikası gerçek 4 sn'de dolmayabilir
  // (önceki koşuda active:false kaldı). Son Işık'ın başlaması oyun durumundan beklenir (en çok 2 dk).
  const basladi = await until(() => { const s = window.__game.session; return !!(s && s.endings.active); }, 120000);
  const sonIsik = await S(() => {
    const S = window.__game.session;
    return { active: S.endings.active, doom: S.env.doom, clock: Math.floor(S.time.minuteOfDay), day: S.time.day, dayMinutes: S.time.dayMinutes, readiness: Object.fromEntries(Object.entries(S.endings.readiness()).map(([k, v]) => [k, v.ok])) };
  });
  log('son ışık', sonIsik);
  check(basladi && sonIsik && sonIsik.active === true && sonIsik.day === 30 && sonIsik.clock >= 20 * 60 && sonIsik.dayMinutes <= 14,
    'Son Işık 30. gün 20:00\'de başlamalı ve son gece hızlanmalı (oyun günü en çok 14 gerçek dakika)', { basladi, sonIsik });
  const PLANLAR = ['bunker', 'military', 'sea', 'mountain', 'convoy', 'plane', 'defense'];
  check(sonIsik && sonIsik.readiness && PLANLAR.every((k) => typeof sonIsik.readiness[k] === 'boolean') && sonIsik.readiness.defense === true,
    'hazırlık listesi yedi kaçış planını içermeli; son savunma her zaman hazır', sonIsik && sonIsik.readiness);
  await shot(page, '/tmp/e-lastlight.png');
  await S(() => window.__game.session.act('escape', { how: 'bunker' }));
  await wait(3000);
  const ekran = await until(() => !!document.querySelector('.results'), 30000);
  const sonuc = await S(async () => {
    const { ENDINGS } = await import('/src/data/story.js');
    const g = window.__game, S = g.session, E = S && S.endings, el = document.querySelector('.results');
    const h1 = el && el.querySelector('h1'), rank = el && el.querySelector('.rating b');
    return {
      text: el ? h1.textContent + ' | ' + rank.textContent : null,
      expected: ENDINGS.bunker.name, win: !!el && el.classList.contains('win'), rating: rank ? rank.textContent : null,
      finished: !!(E && E.finished), escaped: !!(E && E.escaped.has(S.localId)), how: E ? E.escapedHow : null,
      hudHidden: g.ui.hudLayer.classList.contains('hidden'),
    };
  });
  log('sonuç', sonuc);
  check(ekran && sonuc && sonuc.text && sonuc.text.includes(sonuc.expected) && sonuc.win && /^[SABCD]$/.test(sonuc.rating || ''),
    'sığınak kaçışı sonuç ekranını açmalı: sığınak finali başlığı, kazanma görünümü ve S–D derece', { ekran, sonuc });
  check(sonuc && sonuc.finished && sonuc.escaped && sonuc.how === 'bunker' && sonuc.hudHidden,
    'kaçış kaydedilmeli (oyuncu kaçtı, kaçış yolu sığınak), final bitmeli ve HUD gizlenmeli', sonuc);
  await shot(page, '/tmp/e-results.png');
  const dugme = await S(() => { const b = [...document.querySelectorAll('.results .btn')].find((x) => x.textContent.includes('Ana Menü')); b && b.click(); return !!b; });
  await wait(2500);
  const menuyeDondu = await until(() => window.__game.state === 'menu' && !!document.querySelector('.main-menu'), 30000);
  const menu = await S(() => ({ state: window.__game.state, session: !!window.__game.session, menu: !!document.querySelector('.main-menu'), results: !!document.querySelector('.results') }));
  log('menüye dönüş', menu);
  check(dugme && menuyeDondu && menu && menu.state === 'menu' && !menu.session && menu.menu && !menu.results,
    'sonuç ekranındaki Ana Menü düğmesi oturumu kapatıp ana menüye dönmeli', { dugme, menuyeDondu, menu });
};
