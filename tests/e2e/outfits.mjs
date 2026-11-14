// Nadir kıyafet kombinasyonu testi (takımda): her tabanda bütün kafa × gövde setleri (bacak/ayak gövdeyi izler)
// oyunun CharacterFactory'siyle kurulur. Denetimler: her kombinasyon kuruluyor ve geometrisi sonlu (NaN yok);
// boyun ve bel birleşimlerinde görünür boşluk yok (kafa parçasının en alt halkası gövde parçasının en üst halkasının
// 2 cm'den, gövde altı bacak üstünün 3 cm'den fazla üstünde değil); parçalar birbirinin içine aşırı gömülmüyor
// (çakışma sınırı ölçülen dağılıma göre); gözlü her kafada (Swat kaskı hariç) iki göz bulunur ve yüz ağı (iris, dudak)
// kurulur (kadın kafalarında göz malzemesi 'Brown'; 'Black' dudak halkası/boyunluk göz sayılmaz); her kombinasyonda
// ayakkabı tabanı yuvası (SLOT.soles) var. Izgara görüntüsü: /tmp/combos-men.png, /tmp/combos-women.png
// (eski yoklama tools/dev/outfit-combos.mjs bu senaryoya taşındı).
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 200000 });
  await wait(800);
  // Özelleştirme → Koleksiyonlar (gerçek düğmeler): kıyafet seti değişir, karakterin kafası (yüz ve saç) korunur; başlıklı
  // koleksiyonlar (İşçi baret, Askerî kask) şapka yuvasından. Ayarlar sonunda eski hâline döner.
  const koleksiyon = await evalJS(page, () => {
    const g = window.__game, M = g.ui.menus, saved = JSON.stringify(g.settings.get('player.appearance') || {});
    const out = [];
    for (const id of ['mert', 'zulal', 'bora']) {
      M.custChar = id; M.custTab = 'collections'; M.openCustomize();
      const head0 = M.lookFor(id).outfit.head;
      for (const b of [...document.querySelectorAll('.collections button')]) {
        const name = b.textContent.trim();
        [...document.querySelectorAll('.collections button')].find((x) => x.textContent.trim() === name).click(); // her tıklamada ekran yeniden çizilir
        const L = M.lookFor(id);
        out.push({ id, name, head0, head: L.outfit.head, body: L.outfit.body, hat: L.hat });
      }
    }
    g.settings.set('player.appearance', JSON.parse(saved));
    M.showMain();
    return out;
  });
  log('koleksiyonlar', koleksiyon.length, koleksiyon.filter((k) => k.name === 'İşçi' || k.name === 'Askerî'));
  const kafa = koleksiyon.filter((k) => k.head !== k.head0);
  const baslik = koleksiyon.filter((k) => (k.name === 'İşçi' && k.hat !== 'hardhat') || (k.name === 'Askerî' && k.hat !== 'helmet'));
  if (koleksiyon.length < 24 || kafa.length || baslik.length) errors.push('[assert] koleksiyon karakterin kafasını (yüz/saç) korumalı, İşçi/Askerî başlığı şapka yuvasından gelmeli ' + JSON.stringify({ n: koleksiyon.length, kafa: kafa.slice(0, 4), baslik: baslik.slice(0, 4) }));
  for (const gname of ['men', 'women']) {
    const r = await evalJS(page, async (gname) => {
      const g = window.__game;
      cancelAnimationFrame(g.raf); g.loop = () => {};
      document.getElementById('ui-root').style.display = 'none';
      const { Avatar } = await import('/src/entities/Avatar.js');
      const { OUTFIT_SETS, SLOT } = await import('/src/entities/CharacterFactory.js');
      for (const { av } of g.menu.avatars) av.root.visible = false;
      if (window.__combos) for (const a of window.__combos) { g.scene.remove(a.root); a.dispose && a.dispose(); }
      const sets = OUTFIT_SETS[gname];
      const T = g.world.terrain, F = g.menu.F, P = g.world.physics;
      // düz, binasız bir alan (motion testiyle aynı arama)
      let base = window.__combosBase || null;
      for (let r = 10; r < 220 && !base; r += 5) for (let a = 0; a < 6.28 && !base; a += 0.3) {
        const x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r, h = T.heightAt(x, z);
        if (T.waterLevelAt(x, z) > h - 0.3) continue;
        let flat = true;
        for (let dx = -8; dx <= 8 && flat; dx += 2) for (let dz = -14; dz <= 8 && flat; dz += 2) if (Math.abs(T.heightAt(x + dx, z + dz) - h) > 0.4 || g.world.buildingAt(x + dx, z + dz)) flat = false;
        if (flat && !P.overlapsBox(x - 8, z - 14, x + 8, z + 8, h + 0.1, h + 3)) base = { x, z };
      }
      base = window.__combosBase = base || { x: F.x + 6, z: F.z + 10 };
      const list = [], gaps = [];
      let i = 0;
      const cols = sets.body.length;
      for (const head of sets.head) for (const body of sets.body) {
        const look = { base: gname === 'women' ? 'female' : 'male', outfit: { head, body }, skin: '#e0a07a', hairColor: '#3b2314', dirt: 0.2 };
        const av = new Avatar(g, look, {});
        const col = i % cols, row = Math.floor(i / cols);
        const x = base.x + (col - (cols - 1) / 2) * 0.9, z = base.z - row * 1.1;
        av.root.position.set(x, T.heightAt(x, z) + row * 0.001, z);
        g.scene.add(av.root);
        av.update(0.5, { mode: 'ground', speed: 0, yaw: Math.PI });
        list.push(av);
        // boşluk ölçümü: kafa parçası alt halkası ↔ gövde parçası üst halkası (boyun), gövde altı ↔ bacak üstü (bel)
        const c = av.ch.combo, P = c.geo.attributes.position.array, part = c.part;
        const ring = (pt, side) => { let y = side > 0 ? -Infinity : Infinity; for (let k = 0; k < part.length; k++) if (part[k] === pt) y = side > 0 ? Math.max(y, P[k * 3 + 1]) : Math.min(y, P[k * 3 + 1]); return y; };
        const neck = ring(0, -1) - ring(1, +1), waist = ring(1, -1) - ring(2, +1);
        let finite = true;
        for (let k = 0; k < P.length; k++) if (!Number.isFinite(P[k])) { finite = false; break; }
        // yüz: iki göz verisi + yüz ağı (iris/dudak; Head noktasında); taban: ayakkabı tabanı yuvası
        const face = !!(c.face && c.face.eyes.length === 2) && av.ch.anchors.head.children.some((o) => o.name === 'face');
        const lowEye = c.slot.some((s, k) => s === SLOT.eyes && part[k] === 0 && P[k * 3 + 1] < 1.67);
        gaps.push({ head, body, neck: +neck.toFixed(3), waist: +waist.toFixed(3), finite, parts: new Set(part).size, face, lowEye, soles: c.slot.includes(SLOT.soles) });
        i++;
      }
      window.__combos = list;
      const rows = Math.ceil(i / cols), by = T.heightAt(base.x, base.z);
      const cam = g.gfx.camera;
      cam.position.set(base.x, by + 2.2 + rows * 0.35, base.z + 4.2 + rows * 0.9);
      cam.lookAt(base.x, by + 0.9, base.z - (rows - 1) * 0.55);
      g.env.update(0.016, g.time, 12 * 60, cam.position, null);
      g.gfx.render(0.016, g.time);
      return { count: i, gaps };
    }, gname);
    // boyun: kafa altı gövde üstünün 2 cm'den fazla ÜSTÜNDE ise görünür boşluk; bel için 3 cm
    const bad = r.gaps.filter((x) => x.neck > 0.02 || x.waist > 0.03);
    log(gname, 'kombinasyon', r.count, 'boşluklu', bad.length, bad.slice(0, 12));
    const sample = r.gaps.slice(0, 4);
    log(gname, 'örnek ölçüler', sample);
    if (bad.length) errors.push(`[assert] ${gname}: ${bad.length} kombinasyonda boyun/bel boşluğu: ` + JSON.stringify(bad.slice(0, 6)));
    const nan = r.gaps.filter((x) => !x.finite);
    if (!(r.count >= 4)) errors.push(`[assert] ${gname}: kıyafet kombinasyonları kurulamadı ` + JSON.stringify({ count: r.count }));
    if (nan.length) errors.push(`[assert] ${gname}: ${nan.length} kombinasyonda geometri sonlu değil (NaN) ` + JSON.stringify(nan.slice(0, 4)));
    // çakışma: kafa parçası gövdenin içine, gövde bacağın içine aşırı gömülmesin (yaka/kemer örtüşmesi doğal; sınır
    // ölçülen dağılımın çok dışı)
    const deep = r.gaps.filter((x) => x.neck < -0.25 || x.waist < -0.25);
    if (deep.length) errors.push(`[assert] ${gname}: ${deep.length} kombinasyonda parçalar aşırı iç içe (çakışma) ` + JSON.stringify(deep.slice(0, 4)));
    // yüz: Swat kaskı dışındaki her kafada iki göz + yüz ağı; göz yuvası çene/boyunda (1,67 m altı) olmamalı
    const noFace = r.gaps.filter((x) => (x.head !== 'Swat' && !x.face) || (x.head === 'Swat' && x.face) || x.lowEye);
    if (noFace.length) errors.push(`[assert] ${gname}: ${noFace.length} kombinasyonda yüz verisi hatalı (iki göz/yüz ağı yok ya da göz 1,67 m altında) ` + JSON.stringify(noFace.slice(0, 6).map((x) => [x.head, x.body, x.face, x.lowEye])));
    // taban: her kombinasyonda ayakkabı tabanı yuvası
    const noSole = r.gaps.filter((x) => !x.soles);
    if (noSole.length) errors.push(`[assert] ${gname}: ${noSole.length} kombinasyonda ayakkabı tabanı (SLOT.soles) yok ` + JSON.stringify(noSole.slice(0, 6).map((x) => [x.head, x.body])));
    log(gname, 'yüz', r.gaps.filter((x) => x.face).length + '/' + r.count, 'taban', r.gaps.filter((x) => x.soles).length + '/' + r.count);
    log(gname, 'boyun aralığı', [Math.min(...r.gaps.map((x) => x.neck)), Math.max(...r.gaps.map((x) => x.neck))], 'bel aralığı', [Math.min(...r.gaps.map((x) => x.waist)), Math.max(...r.gaps.map((x) => x.waist))]);
    await shot(page, `/tmp/combos-${gname}.png`);
  }
};
