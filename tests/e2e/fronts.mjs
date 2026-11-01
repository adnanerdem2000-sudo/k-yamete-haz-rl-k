// Dolap kapakları ve çekmeceler: konteyner açılınca (depo paneli / arama) ön yüz menteşesinden gerçekten açılır,
// kapanınca kapanır; aranmış konteyner aralık kalır; kilitli kasa açılmaz; başka biri kullanırken (Loot.inUse) de
// açılır. Fizikli çekmeceler mobilyanın gerçek ön yüzünde ve yüksekliğinde. Oyun döngüsü durdurulur, 1/60 sn adım.
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  const inv = await evalJS(page, () => {
    const g = window.__game; cancelAnimationFrame(g.raf); g.loop = () => {};
    const S = g.session;
    g.ui.onLockChange = () => {};
    for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel();
    S.zombies.cap = 0; for (const id of [...S.zombies.list.keys()]) S.zombies.removeZombie(id);
    window.__step = (frames) => { const inp = g.input; for (let i = 0; i < frames; i++) { inp.down.clear(); S.update(1 / 60); inp.endFrame(); } };
    const by = {};
    for (const c of S.fronts.cands) by[c.ct.type] = (by[c.ct.type] || 0) + 1;
    return { aday: S.fronts.cands.length, tur: by, cekmece: S.drawers ? S.drawers.cands.length : 0 };
  });
  log('ön yüz adayları', inv);
  check(inv.aday > 250 && ['wardrobe', 'fridge', 'kitchen_cabinet', 'stove', 'locker', 'ammo_crate', 'safe', 'shelf_drinks'].every((t) => inv.tur[t] > 0), 'açılır ön yüzü olan konteyner türleri kurulmalı', inv);

  // her tür için: yakınına git → kapalı; panel aç → açık (serbest kenar öne çıkar); kapat → kapanır; ara → aralık
  const types = ['wardrobe', 'fridge', 'kitchen_cabinet', 'stove', 'locker', 'weapon_locker', 'ammo_crate', 'cabin_chest', 'shelf_drinks', 'bathroom_cabinet', 'lab_bench', 'toolbox'];
  const res = [];
  for (const type of types) {
    const r = await evalJS(page, (type) => {
      const S = window.__game.session, F = S.fronts, T = S.world.terrain;
      const c = F.cands.find((q) => q.ct.type === type && !q.ct.locked && !S.loot.state.get(q.ct.id));
      if (!c) return { type, yok: true };
      const ct = c.ct, fx = Math.sin(ct.yaw), fz = Math.cos(ct.yaw);
      const px = ct.x + fx * 1.3, pz = ct.z + fz * 1.3;
      S.local.spawnAt(px, S.world.physics.groundHeight(px, pz, ct.fy + 1.5) + 0.02, pz, 0);
      F.t = 0; window.__step(3);
      // öğenin dünyadaki "serbest kenar" noktası: örnek matrisiyle birim kutunun ilgili köşesi
      const edge = () => {
        const a = F.active.find((q) => q.ct.id === ct.id); if (!a) return null;
        const el = a.els[0], im = F.meshes[el.e.mat], M = new (window.__game.gfx.camera.matrix.constructor)();
        im.getMatrixAt(el.slot, M);
        const e = el.e, p = new (window.__game.gfx.camera.position.constructor)(e.k === 'door' && e.hinge === 'R' ? 0 : 1, e.k === 'lid' ? 0 : 1, 0).applyMatrix4(M);
        if (e.k === 'lid') { const q = new (window.__game.gfx.camera.position.constructor)(1, 1, 0).applyMatrix4(M); return { y: q.y, f: (q.x - ct.x) * fx + (q.z - ct.z) * fz }; }
        return { y: p.y, f: (p.x - ct.x) * fx + (p.z - ct.z) * fz };
      };
      const e0 = edge(), o0 = F.openOf(ct.id);
      S.ui.openStorage({ kind: 'container', id: ct.id, label: ct.label });
      window.__ct = { ct, edge };
      return { type, id: ct.id, kapali: o0, kenar0: e0 };
    }, type);
    if (r.yok) { res.push(r); continue; }
    await evalJS(page, () => window.__step(70));
    const r2 = await evalJS(page, () => {
      const S = window.__game.session, F = S.fronts, { ct, edge } = window.__ct;
      const o1 = F.openOf(ct.id), e1 = edge(), use = S.loot.inUse.get(ct.id) || 0;
      window.__game.ui.closePanel();
      return { acik: o1, kenar1: e1, kullanim: use };
    });
    if (type === 'wardrobe' || type === 'fridge') await shot(page, `/tmp/fronts-${type}.png`);
    await evalJS(page, () => window.__step(70));
    const r3 = await evalJS(page, () => {
      const S = window.__game.session, F = S.fronts, { ct } = window.__ct;
      const o2 = F.openOf(ct.id), use = S.loot.inUse.get(ct.id) || 0;
      S.applyAction('search_done', { id: ct.id }, S.localId); window.__game.ui.closePanel();
      return { kapandi: o2, kullanim2: use };
    });
    await evalJS(page, () => window.__step(70));
    const r4 = await evalJS(page, () => { const S = window.__game.session, { ct } = window.__ct; return { arandi: S.fronts.openOf(ct.id) }; });
    res.push({ ...r, ...r2, ...r3, ...r4 });
  }
  for (const r of res) log('ön yüz', r);
  for (const r of res) {
    if (r.yok) continue;
    const moved = r.kenar0 && r.kenar1 ? (r.type === 'ammo_crate' || r.type === 'cabin_chest' ? r.kenar1.y - r.kenar0.y : r.type === 'stove' ? r.kenar1.f - r.kenar0.f : r.kenar1.f - r.kenar0.f) : 0;
    check(r.kapali.every((v) => v < 0.01), `${r.type}: başta kapalı olmalı`, r);
    check(r.acik.every((v) => v > 0.95) && moved > 0.15 && r.kullanim > 0, `${r.type}: panel açıkken ön yüz açılmalı (serbest kenar öne/yukarı)`, { ...r, moved });
    check(r.kapandi.every((v) => v < 0.02) && r.kullanim2 === 0, `${r.type}: panel kapanınca kapanmalı`, r);
    check(r.arandi.every((v) => v > 0.1 && v < 0.5), `${r.type}: aranmış konteyner aralık kalmalı`, r);
  }
  check(res.filter((r) => !r.yok).length >= 9, 'çoğu ön yüz türü denenebilmeli', res.map((r) => r.type + (r.yok ? ':yok' : '')));

  // kilitli kasa: biri "kullanıyor" olsa da kilitliyken açılmaz; başka oyuncunun kullanımı (inUse) açar
  const lock = await evalJS(page, () => {
    const S = window.__game.session, F = S.fronts;
    const safe = F.cands.find((q) => q.ct.type === 'safe');
    const other = F.cands.find((q) => q.ct.type === 'wardrobe' && !S.loot.state.get(q.ct.id));
    const go = (c) => { const ct = c.ct, px = ct.x + Math.sin(ct.yaw) * 1.3, pz = ct.z + Math.cos(ct.yaw) * 1.3; S.local.spawnAt(px, S.world.physics.groundHeight(px, pz, ct.fy + 1.5) + 0.02, pz, 0); F.t = 0; window.__step(2); };
    const out = {};
    if (safe) { go(safe); S.applyAction('cont_use', { id: safe.ct.id, on: true }, 'baskasi'); window.__step(70); out.kasa = F.openOf(safe.ct.id); S.applyAction('cont_use', { id: safe.ct.id, on: false }, 'baskasi'); }
    if (other) { go(other); S.applyAction('cont_use', { id: other.ct.id, on: true }, 'baskasi'); window.__step(70); out.uzak = F.openOf(other.ct.id); S.applyAction('cont_use', { id: other.ct.id, on: false }, 'baskasi'); window.__step(70); out.uzakSonra = F.openOf(other.ct.id); }
    return out;
  });
  log('kilit/uzak kullanım', lock);
  check(!lock.kasa || lock.kasa.every((v) => v < 0.01), 'kilitli kasa açılmamalı', lock);
  check(lock.uzak && lock.uzak.every((v) => v > 0.95) && lock.uzakSonra.every((v) => v < 0.02), 'başka oyuncunun kullanımı (ağdan) kapağı açıp kapamalı', lock);

  // fizikli çekmece: mobilyanın kayıtlı yönünde ve ön yüzünde, yükseklik zemine göre
  const dr = await evalJS(page, () => {
    const S = window.__game.session, D = S.drawers;
    if (!D) return null;
    const out = [];
    for (const type of ['nightstand', 'dresser', 'desk', 'filing_cabinet']) {
      const ct = D.cands.find((q) => q.type === type && q.yaw !== undefined);
      if (!ct) continue;
      const px = ct.x + Math.sin(ct.yaw) * 1.3, pz = ct.z + Math.cos(ct.yaw) * 1.3;
      S.local.spawnAt(px, S.world.physics.groundHeight(px, pz, ct.fy + 1.5) + 0.02, pz, 0);
      D.t = 0; D.update(0.016);
      const r = D.active.get(ct.id); if (!r) continue;
      const t = r.d.body.translation(), fx = Math.sin(ct.yaw), fz = Math.cos(ct.yaw);
      out.push({ type, yonFarki: +(1 - (r.f.x * fx + r.f.z * fz)).toFixed(3), ileri: +((t.x - ct.x) * fx + (t.z - ct.z) * fz).toFixed(2), yukseklik: +(t.y - ct.fy).toFixed(2), boy: ct.fh });
    }
    return out;
  });
  log('çekmeceler', dr);
  check(dr && dr.length >= 3 && dr.every((d) => d.yonFarki < 0.01 && d.ileri > 0 && d.ileri < 0.4 && d.yukseklik > 0.2 && d.yukseklik < d.boy), 'çekmeceler mobilyanın ön yüzünde ve gövde yüksekliği içinde olmalı', dr);
};
