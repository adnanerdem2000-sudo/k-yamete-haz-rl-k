// Duman testi 2: tek oyunculu oyun başlar, HUD görünür, temel paneller açılır, oyuncu hareket eder.
// Denetimler: oturum 1. günde başlar (sonlu konum, başlangıç envanteri, istenen 2 YZ arkadaş, etkin görev, hava
// durumu), HUD görünür ve dolu; W basılı tutulunca oyuncu yürür; günlük sekmeleri, inşa menüsü, takım ve
// duraklatma panelleri açılır (duraklatma oturumu durdurur), kapanınca oyun HUD'a döner.
export default async ({ page, url, shot, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await wait(800);
  await shot(page, '/tmp/s-menu.png');
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 2; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 120000 });
  log('oyun başladı');
  await wait(3000);
  await shot(page, '/tmp/s-hud.png');
  const ilk = await evalJS(page, () => {
    const g = window.__game, S = g.session, U = g.ui;
    return {
      day: S.time.day, pos: S.local.pos.toArray().map((v) => +v.toFixed(1)), inv: S.inventory.items().map((s) => s.id + 'x' + s.qty), bots: S.bots.count(), quests: S.quests.active(), weather: S.weather.label(),
      hud: !U.hudLayer.classList.contains('hidden'), menuScreen: U.menus.screen, hudDay: U.hud.dayEl.textContent, hudCount: U.hud.countEl.textContent, panel: U.panel ? U.panel.name : null,
    };
  });
  log(ilk);
  check(ilk && ilk.day === 1 && ilk.pos.length === 3 && ilk.pos.every(Number.isFinite) && ilk.inv.length >= 2 && ilk.inv.some((s) => s.startsWith('water_bottlex')) && ilk.bots === 2 && ilk.quests.length >= 1 && typeof ilk.weather === 'string' && ilk.weather.length > 0,
    'tek oyunculu oturum 1. günde başlamalı: sonlu konum, başlangıç envanteri (su dahil), istenen 2 YZ arkadaş, en az bir etkin görev, hava durumu', ilk);
  check(ilk && ilk.hud && ilk.menuScreen === null && /Gün\s*1\b/.test(ilk.hudDay) && ilk.hudCount.length > 0,
    'oyun başlayınca menü kapanmalı, HUD görünür olmalı ve gün/geri sayım yazmalı', ilk);
  // hareket: W basılı tutulur. Yazılım GPU'sunda kare 1 sn'yi aşabildiğinden (dt 0,1 sn ile sınırlı) 1,5 sn'de bir
  // kare bile işlenmeyebilir: oyuncu 0,3 m ilerleyene dek en çok 12 sn daha basılı tutulur (sonucu aşağıdaki denetim
  // raporlar; bekleme zaman aşımı burada bilerek yutulur).
  await page.keyboard.down('KeyW'); await wait(1500);
  await page.waitForFunction((p0) => { const p = window.__game.session.local.pos; return Math.hypot(p.x - p0[0], p.z - p0[2]) > 0.3; }, ilk && ilk.pos ? ilk.pos : [0, 0, 0], { timeout: 12000, polling: 200 }).catch(() => {});
  await page.keyboard.up('KeyW');
  const son = await evalJS(page, () => window.__game.session.local.pos.toArray().map((v) => +v.toFixed(1)));
  log('yürüdükten sonra', son);
  const yol = ilk && son ? Math.hypot(son[0] - ilk.pos[0], son[2] - ilk.pos[2]) : null;
  check(yol !== null && son.every(Number.isFinite) && yol > 0.25 && yol < 80 && Math.abs(son[1] - ilk.pos[1]) < 5,
    'W basılı tutulunca oyuncu yürümeli (yatayda > 0,25 m, zeminden kopmadan)', { ilk: ilk && ilk.pos, son, yol });
  const sekmeler = [];
  for (const tab of ['inventory', 'crafting', 'character', 'quests', 'map']) {
    sekmeler.push(await evalJS(page, (t) => {
      const U = window.__game.ui;
      U.openJournal(t);
      const body = U.journal.el ? U.journal.el.querySelector('.journal-body') : null;
      return { tab: t, panel: U.panel ? U.panel.name : null, active: U.journal.tab, body: body ? body.childElementCount : 0 };
    }, tab));
    await wait(900);
    await shot(page, `/tmp/s-j-${tab}.png`);
  }
  log('günlük sekmeleri', sekmeler);
  const bozuk = sekmeler.filter((s) => !(s && s.panel === 'journal' && s.active === s.tab && s.body > 0));
  check(bozuk.length === 0, 'günlüğün her sekmesi (envanter, üretim, karakter, görevler, harita) açılıp içerik çizmeli', bozuk);
  await evalJS(page, () => window.__game.ui.closePanel());
  const insa = await evalJS(page, () => { const U = window.__game.ui; U.openBuildMenu(); const el = U.panel && U.panel.el; return { panel: U.panel ? U.panel.name : null, cards: el ? el.querySelectorAll('.build-card').length : 0, cats: el ? el.querySelectorAll('.side-item').length : 0 }; });
  await wait(800); await shot(page, '/tmp/s-build.png');
  await evalJS(page, () => window.__game.ui.closePanel());
  const takim = await evalJS(page, () => { const U = window.__game.ui, S = window.__game.session; U.openTeam(); const el = U.panel && U.panel.el; return { panel: U.panel ? U.panel.name : null, cards: el ? el.querySelectorAll('.team-card').length : 0, team: S.teamList().length, bots: S.bots.count() }; });
  await wait(800); await shot(page, '/tmp/s-team.png');
  await evalJS(page, () => window.__game.ui.closePanel());
  const durak = await evalJS(page, () => { const U = window.__game.ui; U.openPause(); return { panel: U.panel ? U.panel.name : null, paused: window.__game.session.paused }; });
  await wait(800); await shot(page, '/tmp/s-pause.png');
  await evalJS(page, () => window.__game.ui.closePanel());
  await wait(500);
  const sonDurum = await evalJS(page, () => { const g = window.__game, U = g.ui; return { state: g.state, panel: U.panel ? U.panel.name : null, paused: g.session.paused, hud: !U.hudLayer.classList.contains('hidden'), blocking: U.isBlocking() }; });
  log('paneller', { insa, takim, durak, sonDurum });
  check(insa && insa.panel === 'build' && insa.cards > 0 && insa.cats >= 5, 'inşa menüsü yapı kartları ve kategorileriyle açılmalı', insa);
  check(takim && takim.panel === 'team' && takim.cards === takim.team && takim.team === 1 + takim.bots && takim.bots === 2, 'takım paneli oyuncu ve iki YZ arkadaşın kartlarını göstermeli', takim);
  check(durak && durak.panel === 'pause' && durak.paused === true && sonDurum && sonDurum.state === 'playing' && sonDurum.panel === null && sonDurum.paused === false && sonDurum.hud && !sonDurum.blocking,
    'duraklatma paneli oturumu durdurmalı; paneller kapanınca oyun sürmeli ve HUD görünür olmalı', { durak, sonDurum });
  await shot(page, '/tmp/s-hud2.png');
};
