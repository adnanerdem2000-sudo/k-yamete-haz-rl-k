// Hikâye testi: yeni NPC'ler, belge yerleşimi, santral (elektrik), fener + gemi, pist enkazını halatla
// çekme (Rapier ip eklemi), paraşütlü yardım paketi, düşen uçak, sarsıntı, Kanlı Ay, yeni olaylar,
// kayıt, zaman çizelgesi ve uçakla kaçış finali (kalkış sekansı + epilog). Görseller → /tmp/st-*.png
// Fizik/animasyon gerektiren adımlar oyun döngüsü durdurulup sabit 1/60 sn adımlarla ilerletilir
// (başsız tarayıcıda kare hızı düşük olduğundan gerçek zamanlı beklemek yerine).
// Denetimler her adımın oyun durumuna etkisine bakar (bayrak, nesne, konum, fizik gövdesi, arayüz).
export default async ({ page, url, shot, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const S = (fn, arg) => evalJS(page, fn, arg);
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
  const npc = await S(() => {
    const S = window.__game.session;
    const out = {};
    for (const id of ['aydin', 'ismail', 'zeynep', 'omer', 'necla', 'murat', 'defne']) {
      const n = S.npcs.byId(id);
      out[id] = n ? [Math.round(n.pos.x), Math.round(n.pos.y * 10) / 10, Math.round(n.pos.z), n.visible] : null;
    }
    out.hotelFloor = Math.round(S.world.buildingById.hotel.floorY * 10) / 10;
    return out;
  });
  log('npc', npc);
  const NPC_IDS = ['aydin', 'ismail', 'zeynep', 'omer', 'necla', 'murat', 'defne'];
  // yedi NPC sayısal konumla kurulmalı, Zeynep dışındakiler başta görünür, oteldeki Murat ve Defne kat zemininde (çatıda değil)
  const npcTamam = !!npc && NPC_IDS.every((id) => npc[id] && npc[id].slice(0, 3).every(Number.isFinite))
    && NPC_IDS.filter((id) => id !== 'zeynep').every((id) => npc[id][3] === true)
    && ['murat', 'defne'].every((id) => Math.abs(npc[id][1] - npc.hotelFloor) < 0.6);

  // 2) belgeler: oda/bina belgeleri doğru konteynerlere düşer (deneme amaçlı üretim; bayraklar sıfırlanır)
  const belge = await S(() => {
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
  });
  log('belgeler', belge);
  // belge → bina (Loot.js ROOM_DOCS / BUILDING_DOCS)
  const BELGE_YERI = { military_orders: 'radio', airfield_log: 'terminal', tower_log: 'tower', dam_report: 'powerplant', engineer_note: 'powerplant', prison_log: 'prison_admin', hotel_manager: 'hotel', resort_guestbook: 'hotel', lighthouse_log: 'keeper', village_note: 'vil_cafe', kizilcam_origin: 'vil3', farm_diary: 'barn' };
  const yanlisYer = Object.entries(BELGE_YERI).filter(([doc, b]) => !(belge && (belge[b] || []).includes(doc))).map(([doc]) => doc);
  const tumBelgeler = belge ? Object.values(belge).flat() : [];
  check(npcTamam && yanlisYer.length === 0 && tumBelgeler.length === new Set(tumBelgeler).size,
    'hikâye yerleşimi: yedi NPC kurulmalı (Zeynep dışındakiler görünür, oteldekiler kat zemininde, çatıda değil); her belge kendi binasındaki konteynere bir kez düşmeli', { npc, yanlisYer, belge });

  // 3) santral: türbin → elektrik
  const santral = await S(() => {
    const S = window.__game.session;
    S.act('quest_start', { id: 's_power' });
    S.giveLocal('engine_part', 1); S.giveLocal('wire', 3); S.giveLocal('electronics', 2);
    S.act('power_restore', {});
    S.quests.onInteract('dam_control');
    return { power: S.flags.power_restored, street: S.env.streetPower, pumps: S.flags.gas_power, quest: S.quests.state('s_power') };
  });
  log('santral', santral);
  check(santral && santral.power && santral.street === true && santral.pumps && ['active', 'done'].includes(santral.quest), 'santral: türbin çalışınca elektrik gelmeli (sokak lambaları, pompalar), santral görevi başlamış olmalı', santral);

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
  const fener = await S(() => {
    const S = window.__game.session, W = S.storyWorld, sh = W.ship;
    const xz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    // yaklaşma: gemi açıktaki bekleme noktasından kıyıya doğru kaç m ilerledi
    return { lit: S.flags.lighthouse_lit, beam: W.beam && W.beam.g.visible, ship: sh && [Math.round(sh.g.position.x), Math.round(sh.g.position.z)], sea: S.endings.readiness().sea.detail, yaklasma: sh ? +(xz(sh.far, sh.near) - xz(sh.g.position, sh.near)).toFixed(2) : null };
  });
  log('fener', fener);

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
  const kanliAy = await S(() => { const S = window.__game.session; return { frenzy: S.zombies.frenzy, blood: Math.round(S.env._blood * 100) / 100 }; });
  log('kanlı ay', kanliAy);
  check(fener && fener.lit && fener.beam === true && Array.isArray(fener.ship) && fener.ship.every(Number.isFinite) && fener.yaklasma > 0.5 && /Gemi bekliyor ✓/.test(fener.sea || '') && kanliAy && kanliAy.frenzy === true && kanliAy.blood > 0.5,
    'gece: fener yanıp huzme görünmeli, gemi işarete cevap verip kıyıya yaklaşmalı (deniz kaçışı gemiyi bekler); Kanlı Ay zombileri kudurtup gökyüzünü 4 sn içinde kızıla döndürmeli', { fener, kanliAy });
  await S(() => { const S = window.__game.session; S.emit({ k: 'bloodmoon', on: false }); S.time.set(S.time.total + ((24 * 60 + 10 * 60) - S.time.minuteOfDay)); });

  // 6) pist enkazı: araca halatla bağla, sür ve pistten çek
  const halat = await S(() => {
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
  });
  log('halat', halat);
  const cekildi = await S(() => {
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
    return { moved: Math.round((t.z - z0) * 10) / 10, midSpeed: sp, wreck: [Math.round(t.x), Math.round(t.z)], off: W.offRunway(w), car: [Math.round(v.pos.x), Math.round(v.pos.z)], cam: !!c, midZ: Math.round(mid.z) };
  });
  log('çekildi', cekildi);
  await shot(page, '/tmp/st-tow.png');
  // kalan iki enkaz: poz eşitleme yoluyla pistten çekilmiş say → host pist temiz kararı
  const pist = await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    S.vehicles.exitLocal();
    W.detach(W.wrecks[0]);
    W.wrecks.forEach((w, i) => { if (!W.offRunway(w)) { const t = w.d.body.translation(); S.act('wreck_pose', { i, p: [t.x, t.y + 0.5, -740, 0, 0, 0, 1] }); W.setWreckPose(i, [t.x, t.y + 0.5, -740, 0, 0, 0, 1]); } });
    window.__step(180);
    return { clear: S.flags.runway_clear, off: W.wrecks.map((w) => W.offRunway(w)) };
  });
  log('pist', pist);
  check(halat && halat.joint && halat.mode === 'drive' && halat.n === 3 && halat.mass >= 400 && halat.mass <= 650
    && cekildi && cekildi.midSpeed > 1 && cekildi.moved > 8 && cekildi.off === true && pist && pist.clear && pist.off.length === 3 && pist.off.every(Boolean),
    'pist enkazı: yarım tonluk enkaz ip eklemiyle araca bağlanmalı, araç onu halatla pistin dışına çekmeli; üç enkaz dışarıdayken pist temiz sayılmalı', { halat, cekildi, pist });

  // 7) yardım paketi (paraşüt, fiziksel düşüş, rüzgârla hedefe süzülme)
  const paket = await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    S.local.spawnAt(-280, S.world.terrain.heightAt(-280, 150) + 0.3, 150, 0);
    W.hostAirdrop();
    window.__step(300);
    const d = W.drops[0];
    if (!d) return null;
    const p = d.crate.position;
    window.__still([p.x + 22, p.y + 2, p.z + 16], [p.x, p.y + 2.5, p.z]);
    return { y0: Math.round(p.y - d.gy) };
  });
  log('paket', paket);
  await shot(page, '/tmp/st-airdrop.png');
  const paketIndi = await S(() => {
    const S = window.__game.session, d = S.storyWorld.drops[0];
    let n = 0;
    while (!d.landed && n < 2400) { window.__step(60); n += 60; }
    window.__step(120);
    const p = d.crate.position;
    window.__still([p.x + 9, p.y + 3, p.z + 7], [p.x, p.y, p.z]);
    return { landed: d.landed, secs: Math.round(n / 60), dz: Math.round(Math.hypot(p.x - d.x, p.z - d.z)), cont: !!S.loot.byId.get(d.ct.id), atCrate: Math.abs(d.ct.x - p.x) < 0.1 };
  });
  log('paket indi', paketIndi);
  // 115 m'den bırakılır: serbest düşüşte 5 sn'de yere varırdı. Bırakma noktası hedefe 24 m uzakta: süzülme yaklaştırmalı
  check(paket && paket.y0 > 20 && paket.y0 < 116 && paketIndi && paketIndi.landed && paketIndi.dz < 20 && paketIndi.cont && paketIndi.atCrate,
    'yardım paketi: paraşütle yavaş düşmeli (5 sn sonra hâlâ havada), hedefe süzülüp yere inmeli, sandıkla birlikte duran aranabilir konteyner olmalı', { paket, paketIndi });
  await shot(page, '/tmp/st-airdrop2.png');

  // 8) düşen uçak
  const ucakDusuyor = await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    W.hostCrash(true);
    window.__step(330);
    const c = W.crashes[0];
    if (!c) return null;
    const p = c.g.position;
    window.__still([c.x + 60, c.gy + 25, c.z + 60], [p.x, p.y, p.z]);
    return { y: Math.round(p.y - c.gy) };
  });
  log('uçak düşüyor', ucakDusuyor);
  await shot(page, '/tmp/st-crash.png');
  const ucakDustu = await S(() => {
    const S = window.__game.session, c = S.storyWorld.crashes[0];
    window.__step(360);
    window.__still([c.x + 22, c.gy + 8, c.z + 18], [c.x, c.gy + 1, c.z]);
    return { done: c.done, cont: !!S.loot.byId.get('dyn:' + c.id), fire: (S.combat.fireAreas || []).length };
  });
  log('uçak düştü', ucakDustu);
  check(ucakDusuyor && ucakDusuyor.y > 5 && ucakDusuyor.y < 130 && ucakDustu && ucakDustu.done && ucakDustu.cont && ucakDustu.fire >= 1,
    'düşen uçak: 5,5 sn sonra hâlâ havada alçalmalı, sonra yere çakılıp kargo bölmesi konteyneri ve yangın alanı bırakmalı', { ucakDusuyor, ucakDustu });
  await shot(page, '/tmp/st-crash2.png');

  // 9) sarsıntı: fiziksel nesneler sarsılır
  const sarsinti = await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    const pr = S.props.props.find((p) => p.alive);
    if (pr) S.local.spawnAt(pr.d.body.translation().x + 4, pr.d.body.translation().y + 0.5, pr.d.body.translation().z, 0);
    window.__step(20);
    const a = pr ? { ...pr.d.body.translation() } : null;
    W.hostTremor();
    // 150 kare tek tek ilerletilir (davranış aynı): nesnenin en büyük yer değiştirmesi de ölçülür
    let tepe = 0;
    for (let i = 0; i < 150; i++) { window.__step(1); if (pr) { const q = pr.d.body.translation(); tepe = Math.max(tepe, Math.hypot(q.x - a.x, q.y - a.y, q.z - a.z)); } }
    const b = pr ? pr.d.body.translation() : null;
    return { moved: a ? Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 100) / 100 : null, left: Math.round(W.tremorT * 10) / 10, tepeMm: pr ? Math.round(tepe * 1000) : null, uyanik: pr ? !pr.d.body.isSleeping() : null, kamera: +(S.local.camShake || 0).toFixed(2) };
  });
  log('sarsıntı', sarsinti);
  check(sarsinti && sarsinti.left > 0 && sarsinti.left < 6 && sarsinti.kamera > 0 && sarsinti.uyanik === true && sarsinti.tepeMm >= 3,
    'sarsıntı: sürmeli, kamerayı sarsmalı, yakındaki fiziksel nesneyi uyandırıp yerinden oynatmalı (en az 3 mm)', sarsinti);
  await S(() => window.__resume());
  await wait(800);

  // 10) olay kartları: yeni olaylar (seçim → etki)
  const kartlar = [];
  for (const id of ['harvest', 'thick_fog', 'deer_herd', 'hidden_cache', 'fever', 'airdrop', 'prison_riot']) {
    await S((id) => { const S = window.__game.session; window.__game.ui.closePanel(); S.events.trigger(id); }, id);
    await wait(700);
    if (id === 'harvest') await shot(page, '/tmp/st-event.png');
    // seçimden hemen sonra: hangi kart açıktı, karar kaydedildi mi, olayın etkisi (aynı değerlendirmede, zamanla bozulmadan)
    kartlar.push(await S((id) => {
      const S = window.__game.session, W = S.storyWorld, p = window.__game.ui.panel;
      const aktif = S.events.active ? S.events.active.id : null, n0 = S.results.choices.length, dyn0 = W.dyn.length, drops0 = W.drops.length;
      if (p && p.name === 'event') { const c = [...document.querySelectorAll('.event-card .choice')].find((b) => !b.classList.contains('disabled')); c && c.click(); }
      return { id, aktif, panel: p && p.name, kayit: S.results.choices.length - n0, hava: S.weather.type, isyan: !!S.flags.prison_riot, yeniKonteyner: W.dyn.length - dyn0, yeniPaket: W.drops.length - drops0 };
    }, id));
    await wait(500);
  }
  log('olay kartları', kartlar.map((k) => k && [k.id, k.aktif, k.kayit]));
  const kendi = kartlar.filter((k) => k && k.aktif === k.id);
  // zamanlanmış başka bir olay kartı araya girerse (aktif ≠ id) o tur sayılmaz; etkiler yalnız kendi kartında değerlendirilir
  const etki = (id, f) => { const k = kendi.find((q) => q.id === id); return k ? f(k) : null; };
  const etkiler = { sis: etki('thick_fog', (k) => k.hava === 'fog'), zula: etki('hidden_cache', (k) => k.yeniKonteyner === 1), paket: etki('airdrop', (k) => k.yeniPaket === 1), isyan: etki('prison_riot', (k) => k.isyan) };
  check(kartlar.length === 7 && kartlar.every((k) => k && k.panel === 'event') && kendi.length >= 5 && kendi.every((k) => k.kayit === 1)
    && Object.values(etkiler).every((v) => v !== false) && Object.values(etkiler).filter((v) => v === true).length >= 3,
    'olay kartları: her kart açılmalı, seçilen karar kaydedilmeli (en az 5/7 kendi olayı), kararların etkisi görülmeli (sis, zula, yardım paketi, cezaevi isyanı)', { etkiler, kartlar });
  log('olaylar', await S(() => { const S = window.__game.session; return { weather: S.weather.type, dyn: S.storyWorld.dyn.map((c) => c.label), riot: S.flags.prison_riot, choices: S.results.choices.slice(-4) }; }));

  // 11) kayıt (hikâye dünyası durumu dahil)
  const kayit = await S(() => {
    const S = window.__game.session, W = S.storyWorld; const d = S.serialize();
    return { wrecks: d.story.wrecks.length, dyn: d.story.dyn.length, drops: d.story.drops.length, crashes: d.story.crashes.length, size: JSON.stringify(d).length, canli: [W.wrecks.length, W.dyn.length, W.drops.length, W.crashes.length] };
  });
  log('kayıt', kayit);
  check(kayit && [kayit.wrecks, kayit.dyn, kayit.drops, kayit.crashes].every((n, i) => n === kayit.canli[i]) && kayit.wrecks === 3 && kayit.drops >= 1 && kayit.crashes >= 1 && kayit.dyn >= 2 && kayit.size > 5000, 'kayıt: hikâye dünyası (enkaz, yardım paketi, düşen uçak, dinamik konteyner) kayda eksiksiz girmeli', kayit);

  // 12) zaman çizelgesi
  await S(() => window.__game.ui.openJournal('timeline'));
  await wait(1000);
  await shot(page, '/tmp/st-timeline.png');
  const cizelge = await S(() => { const S = window.__game.session, T = S.timeline; return { n: T.list.length, kinds: [...new Set(T.list.map((e) => e.kind))], dom: document.querySelectorAll('.tl-entry').length, santral: S.quests.state('s_power') }; });
  log('çizelge', cizelge);
  check(cizelge && cizelge.n >= 8 && ['world', 'event', 'questDone'].every((k) => cizelge.kinds.includes(k)) && cizelge.dom >= cizelge.n && cizelge.santral === 'done',
    'zaman çizelgesi: dünya olaylarını, kararları ve biten görevi listelemeli (parçalar toplanıp türbin başlatılınca santral görevi tamamlanır)', cizelge);
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
  const ucakHazir = await S(() => window.__game.session.endings.readiness().plane);
  log('uçak hazır', ucakHazir);
  const kalkis = await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    window.__pause();
    S.act('plane_takeoff', {});
    const ph = [];
    for (let i = 0; i < 26; i++) { window.__step(30); if (W.flight && ph[ph.length - 1] !== W.flight.phase) ph.push(W.flight.phase); }
    const g = S.world.plane.group;
    const dx = W.flight ? Math.round(g.position.x - W.flight.start.x) : null;
    window.__still([g.position.x - 34, g.position.y + 8, g.position.z + 30], [g.position.x, g.position.y + 1, g.position.z]);
    return { phases: ph, x: Math.round(g.position.x), alt: Math.round(g.position.y - S.world.terrain.heightAt(g.position.x, g.position.z)), escaped: S.endings.escaped.has(S.localId), dx };
  });
  log('kalkış', kalkis);
  check(ucakHazir && ucakHazir.ok === true && kalkis && kalkis.phases[0] === 'taxi' && kalkis.phases.includes('roll') && kalkis.dx > 30 && Number.isFinite(kalkis.alt) && kalkis.alt > -1 && kalkis.escaped === true,
    'uçakla kaçış: hazırlıklar tamam görünmeli (onarım, 60 L yakıt, temiz pist, pilot); kalkış taksiden kalkış koşusuna geçip pistte ilerlemeli, yakındaki oyuncu uçağa binmeli', { ucakHazir, kalkis });
  await shot(page, '/tmp/st-takeoff.png');
  await S(() => window.__resume());
  // sonuç ekranı beklemesi artık yutulmaz: 30 sn içinde açılmazsa denetim hatası olarak raporlanır
  const sonucEkrani = await page.waitForFunction(() => !!document.querySelector('.results'), null, { timeout: 30000 }).then(() => true, () => false);
  await wait(800);
  await shot(page, '/tmp/st-results.png');
  const sonuc = await S(() => {
    const el = document.querySelector('.results'), S = window.__game.session;
    return el ? { title: el.querySelector('h1').textContent, epilogue: [...el.querySelectorAll('.epilogue p')].map((p) => p.textContent.slice(0, 48)), win: el.classList.contains('win'), gorunur: el.getClientRects().length > 0, how: S ? S.endings.escapedHow : null } : null;
  });
  log('sonuç', sonuc);
  check(sonucEkrani && sonuc && sonuc.how === 'plane' && sonuc.win && sonuc.gorunur && sonuc.title && sonuc.epilogue.length >= 3,
    'sonuç ekranı: kaçıştan sonra 30 sn içinde görünür açılmalı (uçakla kaçış, hayatta kalındı), epilog kararlara göre en az 3 satır olmalı', { sonucEkrani, sonuc });
};
