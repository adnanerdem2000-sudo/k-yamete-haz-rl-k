// Bölge turu: yeni bölgeleri havadan eğik açıyla görüntüler (görsel kontrol). → /tmp/reg-*.png
// Denetimler: her görünüm sonlu kamera/zemin konumuyla çizilir (çizim çağrısı, üçgen; kare siyah/tek renk değil);
// hedef noktası beklenen bölgenin platosunda (bölge yüksekliğinde); bölgelerin simge binaları kurulmuş; fener kulesi,
// santral kontrol paneli ve anakara köprüsünün tabliyesi (boğazın üstünde yürünebilir zemin) var.
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, () => {
    const g = window.__game;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    g.menu.group.visible = false;
    g.gfx.camera.far = 900; g.gfx.camera.updateProjectionMatrix();
  });
  const views = [
    ['farm', -640, 120, [60, 45, 90]], ['lighthouse', -598, 544, [40, 26, 50]], ['resort', -180, 700, [0, 50, -90]],
    ['prison', 700, -60, [-90, 55, 60]], ['airfield', 120, -760, [0, 80, 150]], ['village', -640, -490, [40, 40, 70]],
    ['dam', -490, -190, [70, 40, 30]], ['bridge', 600, -600, [-80, 50, 60]],
  ];
  // görünüm → [beklenen bölge (WorldLayout REGIONS), simge binalar (BUILDINGS)]; köprü bir platoda değil: tabliyesi denetlenir
  const BEKLENEN = { farm: ['ciftlik', ['barn']], lighthouse: ['fener', ['keeper']], resort: ['tatil', ['hotel']], prison: ['cezaevi', ['prison_admin']], airfield: ['havaalani', ['terminal', 'tower']], village: ['dagkoy', ['vil_cafe']], dam: ['baraj', ['powerplant']], bridge: [null, []] };
  const sonuc = [];
  for (const [name, x, z, off] of views) {
    const r = await evalJS(page, ([x, z, off]) => {
      const g = window.__game, T = g.world.terrain;
      const y = T.heightAt(x, z);
      const c = g.gfx.camera;
      c.position.set(x + off[0], y + off[1], z + off[2]);
      c.lookAt(x, y, z);
      g.world.vegetation.update(c.position, 420, true);
      g.env.update(0.016, g.time, 11 * 60, c.position, null);
      g.gfx.render(0.016, g.time);
      // ölçüm: Graphics.render sayaçları karenin bütün geçişleri için toplar; kare aynı görevde (tampon henüz
      // sunulmadan) küçük bir tuvale örneklenir: siyah/tek renk kare (NaN, gölgelendirici hatası) yakalanır
      const R = g.gfx.renderer, info = R.info.render;
      const cv = document.createElement('canvas'); cv.width = 48; cv.height = 27;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(R.domElement, 0, 0, cv.width, cv.height);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      const renk = new Set(); let maxL = 0;
      for (let i = 0; i < d.length; i += 4) { renk.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)); maxL = Math.max(maxL, 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); }
      const reg = T.regionAt(x, z);
      return { y: +y.toFixed(2), cam: c.position.toArray().map((v) => +v.toFixed(1)), calls: info.calls, tris: info.triangles, region: reg ? reg.id : null, plato: reg && reg.h !== undefined ? reg.h : null, renk: renk.size, maxL: Math.round(maxL) };
    }, [x, z, off]);
    log(name, r);
    sonuc.push({ name, ...(r || { eksik: true }) });
    await shot(page, `/tmp/reg-${name}.png`);
  }
  check(sonuc.length === views.length && sonuc.every((r) => r.calls > 0 && r.tris > 0), 'her bölge görünümü çizilmeli (çizim çağrısı ve üçgen > 0)', sonuc.map((r) => [r.name, r.calls, r.tris]));
  check(sonuc.every((r) => Number.isFinite(r.y) && Array.isArray(r.cam) && r.cam.every(Number.isFinite)), 'zemin yüksekliği ve kamera konumu sonlu olmalı (NaN yok)', sonuc.map((r) => [r.name, r.y, r.cam]));
  check(sonuc.every((r) => r.renk >= 8 && r.maxL >= 24), 'çizilen kare siyah ya da tek renk olmamalı', sonuc.map((r) => [r.name, r.renk, r.maxL]));
  const yanlisBolge = sonuc.filter((r) => BEKLENEN[r.name][0] && !(r.region === BEKLENEN[r.name][0] && Number.isFinite(r.plato) && Math.abs(r.y - r.plato) < 1));
  check(yanlisBolge.length === 0, 'bölge görünümlerinin hedefi beklenen bölgenin platosunda (bölge yüksekliğinde) olmalı', yanlisBolge.map((r) => [r.name, r.region, r.y, r.plato]));
  const yapi = await evalJS(page, async (beklenen) => {
    const { BRIDGE } = await import('/src/world/WorldLayout.js');
    const W = window.__game.world, T = W.terrain;
    const binalar = {};
    for (const [reg, ids] of Object.values(beklenen)) for (const id of ids) { const b = W.buildingById[id]; binalar[id] = !!b && b.spec.region === reg && !!b.box && Number.isFinite(b.box.minX + b.box.maxZ); }
    const L = W.lighthouse;
    const tabliye = W.physics.groundHeight(600, -600, BRIDGE.deck + 5);
    return {
      binalar,
      fener: L ? { x: Math.round(L.x), y: +L.y.toFixed(1), z: Math.round(L.z), isik: W.interactables.some((i) => i.type === 'lighthouse') } : null,
      santral: W.interactables.some((i) => i.type === 'dam_control'),
      kopru: { tabliye: +tabliye.toFixed(2), arazi: +T.heightAt(600, -600).toFixed(2), deck: BRIDGE.deck },
    };
  }, BEKLENEN);
  log('bölge yapıları', yapi);
  check(yapi && Object.keys(yapi.binalar).length >= 8 && Object.values(yapi.binalar).every(Boolean), 'bölgelerin simge binaları (ambar, fener bekçisi, otel, cezaevi idaresi, terminal, kule, köy kahvesi, santral) kendi bölgelerinde kurulmalı', yapi && yapi.binalar);
  check(yapi && yapi.fener && Math.hypot(yapi.fener.x + 598, yapi.fener.z - 544) < 10 && yapi.fener.y > 20 && yapi.fener.isik && yapi.santral,
    'fener kulesi (ışığıyla) burunda, santral kontrol paneli barajda kurulmalı', yapi && { fener: yapi.fener, santral: yapi.santral });
  check(yapi && yapi.kopru && yapi.kopru.tabliye - yapi.kopru.arazi > 5 && Math.abs(yapi.kopru.tabliye - yapi.kopru.deck) < 1,
    'anakara köprüsünün tabliyesi boğazın üstünde yürünebilir zemin olmalı', yapi && yapi.kopru);
};
