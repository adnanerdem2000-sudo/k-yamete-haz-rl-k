// Nesne taşıma testi: oyuncu önündeki kutuyu alır (kinematik), taşır, bırakır ve fırlatır. → /tmp/carry-*.png
// Denetimler: kutu E ile alınır (taşıma durumu, kinematik gövde, taşıma animasyonu); taşırken yürünür ve kutu oyuncunun
// önünde göğüs hizasında kalır; fırlatılan kutu elden çıkıp dinamikleşir, öne savrulup zeminde durur. Oyun döngüsü
// çalışır: yazılım GPU'sunda kare başına en çok 0,1 sn benzetim ilerlediği için beklemeler fizik adımıyla da güvenceye alınır.
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const steps = () => evalJS(page, () => window.__game.session.game.phys.steps);
  // fizik adım sayacı en az t olana dek bekle; zaman aşımında false döner (yutulmaz, denetime düşer)
  const stepsAtLeast = (t, timeout) => page.waitForFunction((n) => window.__game.session.game.phys.steps >= n, t, { timeout, polling: 100 }).then(() => true, () => false);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 150000 });
  await wait(1500);
  // oyuncunun önüne bir kutu koy. Doğuş yeri verandada eve bakar: taşırken kutu 0,2 m sonra kapıya dayanıyordu.
  // Oyuncu önce verandadan 5 m geri çekilip evden uzağa döner (açık bahçe), kutu onun önüne konur.
  const r0 = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const away = pl.yaw + Math.PI, px = pl.pos.x + Math.sin(away) * 5, pz = pl.pos.z + Math.cos(away) * 5;
    pl.spawnAt(px, S.world.physics.groundHeight(px, pz, pl.pos.y + 3) + 0.05, pz, away);
    const x = pl.pos.x + Math.sin(pl.yaw) * 1.1, z = pl.pos.z + Math.cos(pl.yaw) * 1.1;
    const p = S.props.addProp('box', x, z, 0, 'test_box');
    window.__box = p;
    return { ok: !!p, near: !!S.props.nearestCarryable(pl.pos.x, pl.pos.y, pl.pos.z, pl.yaw) };
  });
  log('kutu', r0);
  check(r0 && r0.ok && r0.near, 'oyuncunun önüne konan kutu taşınabilir nesne olarak bulunmalı', r0);
  // açılış paneli/diyaloğu varsa kapat (girdi engellenmesin)
  const blk = await evalJS(page, () => { const g = window.__game; for (let i = 0; i < 3 && g.ui.isBlocking(); i++) { g.ui.closePanel && g.ui.closePanel(); } return { blocking: g.ui.isBlocking(), panel: g.ui.panel && g.ui.panel.name, modal: !!g.ui.modal }; });
  log('arayüz', blk);
  await wait(800);
  await page.keyboard.down('KeyE'); await wait(120); await page.keyboard.up('KeyE');
  await wait(600);
  // E basışı bir sonraki karede işlenir; yavaş karede 600 ms yetmeyebilir: alma en çok 30 sn beklenir
  const aldi = await page.waitForFunction(() => !!window.__game.session.local.carryProp, null, { timeout: 30000, polling: 100 }).then(() => true, () => false);
  const r1 = await evalJS(page, () => { const S = window.__game.session, pl = S.local; window.__p0 = { x: pl.pos.x, z: pl.pos.z }; return { carrying: !!pl.carryProp, kinematic: !!(window.__box && window.__box.d.carried), anim: !!pl.animState().carryBox }; });
  log('alındı', r1);
  check(aldi && r1 && r1.carrying && r1.kinematic && r1.anim, 'E ile kutu alınmalı: oyuncu taşıyor, gövde kinematik, taşıma animasyonu açık', { aldi, r1, arayuz: blk });
  // W en az 1,2 sn ve en az 45 fizik adımı (0,75 sn benzetim) basılı kalır
  const sW = (await steps()) || 0;
  await page.keyboard.down('KeyW'); await wait(1200);
  const yurudu = await stepsAtLeast(sW + 45, 60000);
  await page.keyboard.up('KeyW');
  const r2 = await evalJS(page, () => { const S = window.__game.session, pl = S.local, t = window.__box.d.body.translation(); const o = window.__box.d.obj.position, p0 = window.__p0; return { carrying: !!pl.carryProp, mode: pl.mode, dist: +Math.hypot(t.x - pl.pos.x, t.z - pl.pos.z).toFixed(2), h: +(t.y - pl.pos.y).toFixed(2), gorselMesafe: +Math.hypot(o.x - pl.pos.x, o.z - pl.pos.z).toFixed(2), gorselH: +(o.y - pl.pos.y).toFixed(2), yurunen: p0 ? +Math.hypot(pl.pos.x - p0.x, pl.pos.z - p0.z).toFixed(2) : null }; });
  log('taşınıyor (oyuncuya uzaklık, yükseklik)', r2);
  // kutu tutma noktası (PhysProps.carryTarget, 0,75 m'lik kutu): 0,70 m önde, 1,00 m yukarıda; fizik gövdesi en çok bir adım geride
  check(yurudu && r2 && r2.carrying && r2.yurunen > 0.3 && Math.abs(r2.gorselMesafe - 0.7) < 0.15 && Math.abs(r2.gorselH - 1.0) < 0.15 && Math.abs(r2.dist - r2.gorselMesafe) < 0.3 && Math.abs(r2.h - r2.gorselH) < 0.3,
    'kutuyla yürünebilmeli; kutu (görsel ve fizik gövdesi) oyuncunun 0,7 m önünde, 1 m yukarıda kalmalı', { yurudu, r2 });
  await shot(page, '/tmp/carry-hold.png');
  // fırlat (bırakma noktası kaydedilir)
  await evalJS(page, () => { const t = window.__box.d.body.translation(); window.__birak = { x: t.x, y: t.y, z: t.z }; window.__game.session.local.dropProp(true); });
  const sT = (await steps()) || 0;
  await wait(1200);
  // uçuş, düşüş ve durma için fırlatmadan sonra en az 150 fizik adımı (2,5 sn benzetim)
  const durdu = await stepsAtLeast(sT + 150, 90000);
  const r3 = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local, b = window.__box.d.body, t = b.translation(), v = b.linvel(), r = window.__birak;
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    return {
      carrying: !!pl.carryProp, dynamic: !window.__box.d.carried, dist: +Math.hypot(t.x - pl.pos.x, t.z - pl.pos.z).toFixed(2),
      yerDegisimi: r ? +Math.hypot(t.x - r.x, t.y - r.y, t.z - r.z).toFixed(2) : null, onde: +((t.x - pl.pos.x) * fx + (t.z - pl.pos.z) * fz).toFixed(2),
      hiz: +Math.hypot(v.x, v.y, v.z).toFixed(2), zemin: +(t.y - S.world.terrain.heightAt(t.x, t.z)).toFixed(2), // arazi (veranda/döşeme bunun üstünde)
    };
  });
  log('fırlatıldı', r3);
  // ev cephesine yakın atışta kutu duvara çarpıp önde düşebilir: uzaklık değil, elden çıkıp yer değiştirmesi ve durması denetlenir
  check(durdu && r3 && !r3.carrying && r3.dynamic && r3.yerDegisimi > 0.3 && r3.onde > 0 && r3.hiz < 0.6 && r3.zemin > -0.25,
    'fırlatılan kutu elden çıkıp dinamik olmalı, öne savrulup düşmeli ve arazinin altına geçmeden durmalı', { durdu, r3 });
  await shot(page, '/tmp/carry-throw.png');
};
