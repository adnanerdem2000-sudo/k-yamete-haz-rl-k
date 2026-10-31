// Birleştirme sonrası görsel kontrol: yol levhası, ışıklı dükkân tabelaları (gece), ev içinde çatı kesiti,
// iç mekân (hücre ayıklaması sonrası). → /tmp/mv-*.png
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  await evalJS(page, () => { const g = window.__game; for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel(); });
  const go = (x, z, yaw, min) => evalJS(page, ([x, z, yaw, min]) => {
    const S = window.__game.session, pl = S.local;
    pl.spawnAt(x, S.world.terrain.heightAt(x, z) + 0.2, z, yaw);
    pl.camYaw = yaw; pl.camPitch = 0.12;
    if (min != null) S.time.set(Math.floor(S.time.total / 1440) * 1440 + min);
    return { inside: pl.inside ? pl.inside.id : null };
  }, [x, z, yaw, min]);
  // 1) yol levhası (gündüz)
  log('levha', await go(-36, 166, Math.PI, 600));
  await wait(2500); await shot(page, '/tmp/mv-signpost.png');
  // 2) ev içi: çatı gizli olmalı, iç duvarlar görünür
  log('ev', await go(-285.5, 149.5, 0, 600));
  await wait(2500);
  log('çatı', await evalJS(page, () => { const W = window.__game.session.world; return { hide: W.roofHide.value, homeRoof: W.home.roofId, interiorsVisible: W._interiors.filter((m) => m.visible).length, interiors: W._interiors.length }; }));
  await shot(page, '/tmp/mv-home-inside.png');
  // 3) şehir dükkân tabelaları gece (sokak elektriği açık)
  log('şehir', await go(35, -52, Math.PI, 1300));
  await evalJS(page, () => { const S = window.__game.session; if (S.env) S.env.streetPower = true; });
  await wait(3000);
  log('tabela malzemesi', await evalJS(page, () => { const W = window.__game.session.world; const b = W.buildingById.supermarket; return { shared: b.signMat && b.signMat.name, emissive: b.signMat && b.signMat.emissiveIntensity }; }));
  await shot(page, '/tmp/mv-city-night.png');
  await signShots({ page, evalJS, shot, log });
};

// Kamera doğrudan tabelaların önüne: node tools/scenario.mjs tools/dev/merge-visual.mjs ile birlikte çalışır
export async function signShots({ page, evalJS, shot, log }) {
  const spots = await evalJS(page, () => window.__game.session.world.signSpots);
  log('tabela sayısı', spots.length, spots.filter((s) => s.kind === 'signpost').length);
  const pick = [spots.find((s) => s.kind === 'signpost'), spots.find((s) => s.kind === 'sign')];
  for (const [i, s] of pick.entries()) {
    await evalJS(page, (s) => {
      const g = window.__game; cancelAnimationFrame(g.raf); g.loop = () => {};
      document.getElementById('ui-root').style.display = 'none';
      const c = g.gfx.camera, nx = Math.sin(s.ry), nz = Math.cos(s.ry), d = s.kind === 'sign' ? 9 : 4;
      c.position.set(s.x + nx * d, s.y + (s.kind === 'sign' ? -1.5 : 0.2), s.z + nz * d);
      c.lookAt(s.x, s.y, s.z);
      g.gfx.render(0.016, g.time);
    }, s);
    await shot(page, `/tmp/mv-sign${i}.png`);
  }
}
