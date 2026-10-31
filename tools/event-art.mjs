// Olay kartı görselleri: oyunun kendi sahnelerinden (sabit kamera) 244x192 JPEG üretir ve
// assets/img/events/ altına yazar. Resimli kart tarzına yakın olsun diye hafif ressamsı süzgeç
// (doygunluk/kontrast, yumuşatma, kenar kararması) uygulanır.
// Kullanım: node tools/scenario.mjs tools/event-art.mjs  (geliştirme sunucusu açıkken)
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('assets/img/events');

export default async ({ page, url, wait, evalJS, log }) => {
  const S = (fn, arg) => evalJS(page, fn, arg);
  await page.setViewportSize({ width: 1220, height: 960 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => { window.__game.ui.menus.opts.ai = 0; return window.__game.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1500);
  await S(() => {
    const g = window.__game;
    cancelAnimationFrame(g.raf); g.raf = 0;
    document.getElementById('ui-root').style.display = 'none';
    window.__step = (n) => { const S = g.session; for (let i = 0; i < n; i++) { S.update(1 / 60); g.input.endFrame(); } };
    window.__shot = (pos, look, mood = {}) => {
      const S = g.session, c = g.gfx.camera;
      c.position.set(pos[0], pos[1], pos[2]);
      c.lookAt(look[0], look[1], look[2]);
      c.fov = mood.fov || 50; c.far = 1400; c.updateProjectionMatrix();
      S.world.vegetation.update(c.position, 360, true);
      g.env.update(0.016, g.time, S.time.minuteOfDay, c.position, S.region);
      g.gfx.render(0.016, g.time);
      const src = g.gfx.renderer.domElement;
      const W = 244, H = 192, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const x = cv.getContext('2d');
      const sw = src.width, sh = src.height, k = Math.max(W / sw, H / sh);
      const cw = W / k, ch = H / k;
      x.filter = `saturate(${mood.sat || 1.3}) contrast(${mood.con || 1.12}) brightness(${mood.bri || 1.0}) blur(0.35px)`;
      x.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
      x.filter = 'none';
      if (mood.tint) { x.globalCompositeOperation = 'soft-light'; x.fillStyle = mood.tint; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; }
      const gr = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
      return cv.toDataURL('image/jpeg', 0.86).split(',')[1];
    };
  });
  // yüksek kalite (gölgeler açık, tam çözünürlük)
  await S(() => { const g = window.__game; g.gfx.basePixelRatio = 1; g.gfx.renderer.setPixelRatio(1); g.gfx.renderer.shadowMap.enabled = true; g.gfx.resize && g.gfx.resize(); });

  const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
  const save = (name, b64) => {
    if (ONLY.length && !ONLY.includes(name)) return;
    if (!b64) { log('boş', name); return; } fs.writeFileSync(path.join(OUT, name + '.jpg'), Buffer.from(b64, 'base64')); log('yazıldı', name, Math.round(b64.length * 0.75 / 1024) + ' KB'); };
  const setTime = (hm) => S((hm) => { const S = window.__game.session; S.time.set(Math.floor(S.time.total / 1440) * 1440 + hm); }, hm);

  // ---- fener: gece, huzme
  await setTime(22 * 60);
  save('lighthouse', await S(() => {
    const S = window.__game.session;
    S.act('lighthouse_lit', {});
    S.weather.set('clear', 600);
    window.__step(60);
    const L = S.world.lighthouse;
    return window.__shot([L.x + 46, L.y - 12, L.z - 40], [L.x, L.y - 2, L.z], { tint: '#3a4a9a', sat: 1.4 });
  }));

  // ---- Kanlı Ay: mahalle evleri üzerinde kızıl ay
  save('bloodmoon', await S(() => {
    const S = window.__game.session;
    S.emit({ k: 'bloodmoon', on: true });
    window.__step(300);
    const m = S.time.minuteOfDay;
    const d = [-Math.cos(((m + 720) % 1440) / 1440 * Math.PI * 2) * 0.6, 0.65, -0.3];
    const L = Math.hypot(...d);
    const hx = d[0] / Math.hypot(d[0], d[2]), hz = d[2] / Math.hypot(d[0], d[2]);
    const p = { x: -150 - hx * 20, z: 170 - hz * 20 };
    const y = S.world.terrain.heightAt(p.x, p.z) + 1.7;
    return window.__shot([p.x, y, p.z], [p.x + hx * 100, y + 34, p.z + hz * 100], { tint: '#7a1020', con: 1.2, fov: 62 });
  }));
  await S(() => { const S = window.__game.session; S.emit({ k: 'bloodmoon', on: false }); window.__step(30); });

  // ---- kurtlar: alacakaranlıkta orman kenarı
  await setTime(18 * 60 + 50);
  save('wolves', await S(() => {
    const S = window.__game.session;
    const x = -250, z = -120, y = S.world.terrain.heightAt(x, z);
    S.local.spawnAt(x + 30, y + 0.3, z + 30, 0);
    for (let i = 0; i < 3; i++) { const a = S.npcs.spawnAnimal('wolf', x + i * 2.2, z + (i % 2) * 1.8); a.yaw = 0.8; a.state = 'stalk'; }
    window.__step(40);
    return window.__shot([x + 4.6, y + 0.9, z + 4.2], [x + 1.4, y + 0.55, z + 0.6], { tint: '#5a3a4a', sat: 1.15, bri: 1.08, fov: 46 });
  }));

  // ---- sis: şehir sokağında zombiler
  await setTime(8 * 60 + 30);
  save('fog', await S(() => {
    const S = window.__game.session;
    S.weather.set('fog', 600);
    const x = 70, z = 10, y = S.world.terrain.heightAt(x, z);
    window.__step(300);
    // uzaktaki zombiler havuza geri alınır: oyuncu kameranın hemen arkasında dursun
    S.local.spawnAt(x + 0.5, y + 0.2, z + 6, 0);
    for (let i = 0; i < 5; i++) S.zombies.spawn(i % 2 ? 'normal2' : 'normal', x + (i - 2) * 1.8, z - 7 - i * 2.2, {});
    window.__step(25);
    return window.__shot([x + 0.5, y + 1.7, z + 2], [x, y + 1.2, z - 14], { sat: 1.1, con: 1.18 });
  }));
  await S(() => { const S = window.__game.session; S.weather.set('clear', 600); for (const z of S.zombies.list.values()) z.dead = true; window.__step(60); });

  // ---- çiftlik: altın saat, ambar ve tarla
  await setTime(17 * 60 + 50);
  save('farm', await S(() => {
    const S = window.__game.session;
    const x = -600, z = 166, y = S.world.terrain.heightAt(x, z);
    window.__step(60);
    return window.__shot([x + 26, y + 5, z - 34], [x - 4, y + 3, z + 2], { tint: '#c87a2a', sat: 1.35 });
  }));

  // ---- baraj ve santral
  await setTime(11 * 60);
  save('dam', await S(() => {
    const S = window.__game.session;
    window.__step(30);
    const x = -470, z = -205, y = S.world.terrain.heightAt(x, z);
    return window.__shot([x + 22, y + 7, z + 30], [x - 18, y + 5, z - 8], { tint: '#4a6a9a', sat: 1.25, con: 1.15 });
  }));

  // ---- cezaevi: gözetleme kuleleri, zırhlı enfekteler
  await setTime(19 * 60 + 10);
  save('prison', await S(() => {
    const S = window.__game.session;
    const y = S.world.terrain.heightAt(626, -60);
    S.local.spawnAt(592, y + 0.3, -60, Math.PI / 2);
    for (let i = 0; i < 4; i++) S.zombies.spawn('riot', 618 - i * 2.6, -61.5 + (i % 2) * 3.2, {});
    window.__step(30);
    return window.__shot([598, y + 1.9, -59], [636, y + 4.2, -62], { tint: '#6a2a3a', sat: 1.2, fov: 58 });
  }));
  await S(() => { const S = window.__game.session; for (const z of S.zombies.list.values()) z.dead = true; window.__step(60); });

  // ---- yardım paketi: paraşütlü sandık
  await setTime(16 * 60 + 30);
  save('airdrop', await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    S.local.spawnAt(-280, S.world.terrain.heightAt(-280, 150) + 0.3, 150, 0);
    W.hostAirdrop();
    window.__step(380);
    const d = W.drops[W.drops.length - 1];
    const p = d.crate.position;
    return window.__shot([p.x + 18, p.y - 4, p.z + 12], [p.x, p.y + 2, p.z], { tint: '#c86a2a', sat: 1.3 });
  }));

  // ---- düşen uçak: duman izi
  save('crash', await S(() => {
    const S = window.__game.session, W = S.storyWorld;
    W.hostCrash(false);
    window.__step(420);
    const c = W.crashes[W.crashes.length - 1];
    const p = c.g.position;
    return window.__shot([p.x + 24, p.y - 7, p.z + 20], [p.x, p.y, p.z], { tint: '#a0402a', sat: 1.3, con: 1.18 });
  }));
  log('bitti', fs.readdirSync(OUT).join(' '));
};
