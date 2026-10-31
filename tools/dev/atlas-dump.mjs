export default async ({ page, url, evalJS, log }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const r = await evalJS(page, () => {
    const g = window.__game, V = g.world.vegetation, R = g.gfx.renderer;
    if (!V.imp) V.update(g.gfx.camera.position, 420, true, 1);
    const rt = V.imp.rt, w = rt.width, h = rt.height;
    const buf = new Uint8Array(w * h * 4);
    R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    let a0 = 0, a1 = 0;
    for (let i = 3; i < buf.length; i += 4) { if (buf[i] === 0) a0++; else if (buf[i] === 255) a1++; }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
    return { w, h, transparent: a0, opaque: a1, total: w * h, url: c.toDataURL('image/png'), alpha: R.getContext().getContextAttributes().alpha, pma: R.getContext().getContextAttributes().premultipliedAlpha };
  });
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/atlas.png', Buffer.from(r.url.split(',')[1], 'base64'));
  delete r.url;
  log('atlas', r);
};
