// Görsel regresyon (Aşama 8): istemdeki 12 sahne — ana menü, altı karakterin seçim ekranı, karakter yakın plan,
// başlangıç mahallesi, şehir merkezi, orman, bina içi, araç dışı + içi, zombi yakın plan, gece üs savunması, envanter,
// çok oyunculu lobi (14 görüntü: karakter yakın plan = özelleştirme vitrini + oyun içi yüz; araç = dışı + içi). Oyun döngüsü durdurulur; saat, hava, rüzgâr/su zamanı ve rastgelelik (Math.random
// sahne başında tohumlanır) sabitlenir; CSS animasyonları kapatılır. Arayüzlü sahneler tam sayfa (DOM + tuval), dünya
// sahneleri arayüz gizli tam sayfa (WebGL tamponu korunmadığından tuval ayrı çağrıda okunamaz: boş görüntü verir).
// tests/visual/baseline/<ad>.png ile sayfa içinde karşılaştırılır (kanal farkı > 40/255
// olan piksel oranı); eşik %2,5 (3B animasyonlu menü sahnelerinde %4). Yazılım GPU'sunda deterministik; başka GPU'da
// yeniden taban alınmalı. Taban almak: VISUAL_BASELINE=1 node tools/e2e.mjs visual · çıktı: /tmp/visual/<ad>.png
// VISUAL_QUALITY=ultra|high|medium|low: o kalite seviyesinde (oyun açılmadan ayarlanır) görüntü alınır, karşılaştırılmaz
// (çıktı /tmp/visual-<kalite>/) — kalite seviyelerinin görsel farkı için.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = path.join(ROOT, 'tests/visual/baseline');
const OUT = '/tmp/visual';

