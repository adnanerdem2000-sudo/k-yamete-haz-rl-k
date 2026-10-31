// Hikâye testi: yeni NPC'ler, belge yerleşimi, santral (elektrik), fener + gemi, pist enkazını halatla
// çekme (Rapier ip eklemi), paraşütlü yardım paketi, düşen uçak, sarsıntı, Kanlı Ay, yeni olaylar,
// kayıt, zaman çizelgesi ve uçakla kaçış finali (kalkış sekansı + epilog). Görseller → /tmp/st-*.png
// Fizik/animasyon gerektiren adımlar oyun döngüsü durdurulup sabit 1/60 sn adımlarla ilerletilir
// (başsız tarayıcıda kare hızı düşük olduğundan gerçek zamanlı beklemek yerine).
// Hikâye senaryosunun RSS işaretli kopyası (teşhis): her adımdan sonra renderer RSS ve sayfa yığını günlüklenir
import { execSync } from 'node:child_process';
const rssMB = () => { try { const out = execSync("ps -eo rss,args | grep -- '--type=renderer' | grep -v grep | sort -rn | head -1").toString().trim(); return Math.round(parseInt(out, 10) / 1024); } catch { return -1; } };
export default async ({ page, url, shot, wait, evalJS, log }) => {
  const S = (fn, arg) => evalJS(page, fn, arg);
  const mark = async (label) => log('RSS ' + label, { rss: rssMB(), heap: await S(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)).catch(() => null) });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => { window.__game.ui.menus.opts.ai = 0; return window.__game.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1500);
  await S(() => {
    const g = window.__game;
    window.__pause = () => { cancelAnimationFrame(g.raf); g.raf = 0; };
    window.__resume = () => { document.getElementById('ui-root').style.display = ''; g.last = performance.now(); g.raf = requestAnimationFrame(() => g.loop()); };
    window.__step = (frames, keys = []) => {
      const S = g.session, inp = g.input;
      for (let i = 0; i < frames; i++) { inp.down.clear(); for (const k of keys) inp.down.add(k); S.update(1 / 60); inp.endFrame(); }
      inp.down.clear();
    };
    // sabit kamera ile tek kare (arayüz gizli)
    window.__still = (pos, look, ui = false) => {
      const c = g.gfx.camera, S = g.session;
      document.getElementById('ui-root').style.display = ui ? '' : 'none';
      c.position.set(pos[0], pos[1], pos[2]);
      c.lookAt(look[0], look[1], look[2]);
      S.world.vegetation.update(c.position, g.settings.get('graphics.viewDistance'), true, 1, g.settings.get('graphics.quality'));
      g.env.update(0.016, g.time, S.time.minuteOfDay, c.position, S.region);
      g.gfx.render(0.016, g.time);
    };
  });

  // 1) NPC'ler ve yerleri (bina içindekiler zeminde, çatıda değil)
  log('npc', await S(() => {
    const S = window.__game.session;
    const out = {};
    for (const id of ['aydin', 'ismail', 'zeynep', 'omer', 'necla', 'murat', 'defne']) {
      const n = S.npcs.byId(id);
      out[id] = n ? [Math.round(n.pos.x), Math.round(n.pos.y * 10) / 10, Math.round(n.pos.z), n.visible] : null;
    }
    out.hotelFloor = Math.round(S.world.buildingById.hotel.floorY * 10) / 10;
    return out;
  }));
  await mark('npc');

  // 2) belgeler: oda/bina belgeleri doğru konteynerlere düşer (deneme amaçlı üretim; bayraklar sıfırlanır)
  log('belgeler', await S(() => {
    const S = window.__game.session;
    const story = new Set(['military_orders', 'airfield_log', 'tower_log', 'dam_report', 'engineer_note', 'prison_log', 'hotel_manager', 'resort_guestbook', 'lighthouse_log', 'village_note', 'kizilcam_origin', 'farm_diary']);
    const found = {};
    const before = { ...S.flags };
    for (const c of S.world.containers) {
      if (!['terminal', 'tower', 'radio', 'powerplant', 'prison_admin', 'hotel', 'keeper', 'vil_cafe', 'vil3', 'barn'].includes(c.building)) continue;
      const st = S.loot.generate(c);
      for (const s of st.slots) if (s && s.noteId && story.has(s.noteId)) (found[c.building] = found[c.building] || []).push(s.noteId);
    }
    S.flags = before;
    return found;
  }));
  await mark('belgeler');

  // 3) santral: türbin → elektrik
  log('santral', await S(() => {
    const S = window.__game.session;
    S.act('quest_start', { id: 's_power' });
    S.giveLocal('engine_part', 1); S.giveLocal('wire', 3); S.giveLocal('electronics', 2);
    S.act('power_restore', {});
    S.quests.onInteract('dam_control');
    return { power: S.flags.power_restored, street: S.env.streetPower, pumps: S.flags.gas_power, quest: S.quests.state('s_power') };
  }));
  await mark('santral');

  // 4) fener: lamba + huzme + gemi (gece)
  await S(() => {
    const S = window.__game.session;
    S.act('lighthouse_lit', {});
    S.act('flag', { flag: 'ship_contact', value: 1 });
    S.time.set(S.time.total + ((22 * 60) - S.time.minuteOfDay));
    S.local.spawnAt(-560, S.world.terrain.heightAt(-560, 520) + 0.2, 520, -2.4);
  });
  await wait(1500);
  await S(() => { window.__pause(); window.__step(90); const L = window.__game.session.world.lighthouse; window.__still([L.x + 70, L.y + 6, L.z - 60], [L.x, L.y - 4, L.z]); });
  await shot(page, '/tmp/st-lighthouse.png');
  log('fener', await S(() => { const S = window.__game.session, W = S.storyWorld; return { lit: S.flags.lighthouse_lit, beam: W.beam && W.beam.g.visible, ship: W.ship && [Math.round(W.ship.g.position.x), Math.round(W.ship.g.position.z)], sea: S.endings.readiness().sea.detail }; }));
  await mark('fener');

  // 5) Kanlı Ay (kızıl, büyük ay)
  await S(() => {
    const g = window.__game, S = g.session;
    S.emit({ k: 'bloodmoon', on: true });
    window.__step(240);
    const m = S.time.minuteOfDay;
    const d = [-Math.cos(((m + 720) % 1440) / 1440 * Math.PI * 2) * 0.6, 0.65, -0.3];
    const L = Math.hypot(...d);
    const p = S.local.pos;
    window.__still([p.x, p.y + 1.7, p.z], [p.x + d[0] / L * 100, p.y + 1.7 + d[1] / L * 100 - 18, p.z + d[2] / L * 100]);
  });
  await shot(page, '/tmp/st-bloodmoon.png');
  log('kanlı ay', await S(() => { const S = window.__game.session; return { frenzy: S.zombies.frenzy, blood: Math.round(S.env._blood * 100) / 100 }; }));
  await mark('kanlı ay');
  await S(() => { const S = window.__game.session; S.emit({ k: 'bloodmoon', on: false }); S.time.set(S.time.total + ((24 * 60 + 10 * 60) - S.time.minuteOfDay)); });

  // 6) pist enkazı: araca halatla bağla, sür ve pistten çek
  log('halat', await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    const w = W.wrecks[0];
    const t = w.d.body.translation();
    const v = S.vehicles.byId('air_offroad');
    v.teleport(t.x, S.world.terrain.heightAt(t.x, t.z + 9) + 0.6, t.z + 9, 0);
    v.fuel = v.maxFuel;
    S.giveLocal('rope', 1);
    S.local.spawnAt(t.x + 2, S.world.terrain.heightAt(t.x + 2, t.z) + 0.2, t.z, 0);
    window.__step(30);
    W.useTow(w.it);
    S.act('vehicle_enter', { id: v.id, seat: 0 });
    return { wreck: [Math.round(t.x), Math.round(t.z)], joint: !!w.joint, mode: S.local.mode, n: W.wrecks.length, mass: Math.round(w.d.body.mass()) };
  }));
  await mark('halat');
  log('çekildi', await S(() => {
    const S = window.__game.session, W = S.storyWorld, w = W.wrecks[0];
    const z0 = w.d.body.translation().z;
    window.__step(420, ['KeyW']);
    const mid = w.d.body.translation();
    const v = S.vehicles.byId('air_offroad');
    const sp = +v.speed.toFixed(1);
    window.__step(90);
    const t = w.d.body.translation();
    const c = window.__game.gfx.camera;
    window.__still([t.x + 14, t.y + 6, t.z + 4], [t.x, t.y, t.z + 6]);
    return { moved: Math.round((t.z - z0) * 10) / 10, midSpeed: sp, wreck: [Math.round(t.x), Math.round(t.z)], off: W.offRunway(w), car: [Math.round(v.pos.x), Math.round(v.pos.z)], cam: !!c };
  }));
  await mark('çekildi');
  await shot(page, '/tmp/st-tow.png');
  // kalan iki enkaz: poz eşitleme yoluyla pistten çekilmiş say → host pist temiz kararı
  log('pist', await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    S.vehicles.exitLocal();
    W.detach(W.wrecks[0]);
    W.wrecks.forEach((w, i) => { if (!W.offRunway(w)) { const t = w.d.body.translation(); S.act('wreck_pose', { i, p: [t.x, t.y + 0.5, -740, 0, 0, 0, 1] }); W.setWreckPose(i, [t.x, t.y + 0.5, -740, 0, 0, 0, 1]); } });
    window.__step(180);
    return { clear: S.flags.runway_clear, off: W.wrecks.map((w) => W.offRunway(w)) };
  }));
  await mark('pist');

  // 7) yardım paketi (paraşüt, fiziksel düşüş, rüzgârla hedefe süzülme)
  log('paket', await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    S.local.spawnAt(-280, S.world.terrain.heightAt(-280, 150) + 0.3, 150, 0);
    W.hostAirdrop();
    window.__step(300);
    const d = W.drops[0];
    if (!d) return null;
    const p = d.crate.position;
    window.__still([p.x + 22, p.y + 2, p.z + 16], [p.x, p.y + 2.5, p.z]);
    return { y0: Math.round(p.y - d.gy) };
  }));
  await mark('paket');
  await shot(page, '/tmp/st-airdrop.png');
  log('paket indi', await S(() => {
    const S = window.__game.session, d = S.storyWorld.drops[0];
    let n = 0;
    while (!d.landed && n < 2400) { window.__step(60); n += 60; }
    window.__step(120);
    const p = d.crate.position;
    window.__still([p.x + 9, p.y + 3, p.z + 7], [p.x, p.y, p.z]);
    return { landed: d.landed, secs: Math.round(n / 60), dz: Math.round(Math.hypot(p.x - d.x, p.z - d.z)), cont: !!S.loot.byId.get(d.ct.id), atCrate: Math.abs(d.ct.x - p.x) < 0.1 };
  }));
  await mark('paket indi');
  await shot(page, '/tmp/st-airdrop2.png');

  // 8) düşen uçak
  log('uçak düşüyor', await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    W.hostCrash(true);
    window.__step(330);
    const c = W.crashes[0];
    if (!c) return null;
    const p = c.g.position;
    window.__still([c.x + 60, c.gy + 25, c.z + 60], [p.x, p.y, p.z]);
    return { y: Math.round(p.y - c.gy) };
  }));
  await mark('uçak düşüyor');
  await shot(page, '/tmp/st-crash.png');
  log('uçak düştü', await S(() => {
    const S = window.__game.session, c = S.storyWorld.crashes[0];
    window.__step(360);
    window.__still([c.x + 22, c.gy + 8, c.z + 18], [c.x, c.gy + 1, c.z]);
    return { done: c.done, cont: !!S.loot.byId.get('dyn:' + c.id), fire: (S.combat.fireAreas || []).length };
  }));
  await mark('uçak düştü');
  await shot(page, '/tmp/st-crash2.png');

  // 9) sarsıntı: fiziksel nesneler sarsılır
  log('sarsıntı', await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    const pr = S.props.props.find((p) => p.alive);
    if (pr) S.local.spawnAt(pr.d.body.translation().x + 4, pr.d.body.translation().y + 0.5, pr.d.body.translation().z, 0);
    window.__step(20);
    const a = pr ? { ...pr.d.body.translation() } : null;
    W.hostTremor();
    window.__step(150);
    const b = pr ? pr.d.body.translation() : null;
    return { moved: a ? Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 100) / 100 : null, left: Math.round(W.tremorT * 10) / 10 };
  }));
  await mark('sarsıntı');
  await S(() => window.__resume());
  await wait(800);

  // 10) olay kartları: yeni olaylar (seçim → etki)
  for (const id of ['harvest', 'thick_fog', 'deer_herd', 'hidden_cache', 'fever', 'airdrop', 'prison_riot']) {
    await S((id) => { const S = window.__game.session; window.__game.ui.closePanel(); S.events.trigger(id); }, id);
    await wait(700);
    if (id === 'harvest') await shot(page, '/tmp/st-event.png');
    await S(() => { const p = window.__game.ui.panel; if (p && p.name === 'event') { const c = [...document.querySelectorAll('.event-card .choice')].find((b) => !b.classList.contains('disabled')); c && c.click(); } });
    await wait(500);
  }
  log('olaylar', await S(() => { const S = window.__game.session; return { weather: S.weather.type, dyn: S.storyWorld.dyn.map((c) => c.label), riot: S.flags.prison_riot, choices: S.results.choices.slice(-4) }; }));
  await mark('olaylar');

  // 11) kayıt (hikâye dünyası durumu dahil)
  log('kayıt', await S(() => { const S = window.__game.session; const d = S.serialize(); return { wrecks: d.story.wrecks.length, dyn: d.story.dyn.length, drops: d.story.drops.length, crashes: d.story.crashes.length, size: JSON.stringify(d).length }; }));
  await mark('kayıt');

  // 12) zaman çizelgesi
  await S(() => window.__game.ui.openJournal('timeline'));
  await wait(1000);
  await shot(page, '/tmp/st-timeline.png');
  log('çizelge', await S(() => { const T = window.__game.session.timeline; return { n: T.list.length, kinds: [...new Set(T.list.map((e) => e.kind))] }; }));
  await mark('çizelge');
  await S(() => window.__game.ui.closePanel());

  // 13) uçakla kaçış: 30. gün 20:30, hazırlıklar tamam → kalkış sekansı
  await S(() => {
    const S = window.__game.session;
    for (const [f, v] of [['plane_repaired', 1], ['plane_fuel', 60], ['pilot_joined', 1], ['truth_broadcast', 1]]) S.act('flag', { flag: f, value: v });
    S.time.set(29 * 1440 + 20 * 60 + 30);
    const P = S.world.plane;
    S.local.spawnAt(P.x + 6, S.world.terrain.heightAt(P.x + 6, P.z + 6) + 0.3, P.z + 6, 0);
  });
  await wait(2000);
  log('uçak hazır', await S(() => window.__game.session.endings.readiness().plane));
  await mark('uçak hazır');
  log('kalkış', await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    window.__pause();
    S.act('plane_takeoff', {});
    const ph = [];
    for (let i = 0; i < 26; i++) { window.__step(30); if (W.flight && ph[ph.length - 1] !== W.flight.phase) ph.push(W.flight.phase); }
    const g = S.world.plane.group;
    window.__still([g.position.x - 34, g.position.y + 8, g.position.z + 30], [g.position.x, g.position.y + 1, g.position.z]);
    return { phases: ph, x: Math.round(g.position.x), alt: Math.round(g.position.y - S.world.terrain.heightAt(g.position.x, g.position.z)), escaped: S.endings.escaped.has(S.localId) };
  }));
  await mark('kalkış');
  await shot(page, '/tmp/st-takeoff.png');
  await S(() => window.__resume());
  await page.waitForFunction(() => !!document.querySelector('.results'), null, { timeout: 30000 }).catch(() => {});
  await wait(800);
  await shot(page, '/tmp/st-results.png');
  log('sonuç', await S(() => { const el = document.querySelector('.results'); return el ? { title: el.querySelector('h1').textContent, epilogue: [...el.querySelectorAll('.epilogue p')].map((p) => p.textContent.slice(0, 48)) } : null; }));
  await mark('sonuç');
};