export default async ({ page, url, evalJS, log, errors, wait }) => {
  const VQ = process.env.VISUAL_QUALITY || '';
  const baseline = !!process.env.VISUAL_BASELINE && !VQ;
  const OUTD = VQ ? `/tmp/visual-${VQ}` : OUT;
  const results = {};
  fs.mkdirSync(OUTD, { recursive: true });
  if (VQ) {
    await page.addInitScript((q) => {
      try {
        const k = 'kiyamet_settings_v1', s = JSON.parse(localStorage.getItem(k) || '{}');
        s.graphics = { ...(s.graphics || {}), quality: q, shadows: q !== 'low', bloom: q !== 'low', grass: q !== 'low', ao: q === 'ultra', waterRefl: q === 'ultra', renderScale: 1, autoScale: false, viewDistance: q === 'ultra' ? 700 : q === 'high' ? 540 : 420 };
        localStorage.setItem(k, JSON.stringify(s));
      } catch { /* yoksay */ }
    }, VQ);
  }
  await page.addInitScript(() => {
    // tohumlanabilir rastgelelik: her sahne kurulumundan önce __seed(n)
    let s = 1;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    window.__seed = (n) => { s = (n >>> 0) || 1; Math.random = rnd; };
  });
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
  // ortak: döngüyü durdur/başlat, sabit çizim
  await evalJS(page, async () => {
    const g = window.__game;
    g.settings.set('player.name', 'Oyuncu');
    g.ui.onLockChange = () => {};
    const { windUniforms } = await import('/src/world/Vegetation.js');
    window.__wind = windUniforms;
    window.__loop0 = g.loop;
    window.__freeze = () => { cancelAnimationFrame(g.raf); g.loop = () => {}; g.gfx.autoScale = () => {}; g.gfx.dynScale = 1; g.gfx.basePixelRatio = 1; g.gfx.pixelRatio = 1; g.gfx.resize(); };
    window.__resume = () => { g.loop = window.__loop0; g.last = performance.now(); g.raf = requestAnimationFrame(() => g.loop()); };
    window.__clear = { type: 'clear', rain: 0, cloud: 0.35, fog: 0, wind: 1, snow: 0, storm: 0 };
    window.__draw = (hour, cam) => {
      const T = 1000;
      g.env.weather = window.__clear;
      g.env.update(0.016, T, hour * 60, cam.position, null);
      if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
      window.__wind.uTime.value = T;
      for (let i = 0; i < 2; i++) g.gfx.render(0.016, T);
    };
    window.__freeze();
  });
  const compare = async (name, buf, tol) => {
    fs.writeFileSync(path.join(OUTD, name + '.png'), buf);
    if (VQ) { results[name] = 'kaydedildi'; return; }
    const bp = path.join(BASE, name + '.png');
    if (baseline) { fs.mkdirSync(BASE, { recursive: true }); fs.writeFileSync(bp, buf); results[name] = 'taban alındı'; return; }
    if (!fs.existsSync(bp)) { results[name] = 'taban yok'; errors.push(`[assert] taban görüntü yok: ${name}`); return; }
    const d = await evalJS(page, async ([a, b]) => {
      const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { ratio: 1, why: 'boyut farkı' };
      const px = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
      const A = px(ia), B = px(ib);
      let bad = 0;
      for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) > 40 || Math.abs(A[i + 1] - B[i + 1]) > 40 || Math.abs(A[i + 2] - B[i + 2]) > 40) bad++;
      return { ratio: bad / (A.length / 4) };
    }, ['data:image/png;base64,' + buf.toString('base64'), 'data:image/png;base64,' + fs.readFileSync(bp).toString('base64')]);
    if (!d) { results[name] = 'karşılaştırılamadı'; errors.push(`[assert] karşılaştırılamadı: ${name}`); return; }
    results[name] = +(d.ratio * 100).toFixed(2) + '%' + (d.why ? ' ' + d.why : '');
    if (d.ratio > tol) errors.push(`[assert] görsel fark ${name}: %${(d.ratio * 100).toFixed(2)} (> %${(tol * 100).toFixed(1)}) → ${OUTD}/${name}.png`);
  };
  const pageShot = async () => { try { return await page.screenshot({ type: 'png', timeout: 120000 }); } catch (e) { errors.push('[assert] ekran görüntüsü alınamadı: ' + e.message.split('\n')[0]); return null; } };
  const run = async (name, fn, arg, kind, tol) => {
    const ok = await evalJS(page, fn, arg);
    if (ok === false || ok === undefined) { errors.push(`[assert] sahne kurulamadı: ${name}`); results[name] = 'kurulamadı'; return; }
    await wait(kind === 'page' ? 400 : 150); // <img> çözümleme / sunum
    const buf = await pageShot();
    if (buf) await compare(name, buf, tol);
  };
  // ------------------------------------------------------------------ menü sahneleri (arayüz + 3B menü dünyası)
  const menuSetup = async ([screen]) => {
    const g = window.__game;
    window.__seed(7);
    if (screen === 'main') g.ui.showMainMenu();
    else if (screen === 'chars') g.ui.menus.openCharacters();
    else if (screen === 'custom') g.ui.menus.openCustomize();
    else if (screen === 'lobby') { await g.net.host({ local: true, settings: { aiFill: 0 } }); g.ui.menus.openLobby(); }
    g.menu.t = 40; g.time = 1000;
    for (let i = 0; i < 3; i++) g.menu.update(0.016);
    window.__wind.uTime.value = 1000;
    for (let i = 0; i < 2; i++) g.gfx.render(0.016, 1000);
    return true;
  };
  await run('01-ana-menu', menuSetup, ['main'], 'page', 0.04);
  // altı karakter kartının hepsi görünsün: geniş görüntü alanı
  await page.setViewportSize({ width: 1600, height: 900 });
  await wait(400);
  await run('02-karakter-secimi', menuSetup, ['chars'], 'page', 0.04);
  await page.setViewportSize({ width: 960, height: 540 });
  await wait(400);
  await run('03a-karakter-ozellestirme', menuSetup, ['custom'], 'page', 0.04);
  await run('12-cok-oyunculu-lobi', menuSetup, ['lobby'], 'page', 0.04);
  await evalJS(page, () => { const g = window.__game; g.net.leave(); g.ui.showMainMenu(); });
  // ------------------------------------------------------------------ dünya sahneleri (menü dünyası, arayüz gizli)
  const worldSetup = ([c, t, hour]) => {
    const g = window.__game, T = g.world.terrain, cam = g.gfx.camera;
    window.__seed(11);
    document.getElementById('ui-root').style.display = 'none'; g.menu.group.visible = false;
    if (c) { cam.position.set(c[0], T.heightAt(c[0], c[2]) + c[1], c[2]); cam.lookAt(t[0], T.heightAt(t[0], t[2]) + t[1], t[2]); g.world.setRoofHidden && g.world.setRoofHidden(null); }
    else {
      const b = g.world.buildings.find((q) => q.id === 'n1') || g.world.buildings.find((q) => q.rooms.some((r) => r.type === 'living'));
      const r = b.rooms.find((q) => q.type === 'living') || b.rooms[0];
      cam.position.set(r.minX + 0.5, b.floorY + 1.6, r.minZ + 0.5); cam.lookAt(r.maxX, b.floorY + 1.0, r.maxZ);
      g.world.setRoofHidden && g.world.setRoofHidden(b);
    }
    cam.updateMatrixWorld();
    g.world.vegetation.update(cam.position, 420, true, 1, g.settings.get('graphics.quality'));
    g.world.cullInteriors(cam.position, 1); g.world.instancer.cull(cam.position, 420);
    window.__draw(hour, cam);
    return true;
  };
  await run('04-baslangic-mahallesi', worldSetup, [[-262, 1.7, 182], [-230, 2.5, 160], 11], 'canvas', 0.025);
  await run('05-sehir-merkezi', worldSetup, [[140, 2.2, 32], [140, 2, -40], 17], 'canvas', 0.025);
  await run('06-orman', worldSetup, [[-262, 1.8, -150], [-205, 3, -105], 10], 'canvas', 0.025);
  await run('07-bina-ici', worldSetup, [null, null, 13], 'canvas', 0.025);
  // ------------------------------------------------------------------ oyun içi sahneler (tek oyunculu)
  await evalJS(page, () => { const g = window.__game; document.getElementById('ui-root').style.display = ''; g.menu.group.visible = true; window.__resume(); g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 300000 });
  await page.waitForFunction(() => window.__game.phys && window.__game.phys.steps > 120, null, { timeout: 300000 }).catch(() => {});
  await evalJS(page, () => { window.__freeze(); });
  const gameSetup = ([what]) => {
    const g = window.__game, S = g.session, cam = g.gfx.camera, THREE = window.__THREE;
    window.__seed(23);
    document.getElementById('ui-root').style.display = 'none';
    const P = S.local.pos;
    const fwd = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
    if (what === 'car-out' || what === 'car-in') {
      const v = S.vehicles.list.filter((q) => !q.wrecked && !q.water).sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z))[0];
      if (!v) return false;
      v.root.updateMatrixWorld(true);
      const [fx, fz] = fwd(v.yaw);
      if (what === 'car-out') { cam.position.set(v.pos.x - fx * 5.2 + fz * 3.4, v.pos.y + 2.1, v.pos.z - fz * 5.2 - fx * 3.4); cam.lookAt(v.pos.x, v.pos.y + 0.7, v.pos.z); }
      else { cam.position.set(v.pos.x + fz * 0.36 - fx * 0.15, v.pos.y + 1.2, v.pos.z - fx * 0.36 - fz * 0.15); cam.lookAt(v.pos.x + fx * 6 + fz * 0.36, v.pos.y + 1.0, v.pos.z + fz * 6 - fx * 0.36); }
      cam.updateMatrixWorld();
      g.world.cullInteriors(cam.position, 1);
      window.__draw(12, cam);
      return true;
    }
    if (what === 'face') {
      // karakter yakın plan: oyuncunun yüzü, başın ~1 m önünden
      const [fx, fz] = fwd(S.local.yaw);
      const hy = P.y + 1.6;
      cam.position.set(P.x + fx * 1.05, hy + 0.04, P.z + fz * 1.05); cam.lookAt(P.x, hy, P.z);
      cam.updateMatrixWorld();
      window.__draw(15, cam);
      return true;
    }
    if (what === 'zombie') {
      const [fx, fz] = fwd(S.local.yaw);
      const z = S.zombies.spawn('normal', P.x + fx * 4, P.z + fz * 4, {});
      if (!z) return false;
      const zx = z.x, zz = z.z, zy = z.y; // nav ızgarasında en yakın boş hücreye taşınmış olabilir
      z.yaw = Math.atan2(-fx, -fz); z.state = 'idle'; z.speed = 0;
      for (let i = 0; i < 4; i++) S.zombies.updateViews(0.016);
      cam.position.set(zx - fx * 2.2, zy + 1.65, zz - fz * 2.2); cam.lookAt(zx, zy + 1.45, zz);
      cam.updateMatrixWorld();
      window.__draw(16, cam);
      return true; // zombi görüntüden sonra kaldırılır
    }
    if (what === 'night-base') {
      const h = S.world.home.spec;
      for (let k = 0; k < 6; k++) { const a = -0.6 + k * 0.25, r = 12 + (k % 3) * 4; const z = S.zombies.spawn('normal', h.x + 10 + Math.cos(a) * r, h.z + 22 + Math.sin(a) * r, {}); if (z) { z.yaw = Math.PI + a; z.state = 'idle'; } }
      for (let i = 0; i < 4; i++) S.zombies.updateViews(0.016);
      const cx = h.x + 6, cz = h.z + 30, T = g.world.terrain;
      cam.position.set(cx, T.heightAt(cx, cz) + 3.2, cz); cam.lookAt(h.x + 12, T.heightAt(h.x + 12, h.z + 10) + 1.5, h.z + 10);
      cam.updateMatrixWorld();
      g.world.cullInteriors(cam.position, 1);
      window.__draw(22.5, cam);
      return true; // zombiler görüntüden sonra kaldırılır
    }
    return false;
  };
  await evalJS(page, async () => { window.__THREE = await import('three'); });
  await run('03b-karakter-yuz-yakin-plan', gameSetup, ['face'], 'canvas', 0.025);
  await run('08a-arac-disi', gameSetup, ['car-out'], 'canvas', 0.025);
  await run('08b-arac-ici', gameSetup, ['car-in'], 'canvas', 0.025);
  const clearZ = () => evalJS(page, () => { const S = window.__game.session; for (const id of [...S.zombies.list.keys()]) S.zombies.removeZombie(id); });
  await run('09-zombi-yakin-plan', gameSetup, ['zombie'], 'canvas', 0.025);
  await clearZ();
  await run('10-gece-us-savunmasi', gameSetup, ['night-base'], 'canvas', 0.025);
  await clearZ();
  // envanter: HUD + envanter paneli (simgeler eşzamanlı çizilir)
  await run('11-envanter', async () => {
    const g = window.__game, S = g.session, cam = g.gfx.camera;
    window.__seed(31);
    document.getElementById('ui-root').style.display = '';
    g.ui.openJournal('inventory');
    if (g.icons && g.icons.flush) g.icons.flush(200);
    const P = S.local.pos;
    cam.position.set(P.x - 3, P.y + 2.4, P.z - 3); cam.lookAt(P.x, P.y + 1.2, P.z); cam.updateMatrixWorld();
    window.__draw(12, cam);
    await new Promise((r) => setTimeout(r, 300));
    return true;
  }, null, 'page', 0.03);
  log(VQ ? `kalite ${VQ}` : baseline ? 'taban' : 'fark', results);
  const n = Object.keys(results).length;
  if (n < 14) errors.push(`[assert] 14 görüntü bekleniyordu, ${n} alındı`);
};
